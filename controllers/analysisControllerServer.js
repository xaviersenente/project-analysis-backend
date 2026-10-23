import fs from "fs";
import { HtmlCrawler } from "../services/html/fileScannerService.js";
import {
  analyzeHTML,
  extractTitleAndImagesFromHTML,
  analyzeAllPages,
  runLighthouse,
  analyzeImages,
  synthesizeImagesAnalysis,
} from "../services/htmlAnalysisService.js";
import {
  compileCSS,
  analyzeCSS,
  analyzeImports,
  analyzeCustomProperties,
  analyzeTypography,
  analyzeColors,
} from "../services/cssAnalysisService.js";
import {
  validateHTML,
  calculateValidationScore,
} from "../services/html/validationService.js";
import { performClassAnalysis } from "../services/css/classAnalysisService.js";
import axios from "axios";
import {
  validerSlug,
  trouverProjet,
  cheminResultat,
} from "../services/promo/promoService.js";
import { FileNotFoundError } from "../utils/errors.js";

// Une seule analyse à la fois : Lighthouse est lourd (S3)
let analyseEnCours = false;

/**
 * Scan un répertoire en ligne pour récupérer et analyser les fichiers HTML.
 */
export const scanUrl = async (req, res) => {
  // L'URL vient du fichier de promo, jamais de la requête (S3)
  const slug = validerSlug(req.body?.slug);
  const projet = trouverProjet(slug);

  if (!projet?.site) {
    throw new FileNotFoundError(slug);
  }
  if (analyseEnCours) {
    return res.status(409).json({ error: "Une analyse est déjà en cours" });
  }

  const url = projet.site;
  analyseEnCours = true;

  try {
    // Récupérer la liste des fichiers HTML depuis l'URL
    const htmlFiles = await HtmlCrawler(url);
    const fileResults = [];
    const allHtmlContents = [];

    // Analyser uniquement la page d'accueil (premier fichier HTML)
    const response = await axios.get(url);
    const htmlContent = response.data;

    // Extraire le CSS brut pour analyser les imports avant compilation
    const cssLinkMatch = htmlContent.match(
      /<link.*?href=['"](.*?\.css)['"].*?>/i
    );
    let cssImportsAnalysis = null;
    let cssRawContent = "";

    if (cssLinkMatch) {
      const cssUrl = new URL(cssLinkMatch[1], url).href;
      try {
        const cssResponse = await axios.get(cssUrl);
        cssRawContent = cssResponse.data;

        // Analyser les imports avant la compilation
        cssImportsAnalysis = await analyzeImports(cssRawContent, cssUrl);
        console.log("✅ Analyse des @import réussie.");
      } catch (error) {
        console.error(
          "❌ Erreur lors de l'analyse des imports CSS:",
          error.message
        );
      }
    }

    // Compiler et analyser le CSS de la page d'accueil uniquement
    const { css: compiledCss, importErrors } = await compileCSS(
      htmlContent,
      url
    );
    console.log("✅ CSS compilé avec succès.");
    console.log(`📊 Taille du CSS compilé: ${compiledCss.length} caractères`);
    console.log(
      `📊 Nombre d'@import restants: ${
        (compiledCss.match(/@import/g) || []).length
      }`
    );

    if (importErrors.length > 0) {
      console.warn(
        `⚠️ ${importErrors.length} erreur(s) d'import CSS détectée(s)`
      );
    }

    const cssAnalysisResult = await analyzeCSS(compiledCss);
    console.log("✅ CSS analysé avec succès.");

    // Analyser les couleurs CSS
    let colorsAnalysis = null;
    if (cssAnalysisResult?.values?.colors) {
      colorsAnalysis = analyzeColors(cssAnalysisResult.values.colors);
      console.log(
        `🎨 Analyse des couleurs: ${colorsAnalysis.uniqueColors} couleurs uniques, score: ${colorsAnalysis.score.total}/100`
      );
    }

    // Analyser les variables CSS
    const cssVariablesAnalysis = analyzeCustomProperties(compiledCss);
    console.log("✅ Analyse des variables CSS réussie.");

    // Analyser la typographie
    const typographyAnalysis = analyzeTypography(
      htmlContent,
      cssRawContent,
      compiledCss
    );
    console.log("✅ Analyse de la typographie réussie.");

    for (const fileUrl of htmlFiles) {
      const response = await axios.get(fileUrl);
      const contentType = response.headers["content-type"];

      if (!contentType || !contentType.includes("text/html")) {
        console.warn(
          `⚠️ Le contenu à ${fileUrl} n'est pas du HTML : ${contentType}`
        );
        continue; // Passe au fichier suivant
      }

      const htmlContent = response.data;

      // Stocker le contenu HTML pour l'analyse globale
      allHtmlContents.push(htmlContent);

      const titleAndImg = extractTitleAndImagesFromHTML(htmlContent);
      const htmlAnalysisResult = analyzeHTML(htmlContent);
      const lighthouseReport = await runLighthouse(fileUrl);
      const validationErrors = await validateHTML(htmlContent);

      // Analyse des images avec enrichissement des données Lighthouse
      const imagesAnalysis = analyzeImages(
        titleAndImg.images,
        lighthouseReport.requests,
        fileUrl
      );

      fileResults.push({
        file: fileUrl,
        title: titleAndImg.title,
        images: imagesAnalysis.images,
        imageStats: {
          total: imagesAnalysis.totalImages,
          withLazyLoading: imagesAnalysis.imagesWithLazyLoading,
          withoutLazyLoading:
            imagesAnalysis.totalImages - imagesAnalysis.imagesWithLazyLoading,
          lazyLoadingRatio:
            imagesAnalysis.imagesWithLazyLoading /
            Math.max(imagesAnalysis.totalImages, 1),
          lazyLoadingPercentage: Math.round(
            (imagesAnalysis.imagesWithLazyLoading /
              Math.max(imagesAnalysis.totalImages, 1)) *
              100
          ),
        },
        imagesAnalysis,
        ...htmlAnalysisResult,
        validationErrors,
        lighthouseReport,
      });
    }

    // Effectuer l'analyse globale sur toutes les pages
    const globalAnalysis = analyzeAllPages(allHtmlContents);

    // Calculer le score de validation
    const validationScore = calculateValidationScore(fileResults);

    // Synthétiser l'analyse des images pour l'ensemble des pages
    const globalImagesAnalysis = synthesizeImagesAnalysis(fileResults);

    const analysisResult = {
      pages: fileResults,
      globalAnalysis, // Ajouter le résultat de l'analyse globale
      globalImagesAnalysis, // Synthèse globale des images
      // compiledCss,
      cssAnalysisResult: {
        ...cssAnalysisResult,
        imports: cssImportsAnalysis,
        customProperties: cssVariablesAnalysis,
        typography: typographyAnalysis,
        colors: colorsAnalysis,
      },
      classAnalysis: performClassAnalysis(allHtmlContents, compiledCss),
      validationScore,
    };

    // Étape 2 : Sauvegarde en fichier JSON
    const filePath = cheminResultat(slug);
    fs.writeFileSync(filePath, JSON.stringify(analysisResult, null, 2));

    // Retour simplifié
    return res.status(200).json({
      message: `Project ${slug} saved successfully`,
      analysisResult, // Retourne l'objet complet en une seule étape
    });
  } catch (error) {
    console.error("Error during repository scan:", error);
    res.status(500).json({ error: "An error occurred during the scan" });
  } finally {
    analyseEnCours = false;
  }
};
