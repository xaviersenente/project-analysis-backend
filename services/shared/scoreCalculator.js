/**
 * ScoreCalculator - Factory pour standardiser les calculs de score
 * Élimine la duplication de logique de scoring à travers tous les analyzers
 *
 * @example
 * const calculator = new ScoreCalculator()
 * calculator.addCategory('semantic', 30, () => ({ score: 25, details: 'Good' }))
 * const result = calculator.calculate()
 * // { total: 83.33, breakdown: {...}, grade: 'B', improvements: [...] }
 */

class ScoreCalculator {
  constructor() {
    this.categories = new Map();
    this.totalMax = 0;
  }

  /**
   * Ajoute une catégorie de scoring
   * @param {string} name - Nom de la catégorie
   * @param {number} maxPoints - Points maximum pour cette catégorie
   * @param {Function} calculator - Fonction qui retourne { score, details, improvement? }
   */
  addCategory(name, maxPoints, calculator) {
    this.categories.set(name, {
      max: maxPoints,
      calculator,
    });
    this.totalMax += maxPoints;
    return this; // Chaînage
  }

  /**
   * Calcule tous les scores et génère le résultat final
   * @returns {Object} { total, breakdown, grade, improvements }
   */
  calculate() {
    const breakdown = {};
    const improvements = [];
    let totalScore = 0;

    for (const [
      categoryName,
      { max, calculator },
    ] of this.categories.entries()) {
      try {
        const result = calculator();

        // Normaliser le résultat
        const score = Math.min(result.score || 0, max);
        const details = result.details || "";

        breakdown[categoryName] = {
          score,
          max,
          details,
        };

        totalScore += score;

        // Collecter les améliorations
        if (result.improvement && score < max) {
          improvements.push(result.improvement);
        }
      } catch (error) {
        console.error(
          `Error calculating score for category ${categoryName}:`,
          error
        );
        breakdown[categoryName] = {
          score: 0,
          max,
          details: `Error: ${error.message}`,
        };
      }
    }

    // Calculer le pourcentage total
    const totalPercentage =
      this.totalMax > 0 ? (totalScore / this.totalMax) * 100 : 0;

    return {
      total: Math.round(totalPercentage * 100) / 100, // Arrondir à 2 décimales
      breakdown,
      grade: this.calculateGrade(totalPercentage),
      improvements,
    };
  }

  /**
   * Calcule la note alphabétique basée sur le pourcentage
   * @param {number} percentage - Pourcentage de 0 à 100
   * @returns {string} Grade (A+, A, B, C, D, E, F)
   */
  calculateGrade(percentage) {
    if (percentage >= 95) return "A+";
    if (percentage >= 90) return "A";
    if (percentage >= 80) return "B";
    if (percentage >= 70) return "C";
    if (percentage >= 60) return "D";
    if (percentage >= 50) return "E";
    return "F";
  }

  /**
   * Réinitialise le calculateur
   */
  reset() {
    this.categories.clear();
    this.totalMax = 0;
    return this;
  }
}

/**
 * Helper pour créer rapidement un score simple
 * @param {number} score - Score obtenu
 * @param {number} max - Score maximum
 * @param {string} details - Détails du scoring
 * @param {string} [improvement] - Suggestion d'amélioration
 * @returns {Object}
 */
function createScore(score, max, details, improvement = null) {
  return {
    score: Math.min(score, max),
    details,
    ...(improvement && score < max ? { improvement } : {}),
  };
}

/**
 * Helper pour convertir un ratio en score
 * @param {number} ratio - Ratio de 0 à 1
 * @param {number} maxPoints - Points maximum
 * @param {Object} [options] - Options de calcul
 * @param {boolean} [options.inverse=false] - Si true, inverse le ratio (1-ratio)
 * @param {number} [options.power=1] - Applique une puissance au ratio
 * @returns {number}
 */
function ratioToScore(ratio, maxPoints, options = {}) {
  const { inverse = false, power = 1 } = options;
  let normalizedRatio = Math.max(0, Math.min(1, ratio));

  if (inverse) {
    normalizedRatio = 1 - normalizedRatio;
  }

  if (power !== 1) {
    normalizedRatio = Math.pow(normalizedRatio, power);
  }

  return normalizedRatio * maxPoints;
}

export { ScoreCalculator, createScore, ratioToScore };
