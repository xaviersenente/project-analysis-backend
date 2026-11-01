/**
 * Portfolio S3 : le parcours du site en ligne, qui est le livrable.
 *
 * Aucun code du dépôt n'est exécuté : on visite le site publié, comme un visiteur qui n'a encore
 * rien accepté (navigation privée, aucun clic). Les pages viennent du sitemap et des liens internes,
 * dans la limite de la configuration. Pour chaque page, à 360 px : statut, référencement,
 * débordement, axe-core, requêtes (tiers compris), poids transféré, éléments du DOM ; et des captures.
 * Pour les acquis du S1 (services/analyse/acquisS1.js) : le HTML servi et le HTML rendu, les images,
 * polices et vidéos chargées, et les polices déclarées. Ils restent hors du résultat.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { createRequire } from "module";
import puppeteer from "puppeteer-core";
import thresholds from "../../config/thresholds.js";
import { obtenirChrome, fermerChrome } from "../html/lighthouseService.js";
import { mesurerDebordement, mesurerCibles } from "./navigateur.js";
import { lirePage, lirePolices, lireTailles, lireLignes, memoriserRepos, lireFocus, suivreObservateurs, revelerPage, etirerFondsFixes, restaurerFondsFixes } from "./enPage.js";

const { parcours: reglages, accessibilite, tiers: TIERS } = thresholds.portfolio;
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const DELAI_HTTP = thresholds.performance.timeouts.http;
const { ergonomie: ERGO_S1, accessibilite: ACCES_S1 } = thresholds.sae105;

/** Le domaine du propriétaire : les deux derniers libellés (bryan-thierry.fr), ou l'hôte entier (IP, localhost) */
export const domaineDe = (hote) => {
  if (/^[\d.]+$/.test(hote) || !hote.includes(".")) return hote;
  return hote.split(".").slice(-2).join(".");
};

/** Un service tiers : un autre propriétaire que le site */
export const estTiers = (hote, hoteSite) => domaineDe(hote) !== domaineDe(hoteSite);

export const categorieTiers = (hote) => TIERS.find((t) => t.motif.test(hote))?.categorie ?? "Autre service";

/** Adresse d'une page, sans ancre ; « / » final retiré sauf à la racine */
export const normaliser = (adresse) => {
  const u = new URL(adresse);
  u.hash = "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.href;
};

const lireTexte = async (adresse) => {
  try {
    const reponse = await fetch(adresse, { signal: AbortSignal.timeout(DELAI_HTTP), redirect: "follow" });
    return reponse.ok ? await reponse.text() : null;
  } catch {
    return null;
  }
};

/** robots.txt et sitemap.xml, à la racine du domaine */
const lireRobotsEtSitemap = async (origine) => {
  const robots = await lireTexte(`${origine}/robots.txt`);
  const annonce = robots?.match(/^\s*sitemap:\s*(\S+)/im)?.[1] ?? null;
  const sitemap = (await lireTexte(annonce ?? `${origine}/sitemap.xml`)) ?? (annonce ? await lireTexte(`${origine}/sitemap.xml`) : null);
  const urls = sitemap && /<urlset|<sitemapindex/i.test(sitemap) ? [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]) : [];
  return { robots: Boolean(robots), sitemapAnnonce: Boolean(annonce), sitemap: Boolean(sitemap) && urls.length > 0, urls };
};

/** L'adresse en http:// renvoie-t-elle vers https:// ? null : pas de réponse */
const redirigeVersHttps = async (adresse) => {
  const http = new URL(adresse);
  http.protocol = "http:";
  try {
    const reponse = await fetch(http, { signal: AbortSignal.timeout(DELAI_HTTP), redirect: "manual" });
    const cible = reponse.headers.get("location");
    return reponse.status >= 300 && reponse.status < 400 && Boolean(cible) && new URL(cible, http).protocol === "https:";
  } catch {
    return null;
  }
};

