import axios from "axios";
import * as cheerio from "cheerio";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

// Liste des balises à vérifier
const REQUIRED_TAGS = [
  "body",
  "article",
  "nav",
  "header",
  "footer",
  "h1",
  "h2",
  "h3",
  "p",
  "blockquote",
  "ul",
  "li",
  "figure",
  "figcaption",
  "form",
  "label",
  "input",
  "button",
  "textarea",
  "img",
  "video",
  "a",
  "em",
  "strong",
  "html",
  "head",
  "title",
  "link",
  "meta",
  "script",
];
// Liste des balises obsolètes
const OBSOLETE_TAGS = [
  "font",
  "center",
  "b",
  "i",
  "u",
  "strike",
  "marquee",
  "blink",
  "applet",
  "frameset",
  "noframes",
  "basefont",
  "big",
  "tt",
];
// Liste des balises obsolètes
const OTHER_TAGS = ["br", "hr", "div", "span"];

// Fonction pour extraire toutes les balises d'un contenu HTML
const extractTags = (htmlContent) => {
  const tagRegex = /<\s*([a-zA-Z0-9-]+)/g; // Regex pour capturer les noms des balises HTML
  const tags = [];
  let match;

  while ((match = tagRegex.exec(htmlContent)) !== null) {
    tags.push(match[1]);
  }

  return tags;
};

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
    // throttlingMethod: "devtools", // Utilisation du mode DevTools pour la simulation
    // throttling: {
    //   // Simulation d'une connexion 4G (les valeurs sont basées sur un test classique de Google)
    //   rttMs: 40, // Round-trip time en ms
    //   throughputKbps: 1500, // Débit en kbps
    //   requestLatencyMs: 20, // Latence des requêtes en ms
    //   downloadThroughputKbps: 1500, // Débit de téléchargement en kbps
    //   uploadThroughputKbps: 1500, // Débit d'upload en kbps
    // },
    // // Pour simuler un serveur distant, vous pouvez ajuster le paramètre `simulated`
    // emulatedUserAgent:
    //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
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

/**
 * Analyse le contenu HTML et retourne diverses statistiques sur les balises et les liens.
 * @param {string} htmlContent - Le contenu HTML sous forme de chaîne à analyser.
 * @return {Object} - Un objet contenant des statistiques sur le contenu HTML, comprenant :
 *   @property {number} totalTags - Le nombre total de balises dans le HTML.
 *   @property {Object} uniqueTags - Un objet listant chaque balise unique avec son nombre d'occurrences.
 *   @property {number} externalLinks - Le nombre de liens externes (commençant par "http").
 *   @property {number} internalLinks - Le nombre de liens internes (n'incluant pas "http").
 *   @property {boolean} favicon - Indique si une balise `<link rel="icon">` est présente.
 *   @property {number} mailtoLinks - Le nombre de liens de type "mailto".
 *   @property {boolean} viewport - Indique si une balise `<meta name="viewport">` est présente.
 */
export const analyzeHTML = (htmlContent) => {
  const $ = cheerio.load(htmlContent);

  // Initialise les statistiques d'analyse du HTML
  const result = {
    totalTags: 0, // Nombre total de balises
    uniqueTags: {}, // Nombre d'occurrences de chaque balise unique
    externalLinks: 0, // Liens externes
    internalLinks: 0, // Liens internes
    favicon: false, // Présence d'une icône favicon
    mailtoLinks: 0, // Liens mailto
    viewport: false, // Présence d'une balise viewport
    headings: {
      // Compteur pour les titres h1 à h6
      h1: 0,
      h2: 0,
      h3: 0,
      h4: 0,
      h5: 0,
      h6: 0,
    },
    headingsStructure: [], // Structure des titres avec ordre et texte
    outlineStructure: [], // Structure de la page (sections, titres)
  };

  // Parcourt chaque élément du DOM
  $("*").each((_, el) => {
    const tag = el.name.toLowerCase(); // Récupère le nom de la balise en minuscule
    result.totalTags++;

    // Compte les balises uniques
    result.uniqueTags[tag] = (result.uniqueTags[tag] || 0) + 1;

    // Analyse des liens
    if (tag === "a") {
      const href = $(el).attr("href");
      if (href) {
        if (href.startsWith("http")) result.externalLinks++; // Lien externe
        else result.internalLinks++; // Lien interne
        if (href.startsWith("mailto:")) result.mailtoLinks++; // Lien mailto
      }
    }

    // Vérifie la présence d'une favicon
    if (tag === "link" && $(el).attr("rel") === "icon") result.favicon = true;

    // Vérifie la présence d'une meta viewport
    if (tag === "meta" && $(el).attr("name") === "viewport")
      result.viewport = true;

    // Compte les titres (h1 à h6) et enregistre leur structure
    if (/^h[1-6]$/.test(tag)) {
      result.headings[tag]++;
      result.headingsStructure.push({
        tag: tag,
        text: $(el).text().trim(),
      });

      // Ajoute la structure des titres à l'outline
      result.outlineStructure.push({
        level: parseInt(tag[1]), // Niveau du titre (h1 -> 1, h2 -> 2, etc.)
        text: $(el).text().trim(),
        tag: tag,
      });
    }

    // Analyse des sections (balises section, article, etc.)
    if (["section", "article", "nav", "aside"].includes(tag)) {
      const sectionTitle = $(el)
        .find("h1, h2, h3, h4, h5, h6")
        .first()
        .text()
        .trim();
      if (sectionTitle) {
        result.outlineStructure.push({
          level: 1, // Les sections principales sont de niveau 1
          text: sectionTitle,
          tag: tag,
        });
      }
    }
  });

  return result; // Retourne les statistiques d'analyse avec structure des titres et outline
};

