import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../data");

/**
 * Extrait tous les scores d'un fichier JSON d'analyse
 * @param {object} analysisData - Les données d'analyse complètes
 * @returns {object} - Les scores extraits
 */
const extractScores = (analysisData) => {
  // Extraire les scores des analyses CSS
  const cssScores = {
    cssImports: analysisData.cssAnalysisResult?.imports?.score?.total || null,
    cssVariables:
      analysisData.cssAnalysisResult?.customProperties?.score?.total || null,
    cssTypography:
      analysisData.cssAnalysisResult?.typography?.score?.total || null,
    classAnalysis: analysisData.classAnalysis?.score?.bem?.total || null,
  };

  // Extraire les scores Lighthouse
  const lighthouseScores = {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
  };

  // Calculer les moyennes Lighthouse si des pages existent
  if (analysisData.pages && Array.isArray(analysisData.pages)) {
    const reports = analysisData.pages
      .filter((page) => page.lighthouseReport)
      .map((page) => page.lighthouseReport);

    if (reports.length > 0) {
      lighthouseScores.performance = Math.round(
        (reports.reduce((sum, r) => sum + (r.performance || 0), 0) /
          reports.length) *
          100
      );
      lighthouseScores.accessibility = Math.round(
        (reports.reduce((sum, r) => sum + (r.accessibility || 0), 0) /
          reports.length) *
          100
      );
      lighthouseScores.bestPractices = Math.round(
        (reports.reduce((sum, r) => sum + (r.bestPractices || 0), 0) /
          reports.length) *
          100
      );
      lighthouseScores.seo = Math.round(
        (reports.reduce((sum, r) => sum + (r.seo || 0), 0) / reports.length) *
          100
      );
    }
  }

  return {
    ...cssScores,
    ...lighthouseScores,
    validation:
      analysisData.validationScore?.total !== undefined
        ? analysisData.validationScore.total
        : null,
  };
};

/**
 * Calcule les scores moyens et les statistiques pour tous les étudiants
 * @returns {object} - Statistiques agrégées
 */
export const calculateClassStats = async () => {
  try {
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const allScores = {
      cssImports: [],
      cssVariables: [],
      cssTypography: [],
      classAnalysis: [],
      validation: [],
      performance: [],
      accessibility: [],
      bestPractices: [],
      seo: [],
    };

    const studentData = [];

    // Lire tous les fichiers JSON
    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const analysisData = JSON.parse(content);

      // Extraire le nom de l'étudiant (sans .json)
      const studentName = file.replace(".json", "");

      // Extraire les scores
      const scores = extractScores(analysisData);

      // Ajouter aux collections
      if (scores.cssImports !== null)
        allScores.cssImports.push(scores.cssImports);
      if (scores.cssVariables !== null)
        allScores.cssVariables.push(scores.cssVariables);
      if (scores.cssTypography !== null)
        allScores.cssTypography.push(scores.cssTypography);
      if (scores.classAnalysis !== null)
        allScores.classAnalysis.push(scores.classAnalysis);
      if (scores.validation !== null)
        allScores.validation.push(scores.validation);
      if (scores.performance !== null)
        allScores.performance.push(scores.performance);
      if (scores.accessibility !== null)
        allScores.accessibility.push(scores.accessibility);
      if (scores.bestPractices !== null)
        allScores.bestPractices.push(scores.bestPractices);
      if (scores.seo !== null) allScores.seo.push(scores.seo);

      studentData.push({
        name: studentName,
        scores,
      });
    }

    // Calculer les moyennes et statistiques
    const calculateStats = (scores) => {
      if (scores.length === 0) return null;

      const sorted = [...scores].sort((a, b) => a - b);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const median =
        scores.length % 2 === 0
          ? (sorted[scores.length / 2 - 1] + sorted[scores.length / 2]) / 2
          : sorted[Math.floor(scores.length / 2)];

      return {
        mean: Math.round(mean * 10) / 10,
        median: Math.round(median * 10) / 10,
        min: Math.min(...scores),
        max: Math.max(...scores),
        count: scores.length,
      };
    };

    return {
      timestamp: new Date().toISOString(),
      studentCount: jsonFiles.length,
      stats: {
        cssImports: calculateStats(allScores.cssImports),
        cssVariables: calculateStats(allScores.cssVariables),
        cssTypography: calculateStats(allScores.cssTypography),
        classAnalysis: calculateStats(allScores.classAnalysis),
        validation: calculateStats(allScores.validation),
        lighthouse: {
          performance: calculateStats(allScores.performance),
          accessibility: calculateStats(allScores.accessibility),
          bestPractices: calculateStats(allScores.bestPractices),
          seo: calculateStats(allScores.seo),
        },
      },
      studentData,
    };
  } catch (error) {
    console.error("Error calculating class stats:", error.message);
    throw error;
  }
};

/**
 * Compare le score d'un étudiant avec la moyenne de la classe
 * @param {string} studentName - Nom du fichier JSON (sans extension)
 * @param {object} classStats - Statistiques de classe
 * @returns {object} - Comparaison avec les moyennes
 */
export const getStudentComparison = (studentName, classStats) => {
  const student = classStats.studentData.find((s) => s.name === studentName);

  if (!student) {
    return {
      error: `Étudiant ${studentName} non trouvé`,
    };
  }

  const comparison = {};

  const addComparison = (key, statKey) => {
    if (student.scores[key] !== null && classStats.stats[statKey]) {
      const average = classStats.stats[statKey].mean;
      const difference = student.scores[key] - average;
      const percentDiff = (difference / average) * 100;

      comparison[key] = {
        score: student.scores[key],
        classAverage: average,
        difference: Math.round(difference * 10) / 10,
        percentDifference: Math.round(percentDiff * 10) / 10,
        status: difference >= 0 ? "Au-dessus de la moyenne" : "Sous la moyenne",
      };
    }
  };

  addComparison("cssImports", "cssImports");
  addComparison("cssVariables", "cssVariables");
  addComparison("cssTypography", "cssTypography");
  addComparison("classAnalysis", "classAnalysis");
  addComparison("validation", "validation");
  addComparison("performance", "lighthouse");
  addComparison("accessibility", "lighthouse");
  addComparison("bestPractices", "lighthouse");
  addComparison("seo", "lighthouse");

  const addLighthouseComparison = (key) => {
    if (student.scores[key] !== null && classStats.stats.lighthouse[key]) {
      const average = classStats.stats.lighthouse[key].mean;
      const difference = student.scores[key] - average;
      const percentDiff = (difference / average) * 100;

      comparison[`lighthouse_${key}`] = {
        score: student.scores[key],
        classAverage: average,
        difference: Math.round(difference * 10) / 10,
        percentDifference: Math.round(percentDiff * 10) / 10,
        status: difference >= 0 ? "Au-dessus de la moyenne" : "Sous la moyenne",
      };
    }
  };

  addLighthouseComparison("performance");
  addLighthouseComparison("accessibility");
  addLighthouseComparison("bestPractices");
  addLighthouseComparison("seo");

  return {
    studentName,
    comparison,
    classStats: {
      studentCount: classStats.studentCount,
      stats: classStats.stats,
    },
  };
};
