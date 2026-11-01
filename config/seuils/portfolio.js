/**
 * Seuils du portfolio S3 (config/grilles/s3-portfolio-2026.json, profil portfolio) : parcours du site,
 * qualité web, dépôt et historique, fiche de soutenance, IA. Rassemblés par config/thresholds.js.
 */

export default {
  // ===== PORTFOLIO S3 (config/grilles/s3-portfolio-2026.json) =====
  // Le site en ligne est le livrable : il est parcouru tel quel, sans exécuter le code du dépôt.
  portfolio: {
    parcours: {
      pagesMax: 25,
      delaiPageMs: 30000,
      // Le temps laissé aux scripts de la page après le chargement (animations, contenus chargés ensuite)
      attenteMs: 1500,
      // Au-delà de la largeur de l'écran, une capture est coupée
      captures: {
        largeurs: [360, 768, 1280],
        hauteurMaxPx: 8000,
        qualite: 70,
        // Avant la photo, sans faire défiler la page : contenus révélés au défilement montrés,
        // images chargées à l'approche chargées (attente maximale). Puis le temps des fondus
        // déclenchés (finMs), ou une courte pause quand rien n'a été révélé (pauseMs)
        revelation: { imagesMs: 4000, finMs: 2000, pauseMs: 300 },
      },
      // Acquis du S1, lot 2 : mesures en page après les captures
      acquis: {
        // Focus visible (A10) : les premières commandes atteintes au clavier, une touche Tab chacune
        tabulationsMax: 12,
        // Longueur de ligne (G9), mesurée à cette largeur : les paragraphes d'au moins tant de caractères
        largeurLignePx: 1280,
        paragrapheMinCaracteres: 120,
        // Au-delà, une ligne se lit mal (WCAG 1.4.8 : 80 caractères). Le S1 demandait une max-width en ch
        longueurLigneMaxCh: 80,
        // Le temps de mise en page après un changement de largeur (zoom, bureau)
        miseEnPageMs: 300,
        // Corps de texte lu (CSS et scripts) pour E3 et A11 ; au-delà, coupé
        corpsMaxOctets: 3_000_000,
      },
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

    // Lot 5 : les critères évalués par l'IA (Q13, ED2, PC6), seulement si la promo le demande (ia.criteres)
    ia: {
      modele: "claude-opus-5-5",
      effort: "high",
      maxTokens: 16000,
      // Une preuve plus courte ne prouve rien
      extraitMin: 8,
      // Ce qu'on envoie d'un document, et combien de pages d'études de cas au plus
      documentMaxCaracteres: 12000,
      pagesMax: 12,
      // Les pages qui présentent un projet, d'après leur adresse
      pagesProjets: /\/(projets?|projects?|works?|travaux|realisations?|r[ée]alisations?|cases?|case-studies|portfolio)\/[^/]+/i,
      commitsMax: 200,
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
};
