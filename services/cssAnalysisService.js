/**
 * Service façade pour l'analyse CSS
 * Réexporte toutes les fonctionnalités des modules spécialisés
 */

import { analyze } from "@projectwallace/css-analyzer";

// Réexporter les fonctions principales
export { compileCSS } from "./css/cssCompiler.js";
export { analyzeImports } from "./css/cssImportsAnalyzer.js";
export { analyzeCustomProperties } from "./css/cssVariablesAnalyzer.js";
export { analyzeTypography } from "./css/cssTypographyAnalyzer.js";

/**
 * Analyse le CSS avec Project Wallace.
 * @param {string} css - Le CSS compilé.
 * @returns {object} - Le résultat de l'analyse Project Wallace.
 */
export const analyzeCSS = async (css) => {
  console.log(`🔍 Analyse du CSS en cours...`);
  try {
    const analysisResult = await analyze(css);
    console.log(`✅ Analyse réussie.`);
    return analysisResult;
  } catch (error) {
    console.error("❌ Error analyzing CSS with Project Wallace:", error);
    return { error: "Failed to analyze CSS" };
  }
};
