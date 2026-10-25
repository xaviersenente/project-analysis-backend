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

  // ===== GRILLE SAÉ 105 (2026-2027) =====
  // Seuils et listes des analyseurs du résultat v2 (CRITERES-SAE105-2026.md).
  // Les seuils affichés dans l'interface viennent de config/grille-sae105-2026.json.
  sae105: {
    axes: { accessibilite: 30, methodologie: 25, ergonomie: 25, graphique: 20 },

    graphique: {
      // Mots qui donnent un rôle à une variable de couleur
      roles: {
        surface: ["surface", "fond", "bg", "background", "papier"],
        texte: ["texte", "text", "encre", "ink", "fg", "foreground"],
        accent: ["accent", "primaire", "primary", "secondaire", "secondary", "action", "lien", "link", "marque", "brand"],
        bordure: ["bordure", "border", "trait", "filet", "ligne", "line", "separateur"],
      },
      variablesRolesMin: 4,
      couleursViaVar: 0.9,
      espacementsViaVar: 0.8,
      policesMax: 4,
      remRatio: 0.9,
      lineHeightSansUnite: 0.9,
      taillesDistinctesMax: 7,
      famillesGeneriques: ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji"],

      // G11 : fidélité du site à la maquette Figma (version enregistrée avant la date de rendu)
      maquette: {
        // Rôle des pages Figma d'après leur nom (mêmes règles que figma-sessions)
        pagesGuide: /guide|style|design ?system|composant|component|biblioth|librar|ui ?kit|fondation|foundation/i,
        pagesIgnorees: /mood|inspi|brouillon|draft|archive|recherche|benchmark|couverture|cover/i,
        // Au-delà : un écran tablette ou ordinateur, hors du périmètre (site mobile)
        largeurEcranMaxPx: 600,
        texteMinCaracteres: 2,
        tailleTolerancePx: 1,
        // Un texte plus petit dans la maquette peut être agrandi jusqu'à cette taille sans écart
        tailleLisiblePx: 12,
        graisseTolerance: 0,
        // Distance euclidienne en RVB (0 à 441) : en dessous, deux couleurs sont les mêmes
        couleurDistanceMax: 30,
        // Part des textes retrouvés au style de la maquette ; et part minimale de textes retrouvés
        textesConformesRatio: 0.8,
        textesTrouvesRatio: 0.5,
        couleursHorsMaquetteMax: 2,
        captures: { qualite: 70, hauteurMaxPx: 12000 },
      },
    },

    ergonomie: {
      cibleTactilePx: 44,
      viewportPx: 360,
      accueilMaxKo: 1024,
      imageMaxKo: 150,
      formatsPhoto: ["avif", "webp"],
      formatsPhotoRatio: 0.9,
      imagesDimensionneesRatio: 0.9,
      // Transitions qui déplacent ou redimensionnent (E6) ; couleurs et opacité restent permises
      transitionsInterdites: /^(all|width|height|(min|max)-(width|height)|inline-size|block-size|top|right|bottom|left|inset.*|margin.*|padding.*|font-size|line-height|letter-spacing|gap|row-gap|column-gap|border(-\w+)*-width|flex.*|grid.*)$/,
      liensVagues: ["voir plus", "see all", "see more", "cliquez ici", "click here", "en savoir plus", "ici", "here", "read more", "lire la suite", "plus"],
    },

    accessibilite: {
      lighthouseObjectif: 95,
      zoomViewportPx: 180,
      altSuspects: [/\.(jpe?g|png|webp|avif|gif|svg)$/i, /^(image|photo|img|picture|illustration) (de|d'|of)\b/i, /^(image|photo|img|picture)\d*$/i],
      // Les contenus attendus viennent du fichier de promo (contenusAttendus) ;
      // à défaut, de la liste requiredTags, conservée (tags.requiredTags)
    },

    methodologie: {
      // Timeline des commits (M10) : une estimation, jamais des « heures travaillées »
      timeline: {
        pauseSessionH: 2, // une nouvelle session après plus de 2 h sans commit
        forfaitSessionMin: 30, // durée d'une session = premier au dernier commit, plus 30 min
        sessionsMin: 6,
        joursMin: 4,
        partDernieres48hMax: 0.5,
        datesDivergentesH: 24, // écart entre date d'auteur et date de commit au-delà duquel on le signale
      },
      cssMortMax: 0.05,
      commentairesSectionMin: 3,
      messagesGeneriques: /^(update|updates|fix|fixes|wip|commit|\.|maj|modif(s|ication)?|test|ok|changes?)$/i,
      messagesGeneriquesMax: 0.1,
      readme: ["nom", "groupe", "url du site", "url figma"],
    },

    // Le JavaScript qui remplace du CSS (M4) : le motif, puis ce qu'il fallait faire
    javascript: {
      motifs: [
        {
          motif: "Classe basculée en JavaScript",
          expression: /classList\.(toggle|add|remove)/g,
          alternative: { titre: "Un popover ou <details>, sans JavaScript", code: '<button popovertarget="menu">Menu</button>\n<nav id="menu" popover>…</nav>' },
        },
        {
          motif: "Affichage piloté par element.style",
          expression: /\.style\.(display|opacity|visibility|transform|color|background(Color)?|height|width)\b/g,
          alternative: { titre: "Une classe, un état CSS ou une transition", code: ".panneau:popover-open { opacity: 1; }" },
        },
        {
          motif: "Effet de survol en JavaScript",
          expression: /addEventListener\(\s*["'](mouseover|mouseenter|mouseout|mouseleave)["']/g,
          alternative: { titre: ":hover et :focus-visible", code: ".carte:hover,\n.carte:focus-visible { … }" },
        },
        {
          motif: "Écouteur de défilement",
          expression: /addEventListener\(\s*["']scroll["']/g,
          alternative: { titre: "scroll-behavior, position: sticky", code: "html { scroll-behavior: smooth; }" },
        },
        {
          motif: "Défilement doux en JavaScript",
          expression: /behavior\s*:\s*["']smooth["']/g,
          alternative: { titre: "scroll-behavior: smooth", code: "html { scroll-behavior: smooth; }" },
        },
        {
          motif: "Validation de formulaire écrite à la main",
          // Un écouteur submit qui teste lui-même les valeurs saisies
          expression: /addEventListener\(\s*["']submit["'][\s\S]{0,400}?\.value\b/g,
          alternative: { titre: "La validation native", code: '<input type="email" required>' },
        },
      ],
    },

    bonus: {
      max: 5,
      bem: [
        { ratio: 0.7, points: 5 },
        { ratio: 0.5, points: 3 },
      ],
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
