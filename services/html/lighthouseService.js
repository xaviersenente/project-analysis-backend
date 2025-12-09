import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

/**
 * Exécute Lighthouse en mode mobile sur une URL donnée.
 * @param {string} url - URL du fichier à analyser.
 * @returns {object} - Résultats de Lighthouse.
 */
export const runLighthouse = async (url) => {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
  const options = {
    logLevel: "info",
    output: "json",
    port: chrome.port,
    emulatedFormFactor: "mobile", // Configuration pour le mode mobile
  };

  try {
    const result = await lighthouse(url, options);
    const categories = result.lhr.categories;
    const audits = result.lhr.audits;

    return {
      performance: categories.performance ? categories.performance.score : null,
      accessibility: categories.accessibility
        ? categories.accessibility.score
        : null,
      bestPractices: categories["best-practices"]
        ? categories["best-practices"].score
        : null,
      seo: categories.seo ? categories.seo.score : null,
      viewport: audits.viewport ? audits.viewport.score : null,
      errors: audits["errors-in-console"]
        ? audits["errors-in-console"].score
        : null,
      requests:
        audits["network-requests"]?.details?.items?.map(
          ({ url, resourceSize, mimeType, resourceType }) => ({
            url,
            resourceSize,
            mimeType,
            resourceType,
          })
        ) || null,
    };
  } catch (error) {
    console.error("Erreur Lighthouse:", error);
    throw error;
  } finally {
    await chrome.kill();
  }
};
