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

export const obtenirChrome = () => {
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

/** « … contrast of 2.85 (foreground color: #9a9a9a, background color: #ffffff, … ratio of 4.5:1 » */
const lireContraste = (explication = "") => {
  const m = explication.match(/contrast of ([\d.]+) \(foreground color: (#[0-9a-f]{3,8}), background color: (#[0-9a-f]{3,8})[^)]*\)\.?\s*Expected contrast ratio of ([\d.]+):1/i);
  return m ? { rapport: Number(m[1]), texte: m[2], fond: m[3], requis: Number(m[4]) } : null;
};

/**
 * Audit Lighthouse d'une page (lot 2) : les quatre scores sur 100, les paires en échec
 * de contraste, le poids transféré et les requêtes en échec. Délai maximal par page.
 */
export const auditerPage = async (url) => {
  const chrome = await obtenirChrome();
  const delai = thresholds.performance.timeouts.lighthouse;
  let minuteur;
  const depassement = new Promise((_, reject) => {
    minuteur = setTimeout(() => reject(new Error(`Lighthouse a dépassé le délai (${delai / 1000} s)`)), delai);
  });
  try {
    const { lhr } = await Promise.race([lighthouse(url, optionsLighthouse(chrome.port)), depassement]);
    const score = (cle) => (lhr.categories[cle]?.score === null || lhr.categories[cle] === undefined ? null : Math.round(lhr.categories[cle].score * 100));
    return {
      scores: {
        performance: score("performance"),
        accessibilite: score("accessibility"),
        bonnesPratiques: score("best-practices"),
        seo: score("seo"),
      },
      contrastes: (lhr.audits["color-contrast"]?.details?.items ?? [])
        .map((item) => ({ ...lireContraste(item.node?.explanation), selecteur: item.node?.selector ?? "", extrait: item.node?.snippet ?? "" }))
        .filter((c) => c.rapport),
      poidsKo: Math.round((lhr.audits["total-byte-weight"]?.numericValue ?? 0) / 1024),
      echecs: (lhr.audits["network-requests"]?.details?.items ?? [])
        .filter((r) => r.statusCode >= 400 || r.statusCode === -1)
        .map((r) => ({ url: r.url, statut: r.statusCode })),
    };
  } catch (error) {
    if (error.message.startsWith("Lighthouse a dépassé")) await fermerChrome();
    throw error;
  } finally {
    clearTimeout(minuteur);
  }
};
