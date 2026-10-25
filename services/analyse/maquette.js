/**
 * G11 : fidélité du site à la maquette Figma, et le bloc qui met côte à côte écrans et pages.
 * Sans maquette lisible, sans écran associé ou sans navigateur : « Non mesurable ».
 */
import thresholds from "../../config/thresholds.js";
import { respecte, nonRespecte, nonMesurable } from "./mesure.js";
import { occurrence, NAVIGATEUR } from "./enNavigateur.js";
import { comparerEcran } from "../maquette/comparaison.js";

const M = thresholds.sae105.graphique.maquette;

/** Une comparaison par écran associé dont la page a été relevée */
const comparaisons = (ctx) => {
  ctx.comparaisonsMaquette ??= ctx.maquette.paires.flatMap(({ ecran, fichier }) => {
    const releve = ctx.navigateur?.find((m) => m.fichier === fichier && !m.erreur)?.maquette;
    return releve ? [{ ecran, fichier, ...comparerEcran(ecran, releve, ctx.maquette.palette) }] : [];
  });
  return ctx.comparaisonsMaquette;
};

const ecartLisible = (e) => `${e.propriete} ${e.maquette} → ${e.site}`;

/** Les couleurs hors maquette de toutes les pages, une seule fois chacune */
const couleursHors = (liste) => {
  const vues = new Map();
  for (const c of liste) for (const h of c.couleursHorsMaquette) if (!vues.has(h.couleur)) vues.set(h.couleur, { ...h, fichier: c.fichier });
  return [...vues.values()];
};

export const G11 = (ctx) => {
  if (!ctx.maquette) return nonMesurable(ctx.raisonMaquette);
  if (!ctx.maquette.paires.length) {
    return nonMesurable("Aucun écran de la maquette n'a pu être associé à une page du site : à préciser dans le fichier de promo (champ ecrans)");
  }
  if (!ctx.navigateur) return nonMesurable(ctx.raisonNavigateur ?? NAVIGATEUR);
  const liste = comparaisons(ctx);
  if (!liste.length) return nonMesurable("Aucune page associée à un écran n'a pu être relevée en navigateur");

  const total = liste.reduce((s, c) => s + c.total, 0);
  const trouves = liste.reduce((s, c) => s + c.trouves, 0);
  const conformes = liste.reduce((s, c) => s + c.conformes, 0);
  const justifies = liste.reduce((s, c) => s + c.justifies, 0);
  const couleurs = couleursHors(liste);
  const occurrences = [
    ...liste.flatMap((c) =>
      c.textes
        .filter((t) => t.statut === "absent" || t.statut === "ecart")
        .map((t) =>
          t.statut === "absent"
            ? { fichier: c.fichier, ligne: null, colonne: null, extrait: `« ${t.texte} »  ← absent de la page (écran « ${c.ecran.nom} »)`, surligne: null }
            : occurrence(ctx, c.fichier, t.extrait, `« ${t.texte} » : ${t.ecarts.map(ecartLisible).join(", ")}`)
        )
    ),
    ...couleurs.map((h) => occurrence(ctx, h.fichier, h.extrait, `${h.couleur} absente de la maquette`)),
  ];
  // La valeur juge le style des textes retrouvés ; les absents comptent à part
  const valeur = trouves ? Math.round((conformes / trouves) * 1000) / 10 : null;
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const extra = {
    detailValeur:
      `${conformes} textes au style de la maquette sur ${trouves} retrouvés` +
      (justifies ? ` (dont ${justifies} corrigés pour l'accessibilité)` : "") +
      ` · ${pluriel(total - trouves, "absent")} sur ${total} · ${pluriel(couleurs.length, "couleur")} hors maquette`,
  };
  const fidele =
    (total === 0 || (trouves / total >= M.textesTrouvesRatio && conformes / trouves >= M.textesConformesRatio)) &&
    couleurs.length <= M.couleursHorsMaquetteMax;
  return fidele ? { ...respecte(valeur, extra), occurrences } : nonRespecte(valeur, occurrences, extra);
};

/** Bloc Graphique : chaque écran avec sa page, ses comptes et ses deux captures */
export const blocMaquette = (ctx) => {
  if (!ctx.maquette) return undefined;
  const liste = ctx.navigateur ? comparaisons(ctx) : [];
  const compte = (c, statut) => c?.textes.filter((t) => t.statut === statut).length ?? null;
  const ecrans = [
    ...ctx.maquette.paires.map(({ ecran, fichier }) => {
      const c = liste.find((x) => x.fichier === fichier);
      return {
        nom: ecran.nom,
        fichier,
        largeur: ecran.largeur,
        textes: c ? { total: c.total, conformes: c.conformes, justifies: c.justifies, ecarts: compte(c, "ecart"), absents: compte(c, "absent") } : null,
        captures: ctx.capturesMaquette?.get(fichier) ?? { maquette: null, site: null },
      };
    }),
    ...ctx.maquette.ecransSansPage.map((nom) => ({ nom, fichier: null, largeur: null, textes: null, captures: { maquette: null, site: null } })),
  ];
  return {
    url: ctx.maquette.url,
    version: ctx.maquette.version,
    ecrans,
    pagesSansEcran: ctx.maquette.pagesSansEcran,
    couleursHorsMaquette: couleursHors(liste).map((h) => h.couleur),
  };
};

export default { G11 };
