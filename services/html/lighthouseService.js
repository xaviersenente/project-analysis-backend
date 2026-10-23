import fs from "fs";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import thresholds from "../../config/thresholds.js";

/**
 * Options de Chrome : sans bac à sable ni /dev/shm, pour démarrer sous root
 * dans un conteneur (Render, Docker)
 */
export const CHROME_FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

// Une seule instance de Chrome, réutilisée pour toutes les pages (F3)
let chromePromise = null;

const obtenirChrome = () => {
  // Un chemin absent ferait planter le serveur (exception hors de la promesse)
  const chemin = process.env.CHROME_PATH;
  if (chemin && !fs.existsSync(chemin)) {
    return Promise.reject(new Error(`Chrome introuvable (CHROME_PATH=${chemin})`));
  }
  if (!chromePromise) {
    // CHROME_PATH (Chromium du serveur) est imposé tel quel : sans lui, chrome-launcher cherche Chrome
    chromePromise = chromeLauncher
      .launch({
        chromeFlags: CHROME_FLAGS,
        chromePath: process.env.CHROME_PATH || undefined,
      })
      .catch((error) => {
        chromePromise = null;
        throw error;
      });
  }
  return chromePromise;
};

/**
 * Ferme l'instance de Chrome partagée, à la fin d'une analyse
 */
export const fermerChrome = async () => {
  if (!chromePromise) return;
  const enCours = chromePromise;
  chromePromise = null;
  try {
    const chrome = await enCours;
    await chrome.kill();
  } catch {
    // Chrome n'avait pas démarré : rien à fermer
  }
};

/**
 * Options de Lighthouse : mobile, à la largeur des TP (360 px)
 * @param {number} port - Port de débogage de Chrome
 */
export const optionsLighthouse = (port) => ({
  logLevel: "error",
  output: "json",
  port,
  formFactor: "mobile", // Force le mode mobile
  screenEmulation: {
    mobile: true,
    ...thresholds.performance.viewport,
    disabled: false,
  },
  // Throttling réseau pour simuler une connexion 4G mobile
  throttling: {
    rttMs: 150,
    throughputKbps: 1638.4,
    cpuSlowdownMultiplier: 4,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
  onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
});

/**
 * Exécute Lighthouse en mode mobile sur une URL donnée.
 * Lève une erreur si Chrome est absent ou si le délai maximal est dépassé :
 * l'appelant la traite comme « Non mesurable » (F4).
 * @param {string} url - URL du fichier à analyser.
 * @returns {object} - Résultats de Lighthouse.
 */
export const runLighthouse = async (url) => {
  const chrome = await obtenirChrome();
  const delai = thresholds.performance.timeouts.lighthouse;

  let minuteur;
  const depassement = new Promise((_, reject) => {
    minuteur = setTimeout(
      () => reject(new Error(`Délai de ${delai / 1000} s dépassé`)),
      delai
    );
  });

  try {
    const result = await Promise.race([
      lighthouse(url, optionsLighthouse(chrome.port)),
      depassement,
    ]);
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
    // Après un dépassement, l'audit peut tourner encore : on repart d'un Chrome neuf
    if (error.message.startsWith("Délai")) await fermerChrome();
    throw error;
  } finally {
    clearTimeout(minuteur);
  }
};
