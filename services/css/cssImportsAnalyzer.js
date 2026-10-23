import axios from "axios";
import {
  isNormalizeCSS,
  isGoogleFont,
  categorizeImportByPath,
  getImportType,
} from "../shared/cssHelpers.js";
import {
  ScoreCalculator,
  createScore,
  ratioToScore,
} from "../shared/scoreCalculator.js";
import thresholds from "../../config/thresholds.js";
import { ExternalServiceError, wrapError } from "../../utils/errors.js";

/**
 * Calcule un score de qualité pour l'organisation des imports CSS.
 * Utilise ScoreCalculator pour une logique de scoring standardisée.
 * @param {object} data - Données de l'analyse des imports.
 * @returns {{total:number, breakdown:object, grade:string, improvements:string[]}}
 */
const calculateImportsScore = (data) => {
  const { total, imports, organization } = data;
  const improvements = [];

  const calculator = new ScoreCalculator();

  // 1. Validité des imports (25 points)
  calculator.addCategory(
    "validity",
    thresholds.scoring.points.importsOrganization * 0.833,
    () => {
      if (total === 0) {
        return createScore(0, 25, "Aucun import détecté.");
      }

      const validRatio = organization.validCount / total;
      const score = validRatio * 25;
      const details =
        validRatio === 1
          ? "Tous les imports sont valides."
          : `${organization.invalidCount} import(s) invalide(s) sur ${total}.`;

      const improvement =
        organization.invalidCount > 0
          ? "Corriger les imports invalides ou inaccessibles"
          : null;

      if (improvement) improvements.push(improvement);

      return createScore(score, 25, details, improvement);
    }
  );

  // 2. Organisation (30 points)
  calculator.addCategory(
    "organization",
    thresholds.scoring.points.importsOrganization,
    () => {
      const categoryCount = Object.keys(organization.categories).length;
      const hasMultipleCategories =
        categoryCount >= thresholds.imports.organization.minCategories;

      let score = 0;

      // Score basé sur la diversité des catégories
      score += Math.min(15, categoryCount * 3);

      // Bonus si imports bien structurés (pas tout external ou tout relative)
      if (
        organization.relativeCount > 0 &&
        organization.relativeCount >= total * 0.3
      ) {
        score += 10;
      }

      // Bonus pour modularité
      if (hasMultipleCategories) {
        score += 5;
      }

      score = Math.min(30, score);

      const details = hasMultipleCategories
        ? `${categoryCount} catégories utilisées. Bonne modularité.`
        : categoryCount === 0
        ? "Aucune organisation détectée."
        : `${categoryCount} catégorie(s). Manque de modularité.`;

      const improvement =
        categoryCount < thresholds.imports.organization.minCategories
          ? "Organiser le CSS en catégories (base, components, layout, utils)"
          : null;

      if (improvement) improvements.push(improvement);

      return createScore(score, 30, details, improvement);
    }
  );

  // 3. Performance / Modularité (20 points)
  calculator.addCategory(
    "performance",
    thresholds.scoring.points.importsModularity,
    () => {
      const { optimalMin, optimalMax, low, veryLow, high, tooMany } =
        thresholds.imports.count;
      let score = 0;
      let details = "";
      let improvement = null;

      if (total >= optimalMin && total <= optimalMax) {
        score = 20;
        details = `${total} imports. Excellente modularité (1 fichier par composant). `;
      } else if (total >= low && total < optimalMin) {
        score = 15;
        details = `${total} imports. Bonne modularité, pourrait être améliorée. `;
        improvement =
          "Augmenter la modularité : créer un fichier CSS par composant (idéal : 15-25 imports)";
      } else if (total > optimalMax && total <= high) {
        score = 17;
        details = `${total} imports. Très bonne modularité, légèrement fragmenté. `;
      } else if (total >= veryLow && total < low) {
        score = 10;
        details = `${total} imports. Manque de modularité. `;
        improvement =
          "Augmenter la modularité : créer un fichier CSS par composant (idéal : 15-25 imports)";
      } else if (total > tooMany) {
        score = 12;
        details = `${total} imports. Sur-fragmenté, considérer regrouper certains fichiers. `;
        improvement =
          "Trop de fichiers : envisager de regrouper certains composants similaires";
      } else if (total > 0) {
        score = 5;
        details = `${total} import(s). Faible modularité. `;
        improvement =
          "Augmenter la modularité : créer un fichier CSS par composant (idéal : 15-25 imports)";
      } else {
        details = "Aucun import. ";
      }

      // Vérifier les tailles de fichiers
      const filesWithSize = imports.filter((i) => i.fileSize !== null);
      if (filesWithSize.length > 0) {
        const avgSize =
          filesWithSize.reduce((sum, i) => sum + i.fileSize, 0) /
          filesWithSize.length;
        const largeFiles = filesWithSize.filter(
          (i) => i.fileSize > thresholds.imports.fileSize.large
        ).length;

        if (largeFiles > 0) {
          score -= Math.min(
            5,
            largeFiles * thresholds.imports.fileSize.penaltyPerLargeFile
          );
          details += `${largeFiles} fichier(s) volumineux.`;
        } else if (avgSize < thresholds.imports.fileSize.optimal) {
          details += "Tailles de fichiers optimales.";
        }
      }

      if (improvement) improvements.push(improvement);

      return createScore(Math.max(0, score), 20, details, improvement);
    }
  );

  // 4. Conventions de nommage des fichiers (15 points)
  calculator.addCategory("naming", 15, () => {
    const namingIssues = organization.namingIssues || {};
    const totalFiles = namingIssues.totalFiles || 0;

    if (totalFiles === 0) {
      return createScore(0, 15, "Aucun fichier à analyser.");
    }

    const issuesCount = namingIssues.filesWithIssues || 0;
    const cleanRatio = (totalFiles - issuesCount) / totalFiles;
    const score = cleanRatio * 15;

    const problems = [];
    if (namingIssues.withSpaces > 0) {
      problems.push(`${namingIssues.withSpaces} avec espaces`);
    }
    if (namingIssues.withAccents > 0) {
      problems.push(`${namingIssues.withAccents} avec accents`);
    }
    if (namingIssues.withSpecialChars > 0) {
      problems.push(
        `${namingIssues.withSpecialChars} avec caractères spéciaux`
      );
    }
    if (namingIssues.withUpperCase > 0) {
      problems.push(`${namingIssues.withUpperCase} avec majuscules`);
    }

    const details =
      issuesCount === 0
        ? "Conventions de nommage respectées."
        : `${issuesCount}/${totalFiles} fichier(s) avec problèmes: ${problems.join(
            ", "
          )}.`;

    const improvement =
      issuesCount > 0
        ? "Renommer les fichiers: utiliser kebab-case, sans espaces, sans accents ni caractères spéciaux"
        : null;

    if (improvement) improvements.push(improvement);

    return createScore(score, 15, details, improvement);
  });

  // 5. Bonnes pratiques (10 points)
  calculator.addCategory("bestPractices", 10, () => {
    let score = 0;
    const goodPracticesParts = [];
    const bestPracticesParts = [];

    const normalizeImports = imports.filter((i) => i.isNormalize).length;
    if (normalizeImports > 0) {
      score += 3;
      goodPracticesParts.push(`Utilise normalize.css`);
    }

    if (
      organization.googleFontsCount > 0 &&
      organization.googleFontsCount <= 2
    ) {
      score += 4;
    } else if (organization.googleFontsCount > 2) {
      bestPracticesParts.push("Trop d'imports Google Fonts");
      improvements.push("Limiter le nombre de polices Google Fonts");
    }

    if (organization.externalCount <= 3) {
      score += 3;
    } else {
      bestPracticesParts.push("Trop d'imports externes");
    }

    // Construire le message
    const messages = [];
    if (goodPracticesParts.length > 0) {
      messages.push(`Bonnes pratiques: ${goodPracticesParts.join(", ")}`);
    }
    if (bestPracticesParts.length > 0) {
      messages.push(`Problèmes: ${bestPracticesParts.join(", ")}`);
    }

    const details =
      messages.length > 0
        ? messages.join(". ") + "."
        : "Bonnes pratiques respectées.";

    return createScore(score, 10, details);
  });

  // Calculer et retourner le résultat
  const result = calculator.calculate();

  // Ajouter les améliorations collectées
  result.improvements = [...new Set([...result.improvements, ...improvements])];

  return result;
};

