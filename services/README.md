# Architecture des Services d'Analyse

## 📁 Structure

```
services/
├── css/                          # Modules d'analyse CSS
│   ├── cssCompiler.js           # Compilation et minification CSS
│   ├── cssImportsAnalyzer.js    # Analyse des @import
│   ├── cssVariablesAnalyzer.js  # Analyse des custom properties
│   └── cssTypographyAnalyzer.js # Analyse typographique complète
├── html/                         # Modules d'analyse HTML (à venir)
├── shared/                       # Utilitaires partagés
│   └── cssHelpers.js            # Helpers pour l'analyse CSS
├── cssAnalysisService.js         # Service façade (point d'entrée)
├── cssAnalysisService-old.js     # Ancien fichier monolithique (backup)
├── classAnalysisService.js       # Analyse des classes et BEM
├── fileScannerService.js         # Scanner de fichiers
├── githubService.js              # Service GitHub
└── validationService.js          # Validation des données
```

## 🎯 Modules CSS

### cssCompiler.js

**Responsabilité** : Compilation et minification du CSS

- `compileCSS(htmlContent, baseUrl)` : Compile et minifie le CSS
- `removeNormalizeCSSImports()` : Supprime les imports normalize.css
- `inlineRemoteCSS()` : Inline les imports distants

### cssImportsAnalyzer.js

**Responsabilité** : Analyse des règles @import

- `analyzeImports(cssContent, baseUrl)` : Analyse détaillée des imports
- Détection des types (external, relative, google-fonts)
- Catégorisation (base, components, layout, utils, vendor, etc.)
- Extraction et analyse des classes par import

### cssVariablesAnalyzer.js

**Responsabilité** : Analyse des custom properties CSS

- `analyzeCustomProperties(css)` : Analyse des variables CSS
- Détection des déclarations et utilisations
- Catégorisation (color, typography, spacing, layout, etc.)
- Détection des variables non utilisées ou non déclarées

### cssTypographyAnalyzer.js

**Responsabilité** : Analyse complète de la typographie

- `analyzeTypography(htmlContent, cssRawContent, compiledCss)` : Analyse principale
- `detectWebfontsInHtml()` : Détection des webfonts dans le HTML
- `detectWebfontsInCss()` : Détection des webfonts dans le CSS
- `analyzeFontSizeUnits()` : Analyse des unités de taille
- `calculateTypographyScore()` : Calcul du score sur 100

## 🛠️ Helpers Partagés

### cssHelpers.js

**Utilitaires réutilisables** :

- `isNormalizeCSS()` : Détecte normalize.css
- `isGoogleFont()` : Détecte Google Fonts
- `categorizeImportByPath()` : Catégorise un import
- `getImportType()` : Détermine le type d'import
- `extractClassNames()` : Extrait les classes du CSS
- `analyzeNamingConventions()` : Analyse les conventions de nommage
- `categorizeVariable()` : Catégorise une variable CSS
- `resolveVariable()` : Résout récursivement les var() CSS

## 📦 Service Façade

### cssAnalysisService.js

**Point d'entrée unique** pour préserver la rétrocompatibilité :

```javascript
import {
  compileCSS,
  analyzeImports,
  analyzeCustomProperties,
  analyzeTypography,
  analyzeCSS,
} from "./services/cssAnalysisService.js";
```

## ✅ Avantages de la Nouvelle Architecture

1. **Séparation des responsabilités**

   - Chaque module a une responsabilité unique et claire
   - Facilite la maintenance et les tests

2. **Réutilisabilité**

   - Les helpers sont centralisés dans `shared/`
   - Pas de duplication de code

3. **Testabilité**

   - Modules isolés faciles à tester unitairement
   - Dépendances explicites

4. **Scalabilité**

   - Facile d'ajouter de nouveaux analyseurs
   - Structure claire pour les contributions

5. **Lisibilité**

   - Fichiers plus courts et focalisés
   - Navigation facilitée dans le code

6. **Rétrocompatibilité**
   - La façade préserve l'API existante
   - Migration progressive possible

## 🔄 Migration

L'ancien fichier monolithique `cssAnalysisService-old.js` est conservé comme backup.
Pour revenir à l'ancienne version en cas de problème :

```bash
mv cssAnalysisService.js cssAnalysisService-new.js
mv cssAnalysisService-old.js cssAnalysisService.js
```

## 📈 Métriques

**Avant** : 1 fichier de ~1200 lignes
**Après** : 6 modules de ~100-400 lignes chacun

Réduction de la complexité par fichier : **-66%**

## 🚀 Prochaines Étapes

1. Ajouter des tests unitaires pour chaque module
2. Créer des modules HTML dans `services/html/`
3. Ajouter de la documentation JSDoc complète
4. Configurer ESLint/Prettier
5. Créer des benchmarks de performance
