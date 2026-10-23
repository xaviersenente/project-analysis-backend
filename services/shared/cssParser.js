/**
 * Service partagé pour le parsing CSS avec PostCSS
 * Factorisation du parsing PostCSS utilisé par plusieurs analyzers
 */

import postcss from "postcss";
import { ParsingError } from "../../utils/errors.js";

/**
 * Parse du CSS avec PostCSS et retourne l'AST
 * @param {string} cssContent - Contenu CSS à parser
 * @param {Object} [options] - Options de parsing
 * @param {boolean} [options.from] - Nom du fichier source (pour les erreurs)
 * @returns {postcss.Root} AST PostCSS
 * @throws {ParsingError} Si le parsing échoue
 */
export function parseCSS(cssContent, options = {}) {
  try {
    return postcss.parse(cssContent, {
      from: options.from || "<input>",
      ...options,
    });
  } catch (error) {
    throw new ParsingError("CSS", error.message, {
      reason: error.reason,
      line: error.line,
      column: error.column,
      source: error.source,
    });
  }
}

/**
 * Extrait toutes les déclarations CSS d'une certaine propriété
 * @param {postcss.Root} root - AST PostCSS
 * @param {string|string[]} properties - Propriété(s) à extraire
 * @param {Function} [filter] - Fonction de filtre optionnelle (decl) => boolean
 * @returns {Array<{prop: string, value: string, parent: postcss.Rule}>}
 */
export function extractDeclarations(root, properties, filter = null) {
  const props = Array.isArray(properties) ? properties : [properties];
  const declarations = [];

  root.walkDecls((decl) => {
    if (props.includes(decl.prop) && (!filter || filter(decl))) {
      declarations.push({
        prop: decl.prop,
        value: decl.value,
        parent: decl.parent,
        important: decl.important,
      });
    }
  });

  return declarations;
}

/**
 * Extrait toutes les règles CSS
 * @param {postcss.Root} root - AST PostCSS
 * @param {Function} [filter] - Fonction de filtre optionnelle (rule) => boolean
 * @returns {Array<postcss.Rule>}
 */
export function extractRules(root, filter = null) {
  const rules = [];

  root.walkRules((rule) => {
    if (!filter || filter(rule)) {
      rules.push(rule);
    }
  });

  return rules;
}

/**
 * Extrait toutes les at-rules (@media, @keyframes, etc.)
 * @param {postcss.Root} root - AST PostCSS
 * @param {string} [name] - Nom de l'at-rule à filtrer (ex: 'media', 'keyframes')
 * @returns {Array<postcss.AtRule>}
 */
export function extractAtRules(root, name = null) {
  const atRules = [];

  root.walkAtRules((atRule) => {
    if (!name || atRule.name === name) {
      atRules.push(atRule);
    }
  });

  return atRules;
}

/**
 * Compte les occurrences de chaque valeur pour une propriété
 * @param {postcss.Root} root - AST PostCSS
 * @param {string} property - Propriété à analyser
 * @returns {Map<string, number>} Map des valeurs et leur fréquence
 */
export function countPropertyValues(root, property) {
  const counts = new Map();

  root.walkDecls(property, (decl) => {
    const value = decl.value;
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return counts;
}

/**
 * Trouve toutes les variables CSS définies
 * @param {postcss.Root} root - AST PostCSS
 * @returns {Map<string, {value: string, scope: string}>}
 */
export function extractCSSVariables(root) {
  const variables = new Map();

  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) {
      const scope = decl.parent?.selector || "global";
      variables.set(decl.prop, {
        value: decl.value,
        scope,
      });
    }
  });

  return variables;
}

/**
 * Trouve toutes les utilisations de var()
 * @param {postcss.Root} root - AST PostCSS
 * @returns {Array<{variable: string, property: string, fallback: string|null}>}
 */
export function extractVariableUsages(root) {
  const usages = [];
  const varRegex = /var\((--[^,)]+)(?:,\s*([^)]+))?\)/g;

  root.walkDecls((decl) => {
    let match;
    while ((match = varRegex.exec(decl.value)) !== null) {
      usages.push({
        variable: match[1],
        property: decl.prop,
        fallback: match[2] || null,
      });
    }
  });

  return usages;
}

/**
 * Extrait les sélecteurs de toutes les règles
 * @param {postcss.Root} root - AST PostCSS
 * @param {Object} [options] - Options
 * @param {boolean} [options.unique=false] - Retourner uniquement les sélecteurs uniques
 * @returns {string[]}
 */
export function extractSelectors(root, options = {}) {
  const selectors = [];

  root.walkRules((rule) => {
    if (options.unique) {
      const split = rule.selector.split(",").map((s) => s.trim());
      selectors.push(...split);
    } else {
      selectors.push(rule.selector);
    }
  });

  return options.unique ? [...new Set(selectors)] : selectors;
}

/**
 * Analyse la complexité des sélecteurs
 * @param {postcss.Root} root - AST PostCSS
 * @returns {Object} Statistiques de complexité
 */
export function analyzeSelectorsComplexity(root) {
  const stats = {
    total: 0,
    avgDepth: 0,
    maxDepth: 0,
    withId: 0,
    withClass: 0,
    withAttribute: 0,
    withPseudo: 0,
  };

  const depths = [];

  root.walkRules((rule) => {
    stats.total++;

    // Analyser chaque sélecteur
    const selectors = rule.selector.split(",").map((s) => s.trim());

    selectors.forEach((selector) => {
      // Profondeur approximative (nombre d'espaces)
      const depth = selector.split(/\s+/).length;
      depths.push(depth);
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      // Types de sélecteurs
      if (selector.includes("#")) stats.withId++;
      if (selector.includes(".")) stats.withClass++;
      if (selector.includes("[")) stats.withAttribute++;
      if (selector.includes(":")) stats.withPseudo++;
    });
  });

  stats.avgDepth =
    depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;

  return stats;
}

/**
 * Clone un AST PostCSS
 * @param {postcss.Root} root - AST à cloner
 * @returns {postcss.Root} Clone de l'AST
 */
export function cloneAST(root) {
  return root.clone();
}

/**
 * Convertit un AST PostCSS en string CSS
 * @param {postcss.Root} root - AST PostCSS
 * @param {Object} [options] - Options de stringification
 * @returns {string} CSS sous forme de string
 */
export function astToString(root, options = {}) {
  return root.toString(options);
}
