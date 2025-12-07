/**
 * Helpers utilitaires pour l'analyse CSS
 */

/**
 * Vérifie si un chemin correspond à normalize.css
 * @param {string} importPath - Le chemin d'import CSS.
 * @returns {boolean} - Retourne true si c'est normalize.css.
 */
export const isNormalizeCSS = (importPath) =>
  /normalize\.css$/i.test(importPath);

/**
 * Vérifie si un chemin correspond à Google Fonts
 * @param {string} importPath - Le chemin d'import CSS.
 * @returns {boolean} - Retourne true si c'est Google Fonts.
 */
export const isGoogleFont = (importPath) => {
  return (
    importPath.includes("fonts.googleapis.com") ||
    importPath.includes("fonts.gstatic.com")
  );
};

/**
 * Catégorise un import CSS basé sur son chemin
 * @param {string} importPath - Le chemin d'import CSS.
 * @returns {string} - La catégorie de l'import (base, components, layout, utils, vendor, etc.).
 */
export const categorizeImportByPath = (importPath) => {
  const pathLower = importPath.toLowerCase();

  // Normalisation des chemins avec ou sans extension
  const pathWithoutExt = pathLower.replace(/\.css$/i, "");

  // Extraction du répertoire parent si c'est un chemin relatif
  const parts = pathWithoutExt.split("/").filter((p) => p && p !== ".");

  // Si c'est un chemin absolu (http://), on cherche des patterns dans l'URL
  if (pathLower.startsWith("http")) {
    if (isGoogleFont(importPath)) return "fonts";
    if (isNormalizeCSS(importPath)) return "normalize";
    if (
      pathLower.includes("bootstrap") ||
      pathLower.includes("tailwind") ||
      pathLower.includes("bulma") ||
      pathLower.includes("foundation")
    ) {
      return "framework";
    }
    return "vendor";
  }

  // Pour les chemins relatifs, analyser les segments
  for (const part of parts) {
    if (/^(base|reset|global|core)$/i.test(part)) return "base";
    if (/^(component|comp|modules?)$/i.test(part)) return "components";
    if (/^(layout|layouts|grid|structure)$/i.test(part)) return "layout";
    if (/^(util|utils|utilities|helpers?)$/i.test(part)) return "utils";
    if (/^(theme|themes|variables?|config)$/i.test(part)) return "theme";
    if (/^(vendor|vendors|lib|libs|external)$/i.test(part)) return "vendor";
    if (/^(page|pages|views?)$/i.test(part)) return "pages";
  }

  // Analyse du nom de fichier lui-même
  const filename = parts[parts.length - 1] || "";
  if (/^(main|index|app|styles?)$/i.test(filename)) return "main";
  if (/^(variable|config|settings?)$/i.test(filename)) return "theme";
  if (/^(reset|normalize|base)$/i.test(filename)) return "base";

  return "custom";
};

/**
 * Détermine le type d'import (external, relative, google-fonts)
 * @param {string} importPath - Le chemin d'import CSS.
 * @returns {string} - Le type d'import.
 */
export const getImportType = (importPath) => {
  if (isGoogleFont(importPath)) return "google-fonts";
  if (importPath.startsWith("http://") || importPath.startsWith("https://")) {
    return "external";
  }
  return "relative";
};

/**
 * Extrait les noms de classes d'un contenu CSS
 * @param {string} cssContent - Le contenu CSS.
 * @returns {Array<string>} - Liste des noms de classes détectées.
 */
export const extractClassNames = (cssContent) => {
  const classNames = new Set();

  // Regex pour capturer les sélecteurs de classe
  // Gère: .class, .class1.class2, .class:hover, .class::before, etc.
  const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match;

  while ((match = classRegex.exec(cssContent)) !== null) {
    classNames.add(match[1]);
  }

  return Array.from(classNames);
};

/**
 * Analyse les conventions de nommage des classes CSS
 * @param {Array<string>} classNames - Liste des noms de classes.
 * @returns {object} - Statistiques sur les conventions de nommage.
 */
