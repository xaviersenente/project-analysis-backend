/**
 * Portfolio S3 : les acquis du S1 (SAÉ 105), mesurés sur le site publié.
 *
 * Le sujet du portfolio ne les redemande pas, mais un étudiant de S3 est censé les maîtriser.
 * Ce sont des informations (statut I, origine « s1-sae » dans la grille) : la note reste au jury.
 * La stack est libre (Astro, WordPress…) : on ne lit pas le code source, mais ce que le visiteur reçoit.
 * - le HTML rendu de chaque page (après les scripts) : les analyseurs du S1, tels quels ;
 * - le HTML servi : la validation W3C (M1) ;
 * - le réseau du parcours : poids et formats des images, polices chargées.
 * Les seuils sont ceux du S1 (config/seuils/sae105.js). Une occurrence situe l'élément dans la page :
 * `fichier` est son chemin, la ligne celle du HTML rendu (ou servi, pour M1), pas celle du dépôt.
 */
import path from "path";
import * as cheerio from "cheerio";
import postcss from "postcss";
import thresholds from "../../config/thresholds.js";
import { respecte, nonRespecte, partiel, nonMesurable, parRatio, parAbsence } from "./mesure.js";
import { creerContexte } from "./contexte.js";
import { position } from "../source/inventaire.js";
import { validateHTML } from "../html/validationService.js";
import accessibilite from "./accessibilite.js";
import ergonomie from "./ergonomie.js";
import { pagesLues } from "./qualiteWeb.js";

const { ergonomie: E, graphique: G } = thresholds.sae105;

const PHOTO = /^image\/(jpeg|png|webp|avif|gif)$/;
const HORS_CONTENU = /(^|\/)(favicons?|icons?\/app)\/|favicon|apple-touch-icon/i;

/** Une page rendue, sous la forme des pages de l'inventaire du S1 */
const pageRendue = (p) => {
  const $ = cheerio.load(p.html, { sourceCodeLocationInfo: true });
  const entier = (v) => (/^\d+$/.test(v ?? "") ? Number(v) : null);
  const images = $("img")
    .toArray()
    .map((el) => ({
      src: $(el).attr("src") ?? "",
      alt: $(el).attr("alt") ?? null,
      largeur: entier($(el).attr("width")),
      hauteur: entier($(el).attr("height")),
      loading: $(el).attr("loading") ?? null,
      ...position(p.html, el),
    }));
  return { fichier: p.chemin, url: p.url, html: p.html, images, policesPrechargees: p.polices?.prechargees ?? [] };
};

/** Le contexte des analyseurs du S1, construit sur les pages rendues (sans CSS du dépôt) */
const contexteS1 = (ctx) => {
  if (!ctx.contexteS1) {
    const pages = pagesLues(ctx).filter((p) => p.html).map(pageRendue);
    ctx.contexteS1 = creerContexte({ racine: null, inventaire: { pages }, css: { arbre: postcss.root() }, promo: ctx.promo });
  }
  return ctx.contexteS1;
};

/** Chaque mesure demande un parcours ; sans lui, « Non mesurable » */
const avecParcours = (analyser) => (ctx) => {
  if (!ctx.parcours) return nonMesurable(ctx.raisonParcours ?? "Le site en ligne n'a pas pu être parcouru");
  if (pagesLues(ctx).length === 0) return nonMesurable(`Aucune page lue sur ${ctx.parcours.url}`);
  return analyser(ctx);
};

/** Un analyseur du S1 appliqué tel quel aux pages rendues */
const commeAuS1 = (analyseur) => avecParcours((ctx) => analyseur(contexteS1(ctx)));

/** Les ressources chargées d'un type (Image, Font, Media), une fois chacune, avec la première page qui la charge */
const ressources = (ctx, type) => {
  const vues = new Map();
  for (const p of pagesLues(ctx)) {
    for (const r of p.ressources ?? []) if (r.type === type && !vues.has(r.url)) vues.set(r.url, { ...r, page: p.chemin });
  }
  return [...vues.values()];
};

const nomDe = (url) => path.posix.basename(new URL(url).pathname) || url;
const occRessource = (r, detail) => ({ fichier: r.page, ligne: null, colonne: null, extrait: `${nomDe(r.url)} · ${detail}`, surligne: null });

