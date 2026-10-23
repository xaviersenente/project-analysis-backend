import postcss from "postcss";
import { resolveVariable } from "../shared/cssHelpers.js";
import { ScoreCalculator, createScore } from "../shared/scoreCalculator.js";
import thresholds from "../../config/thresholds.js";
import { parseCSS } from "../shared/cssParser.js";

/**
 * Normalise le nom d'une famille de police pour éviter les doublons dus à la casse
 * @param {string} fontFamily - Le nom de la famille de police
 * @returns {string} - Le nom normalisé (première lettre en majuscule pour chaque mot)
 */
const normalizeFontFamily = (fontFamily) => {
  if (!fontFamily) return fontFamily;

  // Séparer par espaces et mettre la première lettre de chaque mot en majuscule
  return fontFamily
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Détecte les webfonts importées dans le HTML
 * @param {string} htmlContent - Le contenu HTML.
 * @returns {Array<object>} - Liste des imports de webfonts trouvés dans le HTML.
 */
export const detectWebfontsInHtml = (htmlContent) => {
  const webfonts = [];

  // Regex pour détecter les balises <link ...> avec href vers des providers connus
  // On filtrera ensuite pour ne garder que celles avec rel="stylesheet"
  const linkRegex =
    /<link[^>]*href=["']([^"']*(?:fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|use\.fontawesome\.com)[^"']*)["'][^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const fullTag = match[0];
    const url = match[1];

    // Ignorer les preconnect/preload/dns-prefetch: ne compter que rel="stylesheet"
    if (!/rel=["']stylesheet["']/i.test(fullTag)) {
      continue;
    }

    webfonts.push({
      source: "html-link",
      url,
      provider: url.includes("googleapis")
        ? "Google Fonts"
        : url.includes("typekit")
        ? "Adobe Fonts"
        : url.includes("fontawesome")
        ? "Font Awesome"
        : "Unknown",
    });
  }

  return webfonts;
};

/**
 * Détecte les webfonts importées dans le CSS
 * @param {string} cssContent - Le contenu CSS brut.
 * @returns {Array<object>} - Liste des imports de webfonts trouvés dans le CSS.
 */
export const detectWebfontsInCss = (cssContent) => {
  const webfonts = [];

  // Détecter les @import de fonts
  const importRegex =
    /@import\s+(?:url\()?\s*["']?([^"')]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net)[^"')]*)["']?\s*\)?/gi;
  let match;

  while ((match = importRegex.exec(cssContent)) !== null) {
    const url = match[1];
    webfonts.push({
      source: "css-import",
      url,
      provider: url.includes("googleapis")
        ? "Google Fonts"
        : url.includes("typekit")
        ? "Adobe Fonts"
        : "Unknown",
    });
  }

  // Détecter les @font-face
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
  while ((match = fontFaceRegex.exec(cssContent)) !== null) {
    const content = match[1];
    const familyMatch = content.match(/font-family\s*:\s*["']?([^"';]+)["']?/i);
    const srcMatch = content.match(/src\s*:\s*([^;]+)/i);

    if (familyMatch) {
      webfonts.push({
        source: "css-font-face",
        family: familyMatch[1].trim(),
        src: srcMatch ? srcMatch[1].trim() : null,
        provider: "Custom",
      });
    }
  }

  return webfonts;
};

/**
 * Analyse les unités utilisées dans les font-size
 * @param {Map} fontFamilies - Map des familles de polices avec leurs tailles
 * @returns {object} - Statistiques sur les unités utilisées
 */
export const analyzeFontSizeUnits = (fontFamilies) => {
  const units = {
    px: 0,
    rem: 0,
    em: 0,
    percent: 0,
    other: 0,
  };

  let totalSizes = 0;

  fontFamilies.forEach((data) => {
    data.sizes.forEach((_, size) => {
      totalSizes++;
      if (/px$/i.test(size)) units.px++;
      else if (/rem$/i.test(size)) units.rem++;
      else if (/em$/i.test(size)) units.em++;
      else if (/%$/i.test(size)) units.percent++;
      else units.other++;
    });
  });

  const relativeUnits = units.rem + units.em + units.percent;
  const relativeRatio = totalSizes > 0 ? relativeUnits / totalSizes : 0;

  return {
    units,
    totalSizes,
    relativeUnits,
    relativeRatio,
  };
};

/**
 * Analyse les unités utilisées dans les line-height
 * @param {Map} lineHeightValues - Map des valeurs de line-height collectées
 * @returns {object} - Statistiques sur les unités utilisées
 */
export const analyzeLineHeightUnits = (lineHeightValues) => {
  const units = {
    unitless: 0, // 1.5, 2, etc.
    percent: 0, // 150%, 200%
    px: 0,
    em: 0,
    rem: 0,
    other: 0,
  };

  let total = 0;

  lineHeightValues.forEach((count, value) => {
    total += count;

    // Unitless (nombre décimal ou entier)
    if (/^\d+\.?\d*$/.test(value)) {
      units.unitless += count;
    }
    // Pourcentage
    else if (/%$/.test(value)) {
      units.percent += count;
    }
    // Unités CSS
    else if (/px$/i.test(value)) {
      units.px += count;
    } else if (/rem$/i.test(value)) {
      units.rem += count;
    } else if (/em$/i.test(value)) {
      units.em += count;
    } else {
      units.other += count;
    }
  });

  const proportionalUnits = units.unitless + units.percent;
  const proportionalRatio = total > 0 ? proportionalUnits / total : 0;

  return {
    units,
    total,
    proportionalUnits,
    proportionalRatio,
  };
};

/**
 * Calcule le score de la qualité typographique
 * Utilise ScoreCalculator pour standardiser la logique
 * @param {object} typographyData - Données brutes avant transformation
 * @param {object} summary - Résumé des métriques
 * @param {Array} webfonts - Liste des webfonts détectées
 * @param {Map} fontFamilies - Map des familles de polices
 * @returns {object} - Score détaillé sur 100
 */
export const calculateTypographyScore = (
  typographyData,
  summary,
  webfonts,
  fontFamilies
) => {
  const improvements = [];
  const calculator = new ScoreCalculator();

  // 1. Score Webfonts (15 points)
  calculator.addCategory("webfonts", 15, () => {
    let score = 0;
    const details = [];

    if (webfonts.length > 0) {
      score += 5;
      details.push(`${webfonts.length} webfont(s) détectée(s)`);

      // Source appropriée (HTML ou CSS)
      if (
        webfonts.some(
          (w) => w.source === "html-link" || w.source === "css-import"
        )
      ) {
        score += 5;
        details.push("Import correct");
      }

      // Pas de doublons excessifs
      const uniqueProviders = new Set(webfonts.map((w) => w.provider)).size;
      if (webfonts.length <= uniqueProviders * 2) {
        score += 5;
        details.push("Pas de doublons");
      } else {
        details.push("Imports en doublon détectés");
        improvements.push("Éviter les imports de webfonts en doublon");
      }
    } else {
      details.push("Aucune webfont détectée");
      improvements.push("Utiliser des webfonts pour améliorer la typographie");
    }

    return createScore(score, 15, details.join(". "));
  });

  // 2. Score Fallbacks (20 points)
  calculator.addCategory("fallbacks", 20, () => {
    const fallbackCoverage = summary.fallbackCoverage || 0;
    const score = fallbackCoverage * 20;

    const details =
      summary.familiesWithoutGenericFallback === 0
        ? "Toutes les polices ont des fallbacks génériques."
        : `${summary.familiesWithoutGenericFallback} police(s) sans fallback générique.`;

    if (summary.familiesWithoutGenericFallback > 0) {
      improvements.push(
        "Ajouter des polices de secours avec familles génériques"
      );
    }

    return createScore(score, 20, details);
  });

  // 3. Score Héritage (25 points)
  calculator.addCategory(
    "inheritance",
    thresholds.scoring.points.typographyHierarchy + 5,
    () => {
      let score = 0;
      const details = [];

      if (summary.hasGlobalFontFamily) {
        score += 10;
        details.push("Police globale définie");
      } else {
        details.push("Pas de police globale");
        improvements.push(
          "Définir une police globale et réduire les redéclarations"
        );
      }

      const inheritanceQuality = summary.inheritanceQuality || 0;
      score += inheritanceQuality * 15;
      details.push(
        `Qualité d'héritage: ${Math.round(inheritanceQuality * 100)}%`
      );

      return createScore(score, 25, details.join(". "));
    }
  );

  // 4. Score Cohérence des tailles (20 points)
  calculator.addCategory("sizes", 20, () => {
    const unitsAnalysis = analyzeFontSizeUnits(fontFamilies);

    // Analyser le nombre de variations de tailles
    let avgSizeVariations = 0;
    let totalFamilies = 0;
    fontFamilies.forEach((data) => {
      if (data.sizes.size > 0) {
        avgSizeVariations += data.sizes.size;
        totalFamilies++;
      }
    });
    avgSizeVariations =
      totalFamilies > 0 ? avgSizeVariations / totalFamilies : 0;

    // Score selon le nombre de variations
    let score = 0;
    let details = "";

    if (
      avgSizeVariations >=
        thresholds.typography.fontSizeVariations.optimal.min &&
      avgSizeVariations <= thresholds.typography.fontSizeVariations.optimal.max
    ) {
      score += 10;
      details = "Nombre de tailles optimal. ";
    } else if (
      avgSizeVariations >= thresholds.typography.fontSizeVariations.good.min &&
      avgSizeVariations <= thresholds.typography.fontSizeVariations.good.max
    ) {
      score += 7;
      details = "Nombre de tailles correct. ";
    } else if (
      avgSizeVariations >=
        thresholds.typography.fontSizeVariations.acceptable.min &&
      avgSizeVariations <=
        thresholds.typography.fontSizeVariations.acceptable.max
    ) {
      score += 4;
      details = "Trop de variations de tailles. ";
    } else if (
      avgSizeVariations >
      thresholds.typography.fontSizeVariations.acceptable.max
    ) {
      details = "Beaucoup trop de variations de tailles. ";
      improvements.push("Réduire le nombre de variations de tailles de police");
    } else {
      details = "Peu de variations de tailles. ";
    }

    // Score pour unités relatives
    const relativeScore = unitsAnalysis.relativeRatio * 10;
    score += relativeScore;
    details += `${Math.round(
      unitsAnalysis.relativeRatio * 100
    )}% d'unités relatives.`;

    if (
      unitsAnalysis.relativeRatio < thresholds.typography.relativeUnitsRatio.min
    ) {
      improvements.push("Privilégier rem/em au lieu de px pour les font-size");
    }

    return createScore(score, 20, details);
  });

  // 5. Score Line-heights (15 points)
  calculator.addCategory("lineHeights", 15, () => {
    const lineHeightRatio =
      summary.totalFontSizeDeclarations > 0
        ? summary.totalLineHeightDeclarations /
          summary.totalFontSizeDeclarations
        : 0;

    // Score de couverture (10 points)
    let score = lineHeightRatio * 10;

    // Score pour unités proportionnelles (5 points)
    if (summary.lineHeightUnits) {
      const proportionalScore = summary.lineHeightUnits.proportionalRatio * 5;
      score += proportionalScore;
    }

    let details = "";
    if (lineHeightRatio >= thresholds.typography.lineHeightCoverage.excellent) {
      details = "Excellente couverture des line-heights. ";
    } else if (
      lineHeightRatio >= thresholds.typography.lineHeightCoverage.good
    ) {
      details = "Bonne couverture des line-heights. ";
    } else if (
      lineHeightRatio >= thresholds.typography.lineHeightCoverage.average
    ) {
      details = "Couverture moyenne des line-heights. ";
    } else {
      details = "Beaucoup de line-heights manquantes. ";
      improvements.push("Définir des line-heights pour toutes les font-size");
    }

    if (summary.lineHeightUnits) {
      details += `${Math.round(
        summary.lineHeightUnits.proportionalRatio * 100
      )}% de valeurs proportionnelles.`;

      if (
        summary.lineHeightUnits.proportionalRatio <
        thresholds.typography.proportionalLineHeightRatio.min
      ) {
        improvements.push(
          "Privilégier les valeurs proportionnelles (unitless ou %) pour line-height"
        );
      }
    }

    return createScore(score, 15, details);
  });

  // 6. Score Bonnes pratiques (5 points)
  calculator.addCategory("bestPractices", 5, () => {
    const score = summary.excessiveFontFamilyDeclarations ? 0 : 5;
    const details = summary.excessiveFontFamilyDeclarations
      ? "Trop de déclarations font-family."
      : "Nombre de déclarations approprié.";

    return createScore(score, 5, details);
  });

  return calculator.calculate(improvements);
};

/**
 * Extrait les variables CSS d'une racine PostCSS
 * @param {object} root - Racine PostCSS
 * @returns {Map} - Map des variables CSS
 */
const extractCSSVariablesFromRoot = (root) => {
  const cssVariables = new Map();
  root.walkRules((rule) => {
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) {
        cssVariables.set(decl.prop, decl.value.trim());
      }
    });
  });
  return cssVariables;
};

