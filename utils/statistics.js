/**
 * Utilitaires statistiques réutilisables
 * Évite la duplication des calculs mathématiques de base
 */

/**
 * Calcule la moyenne d'un tableau de nombres
 * @param {number[]} values - Tableau de valeurs
 * @returns {number|null} Moyenne ou null si tableau vide
 */
function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const validValues = values.filter((v) => typeof v === "number" && !isNaN(v));
  if (validValues.length === 0) {
    return null;
  }

  const sum = validValues.reduce((acc, val) => acc + val, 0);
  return sum / validValues.length;
}

/**
 * Calcule la médiane d'un tableau de nombres
 * @param {number[]} values - Tableau de valeurs
 * @returns {number|null} Médiane ou null si tableau vide
 */
function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const validValues = values
    .filter((v) => typeof v === "number" && !isNaN(v))
    .sort((a, b) => a - b);

  if (validValues.length === 0) {
    return null;
  }

  const mid = Math.floor(validValues.length / 2);

  if (validValues.length % 2 === 0) {
    return (validValues[mid - 1] + validValues[mid]) / 2;
  }

  return validValues[mid];
}

/**
 * Calcule le minimum d'un tableau
 * @param {number[]} values - Tableau de valeurs
 * @returns {number|null} Minimum ou null si tableau vide
 */
function min(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const validValues = values.filter((v) => typeof v === "number" && !isNaN(v));
  if (validValues.length === 0) {
    return null;
  }

  return Math.min(...validValues);
}

/**
 * Calcule le maximum d'un tableau
 * @param {number[]} values - Tableau de valeurs
 * @returns {number|null} Maximum ou null si tableau vide
 */
function max(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const validValues = values.filter((v) => typeof v === "number" && !isNaN(v));
  if (validValues.length === 0) {
    return null;
  }

  return Math.max(...validValues);
}

/**
 * Calcule l'écart-type d'un tableau de nombres
 * @param {number[]} values - Tableau de valeurs
 * @returns {number|null} Écart-type ou null si tableau vide
 */
function standardDeviation(values) {
  const avg = average(values);
  if (avg === null) {
    return null;
  }

  const validValues = values.filter((v) => typeof v === "number" && !isNaN(v));
  const squaredDiffs = validValues.map((v) => Math.pow(v - avg, 2));
  const avgSquaredDiff = average(squaredDiffs);

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calcule les quartiles d'un tableau
 * @param {number[]} values - Tableau de valeurs
 * @returns {Object|null} { q1, q2 (median), q3 } ou null
 */
function quartiles(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = values
    .filter((v) => typeof v === "number" && !isNaN(v))
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return null;
  }

  const q2 = median(sorted);
  const mid = Math.floor(sorted.length / 2);

  const lowerHalf = sorted.slice(0, mid);
  const upperHalf =
    sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);

  return {
    q1: median(lowerHalf),
    q2,
    q3: median(upperHalf),
  };
}

/**
 * Calcule un résumé statistique complet
 * @param {number[]} values - Tableau de valeurs
 * @returns {Object} Objet avec toutes les statistiques
 */
function summary(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const validValues = values.filter((v) => typeof v === "number" && !isNaN(v));

  if (validValues.length === 0) {
    return null;
  }

  return {
    count: validValues.length,
    min: min(validValues),
    max: max(validValues),
    mean: average(validValues),
    median: median(validValues),
    stdDev: standardDeviation(validValues),
    quartiles: quartiles(validValues),
  };
}

/**
 * Calcule un pourcentage arrondi
 * @param {number} value - Valeur
 * @param {number} total - Total
 * @param {number} [decimals=2] - Nombre de décimales
 * @returns {number} Pourcentage
 */
function percentage(value, total, decimals = 2) {
  if (total === 0) return 0;
  const pct = (value / total) * 100;
  return Math.round(pct * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Calcule un ratio entre 0 et 1
 * @param {number} value - Valeur
 * @param {number} total - Total
 * @returns {number} Ratio
 */
function ratio(value, total) {
  if (total === 0) return 0;
  return Math.max(0, Math.min(1, value / total));
}

/**
 * Groupe des valeurs par plage
 * @param {number[]} values - Valeurs à grouper
 * @param {number} rangeSize - Taille de chaque plage
 * @returns {Object} Objet avec plages comme clés et compteurs comme valeurs
 */
function groupByRange(values, rangeSize) {
  const groups = {};

  values
    .filter((v) => typeof v === "number" && !isNaN(v))
    .forEach((value) => {
      const rangeStart = Math.floor(value / rangeSize) * rangeSize;
      const key = `${rangeStart}-${rangeStart + rangeSize}`;
      groups[key] = (groups[key] || 0) + 1;
    });

  return groups;
}

/**
 * Compte les occurrences de chaque valeur
 * @param {Array} values - Tableau de valeurs
 * @returns {Map} Map avec valeurs et leur fréquence
 */
function frequency(values) {
  const freq = new Map();

  values.forEach((value) => {
    freq.set(value, (freq.get(value) || 0) + 1);
  });

  return freq;
}

/**
 * Trouve les valeurs les plus fréquentes
 * @param {Array} values - Tableau de valeurs
 * @param {number} [topN=5] - Nombre de valeurs à retourner
 * @returns {Array} Tableau de { value, count }
 */
function topFrequent(values, topN = 5) {
  const freq = frequency(values);

  return Array.from(freq.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * Normalise des valeurs entre 0 et 1
 * @param {number[]} values - Valeurs à normaliser
 * @returns {number[]} Valeurs normalisées
 */
function normalize(values) {
  const minVal = min(values);
  const maxVal = max(values);

  if (minVal === null || maxVal === null || minVal === maxVal) {
    return values.map(() => 0);
  }

  return values.map((v) => (v - minVal) / (maxVal - minVal));
}

export {
  average,
  median,
  min,
  max,
  standardDeviation,
  quartiles,
  summary,
  percentage,
  ratio,
  groupByRange,
  frequency,
  topFrequent,
  normalize,
};
