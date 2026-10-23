/**
 * Service d'analyse des couleurs CSS
 * Analyse les couleurs, détecte les similarités, groupe par teinte
 * Utilise OKLCH pour une analyse perceptuellement uniforme
 */

import { parse, converter } from "culori";
import {
  ScoreCalculator,
  createScore,
  ratioToScore,
} from "../shared/scoreCalculator.js";
import thresholds from "../../config/thresholds.js";

/**
 * Parse une couleur CSS et la convertit en OKLCH
 * Supporte: hex, rgb, rgba, hsl, hsla, oklch, transparent, named colors
 * @param {string} color - La couleur CSS
 * @returns {{l: number, c: number, h: number, alpha: number}|null} - Valeurs OKLCH ou null
 */
const parseColor = (color) => {
  // Utiliser culori pour parser la couleur
  const parsed = parse(color);
  if (!parsed) return null;

  // Convertir en OKLCH
  const toOklch = converter("oklch");
  const oklch = toOklch(parsed);

  if (!oklch) return null;

  return {
    l: oklch.l ?? 0,
    c: oklch.c ?? 0,
    h: oklch.h ?? 0,
    alpha: oklch.alpha ?? 1,
  };
};

/**
 * Calcule la différence minimale entre deux teintes (gère la circularité)
 * @param {number} h1 - Première teinte (0-360)
 * @param {number} h2 - Deuxième teinte (0-360)
 * @returns {number} - Différence minimale
 */
const minHueDiff = (h1, h2) => {
  if (h1 === undefined || h2 === undefined) return 0;
  let diff = Math.abs(h1 - h2);
  if (diff > 180) diff = 360 - diff;
  return diff;
};

/**
 * Vérifie si une couleur est transparente
 * @param {string} color - La couleur CSS
 * @returns {boolean}
 */
const isTransparent = (color) => {
  const oklch = parseColor(color);
  return oklch ? oklch.alpha < 1 : false;
};

/**
 * Vérifie si deux couleurs sont similaires en utilisant OKLCH
 * Utilise des seuils perceptuellement uniformes
 * @param {string} color1 - Première couleur
 * @param {string} color2 - Deuxième couleur
 * @param {number} lightnessThreshold - Seuil de différence de luminosité
 * @param {number} chromaThreshold - Seuil de différence de chroma
 * @param {number} hueThreshold - Seuil de différence de teinte en degrés
 * @returns {boolean}
 */
const areColorsSimilar = (
  color1,
  color2,
  lightnessThreshold = thresholds.colors.similarity.lightness,
  chromaThreshold = thresholds.colors.similarity.chroma,
  hueThreshold = thresholds.colors.similarity.hue
) => {
  const oklch1 = parseColor(color1);
  const oklch2 = parseColor(color2);

  if (!oklch1 || !oklch2) return false;

  // Pour les couleurs achromatiques (gris), utiliser un seuil plus strict
  // Permet d'accepter ~10 niveaux de gris réguliers sans les marquer comme similaires
  if (
    oklch1.c < thresholds.colors.similarity.achromaticChroma &&
    oklch2.c < thresholds.colors.similarity.achromaticChroma
  ) {
    return (
      Math.abs(oklch1.l - oklch2.l) <
      thresholds.colors.similarity.grayLightnessDiff
    );
  }

  const deltaL = Math.abs(oklch1.l - oklch2.l);
  const deltaC = Math.abs(oklch1.c - oklch2.c);
  const deltaH = minHueDiff(oklch1.h, oklch2.h);

  return (
    deltaL < lightnessThreshold &&
    deltaC < chromaThreshold &&
    deltaH < hueThreshold
  );
};

/**
 * Groupe les couleurs par gamme de teinte OKLCH (perceptuellement correct)
 * @param {Array<{color: string, count: number}>} colors - Liste des couleurs avec leur fréquence
 * @param {number} hueRangeSize - Taille de la gamme de teinte
 * @returns {Array<{hueRange: number, colors: Array}>} - Couleurs groupées par teinte
 */