const imagesDeContenu = (ctx) => ressources(ctx, "Image").filter((r) => !HORS_CONTENU.test(new URL(r.url).pathname) && r.statut < 400);
const polices = (ctx) => ressources(ctx, "Font").filter((r) => r.statut < 400);

/** Les polices déclarées (@font-face) et utilisées, une fois chacune */
const policesDeclarees = (ctx) => {
  const vues = new Map();
  for (const p of pagesLues(ctx)) for (const f of p.polices?.declarees ?? []) vues.set(`${f.famille}|${f.graisse}|${f.style}`, { ...f, page: p.chemin });
  return [...vues.values()];
};

/** E2 : le lien du menu vers la page elle-même porte aria-current="page" */
const E2 = avecParcours((ctx) => {
  const s1 = contexteS1(ctx);
  const sansSlash = (u) => u.replace(/\/$/, "") || "/";
  const occurrences = s1.pages.flatMap((page) => {
    const ici = sansSlash(new URL(page.url).pathname);
    const lien = page.$("nav a[href]")
      .toArray()
      .find((el) => {
        try {
          const cible = new URL(page.$(el).attr("href"), page.url);
          return cible.host === new URL(page.url).host && sansSlash(cible.pathname) === ici;
        } catch {
          return false;
        }
      });
    return lien && page.$(lien).attr("aria-current") !== "page" ? [s1.occHtml(page, lien)] : [];
  });
  return occurrences.length === 0
    ? respecte(null, { detailValeur: `${s1.pages.length} pages sur ${s1.pages.length}` })
    : nonRespecte(null, occurrences, { detailValeur: `${s1.pages.length - occurrences.length} pages sur ${s1.pages.length}` });
});

/** E10 : aucune image de plus de imageMaxKo (poids transféré) */
const E10 = avecParcours((ctx) => {
  const images = imagesDeContenu(ctx);
  const lourdes = images.filter((i) => i.poidsKo > E.imageMaxKo);
  const max = images.reduce((m, i) => Math.max(m, i.poidsKo), 0);
  return lourdes.length === 0 ? respecte(max) : nonRespecte(max, lourdes.map((i) => occRessource(i, `${i.poidsKo} Ko`)));
});

/** E11 : le poids transféré de la page d'accueil, au chargement ; au-delà du seuil, ce qui pèse le plus */
const E11 = avecParcours((ctx) => {
  const accueil = pagesLues(ctx)[0];
  if (accueil.poidsKo < E.accueilMaxKo) return respecte(accueil.poidsKo);
  const lourdes = (accueil.plusLourdes ?? []).map((r) => ({ ...r, page: accueil.chemin }));
  const occurrences = lourdes.length ? lourdes.map((r) => occRessource(r, `${r.poidsKo} Ko (${r.type})`)) : [{ fichier: accueil.chemin, ligne: null, colonne: null, extrait: `${accueil.poidsKo} Ko transférés`, surligne: null }];
  return nonRespecte(accueil.poidsKo, occurrences, { detailValeur: `${accueil.poidsKo} Ko transférés au chargement` });
});

/** E12 : les photos en AVIF ou WebP (d'après le type servi) */
const E12 = avecParcours((ctx) => {
  const photos = imagesDeContenu(ctx).filter((i) => PHOTO.test(i.mime));
  const anciennes = photos.filter((i) => !E.formatsPhoto.includes(i.mime.split("/")[1]));
  return parRatio(photos.length - anciennes.length, photos.length, E.formatsPhotoRatio, anciennes.map((i) => occRessource(i, i.mime)));
});

