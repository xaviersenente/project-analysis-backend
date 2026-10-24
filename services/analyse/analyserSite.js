/**
 * Analyse statique d'un site (lot 1) : inventaire, CSS, critères, notation,
 * vue par page, ressources et blocs d'axe, au format du résultat v2.
 * Chaque étape est isolée : une étape qui échoue rend ses critères « Non mesurable ».
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import sharp from "sharp";
import { inventorier } from "../source/inventaire.js";
import { chargerCss } from "../css/sources.js";
import { creerSuivi } from "../../utils/mesure.js";
import { creerContexte } from "./contexte.js";
import { nonMesurable } from "./mesure.js";
import { pointsParContrainte, points, noter } from "./notation.js";
import graphique, { variablesCouleur, enPixels } from "./graphique.js";
import ergonomie, { imagesDuSite, lienVersSoi } from "./ergonomie.js";
import accessibilite, { pagesParBalise, ecartsTitres } from "./accessibilite.js";
import methodologie, { problemesNom, classesCss, classesHtml, mesureBem, analyseJavascript } from "./methodologie.js";
import enNavigateur, { blocLighthouse, celluleLighthouse, poidsAccueil } from "./enNavigateur.js";
import { mesurerNavigateur } from "../runtime/navigateur.js";
import { lireHistorique } from "../source/historique.js";

const grille = createRequire(import.meta.url)("../../config/grille-sae105-2026.json");
const ANALYSEURS = { ...graphique, ...ergonomie, ...accessibilite, ...methodologie, ...enNavigateur };
const MAX_POINTS = pointsParContrainte(grille);

// Critères qui ne lisent que le HTML : ils restent mesurables si le CSS est illisible
const SANS_CSS = new Set(["E1", "E2", "E7", "E8", "E9", "E10", "E12", "E13", "E14", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A15", "A16", "M1", "M8", "M9", "M11", "M12", "M13", "M14", "G5", "G6", "G10"]);

/** Vue par page : les contrôles vérifiés page par page */
const vueParPage = (ctx) => {
  const compter = (lire) => {
    const vus = new Map();
    for (const p of ctx.pages) vus.set(lire(p), (vus.get(lire(p)) ?? 0) + 1);
    return vus;
  };
  const titres = compter((p) => p.$("title").first().text().trim());
  const descriptions = compter((p) => p.$('meta[name="description"]').attr("content")?.trim() ?? "");
  const cellule = (ok, detailOk, detailKo) => ({ verdict: ok ? "respecte" : "non-respecte", detail: ok ? detailOk : detailKo });

  return ctx.pages.map((page) => {
    const { $ } = page;
    const titre = $("title").first().text().trim();
    const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
    const navs = $("nav").toArray();
    const reperes = $("header").length && navs.length && navs.every((n) => $(n).attr("aria-label") || $(n).attr("aria-labelledby")) && $("main").length === 1 && $("footer").length;
    const ecarts = ecartsTitres(ctx, page);
    const erreursW3c = ctx.erreursW3cParPage?.[page.fichier];
    return {
      fichier: page.fichier,
      titre: titre || null,
      controles: {
        lang: cellule(Boolean($("html").attr("lang")), `lang="${$("html").attr("lang")}"`, "lang absent sur <html>"),
        titleUnique: cellule(titre && titres.get(titre) === 1, "title propre à la page", titre ? "title en double" : "title absent"),
        descriptionUnique: cellule(description && descriptions.get(description) === 1, "description propre à la page", description ? "description en double" : "description absente"),
        reperes: cellule(Boolean(reperes), "header, nav, main, footer", "repères incomplets"),
        h1Unique: cellule($("h1").length === 1, "1 h1", `${$("h1").length} h1`),
        titresSansSaut: cellule(!ecarts.some((e) => !/h1/.test(e.extrait)), "aucun niveau sauté", "un niveau de titre sauté"),
        menuPopover: cellule($("[popover]").length > 0 && $("[popovertarget]").length > 0, "popover et popovertarget", "menu sans popover"),
        ariaCurrent: lienVersSoi(page)
          ? cellule($(lienVersSoi(page)).attr("aria-current") === "page", 'aria-current="page"', "lien vers la page sans aria-current")
          : { verdict: "respecte", detail: "page absente du menu : rien à marquer" },
        w3c:
          erreursW3c === undefined
            ? { verdict: "non-mesurable", detail: "validation W3C indisponible" }
            : { verdict: erreursW3c ? "non-respecte" : "respecte", valeur: String(erreursW3c), detail: erreursW3c ? `${erreursW3c} erreurs de validation` : "aucune erreur" },
        lighthouseA11y: celluleLighthouse(ctx, page.fichier),
      },
    };
  });
};

