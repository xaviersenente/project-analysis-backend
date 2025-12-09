import * as cheerio from "cheerio";

/**
 * Analyse le contenu HTML et retourne diverses statistiques sur les balises et les liens.
 * @param {string} htmlContent - Le contenu HTML sous forme de chaîne à analyser.
 * @return {Object} - Un objet contenant des statistiques sur le contenu HTML, comprenant :
 *   @property {number} totalTags - Le nombre total de balises dans le HTML.
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
    externalLinks: 0, // Liens externes
    internalLinks: 0, // Liens internes
    deadLinks: 0, // Liens morts (<a href=""> ou <a href="#">)
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
    outlineStructure: [], // Structure de la page (sections, titres)
  };

  // Parcourt chaque élément du DOM
  $("*").each((_, el) => {
    const tag = el.name.toLowerCase(); // Récupère le nom de la balise en minuscule
    result.totalTags++;

    // Analyse des liens
    if (tag === "a") {
      const href = $(el).attr("href");
      if (!href || href === "" || href === "#") {
        result.deadLinks++; // Compte les liens morts
      } else {
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
 * @param {string} htmlContent - Le contenu HTML sous forme de chaîne à analyser.
 */
export const extractTitleAndImagesFromHTML = (htmlContent) => {
  const $ = cheerio.load(htmlContent);

  const title = $("title").text() || null;

  const images = [];
  $("img").each((index, img) => {
    const src = $(img).attr("src") || "No src";
    const alt = $(img).attr("alt") || "No alt";
    const ariaHidden = $(img).attr("aria-hidden") || "✕";
    images.push({ src, alt, ariaHidden });
  });

  return { title, images };
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