export const analyzeNamingConventions = (classNames) => {
  if (classNames.length === 0) {
    return {
      total: 0,
      conventions: {},
      prefixes: {},
      hasConsistentNaming: false,
    };
  }

  const conventions = {
    bem: 0, // block__element--modifier
    kebabCase: 0, // my-class-name
    camelCase: 0, // myClassName
    snakeCase: 0, // my_class_name
    pascalCase: 0, // MyClassName
  };

  const prefixes = {};

  classNames.forEach((className) => {
    // BEM: contient __ ou --
    if (className.includes("__") || className.includes("--")) {
      conventions.bem++;
    }

    // Kebab-case: contient des tirets
    if (/-/.test(className) && !/[A-Z_]/.test(className)) {
      conventions.kebabCase++;
    }

    // CamelCase: commence par minuscule, contient des majuscules
    if (
      /^[a-z]/.test(className) &&
      /[A-Z]/.test(className) &&
      !/-|_/.test(className)
    ) {
      conventions.camelCase++;
    }

    // Snake_case: contient des underscores
    if (
      /_/.test(className) &&
      !/-/.test(className) &&
      !/[A-Z]/.test(className)
    ) {
      conventions.snakeCase++;
    }

    // PascalCase: commence par majuscule
    if (/^[A-Z]/.test(className) && !/-|_/.test(className)) {
      conventions.pascalCase++;
    }

    // Extraction des préfixes (ex: btn-, card-, nav-)
    const prefixMatch = className.match(/^([a-z]+)[-_]/i);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    }
  });

  // Détecter la cohérence: une convention domine > 70%
  const total = classNames.length;
  const dominantConvention = Object.entries(conventions).find(
    ([, count]) => count / total > 0.7
  );

  return {
    total,
    conventions,
    prefixes,
    hasConsistentNaming: !!dominantConvention,
    dominantConvention: dominantConvention ? dominantConvention[0] : null,
  };
};

/**
 * Catégorise une variable CSS selon son nom et sa valeur.
 * @param {string} name - Le nom de la variable.
 * @param {string} value - La valeur de la variable.
 * @returns {string} - La catégorie de la variable.
 */
export const categorizeVariable = (name, value) => {
  const nameLower = name.toLowerCase();
  const valueLower = value.toLowerCase();

  // Couleurs
  if (
    nameLower.includes("color") ||
    nameLower.includes("bg") ||
    nameLower.includes("background") ||
    nameLower.includes("border-color") ||
    (nameLower.includes("text") &&
      (valueLower.includes("#") ||
        valueLower.includes("rgb") ||
        valueLower.includes("hsl") ||
        valueLower.includes("oklch"))) ||
    valueLower.match(/^#[0-9a-f]{3,8}$/i) ||
    valueLower.includes("rgb") ||
    valueLower.includes("hsl") ||
    valueLower.includes("oklch") ||
    valueLower.includes("currentcolor")
  ) {
    return "color";
  }

  // Typographie
  if (
    nameLower.includes("font") ||
    nameLower.includes("text") ||
    nameLower.includes("letter-spacing") ||
    nameLower.includes("line-height") ||
    (nameLower.includes("weight") && !nameLower.includes("border"))
  ) {
    return "typography";
  }

  // Spacing
  if (
    nameLower.includes("spacing") ||
    nameLower.includes("space") ||
    nameLower.includes("gap") ||
    nameLower.includes("margin") ||
    nameLower.includes("padding") ||
    (nameLower.match(/^(xs|sm|md|lg|xl|2xl|3xl|4xl)$/) &&
      valueLower.match(/^\d+/))
  ) {
    return "spacing";
  }

  // Layout
  if (
    nameLower.includes("width") ||
    nameLower.includes("height") ||
    nameLower.includes("max-width") ||
    nameLower.includes("min-width") ||
    nameLower.includes("container") ||
    nameLower.includes("breakpoint")
  ) {
    return "layout";
  }

  // Z-index
  if (
    nameLower.includes("z-index") ||
    (nameLower.includes("z") && valueLower.match(/^\d+$/))
  ) {
    return "zIndex";
  }

  // Radius
  if (nameLower.includes("radius") || nameLower.includes("rounded")) {
    return "radius";
  }

  return "other";
};

/**
 * Résout récursivement les variables CSS
 * @param {string} value - La valeur potentiellement avec var()
 * @param {Map} cssVariables - Map des variables CSS disponibles
 * @returns {string} - La valeur résolue
 */
export const resolveVariable = (value, cssVariables) => {
  if (!value || !cssVariables) return value;

  // Regex pour détecter var(--variable-name)
  const varRegex = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g;
  let resolved = value;
  let match;
  let iterations = 0;
  const maxIterations = 10; // Éviter les boucles infinies

  // Résoudre récursivement les variables
  while (
    (match = varRegex.exec(resolved)) !== null &&
    iterations < maxIterations
  ) {
    const varName = match[1];
    const fallback = match[2];
    const varValue = cssVariables.get(varName) || fallback || match[0];
    resolved = resolved.replace(match[0], varValue);
    varRegex.lastIndex = 0; // Reset regex pour re-scanner
    iterations++;
  }

  return resolved;
};
