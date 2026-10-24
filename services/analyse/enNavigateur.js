/**
 * Critères mesurés en navigateur (lot 2) : E4, E5, E11, E15, A12, A13, A14,
 * et les requêtes en échec qui complètent M9. Sans navigateur, « Non mesurable ».
 */
import thresholds from "../../config/thresholds.js";
import { respecte, nonRespecte, nonMesurable, parAbsence } from "./mesure.js";
import methodologie from "./methodologie.js";

const { ergonomie, accessibilite } = thresholds.sae105;
export const NAVIGATEUR = "Contrôle en navigateur (Lighthouse, Puppeteer) non lancé";

/** Les mesures des pages qui ont abouti ; sinon la raison pour laquelle rien n'est mesurable */
const mesures = (ctx) => {
  if (!ctx.navigateur) return { raison: ctx.raisonNavigateur ?? NAVIGATEUR };
  const abouties = ctx.navigateur.filter((m) => !m.erreur);
  if (abouties.length === 0) return { raison: ctx.navigateur[0]?.erreur ?? NAVIGATEUR };
  return { pages: abouties };
};

/**
 * Occurrence d'un élément relevé à l'écran : sa ligne retrouvée dans le HTML source.
 * Les éléments arrivent dans l'ordre du document : une balise répétée à l'identique
 * est cherchée après la précédente, pour que chacune garde sa ligne.
 */
const occurrence = (ctx, fichier, extrait, precision) => {
  const page = ctx.pages.find((p) => p.fichier === fichier);
  ctx.curseurs ??= new Map();
  const cle = `${fichier}|${extrait}`;
  const depart = ctx.curseurs.has(cle) ? ctx.curseurs.get(cle) + 1 : 0;
  let debut = extrait ? page?.html.indexOf(extrait, depart) ?? -1 : -1;
  // Plus d'autre exemplaire dans le source (élément ajouté au rendu) : la première ligne
  if (debut < 0 && extrait && depart > 0) debut = page.html.indexOf(extrait);
  if (debut >= 0) ctx.curseurs.set(cle, debut);
  const ligne = debut >= 0 ? page.html.slice(0, debut).split("\n").length : null;
  return {
    fichier,
    ligne,
    colonne: null,
    extrait: precision ? `${extrait}  ← ${precision}` : extrait,
    surligne: null,
  };
};

const moyenne = (valeurs) => {
  const connues = valeurs.filter((v) => typeof v === "number");
  return connues.length ? Math.round(connues.reduce((s, v) => s + v, 0) / connues.length) : null;
};

/** Débordement horizontal à une largeur donnée (E5 à 360 px, A14 à 180 px) */
const debordement = (ctx, cle, limite) => {
  const { pages, raison } = mesures(ctx);
  if (!pages) return nonMesurable(raison);
  const fautives = pages.filter((m) => m[cle].largeur > m[cle].viewport);
  const occurrences = fautives.flatMap((m) =>
    m[cle].coupables.length
      ? m[cle].coupables.map((c) => occurrence(ctx, m.fichier, c.extrait, `dépasse jusqu'à ${c.droite} px`))
      : [occurrence(ctx, m.fichier, "", `page large de ${m[cle].largeur} px`)]
  );
  const valeur = Math.max(...pages.map((m) => m[cle].largeur));
  return fautives.length === 0 ? respecte(valeur) : nonRespecte(valeur, occurrences, { detailValeur: `${fautives.length} page${fautives.length > 1 ? "s" : ""} sur ${pages.length}, à ${limite} px` });
};

/** Moyennes Lighthouse et paires en échec, pour le bloc Accessibilité */
export const blocLighthouse = (ctx) => {
  const { pages } = mesures(ctx);
  if (!pages) return {};
  const scores = (cle) => moyenne(pages.map((m) => m.lighthouse.scores[cle]));
  return {
    lighthouse: {
      performance: scores("performance"),
      accessibilite: scores("accessibilite"),
      bonnesPratiques: scores("bonnesPratiques"),
      seo: scores("seo"),
    },
    contrastes: pages.flatMap((m) =>
      m.lighthouse.contrastes.map((c) => ({ texte: c.texte, fond: c.fond, rapport: c.rapport, requis: c.requis, page: m.fichier, selecteur: c.selecteur }))
    ),
  };
};

/** Cellule Lighthouse Accessibilité de la vue par page */
export const celluleLighthouse = (ctx, fichier) => {
  const mesure = ctx.navigateur?.find((m) => m.fichier === fichier);
  if (!mesure) return { verdict: "non-mesurable", detail: ctx.raisonNavigateur ?? NAVIGATEUR };
  if (mesure.erreur) return { verdict: "non-mesurable", detail: mesure.erreur };
  const score = mesure.lighthouse.scores.accessibilite;
  const ok = score >= accessibilite.lighthouseObjectif;
  return { verdict: ok ? "respecte" : "non-respecte", valeur: String(score), detail: ok ? `score ${score}` : `score ${score}, objectif ${accessibilite.lighthouseObjectif}` };
};

