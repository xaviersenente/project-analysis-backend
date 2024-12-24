import postcss from "postcss";
import postcssImport from "postcss-import";
import cssnano from "cssnano"; // Ajout de cssnano pour la minification
import axios from "axios";
import { analyze } from "@projectwallace/css-analyzer";
import path from "path";
import fs from "fs/promises";

/**
 * Remplace les @import distants et relatifs par le contenu du fichier CSS correspondant,
 * en ignorant les @import provenant de Google Fonts.
 * @param {string} cssContent - Le contenu CSS initial.
 * @param {string} currentUrl - L'URL du fichier CSS actuel.
 * @returns {Promise<string>} - CSS avec les imports inlinés.
 */
const inlineRemoteCSS = async (cssContent, currentUrl) => {
  const importRegex = /@import\s+(?:url\()?["'](https?:\/\/.*?)["']\)?;/g;
  const relativeImportRegex = /@import\s+["'](.*?)["'];/g;

  let match;

  // 📦 Gestion des imports absolus (https://...)
  while ((match = importRegex.exec(cssContent)) !== null) {
    const importUrl = match[1];

    // 🛑 Ignorer les Google Fonts
    if (importUrl.includes("fonts.googleapis.com")) {
      console.log(`⚠️ Ignoré : ${importUrl}`);
      continue;
    }

    console.log(`🔄 Téléchargement de ${importUrl}`);
    try {
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
    let resolvedUrl;

    try {
      if (relativePath.startsWith("/")) {
        // 📍 Cas des imports root-relatifs
        resolvedUrl = new URL(relativePath, currentUrl).href;
      } else {
        // 📍 Cas des imports relatifs
        const currentDir = path.dirname(currentUrl);
        resolvedUrl = new URL(relativePath, `${currentDir}/`).href;
      }

      console.log(`🔄 Téléchargement de ${resolvedUrl}`);
      const response = await axios.get(resolvedUrl);
      cssContent = cssContent.replace(match[0], response.data);
    } catch (error) {
      console.error(
        `❌ Échec du téléchargement de ${resolvedUrl}:`,
        error.message
      );
    }
  }

  return cssContent;
};

/**
 * Compile le CSS en résolvant tous les @import et le minifie.
 * @param {string} htmlContent - Le contenu HTML.
 * @param {string} baseUrl - L'URL de base pour résoudre les chemins CSS.
 * @returns {Promise<string>} - CSS compilé et minifié.
 */
export const compileCSS = async (htmlContent, baseUrl) => {
  const cssLinkMatch = htmlContent.match(
    /<link.*?href=["'](.*?\.css)["'].*?>/i
  );
  if (!cssLinkMatch) {
    throw new Error("No CSS file found in the HTML.");
  }

  const cssUrl = new URL(cssLinkMatch[1], baseUrl).href;
  console.log(`🔗 URL du fichier CSS détectée : ${cssUrl}`);

  const cssResponse = await axios.get(cssUrl);
  let cssContent = cssResponse.data;

  // Remplacer les imports par leur contenu en utilisant l'URL actuelle
  cssContent = await inlineRemoteCSS(cssContent, cssUrl);

  // Compiler avec PostCSS et minifier avec cssnano
  const tempFilePath = path.resolve("temp.css");
  await fs.writeFile(tempFilePath, cssContent);

  console.log(`📂 Chemin temporaire pour le CSS : ${tempFilePath}`);

  const compiledCss = await postcss([postcssImport(), cssnano()]).process(
    cssContent,
    { from: tempFilePath }
  );

  await fs.unlink(tempFilePath);

  return compiledCss.css;
};

/**
 * Analyse le CSS avec Project Wallace.
 * @param {string} css - Le CSS compilé.
 * @returns {object} - Le résultat de l'analyse Project Wallace.
 */
export const analyzeCSS = async (css) => {
  try {
    const analysisResult = await analyze(css);
    return analysisResult;
  } catch (error) {
    console.error("Error analyzing CSS with Project Wallace:", error);
    return { error: "Failed to analyze CSS" };
  }
};
