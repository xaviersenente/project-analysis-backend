import fs from "fs";
import path from "path";
import { HtmlCrawler } from "../services/fileScannerService.js";
import {
  analyzeHTML,
  extractTitleAndImagesFromHTML,
  analyzeAllPages,
  runLighthouse,
} from "../services/analysisService.js";
import { compileCSS, analyzeCSS } from "../services/cssAnalysisService.js";
import { validateHTML } from "../services/validationService.js";
import axios from "axios";

/**
 * Scan un répertoire en ligne pour récupérer et analyser les fichiers HTML.
 */
export const scanUrl = async (req, res) => {
  const { url, projectName } = req.query; // On passe l'URL via une query string

  if (!url || !projectName) {
    return res
      .status(400)
      .json({ error: "URL and projectName parameters are required" });
  }

  try {
    // Récupérer la liste des fichiers HTML depuis l'URL
    const htmlFiles = await HtmlCrawler(url);
    const fileResults = [];
    const allHtmlContents = [];

    // Analyser uniquement la page d'accueil (premier fichier HTML)
    const response = await axios.get(url);
    const htmlContent = response.data;
    // Compiler et analyser le CSS de la page d'accueil uniquement
    const compiledCss = await compileCSS(htmlContent, url);
    console.log("✅ CSS compilé avec succès.");
    const cssAnalysisResult = await analyzeCSS(compiledCss);
    console.log("✅ CSS analysé avec succès.");

    for (const fileUrl of htmlFiles) {
      const htmlContent = await axios.get(fileUrl).then((res) => res.data);

      // Stocker le contenu HTML pour l'analyse globale
      allHtmlContents.push(htmlContent);

      const titleAndImg = extractTitleAndImagesFromHTML(htmlContent);
      const htmlAnalysisResult = analyzeHTML(htmlContent);
      const lighthouseReport = await runLighthouse(fileUrl);
      const validationErrors = await validateHTML(htmlContent);

      fileResults.push({
        file: fileUrl,
        ...titleAndImg,
        ...htmlAnalysisResult,
        validationErrors,
        lighthouseReport,
      });
    }

    // Effectuer l'analyse globale sur toutes les pages
    const globalAnalysis = analyzeAllPages(allHtmlContents);

    const analysisResult = {
      pages: fileResults,
      globalAnalysis, // Ajouter le résultat de l'analyse globale
      // compiledCss,
      cssAnalysisResult,
    };

    // Étape 2 : Sauvegarde en fichier JSON
    const filePath = path.join("data", `${projectName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(analysisResult, null, 2));

    // Retour simplifié
    return res.status(200).json({
      message: `Project ${projectName} saved successfully`,
      analysisResult, // Retourne l'objet complet en une seule étape
    });
  } catch (error) {
    console.error("Error during repository scan:", error);
    res.status(500).json({ error: "An error occurred during the scan" });
  }
};