const groupColorsByHue = (
  colors,
  hueRangeSize = thresholds.colors.hueRangeSize
) => {
  const groups = {};
  const achromaticColors = []; // Gris, noir, blanc (chroma faible)

  colors.forEach(({ color, count }) => {
    const oklch = parseColor(color);
    if (!oklch) return;

    // Couleurs achromatiques (chroma très faible)
    if (oklch.c < thresholds.colors.similarity.achromaticChroma) {
      achromaticColors.push({ color, count, oklch });
      return;
    }

    // Grouper par gamme de teinte
    const hueGroup = Math.floor(oklch.h / hueRangeSize) * hueRangeSize;

    if (!groups[hueGroup]) {
      groups[hueGroup] = [];
    }

    groups[hueGroup].push({ color, count, oklch });
  });

  // Convertir en tableau
  const result = Object.entries(groups).map(([hue, colors]) => ({
    hueRange: parseInt(hue),
    hueName: getHueName(parseInt(hue)),
    colors,
  }));

  // Trier par teinte
  result.sort((a, b) => a.hueRange - b.hueRange);

  // Ajouter le groupe achromatique à la fin s'il existe
  if (achromaticColors.length > 0) {
    result.push({
      hueRange: -1,
      hueName: "Achromatique (Gris/Noir/Blanc)",
      colors: achromaticColors,
    });
  }

  return result;
};

/**
 * Retourne le nom de la gamme de teinte OKLCH (perceptuellement correct)
 * Les angles sont adaptés à l'espace OKLCH
 * @param {number} hue - Teinte OKLCH (0-360)
 * @returns {string} - Nom de la couleur
 */
const getHueName = (hue) => {
  if (hue >= 0 && hue < 40) return "Rouge";
  if (hue >= 40 && hue < 80) return "Orange";
  if (hue >= 80 && hue < 130) return "Jaune";
  if (hue >= 130 && hue < 180) return "Vert";
  if (hue >= 180 && hue < 240) return "Cyan";
  if (hue >= 240 && hue < 300) return "Bleu";
  if (hue >= 300 && hue < 360) return "Magenta/Rose";
  return "Inconnu";
};

/**
 * Détecte les couleurs similaires dans une liste
 * @param {Array<{color: string, count: number}>} colors - Liste des couleurs
 * @returns {Array<{color: string, count: number, isSimilar: boolean, similarTo: string[]}>}
 */
const detectSimilarColors = (colors) => {
  const result = colors.map((item) => ({
    ...item,
    isSimilar: false,
    similarTo: [],
  }));

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      if (areColorsSimilar(result[i].color, result[j].color)) {
        result[i].isSimilar = true;
        result[j].isSimilar = true;
        result[i].similarTo.push(result[j].color);
        result[j].similarTo.push(result[i].color);
      }
    }
  }

  return result;
};

/**
 * Calcule un score de qualité pour l'utilisation des couleurs
 * Utilise ScoreCalculator pour une logique standardisée
 * @param {object} colorData - Données d'analyse des couleurs
 * @returns {{total: number, breakdown: object, grade: string, improvements: string[]}}
 */