/** Ressources : images (poids et dimensions lus sur le disque), polices, arborescence */
const ressources = async (ctx) => {
  const citations = new Map();
  for (const page of ctx.pages) {
    for (const img of page.images) {
      if (!img.chemin) continue;
      const existante = citations.get(img.chemin);
      citations.set(img.chemin, {
        alt: existante ? existante.alt : img.alt,
        loading: existante?.loading ?? img.loading,
        pages: [...new Set([...(existante?.pages ?? []), page.fichier])],
      });
    }
  }
  const images = [];
  for (const { fichier, poidsKo } of imagesDuSite(ctx)) {
    const citee = citations.get(fichier);
    let meta = {};
    try {
      meta = await sharp(path.join(ctx.racine, fichier)).metadata();
    } catch {
      // Dimensions illisibles : laissées vides
    }
    images.push({
      fichier,
      format: path.extname(fichier).slice(1).toLowerCase(),
      poidsKo,
      largeur: meta.width ?? null,
      hauteur: meta.height ?? null,
      // Une image de fond CSS est décorative : alt=""
      alt: citee ? citee.alt : "",
      loading: citee?.loading === "lazy" || citee?.loading === "eager" ? citee.loading : null,
      pages: citee?.pages ?? [],
    });
  }

  const prechargees = new Set(ctx.pages.flatMap((p) => p.policesPrechargees));
  const faces = [];
  ctx.css?.arbre.walkAtRules("font-face", (r) => faces.push(r));
  const polices = ctx.inventaire.fichiers
    .filter((f) => /\.(woff2?|ttf|otf)$/i.test(f))
    .map((fichier) => {
      const face = faces.find((r) => r.some((d) => d.prop === "src" && d.value.includes(path.posix.basename(fichier))));
      const lire = (prop) => face?.nodes.find((d) => d.prop === prop)?.value.replace(/["']/g, "") ?? null;
      return {
        fichier,
        famille: lire("font-family") ?? "inconnue",
        graisse: lire("font-weight") ?? "400",
        format: path.extname(fichier).slice(1).toLowerCase(),
        poidsKo: Math.round(fs.statSync(path.join(ctx.racine, fichier)).size / 1024),
        prechargee: prechargees.has(fichier),
      };
    });

  const arborescence = ctx.inventaire.fichiers.map((chemin) => ({ chemin, problemes: problemesNom(chemin) }));
  return { images, poidsAccueilKo: poidsAccueil(ctx), polices, arborescence };
};

/** Blocs propres à chaque axe */
const blocs = (ctx) => {
  const espacements = [...ctx.variables.entries()]
    .filter(([nom]) => /espace|space|spacing|gap|marge|margin|gouttiere|pas/i.test(nom))
    .map(([nom, { valeur }]) => ({ variable: nom, valeur, px: enPixels(ctx.resoudre(valeur)) }))
    .filter((e) => e.px !== null)
    .sort((a, b) => a.px - b.px);
  const tailles = new Map();
  ctx.declarations((d) => d.prop === "font-size").forEach((d) => {
    const resolue = ctx.resoudre(d.value);
    const px = enPixels(resolue);
    if (px === null || tailles.has(resolue)) return;
    const variable = d.value.match(/^var\((--[\w-]+)\)$/)?.[1] ?? null;
    tailles.set(resolue, { variable, valeur: resolue, px });
  });
  let famille = null;
  ctx.css.arbre.walkAtRules("font-face", (r) => {
    famille ??= r.nodes.find((d) => d.prop === "font-family")?.value.replace(/["']/g, "") ?? null;
  });

  const declarees = classesCss(ctx);
  const employees = classesHtml(ctx);
  const bem = mesureBem(ctx);
  return {
    graphique: {
      palette: variablesCouleur(ctx).map((c) => ({ variable: c.nom, valeur: c.valeur, role: c.role })),
      espacements,
      typographie: { famille, tailles: [...tailles.values()].sort((a, b) => a.px - b.px) },
    },
    accessibilite: { ...blocLighthouse(ctx), contenusAttendus: pagesParBalise(ctx) },
    methodologie: {
      javascript: analyseJavascript(ctx),
      classesInutilisees: { total: declarees.size, classes: [...declarees.keys()].filter((c) => !employees.has(c)) },
      bem: { ratio: Math.round(bem.ratio * 1000) / 10, points: bem.points, totalClasses: bem.totalClasses, horsConvention: bem.horsConvention.slice(0, 30) },
    },
  };
};

/**
 * @param {object} options
 * @param {string} options.racine - Racine du site sur le disque
 * @param {object} [options.promo] - Fichier de promo (contenus attendus)
 * @param {{ dossier: string, sha: string } | null} [options.git] - Historique de la version analysée
 * @param {boolean} [options.sansValidationW3c]
 * @param {string} [options.raisonEchec] - Sans racine : pourquoi le site n'a pas pu être lu
 * @param {string} [options.nomDepot] - Préfixe /<nom>/ du site servi en local
 * @param {boolean} [options.sansNavigateur] - Sans Lighthouse ni Puppeteer (analyse rapide)
 * @param {string} [options.emailEtudiant] - Pour repérer les commits d'un autre auteur
 */
export const analyserSite = async ({ racine, promo = {}, git = null, sansValidationW3c = false, raisonEchec = null, nomDepot = null, sansNavigateur = false, emailEtudiant = null }) => {
  const { nonMesurable: etapes, mesurer } = creerSuivi();
  const inventaire = racine ? await mesurer("Inventaire des pages", () => inventorier(racine)) : null;
  const css = inventaire ? await mesurer("CSS", () => chargerCss(inventaire)) : null;
  for (const e of css?.erreurs ?? []) etapes.push({ etape: `CSS (${e.fichier})`, raison: e.raison });

  const ctx = inventaire
    ? creerContexte({ racine, inventaire, css: css ?? { arbre: { walkDecls() {}, walkRules() {}, walkAtRules() {}, walkComments() {} }, feuilles: [], imports: [], fichierDe: () => ({}) }, promo, git })
    : null;
  if (ctx) {
    // Historique Git de la version évaluée (lot 3)
    if (git && promo.dateRendu) {
      ctx.historique = await mesurer("Historique Git", () =>
        lireHistorique({ dossier: git.dossier, sha: git.sha, dateRendu: promo.dateRendu, emailEtudiant })
      );
      if (!ctx.historique) ctx.raisonHistorique = etapes.at(-1)?.raison;
    } else {
      ctx.raisonHistorique = "Pas d'historique Git pour cette analyse";
    }
    ctx.sansValidationW3c = sansValidationW3c;
    ctx.nomDepot = nomDepot ?? path.basename(racine);
    if (sansNavigateur) {
      ctx.raisonNavigateur = "Contrôles en navigateur désactivés pour cette analyse";
    } else {
      ctx.navigateur = await mesurer("Navigateur (Lighthouse, Puppeteer)", () =>
        mesurerNavigateur({ racine, nom: ctx.nomDepot, fichiers: inventaire.fichiers, pages: inventaire.pages.map((p) => p.fichier) })
      );
      if (!ctx.navigateur) ctx.raisonNavigateur = etapes.at(-1)?.raison;
      for (const m of ctx.navigateur ?? []) if (m.erreur) etapes.push({ etape: `Navigateur (${m.fichier})`, raison: m.erreur });
    }
  }

  const criteres = [];
  for (const modele of grille.criteres) {
    let mesure;
    if (!ctx) mesure = nonMesurable(raisonEchec ?? "L'inventaire des pages a échoué");
    else if (!css && !SANS_CSS.has(modele.id)) mesure = nonMesurable("Le CSS n'a pas pu être lu");
    else {
      try {
        mesure = await ANALYSEURS[modele.id](ctx);
      } catch (error) {
        console.error(`⚠️ ${modele.id} : ${error.message}`);
        mesure = nonMesurable(`Analyse impossible : ${error.message.split("\n")[0]}`);
      }
    }
    const { bonusPoints, horsConvention, ...propre } = mesure;
    const critere = { ...modele, ...propre, bonusPoints };
    critere.points = points(critere, MAX_POINTS[modele.id]);
    delete critere.bonusPoints;
    critere.occurrences = (critere.occurrences ?? []).map((o) => ({ surligne: null, ...o }));
    critere.totalOccurrences = critere.occurrences.length;
    criteres.push(critere);
  }

  return {
    criteres,
    note: noter(criteres),
    pages: ctx ? vueParPage(ctx) : undefined,
    ressources: ctx ? await mesurer("Ressources", () => ressources(ctx)) ?? undefined : undefined,
    blocs: ctx && css ? await mesurer("Blocs d'axe", () => blocs(ctx)) ?? undefined : undefined,
    historique: ctx?.historique ?? undefined,
    nonMesurable: etapes,
  };
};
