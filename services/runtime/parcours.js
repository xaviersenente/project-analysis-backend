/**
 * Portfolio S3 : le parcours du site en ligne, qui est le livrable.
 *
 * Aucun code du dépôt n'est exécuté : on visite le site publié, comme un visiteur qui n'a encore
 * rien accepté (navigation privée, aucun clic). Les pages viennent du sitemap et des liens internes,
 * dans la limite de la configuration. Pour chaque page, à 360 px : statut, référencement,
 * débordement, axe-core, requêtes (tiers compris), poids transféré, éléments du DOM ; et des captures.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { createRequire } from "module";
import puppeteer from "puppeteer-core";
import thresholds from "../../config/thresholds.js";
import { obtenirChrome, fermerChrome } from "../html/lighthouseService.js";
import { mesurerDebordement } from "./navigateur.js";

const { parcours: reglages, accessibilite, tiers: TIERS } = thresholds.portfolio;
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const DELAI_HTTP = thresholds.performance.timeouts.http;

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

/** Exécuté dans la page : ce qu'il faut pour le référencement, les liens et le texte (mentions légales) */
function lirePage() {
  const meta = (nom) => document.querySelector(`meta[name="${nom}"], meta[property="${nom}"]`)?.getAttribute("content")?.trim() || null;
  return {
    titre: document.title.trim() || null,
    description: meta("description"),
    lang: document.documentElement.getAttribute("lang") || null,
    h1: document.querySelectorAll("h1").length,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    ogTitre: meta("og:title"),
    ogImage: meta("og:image"),
    dom: document.getElementsByTagName("*").length,
    // Ce que le site en ligne dit de l'outil qui l'a produit (TE2, TE3)
    generateur: meta("generator"),
    wordpress: document.documentElement.innerHTML.includes("/wp-content/"),
    pageBuilder: Boolean(document.querySelector('[class*="elementor"], [class*="et_pb_"], [class*="fusion-builder"], [class*="vc_row"]')),
    liens: [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.href, texte: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 80) })),
    texte: document.body?.innerText.slice(0, 30000) ?? "",
  };
}

const capturer = async (onglet, largeur, dossier, chemin) => {
  const { hauteurMaxPx, qualite } = reglages.captures;
  await onglet.setViewport({ width: largeur, height: 800, deviceScaleFactor: 1, isMobile: largeur < 768, hasTouch: largeur < 768 });
  const hauteur = await onglet.evaluate(() => document.documentElement.scrollHeight);
  const image = await onglet.screenshot({ type: "webp", quality: qualite, clip: { x: 0, y: 0, width: largeur, height: Math.min(hauteur, hauteurMaxPx) }, captureBeyondViewport: true });
  const nom = `${createHash("sha1").update(chemin).digest("hex").slice(0, 12)}-${largeur}.webp`;
  fs.writeFileSync(path.join(dossier, nom), image);
  // Relatif à la page du projet, comme les vignettes
  return { largeur, image: `captures/${nom}` };
};

/**
 * Une page : chargée à 360 px dans le contexte privé, mesurée, puis capturée
 * @returns {Promise<object>} - La page ; `erreur` si elle n'a pas pu être chargée
 */
const visiter = async (contexte, adresse, hoteSite, { largeursCaptures, dossierCaptures }) => {
  const onglet = await contexte.newPage();
  const requetes = new Map();
  let poids = 0;
  try {
    const cdp = await onglet.createCDPSession();
    await cdp.send("Network.enable");
    cdp.on("Network.requestWillBeSent", (e) => requetes.set(e.requestId, e.request.url));
    cdp.on("Network.loadingFinished", (e) => (poids += e.encodedDataLength));
    await onglet.setViewport({ width: 360, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const reponse = await onglet.goto(adresse, { waitUntil: "networkidle2", timeout: reglages.delaiPageMs });
    await new Promise((r) => setTimeout(r, reglages.attenteMs));
    const finale = new URL(onglet.url());
    const type = reponse?.headers()["content-type"] ?? "";
    const base = { url: adresse, chemin: new URL(adresse).pathname + new URL(adresse).search, statut: reponse?.status() ?? 0 };
    if (!reponse || base.statut >= 400 || !type.includes("html") || estTiers(finale.hostname, hoteSite)) return { ...base, page: false };

    const lue = await onglet.evaluate(lirePage);
    const debordement = await onglet.evaluate(mesurerDebordement);
    await onglet.addScriptTag({ path: AXE });
    const violations = await onglet.evaluate(async (impacts) => {
      const { violations } = await window.axe.run(document, { resultTypes: ["violations"] });
      return violations
        .filter((v) => impacts.includes(v.impact))
        .map((v) => ({ regle: v.id, impact: v.impact, aide: v.help, noeuds: v.nodes.slice(0, 10).map((n) => n.html.slice(0, 200)), total: v.nodes.length }));
    }, accessibilite.impacts);
    const toutes = [...requetes.values()].filter((u) => /^https?:/.test(u));
    const captures = [];
    if (dossierCaptures) for (const largeur of largeursCaptures) captures.push(await capturer(onglet, largeur, dossierCaptures, base.chemin));
    return {
      ...base,
      page: true,
      ...lue,
      debordement,
      violations,
      requetes: toutes.length,
      poidsKo: Math.round(poids / 1024),
      tiers: toutes.filter((u) => estTiers(new URL(u).hostname, hoteSite)),
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
      const page = await visiter(contexte, adresse, hoteSite, { largeursCaptures, dossierCaptures });
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
