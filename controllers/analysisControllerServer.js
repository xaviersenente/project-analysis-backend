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
import { creerSuivi } from "../utils/mesure.js";
import { fermerChrome } from "../services/html/lighthouseService.js";
import thresholds from "../config/thresholds.js";

// Délai de chaque requête vers le site analysé (F5)
const optionsHttp = { timeout: thresholds.performance.timeouts.http };

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
  const { nonMesurable, mesurer, noter } = creerSuivi();

  try {
    // Récupérer la liste des fichiers HTML depuis l'URL ; à défaut, la seule page d'accueil
    const pagesTrouvees = await mesurer("Exploration du site", () => HtmlCrawler(url));
    const htmlFiles = pagesTrouvees?.length ? pagesTrouvees : [url];
    const fileResults = [];
    const allHtmlContents = [];

    // Analyser uniquement la page d'accueil (premier fichier HTML)
    const accueil = await mesurer("Page d'accueil", () => axios.get(url, optionsHttp));
    const htmlContent = typeof accueil?.data === "string" ? accueil.data : null;

    // --- CSS de la page d'accueil : rien n'est noté sur une feuille absente ---
    let cssImportsAnalysis = null;
    let cssRawContent = "";
    let compiled = null;

    if (htmlContent !== null) {
      // Extraire le CSS brut pour analyser les imports avant compilation
      const cssLinkMatch = htmlContent.match(
        /<link.*?href=['"](.*?\.css)['"].*?>/i
      );

      if (cssLinkMatch) {
        const cssUrl = new URL(cssLinkMatch[1], url).href;
        cssImportsAnalysis = await mesurer("Imports CSS", async () => {
          const cssResponse = await axios.get(cssUrl, optionsHttp);
          cssRawContent = cssResponse.data;
          return analyzeImports(cssRawContent, cssUrl);
        });
      }

      // Compiler et analyser le CSS de la page d'accueil uniquement
      compiled = await mesurer("CSS", async () => {
        const { css, importErrors } = await compileCSS(htmlContent, url);
        console.log(`📊 Taille du CSS compilé: ${css.length} caractères`);
        if (importErrors.length > 0) {
          console.warn(
            `⚠️ ${importErrors.length} erreur(s) d'import CSS détectée(s)`
          );
        }
        return { css, analyse: await analyzeCSS(css) };
      });
    }

    let cssAnalysisResult = null;
    if (compiled) {
      const colorsAnalysis = compiled.analyse?.values?.colors
        ? await mesurer("Couleurs CSS", () =>
            analyzeColors(compiled.analyse.values.colors)
          )
        : null;

      cssAnalysisResult = {
        ...compiled.analyse,
        imports: cssImportsAnalysis,
        customProperties: await mesurer("Variables CSS", () =>
          analyzeCustomProperties(compiled.css)
        ),
        typography: await mesurer("Typographie", () =>
          analyzeTypography(htmlContent, cssRawContent, compiled.css)
        ),
        colors: colorsAnalysis,
      };
    }

    // --- Pages : chacune est analysée indépendamment ---
    for (const fileUrl of htmlFiles) {
      const response = await mesurer(`Page (${fileUrl})`, () =>
        axios.get(fileUrl, optionsHttp)
      );
      if (!response) continue;

      const contentType = response.headers["content-type"];
      if (!contentType || !contentType.includes("text/html")) {
        console.warn(
          `⚠️ Le contenu à ${fileUrl} n'est pas du HTML : ${contentType}`
        );
        continue; // Passe au fichier suivant
      }

      const pageHtml = response.data;

      const statique = await mesurer(`Analyse HTML (${fileUrl})`, () => ({
        titleAndImg: extractTitleAndImagesFromHTML(pageHtml),
        htmlAnalysisResult: analyzeHTML(pageHtml),
      }));
      if (!statique) continue;

      // Stocker le contenu HTML pour l'analyse globale
      allHtmlContents.push(pageHtml);

      const { titleAndImg, htmlAnalysisResult } = statique;
      const lighthouseReport = await mesurer(`Lighthouse (${fileUrl})`, () =>
        runLighthouse(fileUrl)
      );

      const validation = await validateHTML(pageHtml);
      if (!validation.mesurable) {
        noter(`Validation W3C (${fileUrl})`, validation.raison);
      }

      // Analyse des images avec enrichissement des données Lighthouse
      const imagesAnalysis = await mesurer(`Images (${fileUrl})`, () =>
        analyzeImages(
          titleAndImg.images,
          lighthouseReport?.requests ?? null,
          fileUrl
        )
      );

      fileResults.push({
        file: fileUrl,
        title: titleAndImg.title,
        images: imagesAnalysis?.images ?? [],
        imageStats: imagesAnalysis
          ? {
              total: imagesAnalysis.totalImages,
              withLazyLoading: imagesAnalysis.imagesWithLazyLoading,
              withoutLazyLoading:
                imagesAnalysis.totalImages -
                imagesAnalysis.imagesWithLazyLoading,
              lazyLoadingRatio:
                imagesAnalysis.imagesWithLazyLoading /
                Math.max(imagesAnalysis.totalImages, 1),
              lazyLoadingPercentage: Math.round(
                (imagesAnalysis.imagesWithLazyLoading /
                  Math.max(imagesAnalysis.totalImages, 1)) *
                  100
              ),
            }
          : null,
        imagesAnalysis,
        ...htmlAnalysisResult,
        validationErrors: validation.erreurs,
        validation: { mesurable: validation.mesurable, raison: validation.raison },
        lighthouseReport,
      });
    }

    // --- Synthèses : seulement s'il y a des pages analysées ---
    const avecPages = fileResults.length > 0;
    if (!avecPages) noter("Pages", "Aucune page n'a pu être analysée");

    const analysisResult = {
      pages: fileResults,
      // Ajouter le résultat de l'analyse globale
      globalAnalysis: avecPages
        ? await mesurer("Analyse globale", () => analyzeAllPages(allHtmlContents))
        : null,
      // Synthèse globale des images
      globalImagesAnalysis: avecPages
        ? await mesurer("Synthèse des images", () =>
            synthesizeImagesAnalysis(fileResults)
          )
        : null,
      // compiledCss,
      cssAnalysisResult,
      classAnalysis:
        compiled && avecPages
          ? await mesurer("Classes", () =>
              performClassAnalysis(allHtmlContents, compiled.css)
            )
          : null,
      // Calculer le score de validation
      validationScore: avecPages ? calculateValidationScore(fileResults) : null,
      nonMesurable,
    };

    // Étape 2 : Sauvegarde en fichier JSON
    const filePath = cheminResultat(slug);
    fs.writeFileSync(filePath, JSON.stringify(analysisResult, null, 2));

    // Retour simplifié
    return res.status(200).json({
      message: `Project ${slug} saved successfully`,
      nonMesurable,
      analysisResult, // Retourne l'objet complet en une seule étape
    });
  } catch (error) {
    console.error("Error during repository scan:", error);
    res.status(500).json({ error: "An error occurred during the scan" });
  } finally {
    await fermerChrome();
    analyseEnCours = false;
  }
};
