/**
 * EcoIndex d'une page (méthode ecoindex.fr) : une estimation de son empreinte, d'après
 * le nombre d'éléments du DOM, le nombre de requêtes et le poids transféré.
 * Chaque grandeur est située dans les quantiles d'un échantillon de sites ; le score va de 0 à 100.
 */
import thresholds from "../../config/thresholds.js";

const QUANTILES = {
  dom: [0, 47, 75, 159, 233, 298, 358, 417, 476, 537, 603, 674, 753, 843, 949, 1076, 1237, 1459, 1801, 2479, 594601],
  requetes: [0, 2, 15, 25, 34, 42, 49, 56, 63, 70, 78, 86, 95, 105, 117, 130, 147, 170, 205, 281, 3920],
  // En Ko
  poids: [0, 1.37, 144.7, 319.53, 479.46, 631.97, 783.38, 937.91, 1098.62, 1265.47, 1448.32, 1648.27, 1876.08, 2142.06, 2465.37, 2866.31, 3401.59, 4155.73, 5400.08, 8037.54, 223212.26],
};

/** Place d'une valeur dans les quantiles, interpolée (0 à 20) */
export const quantile = (quantiles, valeur) => {
  for (let i = 1; i < quantiles.length; i++) {
    if (valeur < quantiles[i]) return i - 1 + (valeur - quantiles[i - 1]) / (quantiles[i] - quantiles[i - 1]);
  }
  return quantiles.length - 1;
};

/** Note de A à G d'après le score */
export const noteEcoindex = (score) => thresholds.portfolio.ecoindex.notes.find(([, min]) => score > min)?.[0] ?? "G";

/**
 * @param {{ dom: number, requetes: number, poidsKo: number }} page
 * @returns {{ score: number, note: string }}
 */
export const ecoindex = ({ dom, requetes, poidsKo }) => {
  const q = (3 * quantile(QUANTILES.dom, dom) + 2 * quantile(QUANTILES.requetes, requetes) + quantile(QUANTILES.poids, poidsKo)) / 6;
  const score = Math.round(Math.max(0, 100 - 5 * q) * 10) / 10;
  return { score, note: noteEcoindex(score) };
};