const calculateColorsScore = (colorData) => {
  const {
    totalColors,
    uniqueColors,
    transparentColors,
    opaqueColors,
    similarColorsCount,
    colorGroups,
    formats,
  } = colorData;

  const improvements = [];
  const calculator = new ScoreCalculator();

  // 1) Palette de couleurs (30 points)
  calculator.addCategory(
    "palette",
    thresholds.scoring.points.colorsPalette,
    () => {
      const { uniqueColorsMin, uniqueColorsMax } = thresholds.colors.optimal;
      const { idealRange, tooManyThreshold, maxUniqueColors } =
        thresholds.colors.scores;

      let score = 0;
      let details = "";
      let improvement = null;

      if (uniqueColors >= idealRange[0] && uniqueColors <= idealRange[1]) {
        score = 30;
        details = "Palette de couleurs optimale. ";
      } else if (
        uniqueColors >= uniqueColorsMin &&
        uniqueColors < idealRange[0]
      ) {
        score = 25;
        details = "Palette limitée mais acceptable. ";
      } else if (
        uniqueColors >= idealRange[1] &&
        uniqueColors <= tooManyThreshold
      ) {
        score = 22;
        details = "Palette un peu large. ";
      } else if (
        uniqueColors > tooManyThreshold &&
        uniqueColors <= maxUniqueColors
      ) {
        score = 15;
        details = "Palette large. ";
        improvement =
          "Réduire le nombre de couleurs : utiliser une palette limitée (8-15 couleurs)";
      } else if (uniqueColors > maxUniqueColors) {
        score = 8;
        details = "Trop de couleurs différentes. ";
        improvement =
          "Réduire le nombre de couleurs : utiliser une palette limitée (8-15 couleurs)";
      } else {
        score = 18;
        details = "Palette très limitée. ";
      }

      if (improvement) improvements.push(improvement);
      return createScore(score, 30, details, improvement);
    }
  );

  // 2) Cohérence (25 points) - Pénaliser les couleurs similaires
  calculator.addCategory(
    "consistency",
    thresholds.scoring.points.colorsConsistency,
    () => {
      const similarityRatio =
        uniqueColors > 0 ? similarColorsCount / uniqueColors : 0;

      let score = 0;
      let details = "";
      let improvement = null;

      if (similarityRatio === 0) {
        score = 25;
        details = "Aucune couleur similaire détectée. ";
      } else if (similarityRatio < 0.25) {
        score = 22;
        details = "Quelques couleurs similaires. ";
      } else if (similarityRatio < 0.5) {
        score = 15;
        details = "Plusieurs couleurs similaires détectées. ";
        improvement =
          "Harmoniser les couleurs similaires pour améliorer la cohérence";
      } else if (similarityRatio < 0.7) {
        score = 8;
        details = "Beaucoup de couleurs similaires. ";
        improvement =
          "Harmoniser les couleurs similaires pour améliorer la cohérence";
      } else {
        score = 3;
        details = "Trop de couleurs similaires (manque de cohérence). ";
        improvement =
          "Harmoniser les couleurs similaires pour améliorer la cohérence";
      }

      if (improvement) improvements.push(improvement);
      return createScore(score, 25, details, improvement);
    }
  );

  // 3) Formats (20 points) - Encourager l'uniformité
  calculator.addCategory("formats", 20, () => {
    const formatCount = Object.keys(formats).length;
    let score = 0;
    let details = "";
    let improvement = null;

    if (formatCount === 1) {
      score = 20;
      details = "Format de couleur uniforme. ";
    } else if (formatCount === 2) {
      score = 17;
      details = "2 formats de couleurs utilisés. ";
    } else if (formatCount === 3) {
      score = 14;
      details = "3 formats de couleurs utilisés. ";
      improvement =
        "Uniformiser les formats de couleurs (privilégier oklch ou hsl)";
    } else if (formatCount === 4) {
      score = 10;
      details = "4 formats de couleurs utilisés. ";
      improvement =
        "Uniformiser les formats de couleurs (privilégier oklch ou hsl)";
    } else {
      score = 6;
      details = "Trop de formats différents. ";
      improvement =
        "Uniformiser les formats de couleurs (privilégier oklch ou hsl)";
    }

    // Bonus pour formats modernes (oklch, hsl)
    if (formats.oklch || formats.hsl) {
      score += 5;
      details += "Format moderne détecté. ";
    } else if (!improvement) {
      improvement =
        "Envisager l'utilisation de formats modernes comme oklch ou hsl";
    }

    if (improvement) improvements.push(improvement);
    return createScore(Math.min(score, 20), 20, details, improvement);
  });

  // 4) Transparence (15 points)
  calculator.addCategory("transparency", 15, () => {
    const transparencyRatio =
      totalColors > 0 ? transparentColors.length / totalColors : 0;
    let score = 0;
    let details = "";

    if (transparencyRatio > 0 && transparencyRatio < 0.3) {
      score = 15;
      details = "Utilisation appropriée de la transparence. ";
    } else if (transparencyRatio >= 0.3 && transparencyRatio < 0.5) {
      score = 10;
      details = "Transparence fréquente. ";
    } else if (transparencyRatio >= 0.5) {
      score = 5;
      details = "Trop de couleurs transparentes. ";
    } else {
      score = 12;
      details = "Pas de transparence utilisée. ";
    }

    return createScore(score, 15, details);
  });

  // 5) Bonnes pratiques (10 points)
  calculator.addCategory("bestPractices", 10, () => {
    let score = 0;
    let details = "";
    const improvementsLocal = [];

    // Groupes de teintes diversifiés
    if (colorGroups.length >= 3 && colorGroups.length <= 6) {
      score += 5;
      details = "Bonne diversité de teintes. ";
    } else if (colorGroups.length < 3) {
      details = "Palette monotone. ";
    } else {
      details = "Trop de gammes de teintes. ";
      improvementsLocal.push(
        "Limiter les gammes de teintes pour une palette plus cohérente"
      );
    }

    // Utilisation de variables CSS (bonus si détecté)
    if (opaqueColors.some((c) => c.color.includes("var("))) {
      score += 5;
      details += "Variables CSS utilisées. ";
    } else {
      improvementsLocal.push(
        "Utiliser des variables CSS pour gérer les couleurs"
      );
    }

    improvementsLocal.forEach((imp) => improvements.push(imp));
    return createScore(score, 10, details);
  });

  // Calculer et retourner le résultat
  const result = calculator.calculate();

  // Ajouter les améliorations collectées
  result.improvements = [...new Set([...result.improvements, ...improvements])];

  return result;
};

