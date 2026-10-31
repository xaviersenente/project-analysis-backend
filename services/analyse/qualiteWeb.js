/**
 * Portfolio S3 : les mesures du site en ligne (Q3 à Q11, PR2), à partir du parcours.
 * Ce sont des informations pour le jury : elles disent où regarder, la note reste la sienne.
 * Une occurrence situe le problème sur le site : `fichier` est le chemin de la page.
 */
import thresholds from "../../config/thresholds.js";
import { respecte, nonRespecte, partiel, nonMesurable, parAbsence } from "./mesure.js";
import { ecoindex } from "../qualite/ecoindex.js";
import { categorieTiers, normaliser } from "../runtime/parcours.js";

const { ecoindex: reglesEco, mentionsLegales, hebergeursGratuits, reseaux } = thresholds.portfolio;

const occ = (chemin, extrait) => ({ fichier: chemin || "/", ligne: null, colonne: null, extrait });

/** Les pages du site parcourues avec succès */
export const pagesLues = (ctx) => ctx.parcours.pages.filter((p) => p.page);

/** Chaque analyseur demande un parcours ; sans lui, « Non mesurable » */
const avecParcours = (analyser) => (ctx) => {
  if (!ctx.parcours) return nonMesurable(ctx.raisonParcours ?? "Le site en ligne n'a pas pu être parcouru");
  if (pagesLues(ctx).length === 0) return nonMesurable(`Aucune page lue sur ${ctx.parcours.url}`);
  return analyser(ctx);
};

/** Q3 : erreurs d'accessibilité critiques ou graves, par page et par règle */
const Q3 = (ctx) => {
  const occurrences = pagesLues(ctx).flatMap((p) =>
    p.violations.flatMap((v) => v.noeuds.map((html) => occ(p.chemin, `${v.aide} (${v.regle}, ${v.impact}) · ${html}`)))
  );
  const total = pagesLues(ctx).reduce((s, p) => s + p.violations.reduce((t, v) => t + v.total, 0), 0);
  return total === 0 ? respecte(0) : nonRespecte(total, occurrences, { detailValeur: `${total} éléments en erreur` });
};

/** Q4 : la page est plus large que l'écran à 360 px (défilement de côté, ou page réduite par le téléphone) */
const Q4 = (ctx) =>
  parAbsence(
    pagesLues(ctx)
      .filter((p) => p.debordement.largeur > p.debordement.viewport)
      .map((p) => occ(p.chemin, `${p.debordement.largeur} px de large pour ${p.debordement.viewport} px · ${p.debordement.coupables.map((c) => c.extrait).join(" ") || "élément non identifié"}`))
  );

/** Q5 : lang, title et description propres à la page, un seul h1 */
const Q5 = (ctx) => {
  const pages = pagesLues(ctx);
  const compte = (cle) => {
    const vus = new Map();
    for (const p of pages) if (p[cle]) vus.set(p[cle], (vus.get(p[cle]) ?? 0) + 1);
    return vus;
  };
  const titres = compte("titre");
  const descriptions = compte("description");
  const occurrences = pages.flatMap((p) => {
    const problemes = [];
    if (!p.lang) problemes.push("lang absent sur <html>");
    if (!p.titre) problemes.push("title absent");
    else if (titres.get(p.titre) > 1) problemes.push(`title partagé : « ${p.titre} »`);
    if (!p.description) problemes.push("meta description absente");
    else if (descriptions.get(p.description) > 1) problemes.push("meta description partagée avec une autre page");
    if (p.h1 !== 1) problemes.push(`${p.h1} h1`);
    return problemes.length ? [occ(p.chemin, problemes.join(" · "))] : [];
  });
  return occurrences.length ? nonRespecte(occurrences.length, occurrences, { detailValeur: `${occurrences.length} page(s) sur ${pages.length}` }) : respecte(0, { detailValeur: `${pages.length} pages` });
};

/** Q6 : sitemap.xml et robots.txt */
const Q6 = (ctx) => {
  const { robots, sitemapAnnonce, sitemap } = ctx.parcours;
  const manques = [];
  if (!sitemap.present) manques.push(occ("/sitemap.xml", "sitemap.xml absent ou vide"));
  if (!robots) manques.push(occ("/robots.txt", "robots.txt absent"));
  else if (!sitemapAnnonce) manques.push(occ("/robots.txt", "robots.txt n'annonce pas le sitemap (Sitemap: …)"));
  const detailValeur = sitemap.present ? `${sitemap.urls} adresses dans le sitemap` : undefined;
  if (manques.length === 0) return respecte(null, { detailValeur });
  return sitemap.present || robots ? partiel(null, manques, { detailValeur }) : nonRespecte(null, manques);
};

/** Q7 : EcoIndex de chaque page ; la valeur est le plus faible */
const Q7 = (ctx) => {
  const notes = pagesLues(ctx).map((p) => ({ page: p, ...ecoindex({ dom: p.dom, requetes: p.requetes, poidsKo: p.poidsKo }) }));
  const faibles = notes
    .filter((n) => n.score < reglesEco.scoreMin)
    .sort((a, b) => a.score - b.score)
    .map((n) => occ(n.page.chemin, `EcoIndex ${n.score} (${n.note}) · ${n.page.dom} éléments, ${n.page.requetes} requêtes, ${n.page.poidsKo} Ko`));
  const plusFaible = Math.min(...notes.map((n) => n.score));
  const moyenne = Math.round((notes.reduce((s, n) => s + n.score, 0) / notes.length) * 10) / 10;
  const detailValeur = `${plusFaible} pour la page la plus faible ; moyenne ${moyenne}`;
  return faibles.length ? nonRespecte(plusFaible, faibles, { detailValeur }) : respecte(plusFaible, { detailValeur });
};

