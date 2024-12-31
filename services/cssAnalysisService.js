import postcss from "postcss";
import postcssImport from "postcss-import";
import cssnano from "cssnano"; // Ajout de cssnano pour la minification
import axios from "axios";
import { analyze } from "@projectwallace/css-analyzer";
import path from "path";
import fs from "fs/promises";

axios.defaults.timeout = 5000; // Timeout de 5 secondes pour éviter les blocages

/**
 * Vérifie si un chemin correspond à normalize.css
 * @param {string} importPath - Le chemin d'import CSS.
 * @returns {boolean} - Retourne true si c'est normalize.css.
 */
const isNormalizeCSS = (importPath) => /normalize\.css$/i.test(importPath);

/**
 * Supprime les imports de normalize.css dans le CSS brut.
 * @param {string} cssContent - Le contenu CSS initial.
 * @returns {string} - Le contenu CSS sans les imports normalize.css.
 */
const removeNormalizeCSSImports = (cssContent) => {
  const normalizeRegex = /@import\s+['"]?([^'"]*normalize\.css)['"]?;/gi;
  return cssContent.replace(normalizeRegex, (match) => {
    console.log(`🗑️ Suppression de l'import Normalize.css : ${match}`);
    return "";
  });
};

/**
 * Remplace les @import distants et relatifs par le contenu du fichier CSS correspondant,
 * en ignorant les @import provenant de Google Fonts.
 * @param {string} cssContent - Le contenu CSS initial.
 * @param {string} currentUrl - L'URL du fichier CSS actuel.
 * @returns {Promise<string>} - CSS avec les imports inlinés.
 */
const inlineRemoteCSS = async (cssContent, currentUrl) => {
  console.log(`🔍 Début du traitement des imports CSS pour : ${currentUrl}`);

  const importRegex = /@import\s+(?:url\()?['"]?(https?:\/\/.*?)['"]?\)?;/g;
  const relativeImportRegex = /@import\s+['"]?(.*?)['"]?;/g;

  let match;

  // 📦 Gestion des imports absolus (https://...)
  while ((match = importRegex.exec(cssContent)) !== null) {
    const importUrl = match[1];

    if (importUrl.includes("fonts.googleapis.com")) {
      console.log(`⚠️ Ignoré (absolu) : ${importUrl}`);
      continue;
    }

    try {
      console.log(`🔄 Téléchargement de ${importUrl}`);
      const response = await axios.get(importUrl);
      cssContent = cssContent.replace(match[0], response.data);
    } catch (error) {
      console.error(
        `❌ Échec du téléchargement de ${importUrl}:`,
        error.message
      );
    }
  }

  // 📦 Gestion des imports relatifs
  while ((match = relativeImportRegex.exec(cssContent)) !== null) {
    const relativePath = match[1];

    try {
      let resolvedUrl = new URL(relativePath, currentUrl).href;
      console.log(`🔄 Téléchargement de ${resolvedUrl}`);
      const response = await axios.get(resolvedUrl);
      cssContent = cssContent.replace(match[0], response.data);
    } catch (error) {
      console.error(
        `❌ Échec du téléchargement de ${relativePath}:`,
        error.message
      );
    }
  }

  console.log(`✅ Fin du traitement des imports CSS pour : ${currentUrl}`);
  return cssContent;
};

/**
 * Compile le CSS en résolvant tous les @import et le minifie.
 * @param {string} htmlContent - Le contenu HTML.
 * @param {string} baseUrl - L'URL de base pour résoudre les chemins CSS.
 * @returns {Promise<string>} - CSS compilé et minifié.
 */
export const compileCSS = async (htmlContent, baseUrl) => {
  console.log(`🔧 Début de la compilation CSS avec baseUrl : ${baseUrl}`);
  const cssLinkMatch = htmlContent.match(
    /<link.*?href=['"](.*?\.css)['"].*?>/i
  );
  if (!cssLinkMatch) {
    throw new Error("No CSS file found in the HTML.");
  }

  const cssUrl = new URL(cssLinkMatch[1], baseUrl).href;
  console.log(`🔗 URL du fichier CSS détectée : ${cssUrl}`);

  try {
    const cssResponse = await axios.get(cssUrl);
    let cssContent = cssResponse.data;

    // Supprimer les imports normalize.css
    cssContent = removeNormalizeCSSImports(cssContent);

    cssContent = await inlineRemoteCSS(cssContent, cssUrl);

    const tempFilePath = path.resolve("temp.css");
    await fs.writeFile(tempFilePath, cssContent);

    console.log(`📂 Chemin temporaire pour le CSS : ${tempFilePath}`);

    const compiledCss = await postcss([postcssImport(), cssnano()]).process(
      cssContent,
      { from: tempFilePath }
    );

    await fs.unlink(tempFilePath);

    console.log(`✅ Compilation et minification terminées.`);
    return compiledCss.css;
  } catch (error) {
    console.error(`❌ Erreur lors de la compilation CSS :`, error.message);
    throw error;
  }
};

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
