/**
 * Service d'analyse des couleurs CSS
 * Analyse les couleurs, détecte les similarités, groupe par teinte
 * Utilise OKLCH pour une analyse perceptuellement uniforme
 */

import { parse, converter } from "culori";

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
 * @param {number} lightnessThreshold - Seuil de différence de luminosité (défaut: 0.09)
 * @param {number} chromaThreshold - Seuil de différence de chroma (défaut: 0.06)
 * @param {number} hueThreshold - Seuil de différence de teinte en degrés (défaut: 35)
 * @returns {boolean}
 */
const areColorsSimilar = (
  color1,
  color2,
  lightnessThreshold = 0.1,
  chromaThreshold = 0.06,
  hueThreshold = 35
) => {
  const oklch1 = parseColor(color1);
  const oklch2 = parseColor(color2);

  if (!oklch1 || !oklch2) return false;

  // Pour les couleurs achromatiques (gris), utiliser un seuil plus strict
  // Permet d'accepter ~10 niveaux de gris réguliers sans les marquer comme similaires
  if (oklch1.c < 0.02 && oklch2.c < 0.02) {
    return Math.abs(oklch1.l - oklch2.l) < 0.07;
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
 * @param {number} hueRangeSize - Taille de la gamme de teinte (défaut: 40 degrés)
 * @returns {Array<{hueRange: number, colors: Array}>} - Couleurs groupées par teinte
 */
const groupColorsByHue = (colors, hueRangeSize = 40) => {
  const groups = {};
  const achromaticColors = []; // Gris, noir, blanc (chroma faible)

  colors.forEach(({ color, count }) => {
    const oklch = parseColor(color);
    if (!oklch) return;

    // Couleurs achromatiques (chroma très faible)
    if (oklch.c < 0.02) {
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

  const scores = {
    palette: { score: 0, max: 30, details: "" },
    consistency: { score: 0, max: 25, details: "" },
    formats: { score: 0, max: 20, details: "" },
    transparency: { score: 0, max: 15, details: "" },
    bestPractices: { score: 0, max: 10, details: "" },
  };

  // 1) Palette de couleurs (30 points)
  // Palette optimale : 8-15 couleurs uniques
  if (uniqueColors >= 8 && uniqueColors <= 15) {
    scores.palette.score = 30;
    scores.palette.details = "Palette de couleurs optimale. ";
  } else if (uniqueColors >= 5 && uniqueColors < 8) {
    scores.palette.score = 25;
    scores.palette.details = "Palette limitée mais acceptable. ";
  } else if (uniqueColors >= 16 && uniqueColors <= 20) {
    scores.palette.score = 20;
    scores.palette.details = "Palette un peu large. ";
  } else if (uniqueColors > 20) {
    scores.palette.score = 10;
    scores.palette.details = "Trop de couleurs différentes. ";
  } else {
    scores.palette.score = 15;
    scores.palette.details = "Palette très limitée. ";
  }

  // 2) Cohérence (25 points) - Pénaliser les couleurs similaires
  const similarityRatio =
    uniqueColors > 0 ? similarColorsCount / uniqueColors : 0;

  if (similarityRatio === 0) {
    scores.consistency.score = 25;
    scores.consistency.details = "Aucune couleur similaire détectée. ";
  } else if (similarityRatio < 0.2) {
    scores.consistency.score = 20;
    scores.consistency.details = "Quelques couleurs similaires. ";
  } else if (similarityRatio < 0.4) {
    scores.consistency.score = 10;
    scores.consistency.details = "Plusieurs couleurs similaires détectées. ";
  } else {
    scores.consistency.score = 0;
    scores.consistency.details =
      "Beaucoup de couleurs similaires (manque de cohérence). ";
  }

  // 3) Formats (20 points) - Encourager l'uniformité
  const formatCount = Object.keys(formats).length;

  if (formatCount === 1) {
    scores.formats.score = 20;
    scores.formats.details = "Format de couleur uniforme. ";
  } else if (formatCount === 2) {
    scores.formats.score = 15;
    scores.formats.details = "2 formats de couleurs utilisés. ";
  } else if (formatCount === 3) {
    scores.formats.score = 10;
    scores.formats.details = "3 formats de couleurs utilisés. ";
  } else {
    scores.formats.score = 5;
    scores.formats.details = "Trop de formats différents. ";
  }

  // Bonus pour formats modernes (oklch, hsl)
  if (formats.oklch || formats.hsl) {
    scores.formats.score += 5;
    scores.formats.details += "Format moderne détecté. ";
  }

  // 4) Transparence (15 points)
  const transparencyRatio =
    totalColors > 0 ? transparentColors.length / totalColors : 0;

  if (transparencyRatio > 0 && transparencyRatio < 0.3) {
    scores.transparency.score = 15;
    scores.transparency.details = "Utilisation appropriée de la transparence. ";
  } else if (transparencyRatio >= 0.3 && transparencyRatio < 0.5) {
    scores.transparency.score = 10;
    scores.transparency.details = "Transparence fréquente. ";
  } else if (transparencyRatio >= 0.5) {
    scores.transparency.score = 5;
    scores.transparency.details = "Trop de couleurs transparentes. ";
  } else {
    scores.transparency.score = 12;
    scores.transparency.details = "Pas de transparence utilisée. ";
  }

  // 5) Bonnes pratiques (10 points)
  // Groupes de teintes diversifiés
  if (colorGroups.length >= 3 && colorGroups.length <= 6) {
    scores.bestPractices.score += 5;
    scores.bestPractices.details = "Bonne diversité de teintes. ";
  } else if (colorGroups.length < 3) {
    scores.bestPractices.details = "Palette monotone. ";
  } else {
    scores.bestPractices.details = "Trop de gammes de teintes. ";
  }

  // Utilisation de variables CSS (bonus si détecté)
  if (opaqueColors.some((c) => c.color.includes("var("))) {
    scores.bestPractices.score += 5;
    scores.bestPractices.details += "Variables CSS utilisées. ";
  }

  // Total et grade
  const total = Object.values(scores).reduce((sum, s) => sum + s.score, 0);
  let grade;
  if (total >= 90) grade = "A";
  else if (total >= 80) grade = "B";
  else if (total >= 70) grade = "C";
  else if (total >= 60) grade = "D";
  else grade = "F";

  // Recommandations
  const improvements = [];

  if (uniqueColors > 20) {
    improvements.push(
      "Réduire le nombre de couleurs : utiliser une palette limitée (8-15 couleurs)"
    );
  }

  if (similarityRatio > 0.3) {
    improvements.push(
      "Harmoniser les couleurs similaires pour améliorer la cohérence"
    );
  }

  if (formatCount > 2) {
    improvements.push(
      "Uniformiser les formats de couleurs (privilégier oklch ou hsl)"
    );
  }

  if (!formats.oklch && !formats.hsl) {
    improvements.push(
      "Envisager l'utilisation de formats modernes comme oklch ou hsl"
    );
  }

  if (colorGroups.length > 6) {
    improvements.push(
      "Limiter les gammes de teintes pour une palette plus cohérente"
    );
  }

  if (!opaqueColors.some((c) => c.color.includes("var("))) {
    improvements.push("Utiliser des variables CSS pour gérer les couleurs");
  }

  return { total, breakdown: scores, grade, improvements };
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

  // Convertir l'objet unique en tableau
  const colorsArray = Object.entries(projectWallaceColors.unique).map(
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
    uniqueColors: projectWallaceColors.totalUnique,
    transparentColors,
    opaqueColors: opaqueWithSimilarity,
    similarColorsCount,
    colorGroups,
    formats,
  });

  const result = {
    totalColors: projectWallaceColors.total,
    uniqueColors: projectWallaceColors.totalUnique,
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
