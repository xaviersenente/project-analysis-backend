import axios from "axios";
import {
  isNormalizeCSS,
  isGoogleFont,
  categorizeImportByPath,
  getImportType,
} from "../shared/cssHelpers.js";

/**
 * Calcule un score de qualité pour l'organisation des imports CSS.
 * Le score est sur 100 avec un découpage par critères.
 * @param {object} data - Données de l'analyse des imports.
 * @returns {{total:number, breakdown:object, grade:string, improvements:string[]}}
 */
const calculateImportsScore = (data) => {
  const { total, imports, organization } = data;

  const scores = {
    validity: { score: 0, max: 25, details: "" },
    organization: { score: 0, max: 30, details: "" },
    performance: { score: 0, max: 20, details: "" },
    naming: { score: 0, max: 15, details: "" },
    bestPractices: { score: 0, max: 10, details: "" },
  };

  // 1. Validité des imports (25 points)
  if (total === 0) {
    scores.validity.details = "Aucun import détecté.";
  } else {
    const validRatio = organization.validCount / total;
    scores.validity.score = Math.round(validRatio * 25);

    if (validRatio === 1) {
      scores.validity.details = "Tous les imports sont valides.";
    } else {
      scores.validity.details = `${organization.invalidCount} import(s) invalide(s) sur ${total}.`;
    }
  }

  // 2. Organisation (30 points)
  const categoryCount = Object.keys(organization.categories).length;
  const hasMultipleCategories = categoryCount >= 3;

  // Score basé sur la diversité des catégories
  const categoryScore = Math.min(15, categoryCount * 3);
  scores.organization.score += categoryScore;

  // Bonus si imports bien structurés (pas tout external ou tout relative)
  if (
    organization.relativeCount > 0 &&
    organization.relativeCount >= total * 0.3
  ) {
    scores.organization.score += 10;
  }

  // Bonus pour modularité
  if (hasMultipleCategories) {
    scores.organization.score += 5;
  }

  scores.organization.score = Math.min(30, scores.organization.score);

  if (hasMultipleCategories) {
    scores.organization.details = `${categoryCount} catégories utilisées. Bonne modularité.`;
  } else if (categoryCount === 0) {
    scores.organization.details = "Aucune organisation détectée.";
  } else {
    scores.organization.details = `${categoryCount} catégorie(s). Manque de modularité.`;
  }

  // 3. Modularité (20 points)
  let modularityScore = 0;
  let modularityDetails = "";

  // Score basé sur le nombre d'imports (logique composant)
  if (total >= 15 && total <= 25) {
    // Nombre optimal : 20 points
    modularityScore = 20;
    modularityDetails = `${total} imports. Excellente modularité (1 fichier par composant). `;
  } else if (total >= 10 && total < 15) {
    // Bon mais pourrait être plus modulaire
    modularityScore = 15;
    modularityDetails = `${total} imports. Bonne modularité, pourrait être améliorée. `;
  } else if (total > 25 && total <= 30) {
    // Très modulaire mais attention à ne pas trop fragmenter
    modularityScore = 17;
    modularityDetails = `${total} imports. Très bonne modularité, légèrement fragmenté. `;
  } else if (total >= 5 && total < 10) {
    // Manque de modularité
    modularityScore = 10;
    modularityDetails = `${total} imports. Manque de modularité. `;
  } else if (total > 30) {
    // Trop fragmenté
    modularityScore = 12;
    modularityDetails = `${total} imports. Sur-fragmenté, considérer regrouper certains fichiers. `;
  } else if (total > 0) {
    // Très peu d'imports
    modularityScore = 5;
    modularityDetails = `${total} import(s). Faible modularité. `;
  } else {
    modularityDetails = "Aucun import. ";
  }

  // Vérifier les tailles de fichiers
  const filesWithSize = imports.filter((i) => i.fileSize !== null);
  if (filesWithSize.length > 0) {
    const avgSize =
      filesWithSize.reduce((sum, i) => sum + i.fileSize, 0) /
      filesWithSize.length;
    const largeFiles = filesWithSize.filter((i) => i.fileSize > 100000).length;

    if (largeFiles > 0) {
      modularityScore -= Math.min(5, largeFiles * 2);
      modularityDetails += `${largeFiles} fichier(s) volumineux.`;
    } else if (avgSize < 50000) {
      modularityDetails += "Tailles de fichiers optimales.";
    }
  }

  scores.performance.score = Math.max(0, modularityScore);
  scores.performance.details = modularityDetails;

  // 4. Conventions de nommage des fichiers (15 points)
  const namingIssues = organization.namingIssues || {};
  const totalFiles = namingIssues.totalFiles || 0;

  if (totalFiles === 0) {
    scores.naming.details = "Aucun fichier à analyser.";
  } else {
    const issuesCount = namingIssues.filesWithIssues || 0;
    const cleanRatio = (totalFiles - issuesCount) / totalFiles;

    // Score basé sur le ratio de fichiers sans problèmes
    scores.naming.score = Math.round(cleanRatio * 15);

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

    if (issuesCount === 0) {
      scores.naming.details = "Conventions de nommage respectées.";
    } else {
      scores.naming.details = `${issuesCount}/${totalFiles} fichier(s) avec problèmes: ${problems.join(
        ", "
      )}.`;
    }
  }

  // 5. Bonnes pratiques (10 points)
  let bestPracticesScore = 0;
  const bestPracticesParts = [];
  const goodPracticesParts = [];

  const normalizeImports = imports.filter((i) => i.isNormalize).length;
  if (normalizeImports > 0) {
    bestPracticesScore += 3;
    goodPracticesParts.push(`Utilise normalize.css`);
  }

  if (organization.googleFontsCount > 0 && organization.googleFontsCount <= 2) {
    bestPracticesScore += 4;
  } else if (organization.googleFontsCount > 2) {
    bestPracticesParts.push("Trop d'imports Google Fonts");
  }

  if (organization.externalCount <= 3) {
    bestPracticesScore += 3;
  } else {
    bestPracticesParts.push("Trop d'imports externes");
  }

  scores.bestPractices.score = bestPracticesScore;

  // Construire le message avec bonnes pratiques ET problèmes
  const messages = [];
  if (goodPracticesParts.length > 0) {
    messages.push(`Bonnes pratiques: ${goodPracticesParts.join(", ")}`);
  }
  if (bestPracticesParts.length > 0) {
    messages.push(`Problèmes: ${bestPracticesParts.join(", ")}`);
  }

  scores.bestPractices.details =
    messages.length > 0
      ? messages.join(". ") + "."
      : "Bonnes pratiques respectées.";

  // Total et grade
  const totalScore = Object.values(scores).reduce((sum, s) => sum + s.score, 0);

  let grade;
  if (totalScore >= 90) grade = "A";
  else if (totalScore >= 80) grade = "B";
  else if (totalScore >= 70) grade = "C";
  else if (totalScore >= 60) grade = "D";
  else grade = "F";

  // Recommandations
  const improvements = [];

  if (organization.invalidCount > 0) {
    improvements.push("Corriger les imports invalides ou inaccessibles");
  }
  if (categoryCount < 3) {
    improvements.push(
      "Organiser le CSS en catégories (base, components, layout, utils)"
    );
  }
  if (total < 10) {
    improvements.push(
      "Augmenter la modularité : créer un fichier CSS par composant (idéal : 15-25 imports)"
    );
  } else if (total > 30) {
    improvements.push(
      "Trop de fichiers : envisager de regrouper certains composants similaires"
    );
  }
  if (organization.googleFontsCount > 2) {
    improvements.push("Limiter le nombre de polices Google Fonts");
  }
  if (namingIssues.filesWithIssues > 0) {
    improvements.push(
      "Renommer les fichiers: utiliser kebab-case, sans espaces, sans accents ni caractères spéciaux"
    );
  }

  return {
    total: totalScore,
    breakdown: scores,
    grade,
    improvements,
  };
};

/**
 * Analyse les règles @import avant la compilation.
 * @param {string} cssContent - Le contenu CSS brut.
 * @param {string} baseUrl - L'URL de base pour résoudre les chemins.
 * @returns {object} - Informations détaillées sur les imports, leur organisation et les noms de classes.
 */
export const analyzeImports = async (cssContent, baseUrl) => {
  console.log(`🔍 Analyse des @import CSS...`);

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
        const response = await axios.head(resolvedUrl, { timeout: 3000 });
        isValid = response.status === 200;

        // Récupérer la taille du fichier si disponible
        if (response.headers["content-length"]) {
          fileSize = parseInt(response.headers["content-length"], 10);
        }
      } else {
        // Chemin relatif
        resolvedUrl = new URL(importPath, baseUrl).href;
        const response = await axios.head(resolvedUrl, { timeout: 3000 });
        isValid = response.status === 200;

        if (response.headers["content-length"]) {
          fileSize = parseInt(response.headers["content-length"], 10);
        }
      }
    } catch (error) {
      isValid = false;
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
};