/** Q8 : requêtes vers un autre propriétaire, sans aucune action du visiteur */
const Q8 = (ctx) => {
  const parHote = new Map();
  for (const p of pagesLues(ctx)) {
    for (const adresse of p.tiers) {
      const hote = new URL(adresse).hostname;
      const entree = parHote.get(hote) ?? { requetes: 0, pages: new Set(), exemple: adresse };
      entree.requetes++;
      entree.pages.add(p.chemin);
      parHote.set(hote, entree);
    }
  }
  const occurrences = [...parHote].map(([hote, e]) =>
    occ([...e.pages][0], `${categorieTiers(hote)} : ${hote} · ${e.requetes} requête(s) sur ${e.pages.size} page(s) · ${e.exemple.slice(0, 120)}`)
  );
  const cookiesTiers = ctx.parcours.cookies.filter((c) => c.tiers);
  for (const c of cookiesTiers) occurrences.push(occ("/", `Cookie déposé par ${c.domaine} : ${c.nom}`));
  return parAbsence(occurrences, { valeur: parHote.size, detailValeur: `${parHote.size} service(s)${cookiesTiers.length ? `, ${cookiesTiers.length} cookie(s) tiers` : ""}` });
};

/** La page de mentions légales : celle dont l'adresse ou un lien qui y mène en parle */
const pageMentions = (ctx) => {
  const pages = pagesLues(ctx);
  const parAdresse = pages.find((p) => mentionsLegales.lien.test(decodeURIComponent(p.chemin)));
  if (parAdresse) return parAdresse;
  const lien = pages.flatMap((p) => p.liens).find((l) => mentionsLegales.lien.test(l.texte));
  return lien ? pages.find((p) => normaliser(p.url) === normaliser(lien.href)) ?? null : null;
};

/** Q9 : une page de mentions légales, reliée depuis chaque page, qui nomme l'éditeur et l'hébergeur */
const Q9 = (ctx) => {
  const mentions = pageMentions(ctx);
  if (!mentions) return nonRespecte(null, [occ("/", "Aucune page de mentions légales trouvée parmi les pages parcourues")]);
  const manques = [];
  if (!mentionsLegales.editeur.test(mentions.texte)) manques.push(occ(mentions.chemin, "L'éditeur du site n'est pas nommé"));
  if (!mentionsLegales.hebergeur.test(mentions.texte)) manques.push(occ(mentions.chemin, "L'hébergeur n'est pas nommé"));
  const cible = normaliser(mentions.url);
  for (const p of pagesLues(ctx)) {
    if (p !== mentions && !p.liens.some((l) => normaliser(l.href) === cible)) manques.push(occ(p.chemin, "Pas de lien vers les mentions légales"));
  }
  return manques.length ? partiel(null, manques, { detailValeur: mentions.chemin }) : respecte(null, { detailValeur: mentions.chemin });
};

/** Q10 : son propre domaine, en HTTPS, l'adresse http:// redirigée */
const Q10 = (ctx) => {
  const { hote, https } = ctx.parcours;
  const manques = [];
  if (hebergeursGratuits.test(hote)) manques.push(occ("/", `${hote} : un sous-domaine d'hébergeur, pas un nom de domaine propre`));
  if (!https.actif) manques.push(occ("/", "Le site n'est pas servi en HTTPS"));
  else if (https.redirection === false) manques.push(occ("/", "http:// ne redirige pas vers https://"));
  if (manques.length === 0) return respecte(null, { detailValeur: hote });
  return manques.length === 1 && https.actif ? partiel(null, manques, { detailValeur: hote }) : nonRespecte(null, manques, { detailValeur: hote });
};

/** Q11 : liens internes vers une adresse qui répond en erreur */
const Q11 = (ctx) => {
  const occurrences = ctx.parcours.pages
    .filter((p) => p.statut >= 400 || (p.statut === 0 && p.erreur))
    .flatMap((p) => (ctx.parcours.citations.get(normaliser(p.url)) ?? ["(sitemap)"]).map((source) => occ(source, `Lien vers ${p.chemin} : ${p.statut || p.erreur}`)));
  return parAbsence(occurrences);
};

/** PR2 : les réseaux reliés depuis le site */
const PR2 = (ctx) => {
  const trouves = new Map();
  for (const p of pagesLues(ctx)) {
    for (const l of p.liens) {
      let hote;
      try {
        hote = new URL(l.href).hostname;
      } catch {
        continue;
      }
      const reseau = reseaux.find((r) => r.motif.test(hote));
      if (reseau && !trouves.has(reseau.nom)) trouves.set(reseau.nom, occ(p.chemin, `${reseau.nom} : ${l.href}`));
    }
  }
  const occurrences = [...trouves.values()];
  return occurrences.length >= thresholds.portfolio.reseauxMin
    ? { ...respecte(occurrences.length, { detailValeur: [...trouves.keys()].join(", ") }), occurrences }
    : nonRespecte(occurrences.length, occurrences, { detailValeur: [...trouves.keys()].join(", ") || "aucun" });
};

export default Object.fromEntries(Object.entries({ Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, PR2 }).map(([id, f]) => [id, avecParcours(f)]));
