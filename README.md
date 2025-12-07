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

### Analyser un projet

Pour analyser un projet web, effectuez une requête GET vers :

```
GET /scan?url=<URL_DU_PROJET>&projectName=<NOM_DU_PROJET>
```

**Exemple** :

```bash
curl "http://localhost:3000/scan?url=https://example.com&projectName=MonProjet"
```

### Récupérer la liste des projets

```
GET /scan/projects
```

Retourne un tableau avec les noms de tous les projets analysés.

### Récupérer les données d'un projet

```
GET /scan/project/:projectName
```

**Exemple** :

```bash
curl "http://localhost:3000/scan/project/MonProjet"
```

## 🏗️ Architecture

```
project-analysis-backend/
├── index.js                          # Point d'entrée de l'application
├── package.json                      # Dépendances et scripts
├── render.yaml                       # Configuration de déploiement
├── postcss.config.js                 # Configuration PostCSS
├── controllers/                      # Contrôleurs de routes
│   ├── analysisControllerGithub.js   # Analyse de repos GitHub (désactivé)
│   └── analysisControllerServer.js   # Analyse d'URLs en ligne
├── routes/                           # Définition des routes
│   └── scan.js                       # Routes d'analyse
├── services/                         # Logique métier
│   ├── analysisService.js            # Analyse HTML et Lighthouse
│   ├── cssAnalysisService.js         # Analyse et compilation CSS
│   ├── fileScannerService.js         # Crawling de pages
│   ├── githubService.js              # Interaction avec l'API GitHub
│   └── validationService.js          # Validation W3C
├── utils/                            # Utilitaires
│   └── helpers.js                    # Fonctions helper (vide)
└── data/                             # Résultats d'analyse (JSON)
    └── *.json                        # Un fichier par projet
```

## 🔌 API Endpoints

### `GET /scan`

Analyse un projet web à partir de son URL.

**Paramètres (query string)** :

- `url` (string, requis) : URL du projet à analyser
- `projectName` (string, requis) : Nom du projet pour la sauvegarde

**Réponse** :

```json
{
  "message": "Project MonProjet saved successfully",
  "analysisResult": {
    "pages": [...],
    "globalAnalysis": {...},
    "cssAnalysisResult": {...},
    "classAnalysis": {...}
  }
}
```

### `GET /scan/projects`

Récupère la liste de tous les projets analysés.

**Réponse** :

```json
["Projet1", "Projet2", "Projet3"]
```

### `GET /scan/project/:projectName`

Récupère les données d'analyse d'un projet spécifique.

**Paramètres** :

- `projectName` (string) : Nom du projet

**Réponse** : Objet JSON contenant l'analyse complète du projet.

## 📦 Services

### analysisService.js

Service principal d'analyse HTML et Lighthouse.

#### Fonctions principales :

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

**`fetchAndCompileCss(url, visited)`**

- Récupère et compile récursivement le CSS
- **Paramètres** : `url` (string), `visited` (Set) - URLs déjà visitées
- **Retourne** : CSS compilé

### cssAnalysisService.js

Service de compilation et d'analyse CSS.

#### Fonctions principales :

**`compileCSS(htmlContent, baseUrl)`**

- Compile le CSS en résolvant tous les @import et le minifie
- Supprime automatiquement les imports de normalize.css
- **Paramètres** : `htmlContent` (string), `baseUrl` (string)
- **Retourne** : CSS compilé et minifié
- **Process** :
  1. Détecte le fichier CSS principal dans le HTML
  2. Télécharge le CSS
  3. Supprime les imports normalize.css
  4. Résout les imports distants et relatifs
  5. Compile avec PostCSS
  6. Minifie avec cssnano

**`analyzeCSS(css)`**

- Analyse le CSS avec Project Wallace
- **Paramètres** : `css` (string) - CSS compilé
- **Retourne** : Statistiques CSS détaillées (sélecteurs, propriétés, complexité, etc.)

**`inlineRemoteCSS(cssContent, currentUrl)` (interne)**

- Remplace les @import par leur contenu
- Ignore les imports de Google Fonts
- Gère les imports absolus et relatifs

**`removeNormalizeCSSImports(cssContent)` (interne)**

- Supprime les imports de normalize.css

**`isNormalizeCSS(importPath)` (interne)**

- Vérifie si un import correspond à normalize.css

### fileScannerService.js

Service de crawling de pages HTML.

#### Fonctions principales :

**`HtmlCrawler(baseUrl)`**

- Explore un site web pour trouver toutes les pages HTML
- **Paramètres** : `baseUrl` (string) - URL de départ
- **Retourne** : Promise résolue avec un array d'URLs uniques
- **Configuration** :
  - Profondeur maximale : 3 niveaux
  - Filtre par domaine : oui
  - Normalisation des URLs (/ et /index.html)

### githubService.js

Service d'interaction avec l'API GitHub.

#### Fonctions principales :

**`getRepositoryFiles(repoOwner, repoName)`**

- Récupère la liste des fichiers d'un repository GitHub
- **Paramètres** : `repoOwner` (string), `repoName` (string)
- **Retourne** : Array de fichiers avec métadonnées

### validationService.js

Service de validation HTML W3C.

#### Fonctions principales :

**`validateHTML(htmlContent)`**

- Valide le HTML avec le validateur W3C
- **Paramètres** : `htmlContent` (string)
- **Retourne** : Array d'erreurs de validation
- **API** : https://validator.w3.org/nu/?out=json

### classAnalysisService.js

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
- Le timeout des requêtes axios est fixé à 5 secondes
- Lighthouse s'exécute en mode mobile par défaut

## 🔒 Sécurité

- CORS activé pour permettre les requêtes cross-origin
- Validation des paramètres d'entrée
- Gestion des erreurs pour éviter les crashs

## 🚧 Limitations

- Nécessite Chrome installé sur le système (pour Lighthouse)
- Les analyses peuvent être longues pour les sites complexes
- Timeout de 5 secondes pour les requêtes externes

## 📄 Licence

ISC

## 👤 Auteur

Projet développé pour l'analyse de projets étudiants.
