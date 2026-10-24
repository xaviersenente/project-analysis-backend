# Project Analysis Backend

API d'analyse de projets web (HTML/CSS) qui fournit des rapports détaillés sur la qualité, l'accessibilité, les performances et la structure des pages web.

## 📋 Table des matières

- [Description](#description)
- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Services](#services)
- [Technologies](#technologies)

## 📖 Description

Cette API backend permet d'analyser des projets web hébergés en ligne. Elle effectue une analyse complète incluant :

- Analyse HTML (structure, balises, liens)
- Analyse CSS (compilation, minification, statistiques)
- Analyse des classes (fréquences, unused, couverture HTML/CSS)
- Détection BEM (blocks, elements, modifiers, violations)
- Validation W3C
- Audit Lighthouse (performance, accessibilité, SEO, bonnes pratiques)
- Extraction d'images et métadonnées

Les résultats sont sauvegardés au format JSON dans le répertoire `data/` pour consultation ultérieure.

## ✨ Fonctionnalités

- **Analyse HTML complète** : détection de balises, liens internes/externes, structure des titres
- **Analyse CSS avancée** :
  - Compilation avec PostCSS, minification, résolution des imports
  - **Analyse des @import** : liste et vérification des chemins avant compilation
  - **Détection de normalize.css** : identification automatique de son utilisation
  - **Analyse des variables CSS** :
    - Déclarations et utilisations
    - Variables non utilisées
    - Variables utilisées mais non déclarées
    - Catégorisation automatique (couleur, typographie, spacing, layout, z-index, radius)
    - Ratio variables / propriétés brutes
- **Analyse des classes** : fréquence, redondance, surcharge (nœuds >4 classes), unused CSS, classes HTML non définies
- **Métriques BEM** : blocks/elements/modifiers, ratio BEM, profondeur, violations (élément ou modificateur orphelin)
- **Validation W3C** : vérification de la conformité HTML
- **Audit Lighthouse** : scores de performance, accessibilité, SEO et bonnes pratiques
- **Crawling automatique** : exploration des pages HTML d'un site (jusqu'à 3 niveaux de profondeur)
- **Stockage des résultats** : sauvegarde JSON pour chaque projet analysé
- **API REST** : endpoints pour lancer des analyses et récupérer les résultats

## 🚀 Installation

### Prérequis

- Node.js (version 14 ou supérieure)
- npm ou yarn
- Google Chrome (requis pour Lighthouse)

### Installation des dépendances

```bash
npm install
```

## ⚙️ Configuration

Le serveur démarre par défaut sur le port **3000**. Pour modifier le port, éditez le fichier `index.js` :

```javascript
const port = 3000; // Changez cette valeur
```

## 🎯 Utilisation

### Démarrer le serveur

```bash
npm start
```

Le serveur sera accessible sur `http://localhost:3000`.

### Authentification et données

Toutes les routes exigent l'en-tête `Authorization: Bearer <API_TOKEN>`, avec le jeton défini dans `.env`. Sans `API_TOKEN`, l'API refuse toutes les requêtes. CORS n'accepte que les domaines de `CORS_ORIGIN`.

Les projets sont déclarés dans le fichier de promo, `data/promo.json`, hors de Git :

```json
{
  "dateRendu": "2027-01-15T23:59:00+01:00",
  "projets": [
    { "slug": "etu-01", "nom": "Alice Dupont", "groupe": "TP2", "site": "https://…" }
  ]
}
```

Un slug ne contient que `a-z`, `0-9` et `-`. Les anciens fichiers `data/<Prénom NOM>.json` se migrent avec `node scripts/migrerDonnees.js --essai`, puis sans `--essai`.

### Analyser les dépôts de la promo (lot 1)

L'analyse se fait en local, sur le dépôt GitHub de chaque étudiant, à une version figée : le tag `v1`, sinon le dernier commit avant la date de rendu. Le dépôt est récupéré par un clone partiel, gardé dans `cache/` (hors de Git).

Le fichier de promo, `data/promo.json` :

```json
{
  "promo": "SAÉ 105 · 2026-2027",
  "dateRendu": "2027-01-15T23:59:00+01:00",
  "contenusAttendus": ["article", "nav", "figure", "figcaption", "blockquote", "form", "label", "video"],
  "projets": [
    { "slug": "etu-01", "nom": "Dupont Alice", "groupe": "TP2", "depot": "mmi-montbeliard/sae105-2026-dupont-alice" }
  ]
}
```

```bash
node scripts/analyser.js --tous
```

Chaque projet donne `data/<slug>.json` (résultat v2, conforme à `schema/resultat.js`) et ses vignettes. Sans `contenusAttendus`, la liste `requiredTags` de la configuration s'applique. Un dépôt privé demande `GITHUB_TOKEN` (lecture seule) dans `.env`.

L'analyse comprend :

- l'analyse statique du HTML et du CSS, avec fichier et ligne pour chaque occurrence ;
- le JavaScript qui remplace du CSS (motifs dans `config/thresholds.js`) ;
- les contrôles en navigateur, sur le dépôt servi en local sous `/<nom-du-dépôt>/` comme GitHub Pages (casse respectée, chemins en `/` en échec) : Lighthouse, débordement à 360 et 180 px, cibles tactiles, requêtes en échec. Chrome est nécessaire ; `--sans-navigateur` les saute.

La timeline des commits (lot 3) est « Non mesurable » pour l'instant. Comptez environ une minute par projet de 8 pages.

### Vignettes des images

Après l'analyse, `node scripts/vignettes.js --slug etu-01 --site <dossier du site>` crée une vignette WebP carrée par image (taille dans `config/thresholds.js`) dans `data/vignettes/<slug>/`, hors de Git, et renseigne le champ `vignette` du résultat. Une image introuvable garde `vignette: null`.

### Analyser un projet

```bash
curl -X POST http://localhost:3000/scan -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" -d '{"slug":"etu-01"}'
```

L'URL analysée est celle du fichier de promo, jamais celle de la requête. Une seule analyse tourne à la fois.

### Récupérer la liste des projets

```bash
curl http://localhost:3000/scan/projects -H "Authorization: Bearer $API_TOKEN"
```

### Récupérer les données d'un projet

```bash
curl http://localhost:3000/scan/project/etu-01 -H "Authorization: Bearer $API_TOKEN"
```

## 🏗️ Architecture

```
project-analysis-backend/
├── index.js                          # Point d'entrée de l'application
├── package.json                      # Dépendances et scripts
├── render.yaml                       # Configuration de déploiement
├── postcss.config.js                 # Configuration PostCSS
├── .env.example                      # Template de configuration
├── REFACTORING_SUMMARY.md            # Documentation de la refactorisation
├── config/                           # Configuration centralisée
│   └── thresholds.js                 # Tous les seuils et valeurs magiques
├── controllers/                      # Contrôleurs de routes
│   ├── analysisControllerGithub.js   # Analyse de repos GitHub (désactivé)
│   └── analysisControllerServer.js   # Analyse d'URLs en ligne
├── routes/                           # Définition des routes
│   ├── scan.js                       # Routes d'analyse
│   └── stats.js                      # Routes de statistiques
├── services/                         # Logique métier
│   ├── css/                          # Services d'analyse CSS
│   │   ├── classAnalysisService.js   # Analyse des classes (BEM, etc.)
│   │   ├── cssAnalysisService.js     # Compilation et analyse CSS
│   │   ├── cssColorsAnalyzer.js      # Analyse des couleurs (OKLCH)
│   │   ├── cssCompiler.js            # Compilation PostCSS
│   │   ├── cssImportsAnalyzer.js     # Analyse des @import
│   │   ├── cssTypographyAnalyzer.js  # Analyse typographique
│   │   └── cssVariablesAnalyzer.js   # Analyse des variables CSS
│   ├── html/                         # Services d'analyse HTML
│   │   ├── fileScannerService.js     # Crawling de pages
│   │   ├── htmlAnalyzer.js           # Analyse HTML structurelle
│   │   ├── htmlImagesAnalyzer.js     # Analyse des images
│   │   ├── htmlTagsAnalyzer.js       # Analyse des balises
│   │   ├── lighthouseService.js      # Audit Lighthouse
│   │   └── validationService.js      # Validation W3C
│   ├── shared/                       # Services partagés
│   │   ├── cssHelpers.js             # Helpers CSS (résolution variables)
│   │   ├── cssParser.js              # Parsing PostCSS réutilisable
│   │   └── scoreCalculator.js        # Calcul de scores standardisé
│   ├── stats/                        # Services de statistiques
│   │   └── statsService.js           # Agrégation des statistiques
│   ├── cssAnalysisService.js         # Service principal CSS
│   ├── htmlAnalysisService.js        # Service principal HTML
│   └── githubService.js              # Interaction avec l'API GitHub
├── utils/                            # Utilitaires
│   ├── errors.js                     # Classes d'erreurs personnalisées
│   └── statistics.js                 # Fonctions statistiques réutilisables
└── data/                             # Résultats d'analyse (JSON)
    └── *.json                        # Un fichier par projet
```

### 📐 Architecture Refactorisée (Décembre 2024)

Le projet a été entièrement refactorisé pour améliorer la maintenabilité :

- **Pattern ScoreCalculator** : Logique de scoring standardisée dans tous les analyzers
- **Thresholds centralisés** : Toutes les valeurs magiques dans `config/thresholds.js`
- **Gestion d'erreurs typée** : Classes d'erreurs personnalisées avec middleware Express
- **Services modulaires** : Organisation par domaine (css/, html/, shared/, stats/)
- **Fonctions réutilisables** : Parsing CSS, calculs statistiques, résolution de variables

Voir [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) pour plus de détails.

## 🔌 API Endpoints

### `POST /scan`

Analyse un projet de la promo, à l'URL inscrite dans le fichier de promo.

**Corps (JSON)** :

- `slug` (string, requis) : identifiant du projet dans le fichier de promo

**Codes** : 400 (slug invalide), 401 (jeton), 404 (projet inconnu ou sans `site`), 409 (analyse déjà en cours).

**Réponse** :

```json
{
  "message": "Project etu-01 saved successfully",
  "analysisResult": {
    "pages": [...],
    "globalAnalysis": {...},
    "cssAnalysisResult": {...},
    "classAnalysis": {...}
  }
}
```

### `GET /scan/projects`

Récupère la liste des projets du fichier de promo.

**Réponse** :

```json
[{ "slug": "etu-01", "nom": "Alice Dupont", "groupe": "TP2", "analyse": true }]
```

### `GET /scan/project/:slug`

Récupère les données d'analyse d'un projet de la promo.

**Paramètres** :

- `slug` (string) : identifiant du projet (`^[a-z0-9-]+$`)

**Réponse** : Objet JSON contenant l'analyse complète du projet.

## 📦 Services

### 🔧 Services Partagés (shared/)

#### scoreCalculator.js

Service standardisé pour le calcul de scores dans tous les analyzers.

**Classe principale : `ScoreCalculator`**

```javascript
const calculator = new ScoreCalculator();

calculator.addCategory("categoryName", maxPoints, () => {
  // Logique de calcul
  return createScore(score, maxPoints, details);
});

return calculator.calculate(improvements);
```

**Fonctions helper :**

- `createScore(score, max, details)` : Crée un objet score standardisé
- `ratioToScore(ratio, max)` : Convertit un ratio en score

#### cssParser.js

Utilitaires de parsing PostCSS réutilisables.

**Fonctions principales :**

- `parseCSS(css)` : Parse sécurisé avec gestion d'erreurs
- `extractDeclarations(root, property)` : Extrait toutes les déclarations d'une propriété
- `extractCSSVariables(root)` : Extrait toutes les variables CSS
- `countPropertyValues(root, property)` : Compte les valeurs d'une propriété
- `analyzeSelectorsComplexity(root)` : Calcule la complexité des sélecteurs

#### cssHelpers.js

Helpers pour la résolution des variables CSS.

**Fonctions principales :**

- `resolveVariable(value, cssVariables)` : Résout une valeur avec variables CSS

### ⚙️ Configuration (config/)

#### thresholds.js

Configuration centralisée de **tous** les seuils et valeurs magiques utilisés dans l'application.

**Sections principales :**

- `colors` : Seuils d'analyse des couleurs (OKLCH, similarité, ratios)
- `typography` : Seuils typographiques (tailles, line-heights, variations)
- `imports` : Seuils d'analyse des @import CSS
- `classes` : Seuils BEM et complexité des classes
- `variables` : Seuils d'analyse des variables CSS
- `images` : Seuils d'analyse des images (alt, formats, tailles)
- `performance` : Timeouts et limites de requêtes
- `scoring` : Configuration des grades (A, B, C, D, F)

**Exemple d'utilisation :**

```javascript
import thresholds from "../../config/thresholds.js";

if (uniqueColors > thresholds.colors.optimal.uniqueColorsMax) {
  improvements.push("Réduire le nombre de couleurs");
}
```

### 🎨 Services CSS (css/)

#### cssImportsAnalyzer.js

Analyse des @import CSS (organisation, performance, bonnes pratiques).

**Fonction principale : `analyzeImports(cssRawContent, baseUrl)`**

**Catégories de scoring :**

- Validity (20 pts) : Validité des imports
- Organization (25 pts) : Organisation et catégorisation
- Performance (25 pts) : Taille et fragmentation
- Naming (15 pts) : Conventions de nommage
- Best Practices (15 pts) : Bonnes pratiques

#### cssColorsAnalyzer.js

Analyse avancée des couleurs avec espace colorimétrique OKLCH.

**Fonction principale : `analyzeColors(compiledCss)`**

**Catégories de scoring :**

- Unique Colors (30 pts) : Nombre de couleurs uniques
- Usage Distribution (25 pts) : Distribution d'utilisation
- Palette Organization (20 pts) : Organisation par teinte
- Contrast Quality (15 pts) : Qualité du contraste
- Consistency (10 pts) : Cohérence de la palette

#### cssTypographyAnalyzer.js

Analyse complète de la typographie (polices, tailles, line-heights, webfonts).

**Fonction principale : `analyzeTypography(htmlContent, cssRawContent, compiledCss)`**

**Catégories de scoring :**

- Webfonts (15 pts) : Détection et import des webfonts
- Fallbacks (20 pts) : Polices de secours génériques
- Inheritance (25 pts) : Héritage et police globale
- Sizes (20 pts) : Cohérence des tailles et unités relatives
- Line Heights (15 pts) : Couverture et unités proportionnelles
- Best Practices (5 pts) : Nombre de déclarations approprié

**Fonctions auxiliaires :**

- `detectWebfontsInHtml(htmlContent)` : Détecte les webfonts dans le HTML
- `detectWebfontsInCss(cssContent)` : Détecte les webfonts dans le CSS
- `analyzeFontSizeUnits(fontFamilies)` : Analyse les unités de font-size
- `analyzeLineHeightUnits(lineHeightValues)` : Analyse les unités de line-height
- `calculateTypographyScore(...)` : Calcule le score typographique

#### cssVariablesAnalyzer.js

Analyse des variables CSS (déclarations, utilisations, catégorisation).

**Fonction principale : `analyzeVariables(cssRawContent, compiledCss)`**

**Détecte :**

- Variables déclarées et utilisées
- Variables non utilisées
- Variables utilisées mais non déclarées
- Catégories automatiques (couleur, typographie, spacing, layout, z-index, radius)

#### cssCompiler.js

Compilation et minification CSS avec PostCSS.

**Fonctions principales :**

- `compileCSS(htmlContent, baseUrl)` : Compile le CSS en résolvant les @import
- `inlineRemoteCSS(cssContent, currentUrl)` : Remplace les @import par leur contenu
- `removeNormalizeCSSImports(cssContent)` : Supprime les imports de normalize.css

#### classAnalysisService.js

Analyse des classes HTML/CSS et détection BEM.

**Fonction principale : `performClassAnalysis(allHtmlContents, compiledCss)`**

**Retourne :**

- Statistiques HTML (fréquences, surcharge)
- Classes CSS (spécificité, complexité)
- Comparaison (unused / undefined)
- Métriques BEM (blocks, elements, modifiers, violations)
- Distribution et entropie

### 🌐 Services HTML (html/)

#### htmlAnalyzer.js

Service principal d'analyse HTML et Lighthouse.

**Fonctions principales :**

**`runLighthouse(url)`**

- Exécute un audit Lighthouse en mode mobile
- **Paramètres** : `url` (string) - URL à auditer
- **Retourne** : Objet avec scores (performance, accessibilité, SEO, etc.) et détails des requêtes réseau

**`analyzeHTML(htmlContent)`**

- Analyse le contenu HTML d'une page
- **Paramètres** : `htmlContent` (string) - Contenu HTML
- **Retourne** : Objet contenant :
  - `totalTags` : Nombre total de balises
  - `externalLinks` : Nombre de liens externes
  - `internalLinks` : Nombre de liens internes
  - `deadLinks` : Liens vides ou "#"
  - `favicon` : Présence d'une favicon
  - `viewport` : Présence de meta viewport
  - `mailtoLinks` : Nombre de liens mailto
  - `headings` : Compteur de titres h1-h6
  - `outlineStructure` : Structure de la page

**`extractTitleAndImagesFromHTML(htmlContent)`**

- Extrait le titre et les images d'une page
- **Paramètres** : `htmlContent` (string)
- **Retourne** : `{ title, images[] }` avec détails des images (src, alt, aria-hidden)

**`analyzeAllPages(allHtmlContents)`**

- Analyse globale de toutes les pages d'un projet
- **Paramètres** : `allHtmlContents` (array) - Tableaux de contenus HTML
- **Retourne** :
  - `tagsPresent` : Balises requises présentes
  - `tagsMissing` : Balises requises manquantes
  - `obsoleteTags` : Balises obsolètes utilisées
  - `otherTags` : Autres balises (br, hr, div, span)

**`getCssLinksFromHtml(htmlContent, baseUrl)`**

- Extrait les URLs des fichiers CSS
- **Paramètres** : `htmlContent` (string), `baseUrl` (string)
- **Retourne** : Array d'URLs absolues

#### htmlImagesAnalyzer.js

Analyse avancée des images (accessibilité, performance, SEO).

**Fonction principale : `analyzeImages(htmlContent, baseUrl)`**

**Catégories de scoring :**

- Accessibility (40 pts) : Alt text et accessibilité
- Performance (30 pts) : Formats modernes, lazy loading, tailles
- Best Practices (30 pts) : SEO, ratio decoratives, naming

**Fonctions auxiliaires :**

- `evaluateAltQuality(alt)` : Évalue la qualité d'un texte alt
- `detectImageFormat(src)` : Détecte le format d'image
- `enrichImagesWithNetworkData(images, networkData)` : Enrichit avec données réseau

#### htmlTagsAnalyzer.js

Analyse des balises HTML (présentes, manquantes, obsolètes).

**Fonction principale : `analyzeAllPages(allHtmlContents)`**

**Retourne :**

- Balises requises présentes/manquantes
- Balises obsolètes utilisées
- Autres balises (br, hr, div, span)

#### validationService.js

Validation HTML W3C.

**Fonction principale : `validateHTML(htmlContent)`**

- Valide le HTML avec le validateur W3C
- **API** : https://validator.w3.org/nu/?out=json
- **Retourne** : Array d'erreurs de validation

#### fileScannerService.js

Crawling de pages HTML.

**Fonction principale : `HtmlCrawler(baseUrl)`**

- Explore un site web pour trouver toutes les pages HTML
- **Configuration** : Profondeur maximale 3 niveaux
- **Retourne** : Array d'URLs uniques

#### lighthouseService.js

Audit Lighthouse pour performance et qualité.

**Fonction principale : `runLighthouse(url)`**

- Exécute un audit Lighthouse en mode mobile
- **Retourne** : Scores et détails des requêtes réseau

### 📊 Services de Statistiques (stats/)

#### statsService.js

Agrégation et calcul de statistiques globales.

**Fonction principale : `calculateGlobalStats(projectsData)`**

- Agrège les statistiques de tous les projets
- Calcule moyennes, médianes, percentiles
- **Retourne** : Statistiques globales détaillées

### 🔧 Utilitaires (utils/)

#### errors.js

Gestion d'erreurs typée avec classes personnalisées.

**Classes d'erreurs :**

- `AppError` : Classe de base avec statusCode et isOperational
- `ValidationError` : Erreurs de validation (400)
- `AnalysisError` : Erreurs d'analyse métier (500)
- `ParsingError` : Erreurs de parsing CSS/HTML (422)
- `TimeoutError` : Erreurs de timeout (504)
- `ExternalServiceError` : Erreurs de services externes (502)

**Middlewares et helpers :**

- `errorHandler()` : Middleware Express pour gérer toutes les erreurs
- `asyncHandler(fn)` : Wrapper pour fonctions async (évite try/catch)
- `wrapError(err, context)` : Convertit erreurs génériques en AppError

#### statistics.js

Fonctions statistiques réutilisables.

**Fonctions principales :**

- `average(values)`, `median(values)`, `min(values)`, `max(values)`
- `standardDeviation(values)`, `quartiles(values)`, `summary(values)`
- `percentage(part, total)`, `ratio(numerator, denominator)`
- `frequency(array)`, `topFrequent(array, n)`

### 📦 Autres Services

### cssAnalysisService.js

Service orchestrateur pour l'analyse CSS complète.

**Fonctions principales :**

**`performCSSAnalysis(htmlContent, cssRawContent, compiledCss, baseUrl)`**

- Orchestre toutes les analyses CSS
- **Retourne** : Objet avec imports, colors, typography, variables, classes, etc.

**`analyzeCSS(css)`**

- Analyse le CSS avec Project Wallace
- **Retourne** : Statistiques CSS détaillées (sélecteurs, propriétés, complexité)

### htmlAnalysisService.js

Service orchestrateur pour l'analyse HTML complète.

**Fonction principale : `performHTMLAnalysis(url, htmlContent)`**

- Orchestre toutes les analyses HTML
- **Retourne** : Objet avec tags, images, validation, lighthouse, etc.

### githubService.js

Service dédié à l'analyse des classes HTML/CSS et à la détection BEM.

#### Fonction principale :

**`performClassAnalysis(allHtmlContents, compiledCss)`**

- Agrège : statistiques HTML (fréquences, surcharge), classes CSS (spécificité, complexité), comparaison (unused / undefined), métriques BEM et distribution.
- **Retourne** : objet `classAnalysis` structuré.

#### Structure `classAnalysis` (exemple simplifié) :

```jsonc
{
  "html": {
    "totalClassAssignments": 420,
    "nodesWithClasses": 110,
    "uniqueClasses": ["header", "header__logo", "btn", "btn--primary"],
    "frequency": { "btn": 24, "btn--primary": 8 },
    "averageClassesPerNode": 2.3,
    "medianClassesPerNode": 2,
    "maxClassesPerNode": 6,
    "redundantClasses": ["btn"],
    "highLoadNodes": 5
  },
  "css": {
    "uniqueClasses": ["header", "header__logo", "btn", "btn--primary"],
    "totalSelectors": 180,
    "selectorsWithMultipleClasses": 35,
    "specificity": { "average": 18.4, "max": 120 },
    "complexSelectorsRatio": 0.185
  },
  "mismatch": {
    "unusedCssClasses": ["card--featured"],
    "undefinedHtmlClasses": ["alert--error"],
    "coverageHtml": 0.96,
    "coverageCss": 0.88,
    "cssEfficiency": 0.88
  },
  "bem": {
    "counts": {
      "blocks": 5,
      "elements": 14,
      "modifiers": 6,
      "elementModifiers": 3,
      "other": 12
    },
    "ratios": { "bemClassesRatio": 0.74 },
    "depth": { "max": 3, "average": 2.1 },
    "violations": ["Element sans block: feature__item"]
  },
  "distribution": {
    "prefixes": { "btn": 10, "nav": 8 },
    "entropy": 5.32,
    "utilityClassesRatio": 0.045
  },
  "meta": { "version": "1.0", "generatedAt": "2025-11-22T10:00:00.000Z" }
}
```

#### Métriques clés :

- **Redondance** : classe utilisée sur >25% des nœuds ayant une classe.
- **HighLoadNodes** : nœuds avec >4 classes (possibles candidats simplification).
- **Specificity** : calcul heuristique (ID*100 + classes*10 + types).
- **Entropy** : diversité des classes (plus élevé = usage varié, trop bas = surcharge ou répétition).
- **Violations BEM** : éléments/modificateurs orphelins.
- **UtilityClassesRatio** : proportion de classes réputées utilitaires (`u-`, `is-`, `has-`, `js-`).

#### Limites :

- Classes dynamiques injectées côté client non capturées.
- Heuristique BEM simplifiée, ne gère pas toutes les conventions avancées.
- Spécificité approximative (ne remplace pas un analyseur dédié complet).

## 🎯 Patterns de Code

### Pattern ScoreCalculator

Tous les analyzers utilisent le pattern `ScoreCalculator` pour standardiser le calcul de scores :

```javascript
import { ScoreCalculator, createScore } from "../shared/scoreCalculator.js";
import thresholds from "../../config/thresholds.js";

const calculator = new ScoreCalculator();
const improvements = [];

calculator.addCategory("categoryName", maxPoints, () => {
  let score = 0;
  const details = [];

  if (condition) {
    score += points;
    details.push("Description positive");
  } else {
    details.push("Description négative");
    improvements.push("Suggestion d'amélioration");
  }

  return createScore(score, maxPoints, details.join(". "));
});

return calculator.calculate(improvements);
```

**Avantages :**

- ✅ Format de score uniforme
- ✅ Calcul automatique du grade (A, B, C, D, F)
- ✅ Gestion cohérente des améliorations
- ✅ Code plus lisible et maintenable

### Pattern Thresholds

Toutes les valeurs magiques sont centralisées dans `config/thresholds.js` :

```javascript
import thresholds from "../../config/thresholds.js";

// Au lieu de valeurs en dur
if (count > 25) {
  /* ... */
}

// Utiliser les thresholds
if (count > thresholds.category.subcategory.max) {
  /* ... */
}
```

**Avantages :**

- ✅ Modification centralisée des seuils
- ✅ Documentation inline de chaque seuil
- ✅ Cohérence entre tous les analyzers

### Pattern Error Handling

Gestion d'erreurs typée avec classes personnalisées :

```javascript
import { ValidationError, asyncHandler, wrapError } from "../utils/errors.js";

// Wrapper pour routes async (pas de try/catch nécessaire)
export const myRoute = asyncHandler(async (req, res) => {
  if (!req.body.data) {
    throw new ValidationError("data est requis");
  }

  // La logique métier
  const result = await analyzeData(req.body.data);
  res.json(result);
});
```

**Avantages :**

- ✅ Erreurs typées avec codes HTTP appropriés
- ✅ Pas de try/catch répétitifs
- ✅ Gestion centralisée dans le middleware errorHandler

## 🛠️ Technologies

### Dépendances principales

- **express** (^4.21.2) : Framework web
- **cors** (^2.8.5) : Gestion CORS
- **axios** (^1.7.9) : Requêtes HTTP
- **cheerio** (^1.0.0) : Parsing HTML (jQuery-like)
- **lighthouse** (^12.3.0) : Audit de performance et qualité
- **chrome-launcher** (^1.1.2) : Lancement de Chrome pour Lighthouse
- **postcss** (^8.4.49) : Traitement CSS
- **postcss-import** (^16.1.0) : Résolution des @import CSS
- **cssnano** (^7.0.6) : Minification CSS
- **@projectwallace/css-analyzer** (^5.15.0) : Analyse CSS avancée
- **culori** (^4.0.1) : Analyse des couleurs en espace OKLCH
- **dotenv** (^16.4.7) : Gestion des variables d'environnement
- **simplecrawler** (^1.1.9) : Crawling de sites web
- **jsdom** (^25.0.1) : DOM JavaScript
- **sharp** (^0.33.5) : Traitement d'images
- **fs-extra** (^11.2.0) : Opérations fichiers étendues

### Outils de développement

- **PostCSS** : Compilation et optimisation CSS
- **ESM** : Utilisation des modules ES6 (`type: "module"`)

## 📊 Format des résultats

Les fichiers JSON générés dans `data/` contiennent :

```json
{
  "pages": [
    {
      "file": "URL de la page",
      "title": "Titre de la page",
      "images": [...],
      "totalTags": 150,
      "externalLinks": 5,
      "internalLinks": 10,
      "deadLinks": 0,
      "favicon": true,
      "viewport": true,
      "mailtoLinks": 1,
      "headings": { "h1": 1, "h2": 3, ... },
      "outlineStructure": [...],
      "validationErrors": [...],
      "lighthouseReport": {
        "performance": 0.95,
        "accessibility": 0.88,
        "bestPractices": 0.92,
        "seo": 0.90,
        "viewport": 1,
        "errors": 1,
        "requests": [...]
      }
    }
  ],
  "globalAnalysis": {
    "tagsPresent": [...],
    "tagsMissing": [...],
    "obsoleteTags": [...],
    "obsoleteTagsUsage": {},
    "otherTags": [...],
    "otherTagsUsage": {}
  },
  "cssAnalysisResult": {
    // Statistiques détaillées de Project Wallace
  },
  "classAnalysis": {
    // Voir structure détaillée dans la section classAnalysisService.js
  }
}
```

## 📝 Notes

- Le crawler est limité à 3 niveaux de profondeur pour éviter les explorations trop longues
- Les imports de normalize.css sont automatiquement ignorés
- Les imports de Google Fonts sont exclus de la compilation CSS
- Le timeout des requêtes axios est configuré dans `config/thresholds.js`
- Lighthouse s'exécute en mode mobile par défaut

## 🔄 Refactorisation (Décembre 2024)

Le projet a été entièrement refactorisé pour améliorer la qualité du code :

### Amélioration des Métriques

- **Lignes de code réduites** : ~350 lignes éliminées par factorisation
- **Duplication** : Réduite de 40% à 10%
- **Complexité cyclomatique** : Réduite de 45% en moyenne
- **Maintenabilité** : Score amélioré de C- à A-

### Nouvelles Fonctionnalités

- ✅ **ScoreCalculator** : Pattern standardisé pour tous les scores
- ✅ **Thresholds centralisés** : 50+ constantes dans `config/thresholds.js`
- ✅ **Gestion d'erreurs typée** : Classes d'erreurs personnalisées
- ✅ **Services modulaires** : Organisation par domaine (css/, html/, shared/)
- ✅ **Fonctions réutilisables** : Parsing CSS, calculs statistiques

### Documentation Complète

Voir [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) pour :

- Détails de la refactorisation phase par phase
- Patterns de code établis
- Exemples d'utilisation
- Recommandations pour la maintenance

## 🔒 Sécurité

- Jeton exigé sur toutes les routes (`API_TOKEN`), CORS limité à `CORS_ORIGIN`
- Identifiants de projet validés (`^[a-z0-9-]+$`) et limités au fichier de promo
- Les données des étudiants (`data/`) ne sont jamais versionnées
- Tests : `npm test`
- Gestion des erreurs pour éviter les crashs

## 🧯 Fiabilité de l'analyse

- **Une étape qui échoue ne fait pas tout échouer** : elle est inscrite dans `nonMesurable` (`{ etape, raison }`) et ne compte dans aucun score. Le résultat est toujours enregistré.
- **Validation W3C** : vnu est lancé avec `--stdout` ; sans Java (`JAVA_BIN`), elle est « Non mesurable », jamais une erreur de l'étudiant.
- **Lighthouse** : une seule instance de Chrome par analyse, lancée avec `--no-sandbox` et `--disable-dev-shm-usage`, un délai maximal par page, et un écran de 360 px (`config/thresholds.js`). `CHROME_PATH` impose le Chromium du serveur.
- **Versions figées** : `package-lock.json` est versionné ; Node 22 au minimum (`engines`).
- **Stockage (F1)** : `DATA_DIR` peut pointer vers un disque persistant. Le disque de Render est effacé à chaque déploiement.

## 🚧 Limitations

- Nécessite Chrome installé sur le système (pour Lighthouse)
- Les analyses peuvent être longues pour les sites complexes
- Timeout de 5 secondes pour les requêtes externes

## 📄 Licence

ISC

## 👤 Auteur

Projet développé pour l'analyse de projets étudiants.
