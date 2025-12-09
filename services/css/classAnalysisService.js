import * as cheerio from "cheerio";
import postcss from "postcss";

// BEM regex patterns – à mettre en haut du fichier
const blockPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const elementPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)__([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const blockModPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const elementModPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)__([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/;

// Helper : est-ce une classe BEM ?
const isBemClass = (cls) =>
  blockPattern.test(cls) ||
  elementPattern.test(cls) ||
  blockModPattern.test(cls) ||
  elementModPattern.test(cls);

/**
 * Calcule un score BEM/classes aligné sur le frontend.
 * Retourne un total sur 100, breakdown, grade et recommandations.
 * @param {object} classAnalysis - Objet retourné par performClassAnalysis
 */
const calculateBemClassesScore = (classAnalysis) => {
  if (!classAnalysis) {
    return {
      total: 0,
      breakdown: {},
      grade: "F",
      improvements: ["Aucune donnée d'analyse"],
    };
  }

  const scores = {
    coverage: { score: 0, max: 15, details: "" },
    selectorForms: { score: 0, max: 30, details: "" },
    structure: { score: 0, max: 25, details: "" },
    elementsRatio: { score: 0, max: 20, details: "" },
    modifiers: { score: 0, max: 10, details: "" },
  };

  // 1) Couverture HTML/CSS (15)
  const coverageHtml = classAnalysis.mismatch?.coverageHtml || 0;
  const coverageCss = classAnalysis.mismatch?.coverageCss || 0;
  const averageCoverage = (coverageHtml + coverageCss) / 2;
  if (averageCoverage >= 0.95) scores.coverage.score = 15;
  else if (averageCoverage >= 0.85) scores.coverage.score = 12;
  else if (averageCoverage >= 0.7) scores.coverage.score = 8;
  else scores.coverage.score = 4;
  scores.coverage.details = `Couverture moyenne: ${Math.round(
    averageCoverage * 100
  )}%`;

  // 2) Pourcentage de sélecteurs Pure BEM (30)
  const totalSelectors = classAnalysis.css?.totalSelectors || 0;
  const pureBemSelectors =
    classAnalysis.css?.selectorForms?.pureBemSelectors || 0;
  if (totalSelectors > 0) {
    const bemPercentage = (pureBemSelectors / totalSelectors) * 100;
    if (bemPercentage >= 80) scores.selectorForms.score = 30;
    else if (bemPercentage >= 60) scores.selectorForms.score = 24;
    else if (bemPercentage >= 40) scores.selectorForms.score = 18;
    else if (bemPercentage >= 25) scores.selectorForms.score = 12;
    else scores.selectorForms.score = 6;
    scores.selectorForms.details = `Pure BEM: ${Math.round(bemPercentage)}%`;
  } else {
    scores.selectorForms.details = "Aucun sélecteur CSS.";
  }

  // 3) Pourcentage de blocs structurés (25)
  const totalBlocks = classAnalysis.bem?.blockStructure?.totalBlocks || 0;
  const structuredBlocks =
    classAnalysis.bem?.blockStructure?.structuredBlocks || 0;
  if (totalBlocks > 0) {
    const structuredPercentage = (structuredBlocks / totalBlocks) * 100;
    if (structuredPercentage >= 80) scores.structure.score = 25;
    else if (structuredPercentage >= 60) scores.structure.score = 20;
    else if (structuredPercentage >= 40) scores.structure.score = 14;
    else if (structuredPercentage >= 25) scores.structure.score = 8;
    else scores.structure.score = 3;
    scores.structure.details = `Blocs structurés: ${Math.round(
      structuredPercentage
    )}%`;
  } else {
    scores.structure.details = "Aucun bloc BEM identifié.";
  }

  // 4) Ratio éléments/blocs (20)
  const elements = classAnalysis.bem?.counts?.elements || 0;
  if (totalBlocks > 0) {
    const elementsPerBlock = elements / totalBlocks;
    if (elementsPerBlock >= 2 && elementsPerBlock <= 6)
      scores.elementsRatio.score = 20;
    else if (elementsPerBlock >= 1 && elementsPerBlock < 2)
      scores.elementsRatio.score = 15;
    else if (elementsPerBlock > 6 && elementsPerBlock <= 10)
      scores.elementsRatio.score = 12;
    else if (elementsPerBlock > 0) scores.elementsRatio.score = 8;
    else scores.elementsRatio.score = 0;
    scores.elementsRatio.details = `Éléments/bloc: ${Number(
      elementsPerBlock.toFixed(2)
    )}`;
  } else {
    scores.elementsRatio.details = "Pas de blocs pour calculer le ratio.";
  }

  // 5) Usage des modificateurs (10)
  const modifiers = classAnalysis.bem?.counts?.modifiers || 0;
  const elementModifiers = classAnalysis.bem?.counts?.elementModifiers || 0;
  const totalModifiersCount = modifiers + elementModifiers;
  if (totalBlocks > 0) {
    const modifiersPerBlock = totalModifiersCount / totalBlocks;
    if (modifiersPerBlock >= 1.5) scores.modifiers.score = 10;
    else if (modifiersPerBlock >= 1) scores.modifiers.score = 8;
    else if (modifiersPerBlock >= 0.5) scores.modifiers.score = 5;
    else scores.modifiers.score = 2;
    scores.modifiers.details = `Modificateurs/bloc: ${Number(
      modifiersPerBlock.toFixed(2)
    )}`;
  } else {
    scores.modifiers.details = "Pas de blocs pour évaluer les modificateurs.";
  }

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
  if (averageCoverage < 0.85)
    improvements.push(
      "Améliorer la couverture entre HTML et CSS (réduire classes orphelines)"
    );
  if (totalSelectors > 0) {
    const bemPct = (pureBemSelectors / totalSelectors) * 100;
    if (bemPct < 60)
      improvements.push(
        "Augmenter la part de sélecteurs BEM purs et éviter les combinateurs/ID"
      );
  }
  if (totalBlocks > 0) {
    const structuredPct = (structuredBlocks / totalBlocks) * 100;
    if (structuredPct < 60)
      improvements.push(
        "Structurer les blocs avec éléments et modificateurs (éviter blocs orphelins)"
      );
    const elementsPerBlock = elements / totalBlocks;
    if (!(elementsPerBlock >= 2 && elementsPerBlock <= 6))
      improvements.push("Ajuster le ratio éléments par bloc (viser 2 à 6)");
    const modifiersPerBlock = totalModifiersCount / totalBlocks;
    if (modifiersPerBlock < 1)
      improvements.push(
        "Utiliser davantage de modificateurs pour exprimer les variantes"
      );
  }

  return { total, breakdown: scores, grade, improvements };
};

/**
 * Extrait toutes les classes HTML sur l'ensemble des pages.
 * Retourne statistiques de fréquence et distribution par nœud.
 * @param {string[]} htmlContents
 */
export const extractHtmlClasses = (htmlContents) => {
  const classFrequency = new Map();
  let totalAssignments = 0;
  let nodesWithClasses = 0;
  const classesPerNode = [];

  for (const html of htmlContents) {
    const $ = cheerio.load(html);
    $("*").each((_, el) => {
      const classAttr = $(el).attr("class");
      if (!classAttr) return;
      const rawClasses = classAttr
        .split(/\s+/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (!rawClasses.length) return;
      nodesWithClasses++;
      classesPerNode.push(rawClasses.length);
      for (const cls of rawClasses) {
        totalAssignments++;
        classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
      }
    });
  }

  const uniqueClasses = [...classFrequency.keys()];
  classesPerNode.sort((a, b) => a - b);
  const avg = classesPerNode.length
    ? classesPerNode.reduce((a, b) => a + b, 0) / classesPerNode.length
    : 0;
  const median = classesPerNode.length
    ? classesPerNode[Math.floor(classesPerNode.length / 2)]
    : 0;
  const max = classesPerNode.length
    ? classesPerNode[classesPerNode.length - 1]
    : 0;

  // Redondance: classes présentes sur > 25% des nœuds avec classes
  const threshold = nodesWithClasses * 0.25;
  const redundantClasses = uniqueClasses.filter(
    (c) => classFrequency.get(c) >= threshold
  );
  const highLoadNodes = classesPerNode.filter((n) => n > 4).length;

  return {
    totalClassAssignments: totalAssignments,
    nodesWithClasses,
    uniqueClasses,
    frequency: Object.fromEntries(classFrequency.entries()),
    averageClassesPerNode: Number(avg.toFixed(2)),
    medianClassesPerNode: median,
    maxClassesPerNode: max,
    redundantClasses,
    highLoadNodes,
  };
};

/**
 * Parse le CSS compilé pour récupérer la liste des classes utilisées dans les sélecteurs.
 * @param {string} compiledCss
 */
export const parseCssClasses = (compiledCss) => {
  const root = postcss.parse(compiledCss);
  const classSet = new Set();

  let totalSelectors = 0;
  let selectorsWithMultipleClasses = 0;
  let specificitySum = 0;
  let specificityMax = 0;
  let complexSelectors = 0;

  // Nouveaux compteurs liés à BEM et à la forme des sélecteurs
  let bemSelectors = 0; // sélecteurs qui ciblent au moins une classe BEM
  let pureBemSelectors = 0; // sélecteurs 100% BEM-friendly
  let selectorsWithAncestor = 0; // sélecteurs contenant un espace / combinator
  let selectorsWithId = 0;
  let selectorsWithType = 0;
  let selectorsWithAttribute = 0;

  const classRegexGlobal = /\.([a-zA-Z0-9_-]+)/g;

  // Helper : sélecteur "pur BEM" ?
  // Exemples acceptés : `.block`, `.block__el`, `.block--mod`, `.block__el--mod`,
  // éventuellement avec pseudo-classes/pseudo-éléments : `.block__el:hover`, `.block::before`
  const isPureBemSelector = (selector, classes) => {
    if (!classes.length) return false;
    // Toutes les classes doivent être BEM
    if (!classes.every(isBemClass)) return false;
    // On accepte une seule classe "principale" dans le sélecteur
    if (classes.length > 1) return false;
    // On autorise uniquement : .class + pseudo-classes/éléments
    const withoutPseudos = selector.replace(
      /:{1,2}[a-zA-Z0-9_-]+(\([^)]*\))?/g,
      ""
    );
    // Doit ressembler à ".block" ou ".block__el" ou ".block--mod" etc, sans espace/combinator
    return /^\.([a-zA-Z0-9_-]+)$/.test(withoutPseudos.trim());
  };

  root.walkRules((rule) => {
    // Ignore @keyframes
    if (
      rule.parent &&
      rule.parent.type === "atrule" &&
      rule.parent.name === "keyframes"
    ) {
      return;
    }

    const selectors = rule.selectors || rule.selector.split(",");

    for (const sel of selectors) {
      const trimmed = sel.trim();
      if (!trimmed) continue;
      totalSelectors++;

      // Complexité heuristique (comme avant)
      if (/[:>+\[\]]/.test(trimmed)) complexSelectors++;

      // Nouvelles détections structurelles
      const hasAncestor = /\s|>|~|\+/.test(trimmed); // combinators ou espaces
      const hasId = /#[-_a-zA-Z0-9]+/.test(trimmed);
      const hasAttribute = /\[[^\]]+\]/.test(trimmed);

      const typeMatches =
        trimmed.match(/(^|[\s>+~])([a-zA-Z][a-zA-Z0-9_-]*)/g) || [];
      // On enlève les morceaux qui contiennent . ou # pour garder les vrais type selectors
      const typeSelectors = typeMatches.filter(
        (t) => !t.includes(".") && !t.includes("#")
      );
      const hasType = typeSelectors.length > 0;

      if (hasAncestor) selectorsWithAncestor++;
      if (hasId) selectorsWithId++;
      if (hasType) selectorsWithType++;
      if (hasAttribute) selectorsWithAttribute++;

      // Récupération des classes dans le sélecteur
      const classMatches = [...trimmed.matchAll(classRegexGlobal)].map(
        (m) => m[1]
      );
      for (const cls of classMatches) classSet.add(cls);
      if (classMatches.length > 1) selectorsWithMultipleClasses++;

      // Calcul spécificité (comme avant, avec légère adaptation)
      const idCount = (trimmed.match(/#/g) || []).length;
      const classCount = classMatches.length;
      const typeCount = typeSelectors.length;
      const spec = idCount * 100 + classCount * 10 + typeCount;
      specificitySum += spec;
      if (spec > specificityMax) specificityMax = spec;

      // BEM-aware metrics
      const hasBemClass = classMatches.some(isBemClass);
      if (hasBemClass) {
        bemSelectors++;
        if (isPureBemSelector(trimmed, classMatches)) {
          pureBemSelectors++;
        }
      }
    }
  });

  return {
    uniqueClasses: [...classSet],
    totalSelectors,
    selectorsWithMultipleClasses,
    specificity: {
      average: totalSelectors
        ? Number((specificitySum / totalSelectors).toFixed(2))
        : 0,
      max: specificityMax,
    },
    complexSelectorsRatio: totalSelectors
      ? Number((complexSelectors / totalSelectors).toFixed(3))
      : 0,

    // >>> Nouvelle partie : analyse de la "forme CSS" par rapport à BEM
    selectorForms: {
      bemSelectors,
      pureBemSelectors,
      pureBemSelectorsRatio: totalSelectors
        ? Number((pureBemSelectors / totalSelectors).toFixed(3))
        : 0,
      selectorsWithAncestor,
      selectorsWithId,
      selectorsWithType,
      selectorsWithAttribute,
      ancestorsRatio: totalSelectors
        ? Number((selectorsWithAncestor / totalSelectors).toFixed(3))
        : 0,
      withIdRatio: totalSelectors
        ? Number((selectorsWithId / totalSelectors).toFixed(3))
        : 0,
      withTypeRatio: totalSelectors
        ? Number((selectorsWithType / totalSelectors).toFixed(3))
        : 0,
    },
  };
};

/**
 * Calcule les métriques BEM à partir des classes HTML et CSS.
 * @param {string[]} htmlClasses
 * @param {string[]} cssClasses
 */
export const computeBemMetrics = (htmlClasses, cssClasses) => {
  const allClasses = new Set([...htmlClasses, ...cssClasses]);
  const blocks = new Map(); // blockName -> { elements:Set, modifiers:Set, elementModifiers:Set }
  const definedBlocks = new Set(); // Blocs explicitement définis dans le CSS/HTML
  const violations = [];

  const ensureBlock = (blockName) => {
    if (!blocks.has(blockName)) {
      blocks.set(blockName, {
        elements: new Set(),
        modifiers: new Set(),
        elementModifiers: new Set(),
      });
    }
    return blocks.get(blockName);
  };

  const classify = (cls) => {
    if (elementModPattern.test(cls)) {
      const [, blockName, elementName, modifierName] =
        cls.match(elementModPattern);
      const block = ensureBlock(blockName);
      block.elements.add(`${blockName}__${elementName}`);
      block.elementModifiers.add(cls);
      return "elementModifier";
    }
    if (elementPattern.test(cls)) {
      const [, blockName, elementName] = cls.match(elementPattern);
      const block = ensureBlock(blockName);
      block.elements.add(`${blockName}__${elementName}`);
      return "element";
    }
    if (blockModPattern.test(cls)) {
      const [, blockName] = cls.match(blockModPattern);
      const block = ensureBlock(blockName);
      block.modifiers.add(cls);
      return "modifier";
    }
    if (blockPattern.test(cls)) {
      ensureBlock(cls);
      definedBlocks.add(cls);
      return "block";
    }
    return "other";
  };

  const categoryCount = {
    block: 0,
    element: 0,
    modifier: 0,
    elementModifier: 0,
    other: 0,
  };

  for (const cls of allClasses) {
    const category = classify(cls);
    categoryCount[category]++;
  }

  // Violations heuristiques
  for (const cls of allClasses) {
    if (blockModPattern.test(cls)) {
      const [, blockName] = cls.match(blockModPattern);
      if (!blockPattern.test(blockName) && !allClasses.has(blockName)) {
        violations.push(`Modifier sans block: ${cls}`);
      }
    }
    if (elementPattern.test(cls)) {
      const [, blockName] = cls.match(elementPattern);
      if (!blockPattern.test(blockName) && !allClasses.has(blockName)) {
        violations.push(`Element sans block: ${cls}`);
      }
    }
  }

  // Profondeur
  const depthValues = [];
  for (const key of Object.keys(categoryCount)) {
    const depth =
      key === "block"
        ? 1
        : key === "element"
        ? 2
        : key === "elementModifier"
        ? 3
        : key === "modifier"
        ? 2
        : 1;
    depthValues.push(...Array(categoryCount[key]).fill(depth));
  }
  const depthAvg = depthValues.length
    ? depthValues.reduce((a, b) => a + b, 0) / depthValues.length
    : 0;
  const depthMax = depthValues.length ? Math.max(...depthValues) : 0;

  const bemClassesCount =
    categoryCount.block +
    categoryCount.element +
    categoryCount.modifier +
    categoryCount.elementModifier;
  const bemClassesRatio = allClasses.size
    ? Number((bemClassesCount / allClasses.size).toFixed(3))
    : 0;

  // <<< Nouveaux indicateurs de "pertinence" BEM côté structure
  let structuredBlocksCount = 0;
  let orphanBlocksCount = 0;
  const implicitBlocks = [];

  for (const [name, data] of blocks.entries()) {
    if (!definedBlocks.has(name)) {
      implicitBlocks.push(name);
    }

    const hasStructure =
      data.elements.size > 0 ||
      data.modifiers.size > 0 ||
      data.elementModifiers.size > 0;
    if (hasStructure) structuredBlocksCount++;
    else orphanBlocksCount++;
  }

  const totalBlocks = blocks.size;
  const structuredBlocksRatio = totalBlocks
    ? Number((structuredBlocksCount / totalBlocks).toFixed(3))
    : 0;

  // Transformation des blocks en objet simple
  const blocksObj = Object.fromEntries(
    [...blocks.entries()].map(([name, data]) => [
      name,
      {
        elements: [...data.elements],
        modifiers: [...data.modifiers],
        elementModifiers: [...data.elementModifiers],
      },
    ])
  );

  return {
    blocks: blocksObj,
    counts: {
      blocks: categoryCount.block,
      elements: categoryCount.element,
      modifiers: categoryCount.modifier,
      elementModifiers: categoryCount.elementModifier,
      other: categoryCount.other,
    },
    ratios: {
      bemClassesRatio,
      structuredBlocksRatio,
    },
    depth: {
      max: depthMax,
      average: Number(depthAvg.toFixed(2)),
    },
    blockStructure: {
      totalBlocks,
      structuredBlocks: structuredBlocksCount,
      orphanBlocks: orphanBlocksCount,
      implicitBlocks,
    },
    violations,
  };
};

/**
 * Compare HTML vs CSS classes.
 * @param {object} htmlStats
 * @param {object} cssStats
 */
export const computeComparisons = (htmlStats, cssStats) => {
  const htmlSet = new Set(htmlStats.uniqueClasses);
  const cssSet = new Set(cssStats.uniqueClasses);
  const unusedCssClasses = [...cssSet].filter((c) => !htmlSet.has(c));
  const undefinedHtmlClasses = [...htmlSet].filter((c) => !cssSet.has(c));

  const coverageHtml = htmlSet.size
    ? Number(
        ((htmlSet.size - undefinedHtmlClasses.length) / htmlSet.size).toFixed(3)
      )
    : 0;
  const coverageCss = cssSet.size
    ? Number(((cssSet.size - unusedCssClasses.length) / cssSet.size).toFixed(3))
    : 0;

  const cssEfficiency = coverageCss; // alias

  return {
    unusedCssClasses,
    undefinedHtmlClasses,
    coverageHtml,
    coverageCss,
    cssEfficiency,
  };
};

/**
 * Calcule entropie de distribution des classes HTML.
 * @param {object} frequencyMapObj
 */
const computeEntropy = (frequencyMapObj) => {
  const entries = Object.values(frequencyMapObj);
  const total = entries.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const entropy = entries
    .map((count) => {
      const p = count / total;
      return -p * Math.log2(p);
    })
    .reduce((a, b) => a + b, 0);
  return Number(entropy.toFixed(3));
};

/**
 * Analyse complète des classes (HTML + CSS + BEM + métriques).
 * @param {string[]} allHtmlContents
 * @param {string} compiledCss
 */
export const performClassAnalysis = (allHtmlContents, compiledCss) => {
  const htmlStats = extractHtmlClasses(allHtmlContents);
  let cssStats = {
    uniqueClasses: [],
    totalSelectors: 0,
    selectorsWithMultipleClasses: 0,
    specificity: { average: 0, max: 0 },
    complexSelectorsRatio: 0,
    selectorForms: {
      bemSelectors: 0,
      pureBemSelectors: 0,
      pureBemSelectorsRatio: 0,
      selectorsWithAncestor: 0,
      selectorsWithId: 0,
      selectorsWithType: 0,
      selectorsWithAttribute: 0,
      ancestorsRatio: 0,
      withIdRatio: 0,
      withTypeRatio: 0,
    },
  };
  if (compiledCss) {
    try {
      cssStats = parseCssClasses(compiledCss);
    } catch (e) {
      // Ignorer erreur parsing CSS
    }
  }

  const comparisons = computeComparisons(htmlStats, cssStats);
  const bem = computeBemMetrics(
    htmlStats.uniqueClasses,
    cssStats.uniqueClasses
  );

  // Prefix distribution (utilitaires potentiels)
  const prefixCounts = {};
  htmlStats.uniqueClasses.forEach((c) => {
    const prefixMatch = c.match(/^([a-zA-Z]+)-/);
    if (prefixMatch) {
      const p = prefixMatch[1];
      prefixCounts[p] = (prefixCounts[p] || 0) + 1;
    }
  });
  const entropy = computeEntropy(htmlStats.frequency);
  const utilityClassesRatio = htmlStats.uniqueClasses.length
    ? Number(
        (
          htmlStats.uniqueClasses.filter((c) => /^(u-|is-|has-|js-)/.test(c))
            .length / htmlStats.uniqueClasses.length
        ).toFixed(3)
      )
    : 0;

  const analysis = {
    html: {
      totalClassAssignments: htmlStats.totalClassAssignments,
      nodesWithClasses: htmlStats.nodesWithClasses,
      uniqueClasses: htmlStats.uniqueClasses,
      frequency: htmlStats.frequency,
      averageClassesPerNode: htmlStats.averageClassesPerNode,
      medianClassesPerNode: htmlStats.medianClassesPerNode,
      maxClassesPerNode: htmlStats.maxClassesPerNode,
      redundantClasses: htmlStats.redundantClasses,
      highLoadNodes: htmlStats.highLoadNodes,
    },
    css: {
      uniqueClasses: cssStats.uniqueClasses,
      totalSelectors: cssStats.totalSelectors,
      selectorsWithMultipleClasses: cssStats.selectorsWithMultipleClasses,
      specificity: cssStats.specificity,
      complexSelectorsRatio: cssStats.complexSelectorsRatio,
      selectorForms: cssStats.selectorForms,
    },
    mismatch: {
      unusedCssClasses: comparisons.unusedCssClasses,
      undefinedHtmlClasses: comparisons.undefinedHtmlClasses,
      coverageHtml: comparisons.coverageHtml,
      coverageCss: comparisons.coverageCss,
      cssEfficiency: comparisons.cssEfficiency,
    },
    bem,
    distribution: {
      prefixes: prefixCounts,
      entropy,
      utilityClassesRatio,
    },
    meta: {
      version: "1.0",
      generatedAt: new Date().toISOString(),
    },
  };

  const bemScore = calculateBemClassesScore(analysis);
  return { ...analysis, score: { bem: bemScore } };
};