const capturer = async (onglet, largeur, dossier, chemin) => {
  const { hauteurMaxPx, qualite, revelation } = reglages.captures;
  await onglet.setViewport({ width: largeur, height: 800, deviceScaleFactor: 1, isMobile: largeur < 768, hasTouch: largeur < 768 });
  // Les animations gardent leur durée (les écourter dérègle certains scripts) : si la révélation a
  // déclenché quelque chose, on attend la fin des fondus avant la photo
  const revelees = await onglet.evaluate(revelerPage, { imagesMs: revelation.imagesMs });
  await new Promise((r) => setTimeout(r, revelees > 0 ? revelation.finMs : revelation.pauseMs));
  await onglet.evaluate(etirerFondsFixes);
  // Une page plus large que l'écran est photographiée en entier : le débordement se voit (Q4)
  const { hauteur, largeurPage } = await onglet.evaluate(() => ({ hauteur: document.documentElement.scrollHeight, largeurPage: document.documentElement.scrollWidth }));
  const largeurCapture = Math.min(Math.max(largeur, largeurPage), largeur * 3);
  const image = await onglet.screenshot({ type: "webp", quality: qualite, clip: { x: 0, y: 0, width: largeurCapture, height: Math.min(hauteur, hauteurMaxPx) }, captureBeyondViewport: true });
  const nom = `${createHash("sha1").update(chemin).digest("hex").slice(0, 12)}-${largeur}.webp`;
  fs.writeFileSync(path.join(dossier, nom), image);
  // La largeur suivante repart de la page telle qu'elle est (fonds rétablis)
  await onglet.evaluate(restaurerFondsFixes);
  // Relatif à la page du projet, comme les vignettes
  return { largeur, image: `captures/${nom}` };
};

/** Le texte des feuilles de style et des scripts reçus (E3, A11), lu depuis le navigateur ; null si indisponible */
const corpsDe = async (cdp, requestId) => {
  try {
    const { body, base64Encoded } = await cdp.send("Network.getResponseBody", { requestId });
    const texte = base64Encoded ? Buffer.from(body, "base64").toString("utf-8") : body;
    return texte.slice(0, reglages.acquis.corpsMaxOctets);
  } catch {
    return null;
  }
};

/** Ce que le lot 2 cherche dans un CSS (E3, A11) */
const lireCss = (texte) => ({
  hover: /:hover\b/.test(texte),
  focusVisible: /:focus-visible\b/.test(texte),
  active: /:active\b/.test(texte),
  mouvementCss: /(^|[;{\s])(transition|animation)(-name|-property)?\s*:\s*(?!none\b|0s?\b|initial\b|unset\b)[^;}]+/m.test(texte),
  reduitCss: /prefers-reduced-motion/.test(texte),
});

/** Ce que le lot 2 cherche dans un script (A11) */
const lireJs = (texte) => ({ reduitJs: /prefers-reduced-motion/.test(texte) });

/** La réunion de relevés : un drapeau vaut s'il vaut dans l'un d'eux */
const reunir = (releves) => releves.reduce((tout, r) => Object.fromEntries(Object.keys({ ...tout, ...r }).map((k) => [k, Boolean(tout[k] || r[k])])), {});

/**
 * Acquis du S1, lot 2, après les captures (la page a pu bouger : rien de ce qui précède n'en dépend)
 * - E3, A11 : le CSS du site (feuilles du même propriétaire et <style> de la page) et ses scripts
 * - A14 : le débordement à 180 px, soit 360 px zoomés à 200 %
 * - G9 : la longueur des lignes à 1 280 px
 * - A10 : les premières commandes atteintes au clavier, et si leur apparence change
 * @param {Map<string, object>} lectures - Relevé de chaque CSS et script déjà lu, par adresse :
 *   les pages d'un site partagent leurs fichiers, chacun n'est lu qu'une fois par parcours
 */
