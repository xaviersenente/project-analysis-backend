/**
 * Les règles de verdict communes aux profils : la SAÉ 105 (dépôt servi en local) et le portfolio
 * (site publié, acquis du S1) mesurent différemment, mais jugent de la même façon.
 * Chaque profil collecte ses données (fichiers du dépôt, ou réseau et navigateur) et les passe ici :
 * une règle, ses seuils (config/seuils/sae105.js) et ses libellés ne vivent qu'à un endroit.
 */
import thresholds from "../../config/thresholds.js";
import { validerHtmlEnLot } from "../html/validationService.js";
// Les profils construisent leurs occurrences avec le même outil que les règles
export { occSimple } from "./mesure.js";
import { respecte, nonRespecte, partiel, nonMesurable, parRatio, parAbsence, occSimple } from "./mesure.js";

const { ergonomie: E, graphique: G } = thresholds.sae105;

/** E2 : un contrôle page par page ; les occurrences disent les pages en échec */
export const regleParPage = (nbPages, occurrences) =>
  occurrences.length === 0
    ? respecte(null, { detailValeur: `${nbPages} pages sur ${nbPages}` })
    : nonRespecte(null, occurrences, { detailValeur: `${nbPages - new Set(occurrences.map((o) => o.fichier)).size} pages sur ${nbPages}` });

/** E3 : les états attendus, présents ou non dans le CSS */
export const ETATS = [":hover", ":focus-visible", ":active"];
export const regleEtats = (estPresent) => {
  const presents = ETATS.filter(estPresent);
  const manquants = ETATS.filter((e) => !presents.includes(e));
  const detailValeur = manquants.length ? `manque ${manquants.join(", ")}` : "les trois";
  if (manquants.length === 0) return respecte(ETATS.length, { detailValeur });
  return presents.length ? partiel(presents.length, [], { detailValeur }) : nonRespecte(0, [], { detailValeur });
};

/** E4 : les commandes trop petites, [{ occurrence, largeur, hauteur }] */
export const regleCibles = (petites) =>
  petites.length === 0
    ? respecte(null, { detailValeur: `toutes les commandes ≥ ${E.cibleTactilePx} px` })
    : nonRespecte(
        Math.min(...petites.map((c) => Math.min(c.largeur, c.hauteur))),
        petites.map((c) => c.occurrence)
      );

/**
 * E5, A14 : le débordement horizontal à une largeur donnée
 * @param {Array<{ fichier, largeur, viewport, coupables: Array<{ extrait, droite }> }>} pages
 * @param {number} limite - La largeur mesurée (360, 180)
 * @param {(fichier, extrait, precision) => object} occurrence - Situe un élément dans le profil
 */
export const regleDebordement = (pages, limite, occurrence) => {
  const fautives = pages.filter((m) => m.largeur > m.viewport);
  const occurrences = fautives.flatMap((m) =>
    m.coupables.length
      ? m.coupables.map((c) => occurrence(m.fichier, c.extrait, `dépasse jusqu'à ${c.droite} px`))
      : [occurrence(m.fichier, "", `page large de ${m.largeur} px`)]
  );
  const valeur = Math.max(...pages.map((m) => m.largeur));
  return fautives.length === 0
    ? respecte(valeur)
    : nonRespecte(valeur, occurrences, { detailValeur: `${fautives.length} page${fautives.length > 1 ? "s" : ""} sur ${pages.length}, à ${limite} px` });
};

/** E10 : aucune image de plus de imageMaxKo, [{ poidsKo, occurrence }] */
export const reglePoidsImages = (images) => {
  const lourdes = images.filter((i) => i.poidsKo > E.imageMaxKo);
  const max = images.reduce((m, i) => Math.max(m, i.poidsKo), 0);
  return lourdes.length === 0 ? respecte(max) : nonRespecte(max, lourdes.map((i) => i.occurrence));
};

/** E11 : le poids transféré de la page d'accueil */
export const reglePoidsAccueil = (poidsKo, occurrences = [], extra = {}) =>
  poidsKo < E.accueilMaxKo ? respecte(poidsKo) : nonRespecte(poidsKo, occurrences, extra);

