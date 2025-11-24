import * as cheerio from "cheerio";
import postcss from "postcss";

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

  const classRegexGlobal = /\.([a-zA-Z0-9_-]+)/g;

  root.walkRules((rule) => {
    // Ignore keyframes ou règles @
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
      // Complexité heuristique
      if (/[:>+\[\]]/.test(trimmed)) complexSelectors++;
      const classMatches = [...trimmed.matchAll(classRegexGlobal)].map(
        (m) => m[1]
      );
      for (const cls of classMatches) classSet.add(cls);
      if (classMatches.length > 1) selectorsWithMultipleClasses++;

      // Calcul spécificité simple
      const idCount = (trimmed.match(/#/g) || []).length;
      const classCount = classMatches.length;
      const typeCount = (
        trimmed.match(/(^|\s|>|\+|~)([a-zA-Z][a-zA-Z0-9_-]*)/g) || []
      ).filter((t) => !t.includes("#") && !t.includes(".")).length; // approximatif
      const spec = idCount * 100 + classCount * 10 + typeCount;
      specificitySum += spec;
      if (spec > specificityMax) specificityMax = spec;
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
  };
};

// BEM regex patterns
const blockPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const elementPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)__([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const blockModPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const elementModPattern =
  /^([a-z0-9]+(?:-[a-z0-9]+)*)__([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Calcule les métriques BEM à partir des classes HTML et CSS.
 * @param {string[]} htmlClasses
 * @param {string[]} cssClasses
 */
export const computeBemMetrics = (htmlClasses, cssClasses) => {
  const allClasses = new Set([...htmlClasses, ...cssClasses]);
  const blocks = new Map(); // blockName -> { elements:Set, modifiers:Set, elementModifiers:Set }
  const violations = [];

  const classify = (cls) => {
    if (elementModPattern.test(cls)) {
      const [, blockName, elementName, modifierName] =
        cls.match(elementModPattern);
      if (!blocks.has(blockName))
        blocks.set(blockName, {
          elements: new Set(),
          modifiers: new Set(),
          elementModifiers: new Set(),
        });
      blocks.get(blockName).elements.add(`${blockName}__${elementName}`);
      blocks.get(blockName).elementModifiers.add(cls);
      return "elementModifier";
    }
    if (elementPattern.test(cls)) {
      const [, blockName, elementName] = cls.match(elementPattern);
      if (!blocks.has(blockName))
        blocks.set(blockName, {
          elements: new Set(),
          modifiers: new Set(),
          elementModifiers: new Set(),
        });
      blocks.get(blockName).elements.add(cls);
      return "element";
    }
    if (blockModPattern.test(cls)) {
      const [, blockName] = cls.match(blockModPattern);
      if (!blocks.has(blockName))
        blocks.set(blockName, {
          elements: new Set(),
          modifiers: new Set(),
          elementModifiers: new Set(),
        });
      blocks.get(blockName).modifiers.add(cls);
      return "modifier";
    }
    if (blockPattern.test(cls)) {
      if (!blocks.has(cls))
        blocks.set(cls, {
          elements: new Set(),
          modifiers: new Set(),
          elementModifiers: new Set(),
        });
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

  // Violations heuristiques: modifier sans block défini (pas présent ni dans htmlClasses ni cssClasses)
  for (const cls of allClasses) {
    if (blockModPattern.test(cls)) {
      const [_, blockName] = cls.match(blockModPattern);
      if (!blocks.has(blockName))
        violations.push(`Modifier sans block: ${cls}`);
    }
    if (elementPattern.test(cls)) {
      const [_, blockName] = cls.match(elementPattern);
      if (!blocks.has(blockName)) violations.push(`Element sans block: ${cls}`);
    }
  }

  // Profondeur: block=1, element=2, elementModifier=3, modifier=2
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
    ratios: { bemClassesRatio },
    depth: { max: depthMax, average: Number(depthAvg.toFixed(2)) },
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

  return {
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
};
