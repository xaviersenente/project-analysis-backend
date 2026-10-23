import thresholds from "../../config/thresholds.js";

// Récupération des balises depuis la configuration centralisée
const REQUIRED_TAGS = thresholds.tags.requiredTags;
const OBSOLETE_TAGS = thresholds.tags.obsoleteTags;
const OTHER_TAGS = thresholds.tags.otherTags;

/**
 * Fonction pour extraire toutes les balises d'un contenu HTML
 * @param {string} htmlContent - Le contenu HTML à analyser
 * @returns {string[]} - Un tableau de noms de balises
 */
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
