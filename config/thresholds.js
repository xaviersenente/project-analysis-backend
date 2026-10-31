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
  // Les axes, leurs points et les seuils affichés dans l'interface viennent de config/grilles/sae105-2026.json.
  sae105: {

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

    // Le plafond du bonus est dans la grille (bonusMax)
    bonus: {
      bem: [
        { ratio: 0.7, points: 5 },
        { ratio: 0.5, points: 3 },
      ],
    },
  },

  // ===== PORTFOLIO S3 (config/grilles/s3-portfolio-2026.json) =====
  // Le site en ligne est le livrable : il est parcouru tel quel, sans exécuter le code du dépôt.
  portfolio: {
    parcours: {
      pagesMax: 25,
      delaiPageMs: 30000,
      // Le temps laissé aux scripts de la page après le chargement (animations, contenus chargés ensuite)
      attenteMs: 1500,
      // Au-delà de la largeur de l'écran, une capture est coupée
      captures: { largeurs: [360, 768, 1280], hauteurMaxPx: 8000, qualite: 70 },
      // Fichiers qui ne sont pas des pages
      ignorer: /\.(pdf|zip|jpe?g|png|gif|webp|avif|svg|mp4|webm|mp3|docx?|xlsx?|pptx?)$/i,
    },
    accessibilite: { impacts: ["critical", "serious"] },
    // EcoIndex : la note de chaque page, d'après son score (méthode ecoindex.fr)
    ecoindex: {
      notes: [["A", 80], ["B", 70], ["C", 55], ["D", 40], ["E", 25], ["F", 10], ["G", 0]],
      scoreMin: 55,
    },
    // Q8 : domaines d'un autre propriétaire que le site, et ce qu'ils font
    tiers: [
      { motif: /fonts\.(googleapis|gstatic)\.com$/, categorie: "Polices Google" },
      { motif: /(google-analytics|googletagmanager|analytics\.google)\.com$/, categorie: "Mesure d'audience Google" },
      { motif: /(youtube|youtube-nocookie|ytimg)\.com$/, categorie: "Vidéo YouTube" },
      { motif: /(vimeo|vimeocdn)\.com$/, categorie: "Vidéo Vimeo" },
      { motif: /(facebook|fbcdn|instagram|cdninstagram)\.(com|net)$/, categorie: "Meta" },
      { motif: /(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/, categorie: "CDN de bibliothèques" },
      { motif: /(use\.typekit\.net|p\.typekit\.net)$/, categorie: "Polices Adobe" },
      { motif: /(maps\.googleapis|maps\.gstatic)\.com$/, categorie: "Carte Google" },
      { motif: /(hotjar|clarity\.ms|matomo\.cloud)/, categorie: "Mesure d'audience" },
    ],
    // Q9 : la page de mentions légales, et ce qu'elle doit nommer
    mentionsLegales: {
      lien: /mentions[\s-]*l[ée]gales|legal|informations[\s-]*l[ée]gales/i,
      editeur: /[ée]diteur|responsable de (la )?publication|directeur de (la )?publication|propri[ée]taire du site/i,
      hebergeur: /h[ée]berg(eur|é|ement)/i,
    },
    // Q10 : sous-domaines d'hébergeurs ; un portfolio sur l'un d'eux n'est pas sur son propre domaine
    hebergeursGratuits: /\.(github\.io|netlify\.app|vercel\.app|pages\.dev|onrender\.com|wixsite\.com|webflow\.io|framer\.(website|app)|surge\.sh|glitch\.me|000webhostapp\.com|infinityfreeapp\.com|wordpress\.com)$/i,
    // PC2 : la timeline sur huit semaines de projet (mêmes règles de session que la SAÉ 105)
    historique: {
      pauseSessionH: 2,
      forfaitSessionMin: 30,
      sessionsMin: 10,
      joursMin: 10,
      partDernieres48hMax: 0.3,
      datesDivergentesH: 24,
      messagesGeneriques: /^(update|updates|fix|fixes|wip|commit|\.|maj|modif(s|ication)?|test|ok|changes?)$/i,
    },

    // Fichiers déclaratifs à la racine du dépôt (sujet §3 et §5)
    declaratifs: {
      journal: /^journal\.md$/i,
      ia: /^ia\.md$/i,
      qualite: /^qualit[eé]\.md$/i,
      // PC3 : part des semaines du projet qui ont leur entrée dans le journal
      semainesRatio: 0.75,
      // PC4 : ce qu'une déclaration doit dire, outil par outil
      iaEtape: /[ée]tape|phase|conception|maquette|int[ée]gration|d[ée]veloppement|r[ée]daction|recherche|contenu/i,
      iaRetouche: /modifi|corrig|rejet|retouch|r[ée][ée]crit|adapt|refus|repris|ajust/i,
      // Q12 : les quatre domaines du sujet (§6)
      domainesQualite: [
        { nom: "accessibilité", motif: /accessib|rgaa|wcag|contraste|lecteur d'[ée]cran/i },
        { nom: "sobriété et performance", motif: /sobri|performance|poids|ecoindex|lighthouse|[ée]co-?conception|green ?it/i },
        { nom: "référencement", motif: /r[ée]f[ée]rencement|seo|sitemap|meta ?description|robots/i },
        { nom: "conformité juridique", motif: /juridique|rgpd|mentions l[ée]gales|cookies?|droit d'auteur|licence|cr[ée]dits?/i },
      ],
    },

    // Outils d'IA générative (IA.md, traces dans l'historique)
    outilsIa: [
      { nom: "ChatGPT", motif: /chat ?gpt|openai|gpt-?[345o]/i },
      { nom: "Claude", motif: /claude|anthropic/i },
      { nom: "Copilot", motif: /copilot/i },
      { nom: "Cursor", motif: /cursor/i },
      { nom: "Gemini", motif: /gemini|bard/i },
      { nom: "Mistral", motif: /mistral|le chat/i },
      { nom: "Perplexity", motif: /perplexity/i },
      { nom: "Midjourney", motif: /midjourney/i },
      { nom: "DALL-E", motif: /dall-?e/i },
      { nom: "Firefly", motif: /firefly/i },
      { nom: "Figma AI", motif: /figma ?ai|figma make/i },
      { nom: "v0", motif: /\bv0\b/i },
      { nom: "Bolt", motif: /bolt\.new/i },
      { nom: "Lovable", motif: /lovable/i },
      { nom: "Windsurf", motif: /windsurf|codeium/i },
      { nom: "Codex", motif: /\bcodex\b/i },
      { nom: "Devin", motif: /\bdevin\b/i },
      { nom: "Aider", motif: /\baider\b/i },
    ],
    // PC5 : traces d'un outil dans un commit (co-auteur, signature)
    tracesIa: /co-authored-by:.*(claude|copilot|cursor|chatgpt|openai|gemini|codex|devin|aider|windsurf|lovable|bolt)|generated with \[?(claude|cursor|copilot)|🤖 generated/i,

    // TE2 : ce qui situe le projet sur l'échelle du sujet (dépendances npm et code)
    stack: {
      frameworks: ["astro", "next", "nuxt", "vue", "react", "svelte", "@sveltejs/kit", "@angular/core", "solid-js", "gatsby", "@11ty/eleventy", "@remix-run/react", "qwik"],
      bibliotheques: ["tailwindcss", "bootstrap", "daisyui", "bulma", "foundation-sites", "shadcn", "@shadcn/ui", "gsap", "three", "swiper", "aos", "lenis", "@studio-freight/lenis", "jquery", "animejs", "@barba/core", "locomotive-scroll", "framer-motion", "motion"],
      donnees: ["pocketbase", "@supabase/supabase-js", "firebase", "@strapi/strapi", "@strapi/client", "express", "fastify", "prisma", "@prisma/client", "mongoose", "mongodb", "mysql2", "pg", "@sanity/client", "contentful", "@directus/sdk", "graphql", "@apollo/client", "@astrojs/db", "drizzle-orm", "@notionhq/client", "airtable", "keystatic", "@tinacms/cli", "decap-cms"],
      // Routes ou dossiers d'un back-office
      backOffice: /(^|\/)(admin|dashboard|back-?office)(\/|\.)/i,
      composantsMin: 5,
      // Interactions JavaScript (niveau 2 d'une intégration HTML/CSS)
      interactionsMin: 3,
    },

    // TE3 : indices d'un thème ou d'un template récupéré
    template: {
      code: /(html5up|themeforest|templatemo|colorlib|bootstrapmade|w3layouts|free-css|tooplate|uideck|graygrids|creative-tim|startbootstrap|themewagon|templated\.co|envato)/i,
      // En-tête de style.css d'un thème WordPress
      themeWordpress: /^\s*(Theme URI|Author URI|Author)\s*:\s*(.+)$/im,
      generateurs: /(wix|webflow|framer|squarespace|jimdo|hostinger|site123|weebly|carrd|elementor|divi|avada|astra|oceanwp|kadence)/i,
    },

    // TE4 : ce qui n'a rien à faire dans un dépôt public
    sensibles: {
      fichiers: /(^|\/)(node_modules\/|\.env(\.local|\.production|\.development)?$|[^/]+\.(sqlite3?|db|exe|dll|pem|key|p12|pfx)$|id_rsa|wp-config\.php$)/i,
      // La valeur n'est jamais recopiée dans le résultat : seulement le nom de la clé
      secrets: [
        { nom: "clé ou mot de passe en dur", motif: /\b(api[_-]?key|secret|password|passwd|mot_?de_?passe|token)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i },
        { nom: "clé AWS", motif: /\bAKIA[0-9A-Z]{16}\b/ },
        { nom: "clé OpenAI ou Anthropic", motif: /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/ },
        { nom: "jeton GitHub", motif: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
        { nom: "clé Google", motif: /\bAIza[0-9A-Za-z_-]{35}\b/ },
      ],
      // Fichiers lus pour chercher des secrets (texte, et pas trop gros)
      lisibles: /\.(js|mjs|cjs|ts|jsx|tsx|vue|svelte|astro|php|json|ya?ml|env|ini|toml|html|py)$/i,
      tailleMaxKo: 300,
    },

    // Lot 4 : la fiche de soutenance (sujet §7 : une portion de code tirée au sort)
    soutenance: {
      tirages: 3,
      // Une portion : un bloc de lignes consécutives, assez fourni pour poser des questions
      lignes: 20,
      lignesUtilesMin: 10,
      // Le code écrit par l'étudiant ; ni bibliothèques, ni code généré, ni configuration
      sources: /\.(astro|vue|jsx|tsx|svelte|js|ts|mjs|php|css|scss|html|twig)$/i,
      exclus: /(^|\/)(node_modules|vendor|dist|build|public\/build|\.astro|\.next|\.nuxt|pb_migrations|migrations|pb_data|wp-admin|wp-includes)\/|\.min\.|\.d\.ts$|(^|\/)(astro|vite|tailwind|postcss|next|nuxt|svelte|eslint|prettier|tsconfig|jsconfig)\.config\.|(^|\/)(package(-lock)?|composer)\.json$/i,
      // Lignes qui n'apprennent rien : vides, commentaires, imports
      inutiles: /^\s*($|\/\/|\/\*|\*|<!--|#|import\s|export\s+\*|use\s|require\(|\}|\);?$|<\/[\w-]+>$)/,
      // Questions proposées par l'IA : seulement si le fichier de promo le demande (ia.questionsSoutenance)
      ia: { modele: "claude-opus-5-5", effort: "high", maxTokens: 16000 },
    },

    // PR2 : les réseaux reconnus, et combien le site doit en relier
    reseauxMin: 2,
    reseaux: [
      { nom: "LinkedIn", motif: /(^|\.)linkedin\.com$/ },
      { nom: "GitHub", motif: /(^|\.)github\.com$/ },
      { nom: "Behance", motif: /(^|\.)behance\.net$/ },
      { nom: "Dribbble", motif: /(^|\.)dribbble\.com$/ },
      { nom: "Instagram", motif: /(^|\.)instagram\.com$/ },
      { nom: "Vimeo", motif: /(^|\.)vimeo\.com$/ },
      { nom: "YouTube", motif: /(^|\.)youtube\.com$/ },
      { nom: "ArtStation", motif: /(^|\.)artstation\.com$/ },
      { nom: "X", motif: /(^|\.)(x|twitter)\.com$/ },
      { nom: "Malt", motif: /(^|\.)malt\.fr$/ },
    ],
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
