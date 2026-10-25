/**
 * Configuration centralisée des seuils : aucun seuil en dur dans un analyseur.
 *
 * - tags : les contenus attendus par défaut (A15), si la promo n'en donne pas
 * - performance : délais et écran émulé
 * - sae105 : les seuils de la grille, axe par axe
 * - enLigne, vignettes : le contrôle du site publié et les aperçus d'images
 * - scoring : les lettres de la note
 */

export default {
  // ===== CONTENUS ATTENDUS =====
  tags: {
    // Balises attendues dans le site (A15), sauf si le fichier de promo en donne d'autres
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

  },

  // ===== GRILLE SAÉ 105 (2026-2027) =====
  // Seuils et listes des analyseurs du résultat v2 (CRITERES-SAE105-2026.md).
  // Les seuils affichés dans l'interface viennent de config/grille-sae105-2026.json.
  sae105: {
    axes: { accessibilite: 30, methodologie: 25, ergonomie: 25, graphique: 20 },

    // Site bilingue : un dossier par langue à la racine (fr/, en/). Seule la langue analysée est
    // évaluée (même structure HTML) ; les autres versions sont comparées par leur nombre de pages.
    langues: {
      analysee: "fr",
      autres: ["en"],
      // Part des noms de pages communs aux deux langues au-delà de laquelle (strictement) on nomme les pages manquantes
      nomsCommunsMin: 0.5,
    },

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
      // M2 : messages du validateur CSS qui visent du CSS récent qu'il ne connaît pas encore.
      // Ils ne sont pas comptés comme des erreurs (seulement signalés) ; à retirer quand le validateur les connaîtra.
      validationCssIgnorer: [
        /Unrecognized at-rule “@(starting-style|container|scope|property|view-transition|position-try)”/,
        /Property “(container|container-type|container-name|transition-behavior|anchor-name|position-anchor|position-area|interpolate-size|field-sizing)” doesn't exist/,
        /“allow-discrete”/,
      ],
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

  // ===== SITE EN LIGNE (étape 6) =====
  // Contrôle léger : pages et ressources répondent-elles ? Rien de noté.
  enLigne: {
    requetesSimultanees: 8,
    // Au-delà, les ressources restantes ne sont pas vérifiées (le résultat le dit)
    requetesMax: 300,
  },

  // ===== VIGNETTES =====
  // Aperçu des images du site, pour l'interface (carré, en pixels)
  vignettes: {
    taille: 96,
    qualite: 70,
  },

  // ===== NOTE =====
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
  },
};