/** E12 : les photos en AVIF ou WebP, [{ format, occurrence }] (format : avif, webp, jpeg…) */
export const regleFormatsPhotos = (photos) => {
  const anciennes = photos.filter((p) => !E.formatsPhoto.includes(p.format));
  return parRatio(photos.length - anciennes.length, photos.length, E.formatsPhotoRatio, anciennes.map((p) => p.occurrence));
};

/** A11 : s'il y a du mouvement, prefers-reduced-motion est pris en compte */
export const regleMouvementReduit = ({ mouvement, reduit, occurrences = [], detailPresent = "présent" }) => {
  if (!mouvement) return respecte(null, { detailValeur: "aucun mouvement" });
  return reduit ? respecte(null, { detailValeur: detailPresent }) : nonRespecte(null, occurrences, { detailValeur: "absent" });
};

/** G4 : woff2, font-display: swap et pile de secours ; les occurrences disent ce qui manque */
export const reglePolicesWeb = ({ woff2, swap, secours }, occurrences) => {
  const reussis = [woff2, swap, secours];
  const detailValeur = `woff2 ${woff2 ? "✓" : "✕"} · swap ${swap ? "✓" : "✕"} · pile de secours ${secours ? "✓" : "✕"}`;
  const total = reussis.filter(Boolean).length;
  if (total === 3) return respecte(null, { detailValeur });
  return total === 0 ? nonRespecte(null, occurrences, { detailValeur }) : partiel(null, occurrences, { detailValeur });
};

/** La pile de polices finit-elle par une famille générique (serif, system-ui…) ? */
export const aUneFamilleGenerique = (pile) => new RegExp(`(^|,)\\s*(${G.famillesGeneriques.join("|")})\\s*(,|$)`).test(pile);

/** G5 : des fichiers de police en nombre limité, [occurrence] une par fichier */
export const regleNombrePolices = (occurrences) =>
  occurrences.length <= G.policesMax ? respecte(occurrences.length) : nonRespecte(occurrences.length, occurrences);

/** G6 : des polices, dont au moins une préchargée */
export const reglePrechargement = (nbPolices, nbPrechargees, sansPolice) => {
  if (nbPolices === 0) return respecte(null, { detailValeur: sansPolice });
  return nbPrechargees > 0
    ? respecte(null, { detailValeur: `${nbPrechargees} police${nbPrechargees > 1 ? "s" : ""} préchargée${nbPrechargees > 1 ? "s" : ""}` })
    : nonRespecte(null, [], { detailValeur: "aucun preload" });
};

/** G8 : des tailles de texte distinctes en nombre resserré */
export const regleTailles = (tailles, { occurrences = [], detailToujours = false } = {}) => {
  const detailValeur = tailles.join(", ");
  return tailles.length <= G.taillesDistinctesMax
    ? respecte(tailles.length, detailToujours ? { detailValeur } : {})
    : nonRespecte(tailles.length, occurrences, { detailValeur });
};

/**
 * M1 : la validation W3C de chaque page, et une occurrence par erreur (la partie fautive surlignée)
 * @param {Array<{ fichier: string, html: string }>} pages
 * @returns {Promise<{ mesure: object, erreursParPage: Record<string, number> }>}
 */
export const validerPages = async (pages) => {
  if (pages.length === 0) return { mesure: nonMesurable("Aucune page à valider"), erreursParPage: {} };
  const { mesurable, erreurs, raison } = await validerHtmlEnLot(pages.map((p) => p.html));
  if (!mesurable) return { mesure: nonMesurable(raison), erreursParPage: {} };
  const occurrences = [];
  const erreursParPage = {};
  pages.forEach((page, i) => {
    erreursParPage[page.fichier] = erreurs[i].length;
    for (const e of erreurs[i]) {
      const extrait = `${(e.extract ?? "").replace(/\n/g, " ").trim()}  ← ${e.message}`;
      const debut = typeof e.hiliteStart === "number" ? e.hiliteStart - ((e.extract ?? "").length - (e.extract ?? "").trimStart().length) : -1;
      occurrences.push({
        fichier: page.fichier,
        ligne: e.lastLine ?? null,
        colonne: e.firstColumn ?? null,
        extrait,
        surligne: debut >= 0 && e.hiliteLength ? [debut, debut + e.hiliteLength] : null,
      });
    }
  });
  return { mesure: parAbsence(occurrences), erreursParPage };
};