/** G4 : polices web en woff2, font-display: swap, et une pile de secours */
const G4 = avecParcours((ctx) => {
  const fichiers = polices(ctx);
  const declarees = policesDeclarees(ctx);
  if (fichiers.length === 0 && declarees.length === 0) return respecte(null, { detailValeur: "aucune police web : polices du système" });
  const nonWoff2 = fichiers.filter((f) => f.mime !== "font/woff2" && !/\.woff2(\?|$)/.test(f.url));
  const sansSwap = declarees.filter((f) => f.display !== "swap");
  const generiques = new RegExp(`(^|,)\\s*(${G.famillesGeneriques.join("|")})\\s*(,|$)`);
  // Seulement les pages qui déclarent une police web : ailleurs, la police du système n'a pas besoin de secours
  const piles = pagesLues(ctx)
    .filter((p) => p.polices?.declarees.length)
    .map((p) => p.polices.pile)
    .filter(Boolean);
  const secours = piles.length > 0 && piles.every((pile) => generiques.test(pile));
  const reussis = [nonWoff2.length === 0, sansSwap.length === 0, secours];
  const detailValeur = `woff2 ${reussis[0] ? "✓" : "✕"} · swap ${reussis[1] ? "✓" : "✕"} · pile de secours ${reussis[2] ? "✓" : "✕"}`;
  const occurrences = [
    ...nonWoff2.map((f) => occRessource(f, f.mime)),
    ...sansSwap.map((f) => ({ fichier: f.page, ligne: null, colonne: null, extrait: `@font-face « ${f.famille} » ${f.graisse} : font-display ${f.display}`, surligne: null })),
    ...(secours ? [] : [{ fichier: pagesLues(ctx)[0].chemin, ligne: null, colonne: null, extrait: `font-family: ${piles[0] ?? "?"}  ← sans famille générique de secours`, surligne: null }]),
  ];
  const total = reussis.filter(Boolean).length;
  if (total === 3) return respecte(null, { detailValeur });
  return total === 0 ? nonRespecte(null, occurrences, { detailValeur }) : partiel(null, occurrences, { detailValeur });
});

/** G5 : des fichiers de police en nombre limité (graisses et styles) */
const G5 = avecParcours((ctx) => {
  const fichiers = polices(ctx);
  const occurrences = fichiers.map((f) => occRessource(f, `${f.poidsKo} Ko`));
  return fichiers.length <= G.policesMax ? respecte(fichiers.length) : nonRespecte(fichiers.length, occurrences);
});

/** G6 : les polices chargées sont préchargées (au moins une) */
const G6 = avecParcours((ctx) => {
  if (polices(ctx).length === 0) return respecte(null, { detailValeur: "aucune police web chargée" });
  const prechargees = new Set(pagesLues(ctx).flatMap((p) => p.polices?.prechargees ?? []));
  return prechargees.size > 0
    ? respecte(null, { detailValeur: `${prechargees.size} police${prechargees.size > 1 ? "s" : ""} préchargée${prechargees.size > 1 ? "s" : ""}` })
    : nonRespecte(null, [], { detailValeur: "aucun preload" });
});

/** M1 : la validation W3C du HTML tel que le serveur l'envoie */
const M1 = avecParcours(async (ctx) => {
  if (ctx.sansValidationW3c) return nonMesurable("Validation W3C désactivée pour cette analyse");
  const occurrences = [];
  const nonMesurees = [];
  const pages = pagesLues(ctx).filter((p) => p.source);
  for (const page of pages) {
    const { mesurable, erreurs, raison } = await validateHTML(page.source);
    if (!mesurable) {
      nonMesurees.push(raison);
      continue;
    }
    for (const e of erreurs) {
      occurrences.push({ fichier: page.chemin, ligne: e.lastLine ?? null, colonne: e.firstColumn ?? null, extrait: `${(e.extract ?? "").replace(/\n/g, " ").trim()}  ← ${e.message}`, surligne: null });
    }
  }
  if (pages.length === 0) return nonMesurable("Le HTML servi n'a pas pu être lu");
  if (nonMesurees.length === pages.length) return nonMesurable(nonMesurees[0]);
  return parAbsence(occurrences, { detailValeur: `${occurrences.length} erreur(s) sur ${pages.length - nonMesurees.length} page(s)` });
});

export default {
  A3: commeAuS1(accessibilite.A3),
  A4: commeAuS1(accessibilite.A4),
  A5: commeAuS1(accessibilite.A5),
  A7: commeAuS1(accessibilite.A7),
  A8: commeAuS1(accessibilite.A8),
  E2,
  E7: commeAuS1(ergonomie.E7),
  E8: commeAuS1(ergonomie.E8),
  E9: commeAuS1(ergonomie.E9),
  E10,
  E11,
  E12,
  E13: commeAuS1(ergonomie.E13),
  E14: commeAuS1(ergonomie.E14),
  G4,
  G5,
  G6,
  M1,
};