/**
 * Extrait le titre d'une page HTML à partir de son URL.
 * @param {string} fileUrl - L'URL du fichier HTML à récupérer et analyser.
 * @return {Promise<string|null>} - Une promesse qui résout vers le texte du titre de la page, ou `null` en cas d'erreur.
 */
export const extractTitleFromHTML = async (fileUrl) => {
  try {
    const response = await axios.get(fileUrl);
    const $ = cheerio.load(response.data);
    return $("title").text();
  } catch (error) {
    console.error("Error extracting title:", error);
    return null;
  }
};

/**
 * Analyse le contenu HTML de plusieurs pages pour identifier les balises requises présentes et manquantes.
 * @param {string[]} allHtmlContents - Un tableau contenant les contenus HTML sous forme de chaînes à analyser.
 * @return {Object} - Un objet contenant deux tableaux :
 *   @property {string[]} tagsPresent - Les balises requises qui sont présentes dans au moins une des pages.
 *   @property {string[]} tagsMissing - Les balises requises qui sont absentes de toutes les pages analysées.
 */
export const analyzeAllPages = (allHtmlContents) => {
  const allTags = allHtmlContents.flatMap((htmlContent) =>
    extractTags(htmlContent)
  );

  // Balises uniques
  const uniqueTagsUsed = Array.from(new Set(allTags));

  // Balises présentes et manquantes
  const tagsPresent = REQUIRED_TAGS.filter((tag) =>
    uniqueTagsUsed.includes(tag)
  );
  const tagsMissing = REQUIRED_TAGS.filter(
    (tag) => !uniqueTagsUsed.includes(tag)
  );

  // Compte des balises obsolètes et autres balises
  const { obsoleteTagsUsage, otherTagsUsage } = allTags.reduce(
    (acc, tag) => {
      if (OBSOLETE_TAGS.includes(tag)) {
        acc.obsoleteTagsUsage[tag] = (acc.obsoleteTagsUsage[tag] || 0) + 1;
      }
      if (OTHER_TAGS.includes(tag)) {
        acc.otherTagsUsage[tag] = (acc.otherTagsUsage[tag] || 0) + 1;
      }
      return acc;
    },
    { obsoleteTagsUsage: {}, otherTagsUsage: {} }
  );

  const obsoleteTags = Object.keys(obsoleteTagsUsage);
  const otherTags = Object.keys(otherTagsUsage);

  return {
    tagsPresent,
    tagsMissing,
    obsoleteTags,
    obsoleteTagsUsage,
    otherTags,
    otherTagsUsage,
  };
};

/**
 * Extrait les URLs des fichiers CSS à partir du HTML.
 * @param {string} htmlContent - Le contenu HTML.
 * @param {string} baseUrl - L'URL de base pour résoudre les liens relatifs.
 * @returns {string[]} - Une liste des URLs absolues des fichiers CSS.
 */
export const getCssLinksFromHtml = (htmlContent, baseUrl) => {
  const $ = cheerio.load(htmlContent);
  const cssLinks = [];

  $("link[rel='stylesheet']").each((i, el) => {
    const href = $(el).attr("href");
    if (href) {
      const absoluteUrl = new URL(href, baseUrl).href;
      cssLinks.push(absoluteUrl);
    }
  });

  return cssLinks;
};

/**
 * Récupère et compile le CSS en résolvant les imports récursivement.
 * @param {string} url - L'URL du fichier CSS.
 * @param {Set<string>} visited - Un ensemble des URLs déjà visitées pour éviter les boucles infinies.
 * @returns {Promise<string>} - Le CSS compilé.
 */
export const fetchAndCompileCss = async (url, visited = new Set()) => {
  if (visited.has(url)) {
    return ""; // Évite les boucles infinies
  }

  visited.add(url);

  try {
    const response = await axios.get(url);
    let cssContent = response.data;

    // Recherche des déclarations @import dans le CSS
    const importRegex = /@import\s+["'](.+?)["'];/g;
    let match;
    const importPromises = [];

    while ((match = importRegex.exec(cssContent)) !== null) {
      const importUrl = new URL(match[1], url).href;
      importPromises.push(fetchAndCompileCss(importUrl, visited));
    }

    // Attendre que tous les imports soient résolus
    const importedCssContents = await Promise.all(importPromises);

    // Remplacer les imports par le contenu des fichiers importés
    importedCssContents.forEach((importedCss) => {
      cssContent = cssContent.replace(importRegex, importedCss);
    });

    return cssContent;
  } catch (error) {
    console.error(`Error fetching CSS from ${url}:`, error);
    return "";
  }
};