/** Poids transféré de la page d'accueil, en Ko */
export const poidsAccueil = (ctx) => {
  const { pages } = mesures(ctx);
  return pages?.find((m) => m.fichier === "index.html")?.lighthouse.poidsKo ?? null;
};

export default {
  E4: (ctx) => {
    const { pages, raison } = mesures(ctx);
    if (!pages) return nonMesurable(raison);
    const petites = pages.flatMap((m) => m.cibles.map((c) => ({ ...c, fichier: m.fichier })));
    const occurrences = petites.map((c) => occurrence(ctx, c.fichier, c.extrait, `${c.largeur} × ${c.hauteur} px`));
    const valeur = petites.length ? Math.min(...petites.map((c) => Math.min(c.largeur, c.hauteur))) : null;
    return petites.length === 0 ? respecte(null, { detailValeur: "toutes les cibles isolées ≥ 44 px" }) : nonRespecte(valeur, occurrences);
  },

  E5: (ctx) => debordement(ctx, "debordement", ergonomie.viewportPx),

  E11: (ctx) => {
    const { pages, raison } = mesures(ctx);
    if (!pages) return nonMesurable(raison);
    const poids = poidsAccueil(ctx);
    if (poids === null) return nonMesurable("Pas de page index.html mesurée");
    return poids < ergonomie.accueilMaxKo ? respecte(poids) : nonRespecte(poids);
  },

  E15: (ctx) => {
    const { pages, raison } = mesures(ctx);
    if (!pages) return nonMesurable(raison);
    // Information : dépend de l'hébergement et de la machine
    return respecte(moyenne(pages.map((m) => m.lighthouse.scores.performance)), { detailValeur: "moyenne des pages" });
  },

  A12: (ctx) => {
    const { pages, raison } = mesures(ctx);
    if (!pages) return nonMesurable(raison);
    return parAbsence(
      pages.flatMap((m) =>
        m.lighthouse.contrastes.map((c) => occurrence(ctx, m.fichier, c.extrait, `${c.texte} sur ${c.fond} · ${String(c.rapport).replace(".", ",")}:1, requis ${String(c.requis).replace(".", ",")}:1`))
      )
    );
  },

  A13: (ctx) => {
    const { pages, raison } = mesures(ctx);
    if (!pages) return nonMesurable(raison);
    const valeur = moyenne(pages.map((m) => m.lighthouse.scores.accessibilite));
    const basses = pages
      .filter((m) => m.lighthouse.scores.accessibilite < accessibilite.lighthouseObjectif)
      .map((m) => occurrence(ctx, m.fichier, "", `score ${m.lighthouse.scores.accessibilite}`));
    return valeur >= accessibilite.lighthouseObjectif
      ? { ...respecte(valeur, { detailValeur: "moyenne des pages" }), occurrences: basses }
      : nonRespecte(valeur, basses, { detailValeur: "moyenne des pages" });
  },

  A14: (ctx) => debordement(ctx, "zoom", accessibilite.zoomViewportPx),

  // Ressources cassées : l'inventaire statique, plus les requêtes en échec pendant le chargement
  M9: (ctx) => {
    const statique = methodologie.M9(ctx);
    const { pages } = mesures(ctx);
    if (!pages) return statique;
    const prefixe = new URL(`/${encodeURIComponent(ctx.nomDepot ?? "")}/`, "http://local").pathname;
    const dejaVus = new Set(statique.occurrences.map((o) => `${o.fichier}|${o.extrait}`));
    const vus = new Set();
    const supplementaires = pages.flatMap((m) =>
      m.echecs
        .map((e) => {
          const chemin = decodeURIComponent(new URL(e.url).pathname);
          const relatif = chemin.startsWith(prefixe) ? chemin.slice(prefixe.length) : chemin;
          return { fichier: m.fichier, relatif, statut: e.statut };
        })
        // Déjà relevée par l'inventaire (même page, même ressource) : une seule occurrence
        .filter(({ fichier, relatif }) => ![...dejaVus].some((v) => v.startsWith(`${fichier}|`) && v.includes(relatif.split("/").pop())))
        .filter(({ fichier, relatif }) => !vus.has(`${fichier}|${relatif}`) && vus.add(`${fichier}|${relatif}`))
        .map(({ fichier, relatif, statut }) => ({ fichier, ligne: null, colonne: null, extrait: `${relatif} ← ${statut || "échec"} au chargement`, surligne: null }))
    );
    return parAbsence([...statique.occurrences, ...supplementaires]);
  },
};
