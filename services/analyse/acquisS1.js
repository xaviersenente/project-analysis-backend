/**
 * Portfolio S3 : les acquis du S1 (SAÉ 105), mesurés sur le site publié.
 *
 * Le sujet du portfolio ne les redemande pas, mais un étudiant de S3 est censé les maîtriser.
 * Ce sont des informations (statut I, origine « s1-sae » dans la grille) : la note reste au jury.
 * La stack est libre (Astro, WordPress…) : on ne lit pas le code source, mais ce que le visiteur reçoit.
 * - le HTML rendu de chaque page (après les scripts) : les analyseurs du S1, tels quels ;
 * - le HTML servi : la validation W3C (M1) ;
 * - le réseau du parcours : poids et formats des images, polices chargées ;
 * - en page : focus au clavier (A10), CSS et scripts reçus (E3, A11), commandes (E4),
 *   zoom à 200 % (A14), tailles de texte affichées (G8), longueur des lignes à 1 280 px (G9).
 *
 * Ce module ne fait que collecter : les verdicts viennent des analyseurs du S1 ou des règles
 * communes (regles.js), avec les seuils du S1 (config/seuils/sae105.js). Seuls A10 et G9 ont une
 * règle propre : au clavier et à l'écran, là où le S1 lit le CSS du dépôt.
 * Une occurrence situe l'élément dans la page : `fichier` est son chemin, la ligne celle du HTML
 * rendu (ou servi, pour M1), pas celle du dépôt.
 */
import path from "path";
import * as cheerio from "cheerio";
import postcss from "postcss";
import thresholds from "../../config/thresholds.js";
import { respecte, nonRespecte, nonMesurable, parAbsence } from "./mesure.js";
import { creerContexte } from "./contexte.js";
import { position } from "../source/inventaire.js";
import accessibilite from "./accessibilite.js";
import ergonomie from "./ergonomie.js";
import { pagesLues } from "./qualiteWeb.js";
import {
  occSimple,
  regleParPage,
  regleEtats,
  regleCibles,
  regleDebordement,
  reglePoidsImages,
  reglePoidsAccueil,
  regleFormatsPhotos,
  regleMouvementReduit,
  reglePolicesWeb,
  aUneFamilleGenerique,
  regleNombrePolices,
  reglePrechargement,
  regleTailles,
  validerPages,
} from "./regles.js";

const { accessibilite: A } = thresholds.sae105;
const ACQUIS = thresholds.portfolio.parcours.acquis;

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

/** Les pages dont un relevé a abouti ; sans aucune, « Non mesurable » */
const avecReleve = (cle, raison, analyser) =>
  avecParcours((ctx) => {
    const pages = pagesLues(ctx).filter((p) => p[cle]);
    return pages.length ? analyser(pages, ctx) : nonMesurable(raison);
  });

/** Les ressources chargées d'un type (Image, Font, Media), une fois chacune, avec la première page qui la charge */
const ressources = (ctx, type) => {
  const vues = new Map();
  for (const p of pagesLues(ctx)) {
    for (const r of p.ressources ?? []) if (r.type === type && !vues.has(r.url)) vues.set(r.url, { ...r, page: p.chemin });
  }
  return [...vues.values()];
};

const nomDe = (url) => path.posix.basename(new URL(url).pathname) || url;
const occRessource = (r, detail) => occSimple(r.page, `${nomDe(r.url)} · ${detail}`);

const imagesDeContenu = (ctx) => ressources(ctx, "Image").filter((r) => !HORS_CONTENU.test(new URL(r.url).pathname) && r.statut < 400);
const polices = (ctx) => ressources(ctx, "Font").filter((r) => r.statut < 400);

/** Les polices déclarées (@font-face) et utilisées, une fois chacune */
const policesDeclarees = (ctx) => {
  const vues = new Map();
  for (const p of pagesLues(ctx)) for (const f of p.polices?.declarees ?? []) vues.set(`${f.famille}|${f.graisse}|${f.style}`, { ...f, page: p.chemin });
  return [...vues.values()];
};

/** Un élément relevé à l'écran, une seule fois sur le site (un menu se répète de page en page) */
const unique = (elements) => {
  const vus = new Set();
  return elements.filter((e) => !vus.has(e.extrait) && vus.add(e.extrait));
};
const occElement = (e, precision) => occSimple(e.page, precision ? `${e.extrait}  ← ${precision}` : e.extrait);
const surLesPages = (ctx, cle) => pagesLues(ctx).flatMap((p) => (p[cle] ?? []).map((e) => ({ ...e, page: p.chemin })));

