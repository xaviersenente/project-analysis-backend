// import postcss from "postcss";
// import postcssImport from "postcss-import";
// import path from "path";
// import fs from "fs/promises";
import axios from "axios";
import { isNormalizeCSS, isGoogleFont } from "../shared/cssHelpers.js";

import thresholds from "../../config/thresholds.js";

// Délai passé à chaque requête, sans toucher à axios.defaults (F5)
const optionsHttp = { timeout: thresholds.performance.timeouts.http };

/**
 * Supprime les imports de normalize.css dans le CSS brut.
 * @param {string} cssContent - Le contenu CSS initial.
 * @returns {string} - Le contenu CSS sans les imports normalize.css.
 */
const removeNormalizeCSSImports = (cssContent) => {
  // Supporte: @import "normalize.css"; @import 'normalize.css';
  // @import url("normalize.css"); @import url('normalize.css');
  const normalizeRegex =
    /@import\s+(?:url\()?(['"])([^'"]*normalize\.css)\1\)?\s*;/gi;
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

    if (isGoogleFont(importUrl)) {
      console.log(`⚠️ Ignoré (absolu) : ${importUrl}`);
      continue;
    }

    try {
      console.log(`🔄 Téléchargement de ${importUrl}`);
      const response = await axios.get(importUrl, optionsHttp);
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
      const response = await axios.get(resolvedUrl, optionsHttp);
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
 * Inline tous les @import CSS de manière récursive
 * @param {string} cssContent - Le contenu CSS
 * @param {string} currentUrl - L'URL du fichier CSS courant
 * @param {Set} processedUrls - URLs déjà traitées (éviter les imports circulaires)
 * @param {Array} errors - Tableau pour collecter les erreurs d'import
 * @returns {Promise<string>} - CSS avec tous les imports inlinés
 */
const inlineAllImports = async (
  cssContent,
  currentUrl,
  processedUrls = new Set(),
  errors = []
) => {
  if (processedUrls.has(currentUrl)) {
    console.log(`⚠️ Import circulaire détecté, ignoré: ${currentUrl}`);
    return "";
  }

  processedUrls.add(currentUrl);
  console.log(`🔍 Traitement des imports dans: ${currentUrl}`);

  // Supprimer les commentaires CSS pour éviter de traiter les @import dans les commentaires
  let cssWithoutComments = cssContent.replace(/\/\*[\s\S]*?\*\//g, "");

  // Regex pour capturer les @import (avec ou sans url())
  // Supporte: @import "file.css"; @import 'file.css'; @import url("file.css"); @import url('file.css');
  const importRegex = /@import\s+(?:url\()?(['"])([^'"]+)\1\)?\s*;/g;
  let match;
  let result = cssContent; // Garder les commentaires dans le résultat final

  // Chercher les @import uniquement dans le CSS sans commentaires
  while ((match = importRegex.exec(cssWithoutComments)) !== null) {
    const importPath = match[2];
    const fullMatch = match[0];

    console.log(`📥 Import trouvé: ${importPath}`);

    // 🚫 IGNORER les imports Google Fonts temporairement
    if (isGoogleFont(importPath)) {
      console.log(
        `⚠️ Import Google Fonts ignoré (désactivé temporairement): ${importPath}`
      );
      continue;
    }

    // Construire l'URL absolue de l'import
    let importUrl;
    if (importPath.startsWith("http://") || importPath.startsWith("https://")) {
      importUrl = importPath;
    } else if (importPath.startsWith("/")) {
      const baseUrlObj = new URL(currentUrl);
      importUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${importPath}`;
    } else {
      // Chemin relatif
      const currentDir = currentUrl.substring(0, currentUrl.lastIndexOf("/"));
      importUrl = new URL(importPath, currentDir + "/").href;
    }

    console.log(`🔗 URL résolue: ${importUrl}`);

    try {
      const response = await axios.get(importUrl, optionsHttp);
      console.log(`✅ Chargé: ${importUrl}`);

      // Traiter récursivement les imports dans le fichier chargé
      const inlinedContent = await inlineAllImports(
        response.data,
        importUrl,
        processedUrls,
        errors
      );

      // Remplacer l'@import par le contenu inline
      result = result.replace(
        fullMatch,
        `/* Inlined from ${importUrl} */\n${inlinedContent}\n`
      );
    } catch (error) {
      console.error(
        `❌ Erreur d'import: impossible de charger "${importPath}" (résolu: ${importUrl})`
      );

      // Collecter l'erreur pour le rapport
      errors.push({
        importPath,
        resolvedUrl: importUrl,
        sourceFile: currentUrl,
        error: error.message,
      });

      // Remplacer par un commentaire d'erreur dans le CSS compilé
      result = result.replace(
        fullMatch,
        `/* ⚠️ IMPORT FAILED: "${importPath}" (${error.message}) */\n`
      );
    }
  }

  return result;
};

/**
 * Compile le CSS en résolvant tous les @import et le minifie.
 * @param {string} htmlContent - Le contenu HTML.
 * @param {string} baseUrl - L'URL de base pour résoudre les chemins CSS.
 * @returns {Promise<{css: string, importErrors: Array}>} - CSS compilé et erreurs d'import
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
    const cssResponse = await axios.get(cssUrl, optionsHttp);
    let cssContent = cssResponse.data;

    // Supprimer les imports normalize.css
    cssContent = removeNormalizeCSSImports(cssContent);

    console.log(`📂 Inline de tous les @import...`);

    // Collecter les erreurs d'import
    const importErrors = [];

    // Inline tous les @import récursivement
    cssContent = await inlineAllImports(
      cssContent,
      cssUrl,
      new Set(),
      importErrors
    );

    if (importErrors.length > 0) {
      console.warn(`⚠️ ${importErrors.length} erreur(s) d'import détectée(s):`);
      importErrors.forEach((err) => {
        console.warn(`  - "${err.importPath}" dans ${err.sourceFile}`);
      });
    } else {
      console.log(`✅ Tous les @import ont été inlinés avec succès`);
    }

    return { css: cssContent, importErrors };
  } catch (error) {
    console.error(`❌ Erreur lors de la compilation CSS :`, error.message);
    throw error;
  }
};
