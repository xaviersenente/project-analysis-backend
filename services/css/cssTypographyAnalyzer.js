import postcss from "postcss";
import { resolveVariable } from "../shared/cssHelpers.js";

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
  const scores = {
    webfonts: { score: 0, max: 15, details: "" },
    fallbacks: { score: 0, max: 20, details: "" },
    inheritance: { score: 0, max: 25, details: "" },
    sizes: { score: 0, max: 20, details: "" },
    lineHeights: { score: 0, max: 15, details: "" },
    bestPractices: { score: 0, max: 5, details: "" },
  };

  // 1. Score Webfonts (15 points)
  if (webfonts.length > 0) {
    scores.webfonts.score += 5;
    scores.webfonts.details = `${webfonts.length} webfont(s) détectée(s). `;

    // Source appropriée (HTML ou CSS)
    if (
      webfonts.some(
        (w) => w.source === "html-link" || w.source === "css-import"
      )
    ) {
      scores.webfonts.score += 5;
      scores.webfonts.details += "Import correct. ";
    }

    // Pas de doublons excessifs
    const uniqueProviders = new Set(webfonts.map((w) => w.provider)).size;
    if (webfonts.length <= uniqueProviders * 2) {
      scores.webfonts.score += 5;
      scores.webfonts.details += "Pas de doublons.";
    } else {
      scores.webfonts.details += "Imports en doublon détectés.";
    }
  } else {
    scores.webfonts.details = "Aucune webfont détectée.";
  }

  // 2. Score Fallbacks (20 points)
  const fallbackCoverage = summary.fallbackCoverage || 0;
  scores.fallbacks.score = Math.round(fallbackCoverage * 20);

  if (summary.familiesWithoutGenericFallback === 0) {
    scores.fallbacks.details =
      "Toutes les polices ont des fallbacks génériques.";
  } else {
    scores.fallbacks.details = `${summary.familiesWithoutGenericFallback} police(s) sans fallback générique.`;
  }

  // 3. Score Héritage (25 points)
  if (summary.hasGlobalFontFamily) {
    scores.inheritance.score += 10;
    scores.inheritance.details = "Police globale définie. ";
  } else {
    scores.inheritance.details = "Pas de police globale. ";
  }

  const inheritanceQuality = summary.inheritanceQuality || 0;
  scores.inheritance.score += Math.round(inheritanceQuality * 15);
  scores.inheritance.details += `Qualité d'héritage: ${Math.round(
    inheritanceQuality * 100
  )}%.`;

  // 4. Score Cohérence des tailles (20 points)
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
  avgSizeVariations = totalFamilies > 0 ? avgSizeVariations / totalFamilies : 0;

  // Score selon le nombre de variations
  if (avgSizeVariations >= 2 && avgSizeVariations <= 4) {
    scores.sizes.score += 10;
    scores.sizes.details = "Nombre de tailles optimal. ";
  } else if (avgSizeVariations >= 5 && avgSizeVariations <= 7) {
    scores.sizes.score += 7;
    scores.sizes.details = "Nombre de tailles correct. ";
  } else if (avgSizeVariations >= 8 && avgSizeVariations <= 10) {
    scores.sizes.score += 4;
    scores.sizes.details = "Trop de variations de tailles. ";
  } else if (avgSizeVariations > 10) {
    scores.sizes.details = "Beaucoup trop de variations de tailles. ";
  } else {
    scores.sizes.details = "Peu de variations de tailles. ";
  }

  // Score pour unités relatives
  const relativeScore = Math.round(unitsAnalysis.relativeRatio * 10);
  scores.sizes.score += relativeScore;
  scores.sizes.details += `${Math.round(
    unitsAnalysis.relativeRatio * 100
  )}% d'unités relatives.`;

  // 5. Score Line-heights (15 points)
  const lineHeightRatio =
    summary.totalFontSizeDeclarations > 0
      ? summary.totalLineHeightDeclarations / summary.totalFontSizeDeclarations
      : 0;

  // Score de couverture (10 points)
  scores.lineHeights.score = Math.round(lineHeightRatio * 10);

  // Score pour unités proportionnelles (5 points)
  if (summary.lineHeightUnits) {
    const proportionalScore = Math.round(
      summary.lineHeightUnits.proportionalRatio * 5
    );
    scores.lineHeights.score += proportionalScore;
  }

  if (lineHeightRatio >= 0.9) {
    scores.lineHeights.details = "Excellente couverture des line-heights. ";
  } else if (lineHeightRatio >= 0.7) {
    scores.lineHeights.details = "Bonne couverture des line-heights. ";
  } else if (lineHeightRatio >= 0.5) {
    scores.lineHeights.details = "Couverture moyenne des line-heights. ";
  } else {
    scores.lineHeights.details = "Beaucoup de line-heights manquantes. ";
  }

  if (summary.lineHeightUnits) {
    scores.lineHeights.details += `${Math.round(
      summary.lineHeightUnits.proportionalRatio * 100
    )}% de valeurs proportionnelles.`;
  }

  // 6. Score Bonnes pratiques (5 points)
  if (!summary.excessiveFontFamilyDeclarations) {
    scores.bestPractices.score = 5;
    scores.bestPractices.details = "Nombre de déclarations approprié.";
  } else {
    scores.bestPractices.details = "Trop de déclarations font-family.";
  }

  // Calcul du score total
  const total = Object.values(scores).reduce((sum, s) => sum + s.score, 0);

  // Attribution d'une note alphabétique
  let grade;
  if (total >= 90) grade = "A";
  else if (total >= 80) grade = "B";
  else if (total >= 70) grade = "C";
  else if (total >= 60) grade = "D";
  else grade = "F";

  // Génération des recommandations
  const improvements = [];
  if (scores.webfonts.score < scores.webfonts.max) {
    improvements.push("Utiliser des webfonts pour améliorer la typographie");
  }
  if (scores.fallbacks.score < scores.fallbacks.max * 0.8) {
    improvements.push(
      "Ajouter des polices de secours avec familles génériques"
    );
  }
  if (scores.inheritance.score < scores.inheritance.max * 0.8) {
    improvements.push(
      "Définir une police globale et réduire les redéclarations"
    );
  }
  if (unitsAnalysis.relativeRatio < 0.5) {
    improvements.push("Privilégier rem/em au lieu de px pour les font-size");
  }
  if (lineHeightRatio < 0.7) {
    improvements.push("Définir des line-heights pour toutes les font-size");
  }
  if (
    summary.lineHeightUnits &&
    summary.lineHeightUnits.proportionalRatio < 0.7
  ) {
    improvements.push(
      "Privilégier les valeurs proportionnelles (unitless ou %) pour line-height"
    );
  }
  if (avgSizeVariations > 7) {
    improvements.push("Réduire le nombre de variations de tailles de police");
  }

  return {
    total,
    breakdown: scores,
    grade,
    improvements,
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

  // 2. Analyse du CSS compilé avec PostCSS
  const root = postcss.parse(compiledCss);

  // Extraire d'abord toutes les variables CSS pour les résoudre
  const cssVariables = new Map();
  root.walkRules((rule) => {
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) {
        cssVariables.set(decl.prop, decl.value.trim());
      }
    });
  });

  // Structures pour collecter les données
  const fontFamilies = new Map(); // famille -> { selectors, sizes, lineHeights }
  let totalFontFamilyDeclarations = 0;
  let totalFontSizeDeclarations = 0;
  let totalLineHeightDeclarations = 0;

  // Structures pour collecter les valeurs brutes
  const allFontSizes = new Set();
  const allLineHeights = new Map(); // Map<value, count>
  const globalFamilyOrder = [];

  // Sélecteurs globaux avec font-family (pour détecter l'héritage)
  const globalSelectors = new Set(["html", "body", ":root", "*"]);
  let hasGlobalFontFamily = false;

  root.walkRules((rule) => {
    // Ignorer @keyframes
    if (
      rule.parent &&
      rule.parent.type === "atrule" &&
      rule.parent.name === "keyframes"
    ) {
      return;
    }

    const selectors = rule.selectors || [rule.selector];

    // Vérifier si c'est un sélecteur global
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
      if (decl.prop === "font-family") {
        totalFontFamilyDeclarations++;
        if (isGlobal) hasGlobalFontFamily = true;

        // Résoudre les variables et récupérer toute la stack de polices
        let resolvedValue = resolveVariable(decl.value, cssVariables);
        // Si la résolution laisse encore un var(), tenter d'extraire un fallback inline
        if (typeof resolvedValue === "string" && /var\(/.test(resolvedValue)) {
          const varMatch = decl.value.match(
            /var\(\s*--([\w-]+)\s*(?:,\s*([^\)]+))?\)/
          );
          if (varMatch) {
            const [, , fallback] = varMatch;
            // En cas de fallback inline utilisable, l'appliquer
            if (fallback && !/var\(/.test(fallback)) {
              resolvedValue = fallback.trim();
            } else {
              // Pas de fallback: ignorer complètement cette déclaration
              return;
            }
          } else {
            // Pattern var() non identifiable: ignorer la déclaration
            return;
          }
        }
        // Si après tentative, la valeur reste invalide ou vide, ignorer
        if (!resolvedValue || /var\(/.test(resolvedValue)) {
          return;
        }

        // Parser la font stack complète
        const fontStack = resolvedValue
          .split(",")
          .map((f) => f.trim().replace(/["']/g, ""))
          .filter(Boolean);

        // La première police est la police principale (normalisée)
        const family = normalizeFontFamily(fontStack[0]);

        // Les polices de secours (fallbacks)
        const fallbacks = fontStack.slice(1);

        // Détecter les familles génériques (sans-serif, serif, etc.)
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

        currentFontFamily = family;

        if (!fontFamilies.has(family)) {
          fontFamilies.set(family, {
            selectors: new Set(),
            sizes: new Map(), // size -> { selectors, lineHeights }
            declarationCount: 0,
            isGlobal: false,
            fallbacks: new Set(),
            hasGenericFallback: false,
            genericFallback: null,
          });
        }

        const familyData = fontFamilies.get(family);
        familyData.declarationCount++;
        if (isGlobal) familyData.isGlobal = true;

        // Mémoriser l'ordre d'apparition des familles globales
        if (isGlobal && !globalFamilyOrder.includes(family)) {
          globalFamilyOrder.push(family);
        }

        // Enregistrer les fallbacks
        fallbacks.forEach((f) => familyData.fallbacks.add(f));
        if (hasGenericFallback) {
          familyData.hasGenericFallback = true;
          if (!familyData.genericFallback) {
            familyData.genericFallback = genericFallback;
          }
        }

        selectors.forEach((sel) => familyData.selectors.add(sel.trim()));
      }

      // Traiter aussi la propriété générique "font" qui peut inclure family, size et line-height
      if (decl.prop === "font") {
        let resolvedValue = resolveVariable(decl.value, cssVariables);
        // Gérer les var() non résolues
        if (typeof resolvedValue === "string" && /var\(/.test(resolvedValue)) {
          const varMatch = decl.value.match(
            /var\(\s*--([\w-]+)\s*(?:,\s*([^\)]+))?\)/
          );
          if (varMatch) {
            const [, , fallback] = varMatch;
            if (fallback && !/var\(/.test(fallback)) {
              resolvedValue = fallback.trim();
            } else {
              return;
            }
          } else {
            return;
          }
        }
        if (!resolvedValue || /var\(/.test(resolvedValue)) {
          return;
        }

        // Parser la propriété 'font' shorthand
        // Format: [ [ font-style ] [ font-variant ] [ font-weight ] [ font-stretch ] ] [ font-size [ / line-height ] ] font-family

        // Extraire la taille et line-height (format: 14px/1.5 ou 14px / 1.5)
        const fontSizeLineHeightMatch = resolvedValue.match(
          /(\d+(?:\.\d+)?(?:px|em|rem|%|pt|ch|ex|vw|vh))(?:\s*\/\s*(\d+(?:\.\d+)?(?:px|em|rem|%)?))?\s/i
        );

        if (fontSizeLineHeightMatch) {
          totalFontSizeDeclarations++;
          const fontSize = fontSizeLineHeightMatch[1];
          currentFontSize = fontSize;
          allFontSizes.add(currentFontSize);

          // Extraire le line-height s'il est présent
          if (fontSizeLineHeightMatch[2]) {
            totalLineHeightDeclarations++;
            const lineHeight = fontSizeLineHeightMatch[2];
            currentLineHeight = lineHeight;
            allLineHeights.set(
              lineHeight,
              (allLineHeights.get(lineHeight) || 0) + 1
            );
          }
        }

        // Extraire la famille: elle se trouve généralement en dernier dans la propriété font
        // Après avoir retiré les tokens de style/weight/variant/size
        let fontFamilyStr = resolvedValue;

        // Retirer les styles CSS connus (font-style, font-weight, font-variant, font-stretch)
        fontFamilyStr = fontFamilyStr.replace(
          /\b(italic|oblique|normal|bold|bolder|lighter|100|200|300|400|500|600|700|800|900|small-caps|all-small-caps|petite-caps|all-petite-caps|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded)\b\s*/gi,
          ""
        );

        // Retirer la taille et line-height si présents
        fontFamilyStr = fontFamilyStr.replace(
          /(\d+(?:\.\d+)?(?:px|em|rem|%|pt|ch|ex|vw|vh))(?:\s*\/\s*\d+(?:\.\d+)?(?:px|em|rem|%)?)?/gi,
          ""
        );

        fontFamilyStr = fontFamilyStr.trim();

        if (fontFamilyStr) {
          // Parser le stack de familles
          const fontStack = fontFamilyStr
            .split(",")
            .map((f) => f.trim().replace(/["']/g, ""))
            .filter(Boolean);

          if (fontStack.length > 0) {
            totalFontFamilyDeclarations++;
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

            currentFontFamily = family;
            if (isGlobal) hasGlobalFontFamily = true;

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

            const familyData = fontFamilies.get(family);
            familyData.declarationCount++;
            if (isGlobal) familyData.isGlobal = true;

            if (isGlobal && !globalFamilyOrder.includes(family)) {
              globalFamilyOrder.push(family);
            }

            fallbacks.forEach((f) => familyData.fallbacks.add(f));
            if (hasGenericFallback) {
              familyData.hasGenericFallback = true;
              if (!familyData.genericFallback) {
                familyData.genericFallback = genericFallback;
              }
            }

            selectors.forEach((sel) => familyData.selectors.add(sel.trim()));
          }
        }
      }

      if (decl.prop === "font-size") {
        currentFontSize = resolveVariable(decl.value.trim(), cssVariables);
        // Si non résolu, essayer le fallback inline, sinon ignorer
        if (
          typeof currentFontSize === "string" &&
          /var\(/.test(currentFontSize)
        ) {
          const varMatch = decl.value.match(
            /var\(\s*--([\w-]+)\s*(?:,\s*([^\)]+))?\)/
          );
          if (varMatch) {
            const [, , fallback] = varMatch;
            if (fallback && !/var\(/.test(fallback)) {
              currentFontSize = fallback.trim();
            } else {
              currentFontSize = null;
            }
          } else {
            currentFontSize = null;
          }
        }
        // Enregistrer la taille dans les structures globales seulement si résolue
        if (currentFontSize) {
          totalFontSizeDeclarations++;
          allFontSizes.add(currentFontSize);

          // Enregistrer aussi les sélecteurs pour fontSizeDetails
          if (!fontFamilies.has("_orphan_sizes")) {
            fontFamilies.set("_orphan_sizes", {
              selectors: new Set(),
              sizes: new Map(),
              declarationCount: 0,
              isGlobal: false,
              fallbacks: new Set(),
              hasGenericFallback: false,
              genericFallback: null,
            });
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

      if (decl.prop === "line-height") {
        currentLineHeight = resolveVariable(decl.value.trim(), cssVariables);
        // Si non résolu, essayer le fallback inline, sinon ignorer
        if (
          typeof currentLineHeight === "string" &&
          /var\(/.test(currentLineHeight)
        ) {
          const varMatch = decl.value.match(
            /var\(\s*--([\w-]+)\s*(?:,\s*([^\)]+))?\)/
          );
          if (varMatch) {
            const [, , fallback] = varMatch;
            if (fallback && !/var\(/.test(fallback)) {
              currentLineHeight = fallback.trim();
            } else {
              currentLineHeight = null;
            }
          } else {
            currentLineHeight = null;
          }
        }

        // Enregistrer la valeur seulement si résolue
        if (currentLineHeight) {
          totalLineHeightDeclarations++;
          allLineHeights.set(
            currentLineHeight,
            (allLineHeights.get(currentLineHeight) || 0) + 1
          );
        }
      }
    });

    // Associer taille et line-height à la famille si définie dans cette règle
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

  // 3. Transformation des données pour la sortie
  const fontFamiliesOutput = {};
  let familiesWithoutGenericFallback = 0;
  let familiesWithFallbacks = 0;

  fontFamilies.forEach((data, family) => {
    // Ignorer la famille orpheline interne
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

  // 4. Calcul des métriques d'héritage
  const totalFamilies =
    fontFamilies.size - (fontFamilies.has("_orphan_sizes") ? 1 : 0);
  const globalFamilies = [...fontFamilies.values()].filter(
    (f, idx) => f.isGlobal && [...fontFamilies.keys()][idx] !== "_orphan_sizes"
  ).length;
  const inheritanceQuality = hasGlobalFontFamily
    ? totalFontFamilyDeclarations > 0
      ? Number(
          (
            1 -
            (totalFontFamilyDeclarations - globalFamilies) /
              totalFontFamilyDeclarations
          ).toFixed(3)
        )
      : 1
    : 0;

  console.log(`✅ Analyse typographie terminée.`);

  // 5. Calcul des analyses d'unités
  const fontSizeUnits = analyzeFontSizeUnits(fontFamilies);
  const lineHeightUnits = analyzeLineHeightUnits(allLineHeights);

  // 6. Détail des valeurs et comptages (corrigé pour éviter les doublons)
  const fontFamilyDetails = {};
  const fontSizeDetails = {};
  const lineHeightDetails = {};

  // font-family
  fontFamilies.forEach((data, family) => {
    // Ignorer la famille orpheline interne
    if (family === "_orphan_sizes") return;

    fontFamilyDetails[family] = {
      count: data.declarationCount,
      selectors: [...data.selectors],
      isGlobal: data.isGlobal,
    };
  });

  // font-size (comptage basé sur les sélecteurs uniques)
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

  // line-height (directement depuis allLineHeights)
  allLineHeights.forEach((count, lh) => {
    lineHeightDetails[lh] = { count };
  });

  // 7. Calcul du score typographique
  const score = calculateTypographyScore(
    {
      fontFamilies,
      totalFontFamilyDeclarations,
      totalFontSizeDeclarations,
      totalLineHeightDeclarations,
    },
    {
      totalFamilies,
      hasGlobalFontFamily,
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
        totalFontFamilyDeclarations > totalFamilies * 2,
      totalFontFamilyDeclarations,
      totalFontSizeDeclarations,
      totalLineHeightDeclarations,
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
      totalFontFamilyDeclarations,
      totalFontSizeDeclarations,
      totalLineHeightDeclarations,
      hasGlobalFontFamily,
      globalFamilies,
      inheritanceQuality,
      averageDeclarationsPerFamily:
        totalFamilies > 0
          ? Number((totalFontFamilyDeclarations / totalFamilies).toFixed(2))
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
      shouldUseGlobalFontFamily: !hasGlobalFontFamily,
      excessiveFontFamilyDeclarations:
        totalFontFamilyDeclarations > totalFamilies * 2,
      missingLineHeights:
        totalFontSizeDeclarations > totalLineHeightDeclarations,
      missingGenericFallbacks: familiesWithoutGenericFallback > 0,
    },
    score,
  };
};