// ---------- Règles du S1, données du site publié ----------

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
  return regleParPage(s1.pages.length, occurrences);
});

/** E10 : le poids transféré de chaque image de contenu */
const E10 = avecParcours((ctx) => reglePoidsImages(imagesDeContenu(ctx).map((i) => ({ poidsKo: i.poidsKo, occurrence: occRessource(i, `${i.poidsKo} Ko`) }))));

/** E11 : le poids de l'accueil au chargement ; au-delà du seuil, ce qui pèse le plus */
const E11 = avecParcours((ctx) => {
  const accueil = pagesLues(ctx)[0];
  const lourdes = (accueil.plusLourdes ?? []).map((r) => occRessource({ ...r, page: accueil.chemin }, `${r.poidsKo} Ko (${r.type})`));
  return reglePoidsAccueil(accueil.poidsKo, lourdes.length ? lourdes : [occSimple(accueil.chemin, `${accueil.poidsKo} Ko transférés`)], {
    detailValeur: `${accueil.poidsKo} Ko transférés au chargement`,
  });
});

/** E12 : les photos en AVIF ou WebP, d'après le type servi */
const E12 = avecParcours((ctx) =>
  regleFormatsPhotos(
    imagesDeContenu(ctx)
      .filter((i) => PHOTO.test(i.mime))
      .map((i) => ({ format: i.mime.split("/")[1], occurrence: occRessource(i, i.mime) }))
  )
);

/** G4 : polices chargées en woff2, déclarées en swap, pile de secours sur les pages qui les emploient */
const G4 = avecParcours((ctx) => {
  const fichiers = polices(ctx);
  const declarees = policesDeclarees(ctx);
  if (fichiers.length === 0 && declarees.length === 0) return respecte(null, { detailValeur: "aucune police web : polices du système" });
  const nonWoff2 = fichiers.filter((f) => f.mime !== "font/woff2" && !/\.woff2(\?|$)/.test(f.url));
  const sansSwap = declarees.filter((f) => f.display !== "swap");
  // Seulement les pages qui déclarent une police web : ailleurs, la police du système n'a pas besoin de secours
  const piles = pagesLues(ctx)
    .filter((p) => p.polices?.declarees.length)
    .map((p) => p.polices.pile)
    .filter(Boolean);
  const secours = piles.length > 0 && piles.every(aUneFamilleGenerique);
  return reglePolicesWeb({ woff2: nonWoff2.length === 0, swap: sansSwap.length === 0, secours }, [
    ...nonWoff2.map((f) => occRessource(f, f.mime)),
    ...sansSwap.map((f) => occSimple(f.page, `@font-face « ${f.famille} » ${f.graisse} : font-display ${f.display}`)),
    ...(secours ? [] : [occSimple(pagesLues(ctx)[0].chemin, `font-family: ${piles[0] ?? "?"}  ← sans famille générique de secours`)]),
  ]);
});

/** G5 : les fichiers de police chargés */
const G5 = avecParcours((ctx) => regleNombrePolices(polices(ctx).map((f) => occRessource(f, `${f.poidsKo} Ko`))));

/** G6 : au moins une police chargée est préchargée */
const G6 = avecParcours((ctx) =>
  reglePrechargement(polices(ctx).length, new Set(pagesLues(ctx).flatMap((p) => p.polices?.prechargees ?? [])).size, "aucune police web chargée")
);

/** M1 : la validation W3C du HTML tel que le serveur l'envoie */
const M1 = avecParcours(async (ctx) => {
  if (ctx.sansValidationW3c) return nonMesurable("Validation W3C désactivée pour cette analyse");
  const pages = pagesLues(ctx).filter((p) => p.source);
  if (pages.length === 0) return nonMesurable("Le HTML servi n'a pas pu être lu");
  const { mesure } = await validerPages(pages.map((p) => ({ fichier: p.chemin, html: p.source })));
  return mesure;
});