/**
 * Analyse les couleurs CSS à partir des données de Project Wallace
 * @param {object} projectWallaceColors - Données colors de Project Wallace
 * @returns {object} - Analyse complète des couleurs
 */
export const analyzeColors = (projectWallaceColors) => {
  console.log(`🎨 Analyse des couleurs CSS (OKLCH)...`);

  if (!projectWallaceColors || !projectWallaceColors.unique) {
    console.log(`⚠️ Aucune donnée de couleur fournie`);
    return {
      totalColors: 0,
      uniqueColors: 0,
      colors: [],
      transparentColors: [],
      opaqueColors: [],
      colorGroups: [],
      similarColors: [],
      formats: {},
      score: {
        total: 0,
        breakdown: {},
        grade: "N/A",
        improvements: ["Aucune couleur détectée dans le CSS"],
      },
    };
  }

  // Normaliser et fusionner les couleurs (casse insensible pour les hex)
  const normalizedColors = {};
  Object.entries(projectWallaceColors.unique).forEach(([color, count]) => {
    // Normaliser en minuscules pour les couleurs hex
    const normalized = color.trim().toLowerCase();
    normalizedColors[normalized] = (normalizedColors[normalized] || 0) + count;
  });

  // Convertir l'objet normalisé en tableau
  const colorsArray = Object.entries(normalizedColors).map(
    ([color, count]) => ({ color, count })
  );

  // Séparer couleurs transparentes et opaques
  const transparentColors = colorsArray.filter((item) =>
    isTransparent(item.color)
  );
  const opaqueColors = colorsArray.filter((item) => !isTransparent(item.color));

  // Détecter les couleurs similaires (seulement dans les couleurs opaques)
  const opaqueWithSimilarity = detectSimilarColors(opaqueColors);
  const similarColorsCount = opaqueWithSimilarity.filter(
    (c) => c.isSimilar
  ).length;

  // Grouper par teinte
  const colorGroups = groupColorsByHue(opaqueColors);

  // Détecter les formats utilisés
  const formats = {};
  colorsArray.forEach(({ color }) => {
    const trimmed = color.trim().toLowerCase();
    if (trimmed === "transparent") {
      formats.transparent = (formats.transparent || 0) + 1;
    } else if (trimmed.startsWith("#")) {
      formats.hex = (formats.hex || 0) + 1;
    } else if (trimmed.startsWith("rgb")) {
      formats.rgb = (formats.rgb || 0) + 1;
    } else if (trimmed.startsWith("hsl")) {
      formats.hsl = (formats.hsl || 0) + 1;
    } else if (trimmed.startsWith("oklch")) {
      formats.oklch = (formats.oklch || 0) + 1;
    } else if (trimmed.includes("var(")) {
      formats.variable = (formats.variable || 0) + 1;
    } else {
      formats.named = (formats.named || 0) + 1;
    }
  });

  // Calculer le score
  const score = calculateColorsScore({
    totalColors: projectWallaceColors.total,
    uniqueColors: Object.keys(normalizedColors).length, // Utiliser le nombre de couleurs normalisées
    transparentColors,
    opaqueColors: opaqueWithSimilarity,
    similarColorsCount,
    colorGroups,
    formats,
  });

  const result = {
    totalColors: projectWallaceColors.total,
    uniqueColors: Object.keys(normalizedColors).length, // Utiliser le nombre de couleurs normalisées
    colors: colorsArray,
    transparentColors,
    opaqueColors: opaqueWithSimilarity,
    colorGroups,
    similarColors: opaqueWithSimilarity.filter((c) => c.isSimilar),
    hasSimilarColors: similarColorsCount > 0,
    formats,
    score,
  };

  console.log(
    `✅ Analyse des couleurs terminée (OKLCH). Score: ${score.total}/100 (${score.grade})`
  );

  return result;
};
