import { categorizeVariable } from "../shared/cssHelpers.js";

/**
 * Calcule un score de qualité pour l'usage des variables CSS.
 * Le score est sur 100 avec un découpage par critères, similaire à la typographie.
 * @param {object} data - Données de l'analyse des variables.
 * @returns {{total:number, breakdown:object, grade:string, improvements:string[]}}
 */
const calculateVariablesScore = (data) => {
  const {
    totalDeclared,
    totalUsed,
    totalUnused,
    totalUndeclared,
    ratio, // { variableUsages, rawProperties, variableRatio }
    categorization, // counts per category
  } = data;

  const scores = {
    adoption: { score: 0, max: 40, details: "" },
    coverage: { score: 0, max: 25, details: "" },
    hygiene: { score: 0, max: 20, details: "" },
    categories: { score: 0, max: 10, details: "" },
    bestPractices: { score: 0, max: 5, details: "" },
  };

  // 1) Adoption (utilisation effective de var() vs propriétés brutes)
  // Échelle ajustée avec objectif à 40%
  const variableRatio = Math.max(
    0,
    Math.min(1, Number(ratio?.variableRatio || 0))
  );

  let adoptionScore = 0;
  if (variableRatio === 0) {
    adoptionScore = 0;
  } else if (variableRatio >= 0.35) {
    // ≥35% : score maximum de 40 points
    adoptionScore = 40;
  } else {
    // 0-35% : progression linéaire de 0 à 40 points
    adoptionScore = (variableRatio / 0.35) * 40;
  }

  scores.adoption.score = Math.round(adoptionScore);
  scores.adoption.details = `${Math.round(
    variableRatio * 100
  )}% des propriétés utilisent des variables.`;

  // 2) Coverage (part des variables déclarées réellement utilisées)
  const usedCoverage = totalDeclared > 0 ? totalUsed / totalDeclared : 0;

  let coverageScore = 0;
  if (usedCoverage >= 0.8) {
    coverageScore = 25;
  } else if (usedCoverage >= 0.6) {
    // 60-80% : interpolation linéaire 19-25
    coverageScore = 19 + ((usedCoverage - 0.6) / 0.2) * 6;
  } else if (usedCoverage >= 0.4) {
    // 40-60% : interpolation linéaire 13-19
    coverageScore = 13 + ((usedCoverage - 0.4) / 0.2) * 6;
  } else if (usedCoverage >= 0.2) {
    // 20-40% : interpolation linéaire 6-13
    coverageScore = 6 + ((usedCoverage - 0.2) / 0.2) * 7;
  } else if (usedCoverage > 0) {
    // 0-20% : interpolation linéaire 0-6
    coverageScore = (usedCoverage / 0.2) * 6;
  }

  scores.coverage.score = Math.round(coverageScore);
  if (totalDeclared === 0) {
    scores.coverage.details = "Aucune variable déclarée.";
  } else {
    scores.coverage.details = `${totalUsed}/${totalDeclared} variables utilisées (${Math.round(
      usedCoverage * 100
    )}%).`;
  }

  // 3) Hygiène (pénalisations pour usages non déclarés et variables inutilisées)
  // - Pénalité pour usages non déclarés: 4 pts chacun, plafonné à 12
  // - Pénalité pour variables inutilisées: proportion * 8 pts
  const penaltyUndeclared = Math.min(12, (totalUndeclared || 0) * 4);
  const unusedRatio = totalDeclared > 0 ? totalUnused / totalDeclared : 0;
  const penaltyUnused = Math.round(Math.max(0, Math.min(1, unusedRatio)) * 8);
  const hygieneBase = scores.hygiene.max - (penaltyUndeclared + penaltyUnused);
  scores.hygiene.score = Math.max(0, hygieneBase);
  const hygieneParts = [];
  if (totalUndeclared > 0)
    hygieneParts.push(`${totalUndeclared} usage(s) non déclaré(s)`);
  if (totalUnused > 0)
    hygieneParts.push(`${totalUnused} variable(s) inutilisée(s)`);
  scores.hygiene.details =
    hygieneParts.length > 0
      ? `Problèmes: ${hygieneParts.join(", ")}.`
      : "Aucun problème d'hygiène détecté.";

  // 4) Couverture par catégories (encourage une base design tokens équilibrée)
  const categoryKeys = ["color", "typography", "spacing", "radius"];
  const covered = categoryKeys.filter(
    (k) => (categorization?.[k] || 0) > 0
  ).length;
  const categoryCoverage = covered / categoryKeys.length; // 0..1
  scores.categories.score = Math.round(
    categoryCoverage * scores.categories.max
  );
  scores.categories.details = `${covered}/${categoryKeys.length} catégories clés couvertes.`;

  // 5) Bonnes pratiques (petit bonus si l'essentiel est respecté)
  // Ajusté pour objectif à 35% d'adoption
  if (variableRatio >= 0.35) scores.bestPractices.score += 3;
  else if (variableRatio >= 0.25) scores.bestPractices.score += 2;
  else if (variableRatio >= 0.15) scores.bestPractices.score += 1;
  if (totalUndeclared === 0) scores.bestPractices.score += 2;
  scores.bestPractices.details =
    `${variableRatio >= 0.25 ? "Bonne" : "Faible"} adoption, ` +
    (totalUndeclared === 0
      ? "aucun usage non déclaré."
      : "usages non déclarés présents.");

  // Total et grade
  const total = Object.values(scores).reduce((sum, s) => sum + s.score, 0);
  let grade;
  if (total >= 90) grade = "A";
  else if (total >= 80) grade = "B";
  else if (total >= 70) grade = "C";
  else if (total >= 60) grade = "D";
  else grade = "F";

  // Recommandations
  const improvements = [];
  if (variableRatio < 0.25)
    improvements.push("Augmenter l'usage des variables sur les propriétés CSS");
  if (usedCoverage < 0.75 && totalDeclared > 0)
    improvements.push(
      "Supprimer les variables inutilisées ou les mettre en usage"
    );
  if (totalUndeclared > 0)
    improvements.push(
      "Déclarer toutes les variables utilisées (éviter var(--x) non déclarées)"
    );
  if (categoryCoverage < 0.5)
    improvements.push(
      "Élargir la couverture des variables (couleurs, typos, espacements, etc.)"
    );

  return { total, breakdown: scores, grade, improvements };
};

