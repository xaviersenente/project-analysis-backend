import { getRepositoryFiles } from "../services/githubService.js";
import {
  analyzeHTML,
  extractTitleFromHTML,
  analyzeAllPages,
  runLighthouse,
} from "../services/analysisService.js";
import { validateHTML } from "../services/validationService.js";
import axios from "axios";

export const scanRepository = async (req, res) => {
  const { repoOwner, repoName } = req.params;

  try {
    // Récupérer la liste des fichiers HTML du repo
    const files = await getRepositoryFiles(repoOwner, repoName);
    const htmlFiles = files.filter((file) => file.name.endsWith(".html"));

    const fileResults = [];
    const allHtmlContents = []; // Pour stocker le contenu HTML de toutes les pages

    for (const file of htmlFiles) {
      const fileUrl = file.download_url;
      const htmlContent = await axios.get(fileUrl).then((res) => res.data);

      // Stocker le contenu HTML pour l'analyse globale
      allHtmlContents.push(htmlContent);

      const title = await extractTitleFromHTML(fileUrl);
      const analysisResult = analyzeHTML(htmlContent);
      const validationErrors = await validateHTML(htmlContent);
      const lighthouseReport = await runLighthouse(fileUrl);

      fileResults.push({
        file: file.name,
        title,
        ...analysisResult,
        validationErrors, // Ajouter les erreurs de validation W3C
        lighthouseReport,
      });
    }

    // Effectuer l'analyse globale sur toutes les pages
    const globalAnalysis = analyzeAllPages(allHtmlContents);

    res.json({
      pages: fileResults,
      globalAnalysis, // Ajouter le résultat de l'analyse globale
    });
  } catch (error) {
    console.error("Error during repository scan:", error);
    res.status(500).json({ error: "An error occurred during the scan" });
  }
};