const mesurerAcquis = async (onglet, cdp, reponses, hoteSite, lectures) => {
  const { tabulationsMax, largeurLignePx, paragrapheMinCaracteres, miseEnPageMs } = reglages.acquis;
  const pause = () => new Promise((r) => setTimeout(r, miseEnPageMs));
  const releves = [];
  for (const [id, r] of reponses) {
    if (!/^https?:/.test(r.url) || estTiers(new URL(r.url).hostname, hoteSite) || !["Stylesheet", "Script"].includes(r.type)) continue;
    if (!lectures.has(r.url)) {
      const texte = await corpsDe(cdp, id);
      // Un corps illisible n'est pas retenu : une autre page pourra le lire
      if (texte === null) continue;
      lectures.set(r.url, r.type === "Stylesheet" ? lireCss(texte) : lireJs(texte));
    }
    releves.push(lectures.get(r.url));
  }
  // Les styles et scripts de la page elle-même
  releves.push(lireCss(await onglet.evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n"))));
  releves.push(lireJs(await onglet.evaluate(() => [...document.querySelectorAll("script:not([src])")].map((s) => s.textContent).join("\n"))));
  const styles = { reduitJs: false, ...reunir(releves) };

  await onglet.setViewport({ width: ACCES_S1.zoomViewportPx, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await pause();
  const zoom = await onglet.evaluate(mesurerDebordement);

  await onglet.setViewport({ width: largeurLignePx, height: 800, deviceScaleFactor: 1 });
  await pause();
  const lignes = await onglet.evaluate(lireLignes, paragrapheMinCaracteres);

  // Le focus : depuis le haut de la page, au clavier comme un visiteur qui n'utilise pas la souris
  await onglet.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  await onglet.evaluate(memoriserRepos);
  const focus = [];
  for (let i = 0; i < tabulationsMax; i++) {
    await onglet.keyboard.press("Tab");
    const etat = await onglet.evaluate(lireFocus).catch(() => null);
    if (etat && !focus.some((f) => f.extrait === etat.extrait)) focus.push(etat);
  }
  return { styles, zoom, lignes, focus };
};

/**
 * Une page : chargée à 360 px dans le contexte privé, mesurée, puis capturée
 * @returns {Promise<object>} - La page ; `erreur` si elle n'a pas pu être chargée
 */
const visiter = async (contexte, adresse, hoteSite, { largeursCaptures, dossierCaptures, lectures }) => {
  const onglet = await contexte.newPage();
  const requetes = new Map();
  // Réponses par requête : type (Image, Font, Media…), type MIME, statut, octets transférés
  const reponses = new Map();
  let poids = 0;
  try {
    // Pour les captures : savoir ce que la page révélera au défilement
    if (dossierCaptures) await onglet.evaluateOnNewDocument(suivreObservateurs);
    const cdp = await onglet.createCDPSession();
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (e) => requetes.set(e.requestId, e.request.url));
    cdp.on("Network.responseReceived", (e) => reponses.set(e.requestId, { url: e.response.url, type: e.type, mime: e.response.mimeType, statut: e.response.status, octets: 0 }));
    cdp.on("Network.loadingFinished", (e) => {
      poids += e.encodedDataLength;
      if (reponses.has(e.requestId)) reponses.get(e.requestId).octets = e.encodedDataLength;
    });
    await onglet.setViewport({ width: 360, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const reponse = await onglet.goto(adresse, { waitUntil: "networkidle2", timeout: reglages.delaiPageMs });
    await new Promise((r) => setTimeout(r, reglages.attenteMs));
    const finale = new URL(onglet.url());
    const type = reponse?.headers()["content-type"] ?? "";
    const base = { url: adresse, chemin: new URL(adresse).pathname + new URL(adresse).search, statut: reponse?.status() ?? 0 };
    if (!reponse || base.statut >= 400 || !type.includes("html") || estTiers(finale.hostname, hoteSite)) return { ...base, page: false };

    const lue = await onglet.evaluate(lirePage);
    // Acquis du S1 au chargement, à 360 px : commandes trop petites (E4), tailles de texte (G8), animations (A11)
    const cibles = (await onglet.evaluate(mesurerCibles, ERGO_S1.cibleTactilePx)).slice(0, 20);
    const tailles = await onglet.evaluate(lireTailles);
    const animations = await onglet.evaluate(() => document.getAnimations?.().length ?? 0);
    // Le HTML tel que le serveur l'envoie (validation W3C), et tel que le visiteur le reçoit une fois les scripts passés
    const source = await reponse.text().catch(() => null);
    const html = await onglet.evaluate(() => `<!DOCTYPE html>\n${document.documentElement.outerHTML}`);
    const polices = await onglet.evaluate(lirePolices);
    const debordement = await onglet.evaluate(mesurerDebordement);
    await onglet.addScriptTag({ path: AXE });
    const violations = await onglet.evaluate(async (impacts) => {
      const { violations } = await window.axe.run(document, { resultTypes: ["violations"] });
      return violations
        .filter((v) => impacts.includes(v.impact))
        .map((v) => ({ regle: v.id, impact: v.impact, aide: v.help, noeuds: v.nodes.slice(0, 10).map((n) => n.html.slice(0, 200)), total: v.nodes.length }));
    }, accessibilite.impacts);
    const toutes = [...requetes.values()].filter((u) => /^https?:/.test(u));
    // Le poids de la page au chargement, à 360 px (EcoIndex, E11) : les captures aux autres largeurs
    // chargent d'autres images, qui ne comptent pas
    const poidsAuChargement = poids;
    // Les cinq réponses les plus lourdes au chargement, tous types confondus (E11 : ce qui pèse)
    const plusLourdes = [...reponses.values()]
      .filter((r) => r.octets > 0 && /^https?:/.test(r.url))
      .sort((a, b) => b.octets - a.octets)
      .slice(0, 5)
      .map((r) => ({ url: r.url, type: r.type, poidsKo: Math.round(r.octets / 1024) }));
    // Images, polices et vidéos de la page à 360 px, y compris celles chargées à l'approche (révélées par
    // la première capture) ; pas les variantes plus larges chargées pour les captures suivantes
    const releverRessources = () =>
      [...reponses.values()]
        .filter((r) => ["Image", "Font", "Media"].includes(r.type) && /^https?:/.test(r.url))
        .map(({ octets, ...r }) => ({ ...r, poidsKo: Math.round(octets / 1024) }));
    let ressources = dossierCaptures ? null : releverRessources();
    const captures = [];
    if (dossierCaptures) {
      for (const largeur of largeursCaptures) {
        captures.push(await capturer(onglet, largeur, dossierCaptures, base.chemin));
        ressources ??= releverRessources();
      }
    }
    const acquis = await mesurerAcquis(onglet, cdp, reponses, hoteSite, lectures);
    return {
      ...base,
      page: true,
      ...lue,
      debordement,
      violations,
      requetes: toutes.length,
      poidsKo: Math.round(poidsAuChargement / 1024),
      plusLourdes,
      tiers: toutes.filter((u) => estTiers(new URL(u).hostname, hoteSite)),
      source,
      html,
      polices,
      ressources,
      cibles,
      tailles,
      ...acquis,
      styles: { ...acquis.styles, animations },
      captures,
    };
  } catch (error) {
    return { url: adresse, chemin: new URL(adresse).pathname, statut: 0, page: false, erreur: error.message.split("\n")[0] };
  } finally {
    await onglet.close();
  }
};

/**
 * @param {object} options
 * @param {string} options.url - Adresse du site en ligne
 * @param {string} [options.dossierCaptures] - Où écrire les captures (vidé à chaque parcours)
 * @param {number} [options.pagesMax]
 * @returns {Promise<object>} - Le parcours ; les pages gardent leur texte pour les analyseurs
 */
export const parcourirSite = async ({ url, dossierCaptures = null, pagesMax = reglages.pagesMax }) => {
  const depart = new URL(normaliser(url));
  const hoteSite = depart.hostname;
  const { robots, sitemapAnnonce, sitemap, urls } = await lireRobotsEtSitemap(depart.origin);
  const https = { actif: depart.protocol === "https:", redirection: depart.protocol === "https:" ? await redirigeVersHttps(depart.href) : false };
  if (dossierCaptures) {
    fs.rmSync(dossierCaptures, { recursive: true, force: true });
    fs.mkdirSync(dossierCaptures, { recursive: true });
  }

  const interne = (adresse) => {
    try {
      const u = new URL(adresse);
      return /^https?:$/.test(u.protocol) && u.hostname === hoteSite && !reglages.ignorer.test(u.pathname);
    } catch {
      return false;
    }
  };
  const aVisiter = [depart.href, ...urls.filter(interne).map(normaliser)];
  const vues = new Set();
  const pages = [];
  // CSS et scripts déjà lus, par adresse (mesurerAcquis)
  const lectures = new Map();
  // Les liens internes, pour retrouver d'où vient une adresse en erreur
  const citations = new Map();

  const chrome = await obtenirChrome();
  const navigateur = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
  // Navigation privée : aucun cookie, aucun consentement donné
  const contexte = await navigateur.createBrowserContext();
  let cookies = [];
  try {
    while (aVisiter.length && pages.length < pagesMax) {
      const adresse = normaliser(aVisiter.shift());
      if (vues.has(adresse)) continue;
      vues.add(adresse);
      // Accueil : les trois largeurs ; les autres pages : 360 px seulement
      const largeursCaptures = pages.length === 0 ? reglages.captures.largeurs : reglages.captures.largeurs.slice(0, 1);
      const page = await visiter(contexte, adresse, hoteSite, { largeursCaptures, dossierCaptures, lectures });
      pages.push(page);
      for (const lien of page.liens ?? []) {
        if (!interne(lien.href)) continue;
        const cible = normaliser(lien.href);
        if (!citations.has(cible)) citations.set(cible, new Set());
        citations.get(cible).add(page.chemin);
        if (!vues.has(cible)) aVisiter.push(cible);
      }
    }
    // Les cookies ne sont qu'une information : leur lecture ne fait pas échouer le parcours
    cookies = await contexte.cookies().catch(() => []);
  } finally {
    await contexte.close().catch(() => {});
    await navigateur.disconnect();
    await fermerChrome();
  }

  return {
    url: depart.href,
    hote: hoteSite,
    parcouruLe: new Date().toISOString(),
    https,
    robots,
    sitemapAnnonce,
    sitemap: { present: sitemap, urls: urls.length },
    pages,
    citations: new Map([...citations].map(([cible, sources]) => [cible, [...sources]])),
    nonParcourues: new Set(aVisiter.map(normaliser).filter((a) => !vues.has(a))).size,
    cookies: cookies.map((c) => ({ nom: c.name, domaine: c.domain, tiers: estTiers(c.domain.replace(/^\./, ""), hoteSite) })),
  };
};