/**
 * Analyse les variables CSS (custom properties).
 * @param {string} css - Le contenu CSS.
 * @returns {object} - Statistiques sur les variables CSS.
 */
export const analyzeCustomProperties = (css) => {
  console.log(`🔍 Analyse des variables CSS...`);

  // Déclarations de variables (généralement dans :root ou autres sélecteurs)
  const declarationRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  const declarations = new Map();
  let match;

  while ((match = declarationRegex.exec(css)) !== null) {
    const varName = match[1];
    const varValue = match[2].trim();

    if (!declarations.has(varName)) {
      declarations.set(varName, {
        name: `--${varName}`,
        value: varValue,
        usageCount: 0,
        category: categorizeVariable(varName, varValue),
      });
    }
  }

  // Utilisations de variables
  const usageRegex = /var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/g;
  const usages = new Map();
  const undeclaredUsages = [];

  while ((match = usageRegex.exec(css)) !== null) {
    const varName = match[1];
    const fallback = match[2] ? match[2].trim() : null;

    if (declarations.has(varName)) {
      declarations.get(varName).usageCount++;
    } else {
      if (!usages.has(varName)) {
        undeclaredUsages.push({
          name: `--${varName}`,
          fallback,
        });
        usages.set(varName, true);
      }
    }

    if (!usages.has(varName)) {
      usages.set(varName, true);
    }
  }

  // Variables déclarées mais non utilisées
  const unusedVariables = Array.from(declarations.values()).filter(
    (v) => v.usageCount === 0
  );

  // Compter toutes les propriétés CSS (brutes)
  const allPropertiesRegex = /[\w-]+\s*:\s*[^;{]+;/g;
  const allProperties = css.match(allPropertiesRegex) || [];
  const rawPropertiesCount = allProperties.filter(
    (prop) => !prop.includes("var(")
  ).length;
  const variableUsagesCount = allProperties.filter((prop) =>
    prop.includes("var(")
  ).length;

  // Catégorisation
  const categorized = {
    color: [],
    typography: [],
    spacing: [],
    radius: [],
    other: [],
  };

  declarations.forEach((variable) => {
    // Si la catégorie n'existe pas dans categorized, on la met dans "other"
    const category =
      variable.category in categorized ? variable.category : "other";
    categorized[category].push(variable);
  });

  const ratio =
    declarations.size > 0
      ? variableUsagesCount / (variableUsagesCount + rawPropertiesCount)
      : 0;

  const result = {
    totalDeclared: declarations.size,
    totalUsed: declarations.size - unusedVariables.length,
    totalUnused: unusedVariables.length,
    totalUndeclared: undeclaredUsages.length,
    declarations: Array.from(declarations.values()),
    unusedVariables,
    undeclaredUsages,
    categorization: {
      color: categorized.color.length,
      typography: categorized.typography.length,
      spacing: categorized.spacing.length,
      radius: categorized.radius.length,
      other: categorized.other.length,
    },
    detailedCategorization: categorized,
    ratio: {
      variableUsages: variableUsagesCount,
      rawProperties: rawPropertiesCount,
      variableRatio: ratio,
    },
  };

  const score = calculateVariablesScore(result);
  return { ...result, score };
};