/**
 * Résout une valeur potentiellement variable avec fallback inline
 * @param {string} value - Valeur à résoudre
 * @param {Map} cssVariables - Map des variables CSS
 * @returns {string|null} - Valeur résolue ou null si non résolue
 */
const resolveValueWithFallback = (value, cssVariables) => {
  let resolved = resolveVariable(value, cssVariables);

  // Si non résolu, essayer le fallback inline
  if (typeof resolved === "string" && /var\(/.test(resolved)) {
    const varMatch = value.match(/var\(\s*--([\w-]+)\s*(?:,\s*([^\)]+))?\)/);
    if (varMatch) {
      const [, , fallback] = varMatch;
      if (fallback && !/var\(/.test(fallback)) {
        return fallback.trim();
      }
    }
    return null;
  }

  return resolved && !/var\(/.test(resolved) ? resolved : null;
};

/**
 * Parse une font stack complète et retourne famille principale, fallbacks et info générique
 * @param {string} resolvedValue - Valeur de font-family résolue
 * @returns {object} - { family, fallbacks, hasGenericFallback, genericFallback }
 */
const parseFontStack = (resolvedValue) => {
  const fontStack = resolvedValue
    .split(",")
    .map((f) => f.trim().replace(/["']/g, ""))
    .filter(Boolean);

  const family = normalizeFontFamily(fontStack[0]);
  const fallbacks = fontStack.slice(1);

  const genericFamilies = [
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
  ];

  const hasGenericFallback = fallbacks.some((f) =>
    genericFamilies.includes(f.toLowerCase())
  );

  const genericFallback = fallbacks.find((f) =>
    genericFamilies.includes(f.toLowerCase())
  );

  return { family, fallbacks, hasGenericFallback, genericFallback };
};

/**
 * Initialise les données d'une famille de polices si nécessaire
 * @param {Map} fontFamilies - Map des familles
 * @param {string} family - Nom de la famille
 */
const initializeFontFamily = (fontFamilies, family) => {
  if (!fontFamilies.has(family)) {
    fontFamilies.set(family, {
      selectors: new Set(),
      sizes: new Map(),
      declarationCount: 0,
      isGlobal: false,
      fallbacks: new Set(),
      hasGenericFallback: false,
      genericFallback: null,
    });
  }
};

/**
 * Met à jour les données d'une famille de polices
 * @param {Map} fontFamilies - Map des familles
 * @param {string} family - Nom de la famille
 * @param {object} options - Options de mise à jour
 */
const updateFontFamilyData = (fontFamilies, family, options = {}) => {
  const {
    selectors = [],
    isGlobal = false,
    fallbacks = [],
    hasGenericFallback = false,
    genericFallback = null,
    globalFamilyOrder = [],
  } = options;

  const familyData = fontFamilies.get(family);
  familyData.declarationCount++;

  if (isGlobal) {
    familyData.isGlobal = true;
    if (!globalFamilyOrder.includes(family)) {
      globalFamilyOrder.push(family);
    }
  }

  fallbacks.forEach((f) => familyData.fallbacks.add(f));

  if (hasGenericFallback) {
    familyData.hasGenericFallback = true;
    if (!familyData.genericFallback && genericFallback) {
      familyData.genericFallback = genericFallback;
    }
  }

  selectors.forEach((sel) => familyData.selectors.add(sel.trim()));
};

/**
 * Traite une déclaration font-family
 * @param {object} params - Paramètres de traitement
 */
const processFontFamilyDeclaration = ({
  decl,
  cssVariables,
  fontFamilies,
  isGlobal,
  selectors,
  globalFamilyOrder,
  counters,
}) => {
  counters.totalFontFamilyDeclarations++;
  if (isGlobal) counters.hasGlobalFontFamily = true;

  const resolvedValue = resolveValueWithFallback(decl.value, cssVariables);
  if (!resolvedValue) return null;

  const { family, fallbacks, hasGenericFallback, genericFallback } =
    parseFontStack(resolvedValue);

  initializeFontFamily(fontFamilies, family);
  updateFontFamilyData(fontFamilies, family, {
    selectors,
    isGlobal,
    fallbacks,
    hasGenericFallback,
    genericFallback,
    globalFamilyOrder,
  });

  return family;
};

/**
 * Parse la propriété font shorthand
 * @param {string} value - Valeur de la propriété font
 * @returns {object} - { fontSize, lineHeight, fontFamily }
 */
const parseFontShorthand = (value) => {
  const result = { fontSize: null, lineHeight: null, fontFamily: null };

  // Extraire la taille et line-height
  const fontSizeLineHeightMatch = value.match(
    /(\d+(?:\.\d+)?(?:px|em|rem|%|pt|ch|ex|vw|vh))(?:\s*\/\s*(\d+(?:\.\d+)?(?:px|em|rem|%)?))?\s/i
  );

  if (fontSizeLineHeightMatch) {
    result.fontSize = fontSizeLineHeightMatch[1];
    result.lineHeight = fontSizeLineHeightMatch[2] || null;
  }

  // Extraire la famille
  let fontFamilyStr = value;

  // Retirer les styles CSS connus
  fontFamilyStr = fontFamilyStr.replace(
    /\b(italic|oblique|normal|bold|bolder|lighter|100|200|300|400|500|600|700|800|900|small-caps|all-small-caps|petite-caps|all-petite-caps|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded)\b\s*/gi,
    ""
  );

  // Retirer la taille et line-height
  fontFamilyStr = fontFamilyStr.replace(
    /(\d+(?:\.\d+)?(?:px|em|rem|%|pt|ch|ex|vw|vh))(?:\s*\/\s*\d+(?:\.\d+)?(?:px|em|rem|%)?)?/gi,
    ""
  );

  result.fontFamily = fontFamilyStr.trim();

  return result;
};

/**
 * Construit le résultat final de l'analyse typographique
 * @param {object} params - Paramètres pour construire le résultat
 * @returns {object} - Résultat complet de l'analyse
 */
const buildTypographyResult = ({
  fontFamilies,
  allFontSizes,
  allLineHeights,
  allWebfonts,
  webfontsInHtml,
  webfontsInCss,
  counters,
  globalFamilyOrder,
}) => {
  // Transformation des données pour la sortie
  const fontFamiliesOutput = {};
  let familiesWithoutGenericFallback = 0;
  let familiesWithFallbacks = 0;

  fontFamilies.forEach((data, family) => {
    if (family === "_orphan_sizes") return;

    const sizesArray = [];
    data.sizes.forEach((sizeData, size) => {
      sizesArray.push({
        size,
        selectors: [...sizeData.selectors],
        lineHeights: [...sizeData.lineHeights],
        selectorCount: sizeData.selectors.size,
      });
    });

    if (!data.hasGenericFallback) familiesWithoutGenericFallback++;
    if (data.fallbacks.size > 0) familiesWithFallbacks++;

    fontFamiliesOutput[family] = {
      declarationCount: data.declarationCount,
      isGlobal: data.isGlobal,
      selectors: [...data.selectors],
      selectorCount: data.selectors.size,
      sizes: sizesArray,
      sizeVariations: sizesArray.length,
      fallbacks: [...data.fallbacks],
      hasGenericFallback: data.hasGenericFallback,
      genericFallback: data.genericFallback,
    };
  });

  // Calcul des métriques d'héritage
  const totalFamilies =
    fontFamilies.size - (fontFamilies.has("_orphan_sizes") ? 1 : 0);
  const globalFamilies = [...fontFamilies.values()].filter(
    (f, idx) => f.isGlobal && [...fontFamilies.keys()][idx] !== "_orphan_sizes"
  ).length;

  const inheritanceQuality = counters.hasGlobalFontFamily
    ? counters.totalFontFamilyDeclarations > 0
      ? Number(
          (
            1 -
            (counters.totalFontFamilyDeclarations - globalFamilies) /
              counters.totalFontFamilyDeclarations
          ).toFixed(3)
        )
      : 1
    : 0;

  // Analyses d'unités
  const fontSizeUnits = analyzeFontSizeUnits(fontFamilies);
  const lineHeightUnits = analyzeLineHeightUnits(allLineHeights);

  // Détails des valeurs
  const fontFamilyDetails = {};
  const fontSizeDetails = {};
  const lineHeightDetails = {};

  fontFamilies.forEach((data, family) => {
    if (family === "_orphan_sizes") return;
    fontFamilyDetails[family] = {
      count: data.declarationCount,
      selectors: [...data.selectors],
      isGlobal: data.isGlobal,
    };
  });

  const fontSizeSelectorsMap = new Map();
  fontFamilies.forEach((data) => {
    data.sizes.forEach((sizeData, size) => {
      if (!fontSizeSelectorsMap.has(size)) {
        fontSizeSelectorsMap.set(size, new Set());
      }
      sizeData.selectors.forEach((sel) =>
        fontSizeSelectorsMap.get(size).add(sel)
      );
    });
  });

  fontSizeSelectorsMap.forEach((selectors, size) => {
    fontSizeDetails[size] = {
      count: selectors.size,
      selectors: [...selectors],
    };
  });

  allLineHeights.forEach((count, lh) => {
    lineHeightDetails[lh] = { count };
  });

  // Calcul du score
  const score = calculateTypographyScore(
    {
      fontFamilies,
      totalFontFamilyDeclarations: counters.totalFontFamilyDeclarations,
      totalFontSizeDeclarations: counters.totalFontSizeDeclarations,
      totalLineHeightDeclarations: counters.totalLineHeightDeclarations,
    },
    {
      totalFamilies,
      hasGlobalFontFamily: counters.hasGlobalFontFamily,
      inheritanceQuality,
      fallbackCoverage:
        totalFamilies > 0
          ? Number(
              (
                (totalFamilies - familiesWithoutGenericFallback) /
                totalFamilies
              ).toFixed(3)
            )
          : 0,
      familiesWithoutGenericFallback,
      excessiveFontFamilyDeclarations:
        counters.totalFontFamilyDeclarations > totalFamilies * 2,
      totalFontFamilyDeclarations: counters.totalFontFamilyDeclarations,
      totalFontSizeDeclarations: counters.totalFontSizeDeclarations,
      totalLineHeightDeclarations: counters.totalLineHeightDeclarations,
      lineHeightUnits,
    },
    allWebfonts,
    fontFamilies
  );

  return {
    webfonts: {
      detected: allWebfonts.length > 0,
      count: allWebfonts.length,
      sources: {
        html: webfontsInHtml.length,
        css: webfontsInCss.length,
      },
      details: allWebfonts,
    },
    fontFamilies: fontFamiliesOutput,
    summary: {
      totalFamilies,
      totalFontFamilyDeclarations: counters.totalFontFamilyDeclarations,
      totalFontSizeDeclarations: counters.totalFontSizeDeclarations,
      totalLineHeightDeclarations: counters.totalLineHeightDeclarations,
      hasGlobalFontFamily: counters.hasGlobalFontFamily,
      globalFamilies,
      inheritanceQuality,
      averageDeclarationsPerFamily:
        totalFamilies > 0
          ? Number(
              (counters.totalFontFamilyDeclarations / totalFamilies).toFixed(2)
            )
          : 0,
      familiesWithFallbacks,
      familiesWithoutGenericFallback,
      fallbackCoverage:
        totalFamilies > 0
          ? Number(
              (
                (totalFamilies - familiesWithoutGenericFallback) /
                totalFamilies
              ).toFixed(3)
            )
          : 0,
      fontSizeUnits,
      lineHeightUnits,
      fontFamilyDetails,
      fontSizeDetails,
      lineHeightDetails,
    },
    recommendations: {
      shouldUseGlobalFontFamily: !counters.hasGlobalFontFamily,
      excessiveFontFamilyDeclarations:
        counters.totalFontFamilyDeclarations > totalFamilies * 2,
      missingLineHeights:
        counters.totalFontSizeDeclarations >
        counters.totalLineHeightDeclarations,
      missingGenericFallbacks: familiesWithoutGenericFallback > 0,
    },
    score,
  };
};

/**
 * Analyse la typographie dans le HTML et le CSS compilé
 * @param {string} htmlContent - Le contenu HTML.
 * @param {string} cssRawContent - Le contenu CSS brut (avant compilation).
 * @param {string} compiledCss - Le CSS compilé.
 * @returns {object} - Analyse complète de la typographie.
 */
export const analyzeTypography = (htmlContent, cssRawContent, compiledCss) => {
  console.log(`🔍 Analyse de la typographie...`);

  // 1. Détection des webfonts
  const webfontsInHtml = detectWebfontsInHtml(htmlContent);
  const webfontsInCss = detectWebfontsInCss(cssRawContent);
  const allWebfonts = [...webfontsInHtml, ...webfontsInCss];

  // 2. Parse du CSS compilé
  const root = postcss.parse(compiledCss);
  const cssVariables = extractCSSVariablesFromRoot(root);

  // Structures de données
  const fontFamilies = new Map();
  const allFontSizes = new Set();
  const allLineHeights = new Map();
  const globalFamilyOrder = [];

  // Compteurs
  const counters = {
    totalFontFamilyDeclarations: 0,
    totalFontSizeDeclarations: 0,
    totalLineHeightDeclarations: 0,
    hasGlobalFontFamily: false,
  };

  // Sélecteurs globaux
  const globalSelectors = new Set(["html", "body", ":root", "*"]);

  // 3. Parcours du CSS
  root.walkRules((rule) => {
    // Ignorer @keyframes
    if (rule.parent?.type === "atrule" && rule.parent.name === "keyframes") {
      return;
    }

    const selectors = rule.selectors || [rule.selector];
    const isGlobal = selectors.some(
      (sel) =>
        globalSelectors.has(sel.trim()) ||
        sel.trim() === "body" ||
        sel.trim() === "html"
    );

    let currentFontFamily = null;
    let currentFontSize = null;
    let currentLineHeight = null;

    rule.walkDecls((decl) => {
      // Traitement font-family
      if (decl.prop === "font-family") {
        currentFontFamily = processFontFamilyDeclaration({
          decl,
          cssVariables,
          fontFamilies,
          isGlobal,
          selectors,
          globalFamilyOrder,
          counters,
        });
      }

      // Traitement propriété font shorthand
      else if (decl.prop === "font") {
        const resolvedValue = resolveValueWithFallback(
          decl.value,
          cssVariables
        );
        if (!resolvedValue) return;

        const parsed = parseFontShorthand(resolvedValue);

        // Traiter fontSize et lineHeight
        if (parsed.fontSize) {
          counters.totalFontSizeDeclarations++;
          currentFontSize = parsed.fontSize;
          allFontSizes.add(currentFontSize);

          if (parsed.lineHeight) {
            counters.totalLineHeightDeclarations++;
            currentLineHeight = parsed.lineHeight;
            allLineHeights.set(
              currentLineHeight,
              (allLineHeights.get(currentLineHeight) || 0) + 1
            );
          }
        }

        // Traiter fontFamily
        if (parsed.fontFamily) {
          const { family, fallbacks, hasGenericFallback, genericFallback } =
            parseFontStack(parsed.fontFamily);

          if (family) {
            counters.totalFontFamilyDeclarations++;
            if (isGlobal) counters.hasGlobalFontFamily = true;

            initializeFontFamily(fontFamilies, family);
            updateFontFamilyData(fontFamilies, family, {
              selectors,
              isGlobal,
              fallbacks,
              hasGenericFallback,
              genericFallback,
              globalFamilyOrder,
            });

            currentFontFamily = family;
          }
        }
      }

      // Traitement font-size
      else if (decl.prop === "font-size") {
        currentFontSize = resolveValueWithFallback(
          decl.value.trim(),
          cssVariables
        );

        if (currentFontSize) {
          counters.totalFontSizeDeclarations++;
          allFontSizes.add(currentFontSize);

          // Créer une entrée orpheline si pas de famille associée
          if (!fontFamilies.has("_orphan_sizes")) {
            initializeFontFamily(fontFamilies, "_orphan_sizes");
          }

          const orphanData = fontFamilies.get("_orphan_sizes");
          if (!orphanData.sizes.has(currentFontSize)) {
            orphanData.sizes.set(currentFontSize, {
              selectors: new Set(),
              lineHeights: new Set(),
            });
          }

          const orphanSizeData = orphanData.sizes.get(currentFontSize);
          selectors.forEach((sel) => orphanSizeData.selectors.add(sel.trim()));
        }
      }

      // Traitement line-height
      else if (decl.prop === "line-height") {
        currentLineHeight = resolveValueWithFallback(
          decl.value.trim(),
          cssVariables
        );

        if (currentLineHeight) {
          counters.totalLineHeightDeclarations++;
          allLineHeights.set(
            currentLineHeight,
            (allLineHeights.get(currentLineHeight) || 0) + 1
          );
        }
      }
    });

    // Associer taille et line-height à la famille
    if (currentFontFamily && currentFontSize) {
      const familyData = fontFamilies.get(currentFontFamily);

      if (!familyData.sizes.has(currentFontSize)) {
        familyData.sizes.set(currentFontSize, {
          selectors: new Set(),
          lineHeights: new Set(),
        });
      }

      const sizeData = familyData.sizes.get(currentFontSize);
      selectors.forEach((sel) => sizeData.selectors.add(sel.trim()));
      if (currentLineHeight) {
        sizeData.lineHeights.add(currentLineHeight);
      }
    }
  });

  // 4. Transformation des données pour la sortie
  const result = buildTypographyResult({
    fontFamilies,
    allFontSizes,
    allLineHeights,
    allWebfonts,
    webfontsInHtml,
    webfontsInCss,
    counters,
    globalFamilyOrder,
  });

  console.log(`✅ Analyse typographie terminée.`);
  return result;
};