/**
 * Analyse les règles @import avant la compilation.
 * @param {string} cssContent - Le contenu CSS brut.
 * @param {string} baseUrl - L'URL de base pour résoudre les chemins.
 * @returns {object} - Informations détaillées sur les imports, leur organisation et les noms de classes.
 * @throws {ExternalServiceError} Si les requêtes externes échouent
 */
export const analyzeImports = async (cssContent, baseUrl) => {
  console.log(`🔍 Analyse des @import CSS...`);

  try {
    // Supprimer les commentaires CSS pour éviter d'analyser les @import dans les commentaires
    const cssWithoutComments = cssContent.replace(/\/\*[\s\S]*?\*\//g, "");

    const imports = [];
    const importRegex =
      /@import\s+(?:url\()?\s*['"]?([^'")]+)['"]?\s*\)?(?:\s+([^;]+))?;/gi;
    let match;

    // Métriques d'organisation
    const organizationMetrics = {
      googleFontsCount: 0,
      externalCount: 0,
      relativeCount: 0,
      categories: {},
      namingIssues: {
        totalFiles: 0,
        filesWithIssues: 0,
        withSpaces: 0,
        withAccents: 0,
        withSpecialChars: 0,
        withUpperCase: 0,
        problematicFiles: [],
      },
    };

    while ((match = importRegex.exec(cssWithoutComments)) !== null) {
      const importPath = match[1];
      const mediaQuery = match[2] ? match[2].trim() : null;

      let isValid = false;
      let resolvedUrl = importPath;
      let fileSize = null;
      const isNormalize = isNormalizeCSS(importPath);
      const isGoogleFontImport = isGoogleFont(importPath);
      const type = getImportType(importPath);
      const category = categorizeImportByPath(importPath);

      // Mise à jour des compteurs
      if (isGoogleFontImport) organizationMetrics.googleFontsCount++;
      if (type === "external") organizationMetrics.externalCount++;
      if (type === "relative") organizationMetrics.relativeCount++;
      organizationMetrics.categories[category] =
        (organizationMetrics.categories[category] || 0) + 1;

      try {
        // Vérifier si c'est un chemin absolu ou relatif
        if (
          importPath.startsWith("http://") ||
          importPath.startsWith("https://")
        ) {
          resolvedUrl = importPath;
          // Tenter de vérifier l'accessibilité
          const response = await axios.head(resolvedUrl, {
            timeout: thresholds.performance.timeouts.default,
          });
          isValid = response.status === 200;

          // Récupérer la taille du fichier si disponible
          if (response.headers["content-length"]) {
            fileSize = parseInt(response.headers["content-length"], 10);
          }
        } else {
          // Chemin relatif
          resolvedUrl = new URL(importPath, baseUrl).href;
          const response = await axios.head(resolvedUrl, {
            timeout: thresholds.performance.timeouts.default,
          });
          isValid = response.status === 200;

          if (response.headers["content-length"]) {
            fileSize = parseInt(response.headers["content-length"], 10);
          }
        }
      } catch (error) {
        isValid = false;
        // Log mais ne pas propager l'erreur pour un import individuel
        console.warn(`⚠️  Import inaccessible: ${importPath}`, error.message);
      }

      // Analyser le nommage du fichier (pour les fichiers relatifs et root-relatifs)
      if (
        (type === "relative" || importPath.startsWith("/")) &&
        !isGoogleFontImport
      ) {
        organizationMetrics.namingIssues.totalFiles++;

        // Extraire le nom du fichier (sans le chemin)
        const fileName = importPath
          .split("/")
          .pop()
          .replace(/\.css$/, "");
        const issues = [];

        // Détecter les espaces
        if (fileName.includes(" ")) {
          organizationMetrics.namingIssues.withSpaces++;
          issues.push("espaces");
        }

        // Détecter les accents (caractères non-ASCII courants)
        if (/[àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ]/.test(fileName)) {
          organizationMetrics.namingIssues.withAccents++;
          issues.push("accents");
        }

        // Détecter les caractères spéciaux (sauf - et _)
        if (/[^a-zA-Z0-9\-_]/.test(fileName.replace(/\s/g, ""))) {
          organizationMetrics.namingIssues.withSpecialChars++;
          issues.push("caractères spéciaux");
        }

        // Détecter les majuscules
        if (/[A-Z]/.test(fileName)) {
          organizationMetrics.namingIssues.withUpperCase++;
          issues.push("majuscules");
        }

        if (issues.length > 0) {
          organizationMetrics.namingIssues.filesWithIssues++;
          organizationMetrics.namingIssues.problematicFiles.push({
            path: importPath,
            fileName,
            issues,
          });
        }
      }

      imports.push({
        path: importPath,
        resolvedUrl,
        mediaQuery,
        isValid,
        isNormalize,
        isGoogleFont: isGoogleFontImport,
        type,
        category,
        fileSize,
      });
    }

    // Préparer les données pour le retour
    const analysisData = {
      total: imports.length,
      imports,
      organization: {
        googleFontsCount: organizationMetrics.googleFontsCount,
        externalCount: organizationMetrics.externalCount,
        relativeCount: organizationMetrics.relativeCount,
        validCount: imports.filter((i) => i.isValid).length,
        invalidCount: imports.filter((i) => !i.isValid).length,
        categories: organizationMetrics.categories,
        namingIssues: organizationMetrics.namingIssues,
      },
    };

    // Calculer le score
    const score = calculateImportsScore(analysisData);

    console.log(
      `✅ Analyse des imports terminée. Score: ${score.total}/100 (${score.grade})`
    );

    return {
      ...analysisData,
      score,
    };
  } catch (error) {
    throw wrapError(error, "CSS imports analysis failed", { baseUrl });
  }
};
