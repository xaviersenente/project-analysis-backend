/**
 * Configuration centralisée de tous les seuils et valeurs magiques
 * Utilisés à travers les différents analyzers
 *
 * Organisation :
 * - CSS (colors, typography, imports, classes, variables)
 * - HTML (images, tags, validation)
 * - Performance (timeouts, limits)
 * - Scoring (grades, weights)
 */

export default {
  // ===== CSS COLORS =====
  colors: {
    // Similarité des couleurs (OKLCH)
    similarity: {
      lightness: 0.06, // Seuil de différence de luminosité
      chroma: 0.1, // Seuil de différence de saturation
      hue: 30, // Seuil de différence de teinte (degrés)
      achromaticChroma: 0.02, // Seuil pour les couleurs sans teinte (gris)
      grayLightnessDiff: 0.07, // Différence de luminosité pour les gris
    },

    // Groupement par teinte
    hueRangeSize: 40, // Taille des gammes de teinte (degrés)

    // Ratios optimaux
    optimal: {
      uniqueColorsMin: 8, // Minimum de couleurs uniques
      uniqueColorsMax: 25, // Maximum de couleurs uniques
      dominantColorRatio: 0.35, // Ratio maximum pour une couleur dominante
    },

    // Scoring
    scores: {
      maxUniqueColors: 30, // Au-delà, pénalité
      idealRange: [10, 20], // Plage idéale de couleurs
      tooManyThreshold: 25, // Seuil "trop de couleurs"
    },
  },

  // ===== CSS TYPOGRAPHY =====
  typography: {
    // Tailles de police
    fontSize: {
      minReadable: 14, // Taille minimum lisible (px)
      minComfortable: 16, // Taille confortable (px)
      maxReasonable: 72, // Taille maximum raisonnable (px)
      idealBodyMin: 16, // Taille idéale minimum pour le corps
      idealBodyMax: 18, // Taille idéale maximum pour le corps
    },

    // Line height
    lineHeight: {
      min: 1.2, // Minimum acceptable
      ideal: 1.5, // Valeur idéale
      max: 2.0, // Maximum raisonnable
      comfortable: 1.6, // Valeur confortable
    },

    // Familles de polices
    fontFamilies: {
      maxCount: 3, // Maximum de familles recommandé
      idealCount: 2, // Nombre idéal
    },

    // Poids de police
    fontWeights: {
      maxUnique: 5, // Maximum de poids différents
      idealRange: [3, 4], // Plage idéale
    },

    // Variantes
    variants: {
      maxTotal: 12, // Maximum de variantes (size+weight)
      idealRange: [6, 10], // Plage idéale
    },

    // Variations de tailles de police
    fontSizeVariations: {
      optimal: { min: 2, max: 4 }, // Nombre optimal de variations
      good: { min: 5, max: 7 }, // Nombre correct de variations
      acceptable: { min: 8, max: 10 }, // Nombre acceptable de variations
    },

    // Ratios d'unités
    relativeUnitsRatio: {
      min: 0.5, // Ratio minimum d'unités relatives (rem/em)
      ideal: 0.8, // Ratio idéal
    },

    // Couverture des line-heights
    lineHeightCoverage: {
      excellent: 0.9, // Excellente couverture
      good: 0.7, // Bonne couverture
      average: 0.5, // Couverture moyenne
    },

    // Ratio de valeurs proportionnelles pour line-height
    proportionalLineHeightRatio: {
      min: 0.7, // Minimum recommandé
      ideal: 0.9, // Idéal
    },
  },

  // ===== CSS IMPORTS =====
  imports: {
    // Nombre d'imports (modularité)
    count: {
      veryLow: 5, // Très peu d'imports
      low: 10, // Peu d'imports
      optimalMin: 15, // Nombre optimal minimum
      optimalMax: 25, // Nombre optimal maximum
      high: 30, // Beaucoup d'imports
      tooMany: 30, // Trop fragmenté
    },

    // Taille des fichiers
    fileSize: {
      optimal: 50000, // Taille optimale (bytes)
      large: 100000, // Fichier volumineux (bytes)
      penaltyPerLargeFile: 2, // Points de pénalité par fichier large
    },

    // Organisation
    organization: {
      minCategories: 3, // Minimum de catégories pour bonne organisation
    },
  },

  // ===== CSS CLASSES (BEM) =====
  classes: {
    bem: {
      minRatio: 0.3, // Ratio minimum pour usage BEM acceptable
      goodRatio: 0.5, // Ratio pour bon usage BEM
      excellentRatio: 0.7, // Ratio pour excellent usage BEM
    },

    complexity: {
      maxNestingDepth: 3, // Profondeur maximum acceptable
      idealNestingDepth: 2, // Profondeur idéale
      maxSelectorsPerRule: 4, // Maximum de sélecteurs par règle
    },
  },

  // ===== CSS VARIABLES =====
  variables: {
    usage: {
      minCount: 5, // Minimum pour usage significatif
      idealMin: 10, // Plage idéale minimum
      idealMax: 30, // Plage idéale maximum
      excessive: 50, // Trop de variables
    },

    naming: {
      minSemanticRatio: 0.3, // Ratio minimum de noms sémantiques
      goodSemanticRatio: 0.6, // Ratio pour bon naming
    },
  },

  // ===== HTML IMAGES =====
  images: {
    // Attribut alt
    alt: {
      minGoodLength: 10, // Longueur minimum pour un bon alt
      maxGoodLength: 125, // Longueur maximum pour un bon alt
      optimalRatio: 0.8, // Ratio optimal d'images avec alt
      excellentRatio: 0.95, // Ratio excellent
    },

    // Images décoratives
    decorative: {
      lowRatio: 0.3, // Ratio faible d'images décoratives
      optimalRatio: 0.6, // Ratio optimal
    },

    // Lazy loading
    lazyLoading: {
      optimalMin: 0.4, // Minimum optimal
      optimalMax: 0.9, // Maximum optimal
      acceptable: 0.25, // Acceptable
      tooMuch: 0.95, // Trop de lazy loading
    },

    // Poids des images (basé sur la moyenne des 5 images les plus lourdes)
    weight: {
      excellent: 80, // Excellent (KB)
      good: 150, // Bon (KB)
      acceptable: 250, // Acceptable (KB)
      large: 400, // Large (KB)
    },

    // Formats modernes
    modernFormats: {
      webp: {
        goodRatio: 0.5, // Bon ratio WebP
        excellentRatio: 0.8, // Excellent ratio WebP
      },
      avif: {
        minRatio: 0.3, // Ratio minimum AVIF
      },
    },

    // Responsive
    responsive: {
      minSrcsetRatio: 0.4, // Ratio minimum avec srcset
      goodSrcsetRatio: 0.6, // Bon ratio srcset
    },
  },

  // ===== HTML TAGS =====
  tags: {
    semantic: {
      minCount: 3, // Minimum pour usage sémantique
      goodCount: 5, // Bon usage sémantique
      excellentCount: 8, // Excellent usage sémantique
    },

    // Balises à vérifier (présence/absence)
    requiredTags: [
      "body",
      "article",
      "nav",
      "header",
      "footer",
      "h1",
      "h2",
      "h3",
      "p",
      "blockquote",
      "ul",
      "li",
      "figure",
      "figcaption",
      "form",
      "label",
      "input",
      "button",
      "textarea",
      "img",
      "a",
      "em",
      "strong",
      "html",
      "head",
      "title",
      "link",
      "meta",
      "script",
      "video",
    ],

    // Balises obsolètes (à éviter)
    obsoleteTags: [
      "font",
      "center",
      "b",
      "i",
      "u",
      "strike",
      "marquee",
      "blink",
      "applet",
      "frameset",
      "noframes",
      "basefont",
      "big",
      "tt",
    ],

    // Balises non sémantiques (usage à surveiller)
    otherTags: ["br", "hr", "div", "span"],
  },

  // ===== PERFORMANCE =====
  performance: {
    timeouts: {
      default: 30000, // Timeout par défaut (ms)
      http: 5000, // Délai d'une requête HTTP vers le site analysé (ms)
      lighthouse: 90000, // Délai maximal d'un audit Lighthouse, par page (ms)
      validation: 30000, // Délai maximal de la validation W3C, par page (ms)
    },

    // Écran émulé pour les contrôles en navigateur : 360 px, comme dans les TP
    viewport: {
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
    },

    limits: {
      maxFileSize: 5 * 1024 * 1024, // 5MB max pour fichiers uploadés
      maxConcurrentAnalysis: 3, // Analyses simultanées max
    },
  },

  // ===== VIGNETTES =====
  // Aperçu des images du site, pour l'interface (carré, en pixels)
  vignettes: {
    taille: 96,
    qualite: 70,
  },

  // ===== SCORING =====
  scoring: {
    // Grades (pourcentages)
    grades: {
      "A+": 95,
      A: 90,
      B: 80,
      C: 70,
      D: 60,
      E: 50,
      F: 0,
    },

    // Poids par catégorie pour l'analyse des images (total 100)
    // Utilisé dans: htmlImagesAnalyzer.js
    weights: {
      accessibility: 35, // Présence/qualité des alt, images décoratives
      performance: 35, // Lazy loading, optimisation du poids
      bestPractices: 30, // Formats modernes (WebP, AVIF, SVG), ratio décoratif, cohérence
    },

    // Points maximum par sous-catégorie pour les différents analyzers
    points: {
      // Images - Répartition des points dans htmlImagesAnalyzer.js
      imagesAltPresence: 15, // Présence des attributs alt
      imagesAltQuality: 10, // Qualité des textes alt (descriptifs, 10-125 caractères)
      imagesDecorative: 10, // Gestion correcte des images décoratives
      imagesLazyLoading: 20, // Utilisation du lazy loading
      imagesWeight: 15, // Optimisation du poids (moyenne top 5)
      imagesFormats: 15, // Formats modernes (WebP, AVIF, SVG)
      imagesDecorativeRatio: 10, // Ratio décoratif/contenu approprié
      imagesFormatConsistency: 5, // Cohérence des formats utilisés

      // Typography (scoring typographie CSS)
      typographyReadability: 25, // Lisibilité (tailles, line-height)
      typographyHierarchy: 20, // Hiérarchie typographique
      typographyConsistency: 20, // Cohérence des styles
      typographyAccessibility: 15, // Accessibilité (contraste, tailles min)
      typographyPerformance: 10, // Performance (webfonts, chargement)
      typographySemantics: 10, // Sémantique (unités relatives)

      // Colors (scoring palette de couleurs CSS)
      colorsPalette: 25, // Qualité de la palette (nombre, diversité)
      colorsContrast: 25, // Contraste et accessibilité
      colorsConsistency: 20, // Cohérence des couleurs utilisées
      colorsAccessibility: 15, // Respect des normes WCAG
      colorsUsage: 15, // Usage approprié des couleurs

      // Imports (scoring organisation CSS)
      importsOrganization: 30, // Organisation et structure des imports
      importsNaming: 20, // Convention de nommage des fichiers
      importsModularity: 20, // Modularité et découpage
      importsPerformance: 20, // Impact performance (taille, nombre)
      importsStructure: 10, // Architecture des dossiers
    },
  },
};