/** A11 : mouvement (CSS ou animations au chargement), et prefers-reduced-motion dans le CSS ou les scripts */
const A11 = avecReleve("styles", "Styles de la page non lus", (pages) => {
  const css = pages.some((p) => p.styles.reduitCss);
  const js = pages.some((p) => p.styles.reduitJs);
  return regleMouvementReduit({
    mouvement: pages.some((p) => p.styles.mouvementCss || p.styles.animations > 0),
    reduit: css || js,
    detailPresent: `présent (${[css && "CSS", js && "script"].filter(Boolean).join(" et ")})`,
    occurrences: pages
      .filter((p) => p.styles.animations > 0)
      .slice(0, 5)
      .map((p) => occSimple(p.chemin, `${p.styles.animations} animation(s) au chargement`)),
  });
});

/** E3 : les états dans le CSS du site */
const CLES_ETATS = { ":hover": "hover", ":focus-visible": "focusVisible", ":active": "active" };
const E3 = avecReleve("styles", "Styles de la page non lus", (pages) => regleEtats((etat) => pages.some((p) => p.styles[CLES_ETATS[etat]])));

/** E4 : boutons et liens sans texte, à 360 px */
const E4 = avecParcours((ctx) => regleCibles(unique(surLesPages(ctx, "cibles")).map((c) => ({ ...c, occurrence: occElement(c, `${c.largeur} × ${c.hauteur} px`) }))));

/** A14 : le débordement à 180 px, soit 360 px zoomés à 200 % */
const A14 = avecReleve("zoom", "Zoom non mesuré", (pages) =>
  regleDebordement(
    pages.map((p) => ({ fichier: p.chemin, ...p.zoom })),
    A.zoomViewportPx,
    (fichier, extrait, precision) => occSimple(fichier, extrait ? `${extrait}  ← ${precision}` : precision)
  )
);

/** G8 : les tailles de texte affichées, toutes pages confondues */
const G8 = avecParcours((ctx) => {
  const tailles = new Map();
  for (const t of surLesPages(ctx, "tailles")) if (!tailles.has(t.px)) tailles.set(t.px, t);
  const liste = [...tailles.values()].sort((a, b) => a.px - b.px);
  return regleTailles(
    liste.map((t) => `${t.px} px`),
    { occurrences: liste.map((t) => occElement(t, `${t.px} px`)), detailToujours: true }
  );
});

// ---------- Règles propres au site publié ----------

/** A10 : chaque commande atteinte au clavier change d'apparence (contour, ombre, fond, couleur…) */
const A10 = avecParcours((ctx) => {
  const atteintes = unique(surLesPages(ctx, "focus"));
  if (atteintes.length === 0) return nonMesurable("Aucune commande atteinte au clavier (touche Tab)");
  const invisibles = atteintes.filter((e) => !e.visible);
  return parAbsence(
    invisibles.map((e) => occElement(e, "aucun changement visible au focus")),
    { detailValeur: `${atteintes.length - invisibles.length} commande(s) sur ${atteintes.length} atteintes au clavier` }
  );
});

/** G9 : à 1 280 px, aucune ligne de paragraphe au-delà de longueurLigneMaxCh caractères */
const G9 = avecParcours((ctx) => {
  const lignes = surLesPages(ctx, "lignes");
  if (lignes.length === 0) return respecte(null, { detailValeur: "aucun paragraphe long" });
  const max = Math.max(...lignes.map((l) => l.ch));
  const longues = unique(lignes.filter((l) => l.ch > ACQUIS.longueurLigneMaxCh));
  return longues.length === 0 ? respecte(max) : nonRespecte(max, longues.map((l) => occElement(l, `${l.ch} caractères par ligne à ${ACQUIS.largeurLignePx} px`)));
});

export default {
  // Analyseurs du S1, tels quels, sur le HTML rendu
  A3: commeAuS1(accessibilite.A3),
  A4: commeAuS1(accessibilite.A4),
  A5: commeAuS1(accessibilite.A5),
  A7: commeAuS1(accessibilite.A7),
  A8: commeAuS1(accessibilite.A8),
  E7: commeAuS1(ergonomie.E7),
  E8: commeAuS1(ergonomie.E8),
  E9: commeAuS1(ergonomie.E9),
  E13: commeAuS1(ergonomie.E13),
  E14: commeAuS1(ergonomie.E14),
  // Règles du S1, données du site publié
  E2,
  E3,
  E4,
  E10,
  E11,
  E12,
  A11,
  A14,
  G4,
  G5,
  G6,
  G8,
  M1,
  // Règles propres au site publié
  A10,
  G9,
};
