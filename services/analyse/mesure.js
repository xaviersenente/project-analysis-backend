/**
 * Fabrique des mesures rendues par les analyseurs.
 * Une mesure : { verdict, valeur, detailValeur?, occurrences, raison? }
 */

export const respecte = (valeur = null, extra = {}) => ({ verdict: "respecte", valeur, occurrences: [], ...extra });

export const nonRespecte = (valeur, occurrences = [], extra = {}) => ({
  verdict: "non-respecte",
  valeur,
  occurrences,
  ...extra,
});

export const partiel = (valeur, occurrences = [], extra = {}) => ({ verdict: "partiel", valeur, occurrences, ...extra });

/** Jamais une erreur imputée à l'étudiant : la mesure n'a pas pu se faire */
export const nonMesurable = (raison) => ({ verdict: "non-mesurable", valeur: null, occurrences: [], raison });

/** Critère manuel : les éléments relevés pour aider l'enseignant */
export const aJuger = (occurrences = [], extra = {}) => ({ verdict: "a-juger", valeur: null, occurrences, ...extra });

/**
 * Verdict d'un ratio face à un seuil (en proportion) ; valeur rendue en pourcentage
 * @param {number} ok - Éléments conformes
 * @param {number} total
 * @param {number} seuil - Proportion minimale (0 à 1)
 * @param {Array} occurrences - Les éléments non conformes
 */
export const parRatio = (ok, total, seuil, occurrences, extra = {}) => {
  if (total === 0) return respecte(null, { detailValeur: "rien à mesurer", ...extra });
  const pourcent = Math.round((ok / total) * 1000) / 10;
  return ok / total >= seuil
    ? { ...respecte(pourcent, extra), occurrences }
    : nonRespecte(pourcent, occurrences, extra);
};

/** Verdict d'un compte qui doit rester nul (erreurs, doublons…) */
export const parAbsence = (occurrences, extra = {}) =>
  occurrences.length === 0 ? respecte(0, extra) : nonRespecte(occurrences.length, occurrences, extra);
