/**
 * Analyse les images HTML et calcule un score de qualité
 * basé sur l'accessibilité, la performance et les bonnes pratiques.
 */

/**
 * Détecte le format d'une image en combinant l'extension et le MIME type
 * @param {string} src - L'URL source de l'image
 * @param {object} lighthouseRequest - La requête Lighthouse correspondante
 * @returns {string} - Format de l'image (avif, webp, jpg, png, svg, gif, unknown)
 */
const detectImageFormat = (src, lighthouseRequest) => {
  // Priorité 1 : Extension du fichier
  const ext = src.split(".").pop().toLowerCase().split("?")[0];
  const validExtensions = ["avif", "webp", "jpg", "jpeg", "png", "svg", "gif"];
  const extFormat = validExtensions.includes(ext) ? ext : "unknown";

  // Priorité 2 : MIME type de Lighthouse
  if (lighthouseRequest?.mimeType) {
    const mimeMap = {
      "image/avif": "avif",
      "image/webp": "webp",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/gif": "gif",
      "application/octet-stream": extFormat, // Fallback sur extension
    };
    return mimeMap[lighthouseRequest.mimeType] || extFormat;
  }

  return extFormat;
};

/**
 * Enrichit les données images avec les informations réseau de Lighthouse
 * @param {Array} images - Liste des images extraites du HTML
 * @param {Array} lighthouseRequests - Requêtes réseau de Lighthouse
 * @param {string} baseUrl - URL de base pour résoudre les chemins relatifs
 * @returns {Array} - Images enrichies avec resourceSize, mimeType, format
 */
const enrichImagesWithNetworkData = (images, lighthouseRequests, baseUrl) => {
  if (!lighthouseRequests || !Array.isArray(lighthouseRequests)) {
    return images.map((img) => ({
      ...img,
      resourceSize: null,
      mimeType: null,
      format: detectImageFormat(img.src, null),
    }));
  }

  return images.map((image) => {
    try {
      // Résoudre l'URL complète
      const fullUrl = new URL(image.src, baseUrl).href;

      // Trouver la requête correspondante
      const request = lighthouseRequests.find(
        (req) => req.resourceType === "Image" && req.url === fullUrl
      );

      return {
        ...image,
        resourceSize: request?.resourceSize || null,
        mimeType: request?.mimeType || null,
        format: detectImageFormat(image.src, request),
      };
    } catch (error) {
      // En cas d'erreur de parsing d'URL
      return {
        ...image,
        resourceSize: null,
        mimeType: null,
        format: detectImageFormat(image.src, null),
      };
    }
  });
};

/**
 * Détermine si une image est décorative selon les meilleures pratiques W3C
 * Une image décorative a un alt vide (alt="") et/ou aria-hidden="true"
 * @param {object} image - Objet image avec alt et ariaHidden
 * @returns {boolean}
 */
const isDecorativeImage = (image) => {
  return (
    image.alt === "" || image.alt === "No alt" || image.ariaHidden === "true"
  );
};

/**
 * Calcule la qualité d'un texte alternatif
 * @param {string} alt - Texte alternatif
 * @returns {string} - 'good', 'poor', 'missing'
 */
const evaluateAltQuality = (alt) => {
  if (!alt || alt === "No alt" || alt === "") return "missing";

  // Alt trop court ou générique
  const genericTerms = ["image", "photo", "picture", "img", "icon"];
  const isGeneric = genericTerms.some(
    (term) => alt.toLowerCase().includes(term) && alt.length < 15
  );

  if (alt.length < 5 || isGeneric) return "poor";

  return "good";
};

/**
 * Calcule un score de qualité pour les images HTML
 * @param {object} data - Données d'analyse des images
 * @returns {object} - Score avec breakdown, grade et improvements
 */
const calculateImagesScore = (data) => {
  const {
    totalImages,
    imagesWithAlt,
    imagesWithoutAlt,
    imagesWithGoodAlt,
    imagesWithPoorAlt,
    decorativeImages,
    contentImages,
    imagesWithLazyLoading,
    averageWeight,
    top5AverageWeight,
    formats,
    decorativeRatio,
  } = data;

  const scores = {
    accessibility: { score: 0, max: 35, details: "" },
    performance: { score: 0, max: 35, details: "" },
    bestPractices: { score: 0, max: 30, details: "" },
  };

  // ===== 1. ACCESSIBILITÉ (35 points) =====

  if (totalImages === 0) {
    scores.accessibility.details = "Aucune image détectée.";
    scores.performance.details = "Aucune image détectée.";
    scores.bestPractices.details = "Aucune image détectée.";

    return {
      total: 100,
      breakdown: scores,
      grade: "A",
      improvements: ["Aucune image à optimiser."],
    };
  }

  // 1.1 Présence d'alt (15 points)
  const altPresenceRatio = imagesWithAlt / totalImages;
  if (altPresenceRatio >= 0.9) scores.accessibility.score += 15;
  else if (altPresenceRatio >= 0.75) scores.accessibility.score += 13;
  else if (altPresenceRatio >= 0.6) scores.accessibility.score += 10;
  else if (altPresenceRatio >= 0.4) scores.accessibility.score += 7;
  else scores.accessibility.score += 4;

  // 1.2 Qualité des alt (10 points)
  const goodAltRatio = imagesWithGoodAlt / Math.max(contentImages, 1);
  if (goodAltRatio >= 0.8) scores.accessibility.score += 10;
  else if (goodAltRatio >= 0.6) scores.accessibility.score += 8;
  else if (goodAltRatio >= 0.4) scores.accessibility.score += 6;
  else if (goodAltRatio >= 0.25) scores.accessibility.score += 4;
  else scores.accessibility.score += 2;

  // 1.3 Images décoratives bien marquées (10 points)
  if (decorativeRatio >= 0.1 && decorativeRatio <= 0.25) {
    scores.accessibility.score += 10;
  } else if (
    decorativeRatio < 0.1 ||
    (decorativeRatio > 0.25 && decorativeRatio <= 0.35)
  ) {
    scores.accessibility.score += 8;
  } else if (decorativeRatio <= 0.45) {
    scores.accessibility.score += 5;
  } else {
    scores.accessibility.score += 2;
  }

  scores.accessibility.details = `${imagesWithAlt}/${totalImages} images avec alt (${Math.round(
    altPresenceRatio * 100
  )}%), ${imagesWithGoodAlt} alt de qualité, ${decorativeImages} décoratives (${Math.round(
    decorativeRatio * 100
  )}%)`;

  // ===== 2. PERFORMANCE (35 points) =====

  // 2.1 Lazy loading (20 points) - Optimal : 40-90%
  const lazyLoadingRatio = imagesWithLazyLoading / totalImages;
  if (lazyLoadingRatio >= 0.4 && lazyLoadingRatio <= 0.9) {
    scores.performance.score += 20;
  } else if (lazyLoadingRatio >= 0.25 && lazyLoadingRatio < 0.4) {
    scores.performance.score += 17;
  } else if (lazyLoadingRatio > 0.9 && lazyLoadingRatio <= 0.95) {
    scores.performance.score += 16;
  } else if (lazyLoadingRatio >= 0.1 || lazyLoadingRatio > 0.95) {
    scores.performance.score += 12;
  } else {
    scores.performance.score += 7;
  }

  // 2.2 Poids optimisé (15 points) - Top 5 moyenne < 150KB
  let weightScore = 0;
  if (top5AverageWeight !== null) {
    const weightKB = top5AverageWeight / 1024;
    if (weightKB < 80) weightScore = 15;
    else if (weightKB < 150) weightScore = 13;
    else if (weightKB < 250) weightScore = 10;
    else if (weightKB < 400) weightScore = 7;
    else weightScore = 4;
  } else {
    // Si pas de données de poids, score neutre
    weightScore = 11;
  }
  scores.performance.score += weightScore;

  const avgWeightKB =
    averageWeight !== null ? Math.round(averageWeight / 1024) : null;
  const top5WeightKB =
    top5AverageWeight !== null ? Math.round(top5AverageWeight / 1024) : null;

  scores.performance.details = `Lazy loading: ${imagesWithLazyLoading}/${totalImages} (${Math.round(
    lazyLoadingRatio * 100
  )}%)`;
  if (top5WeightKB !== null) {
    scores.performance.details += `, Top 5 poids moyen: ${top5WeightKB}KB`;
  }
  if (avgWeightKB !== null) {
    scores.performance.details += `, Moyenne: ${avgWeightKB}KB`;
  }

  // ===== 3. BONNES PRATIQUES (30 points) =====

  // 3.1 Formats modernes (15 points) - avif/webp/svg > 50%
  const totalFormats = Object.values(formats).reduce(
    (sum, count) => sum + count,
    0
  );
  const modernFormats =
    (formats.avif || 0) + (formats.webp || 0) + (formats.svg || 0);
  const modernRatio = totalFormats > 0 ? modernFormats / totalFormats : 0;

  if (modernRatio >= 0.8) scores.bestPractices.score += 15;
  else if (modernRatio >= 0.6) scores.bestPractices.score += 13;
  else if (modernRatio >= 0.4) scores.bestPractices.score += 10;
  else if (modernRatio >= 0.2) scores.bestPractices.score += 7;
  else scores.bestPractices.score += 4;

  // 3.2 Ratio décoratif/contenu (10 points) - Optimal : 10-30%
  let decorativeScore = 0;
  if (decorativeRatio >= 0.1 && decorativeRatio <= 0.3) {
    decorativeScore = 10;
  } else if (
    decorativeRatio < 0.1 ||
    (decorativeRatio > 0.3 && decorativeRatio <= 0.4)
  ) {
    decorativeScore = 8;
  } else if (decorativeRatio <= 0.5) {
    decorativeScore = 5;
  } else {
    decorativeScore = 2;
  }
  scores.bestPractices.score += decorativeScore;

  // 3.3 Cohérence des formats (5 points)
  const formatCount = Object.values(formats).filter(
    (count) => count > 0
  ).length;
  if (formatCount <= 2) scores.bestPractices.score += 5;
  else if (formatCount === 3) scores.bestPractices.score += 3;
  else scores.bestPractices.score += 1;

  const formatsList = Object.entries(formats)
    .filter(([, count]) => count > 0)
    .map(([format, count]) => `${count} ${format}`)
    .join(", ");

  scores.bestPractices.details = `Formats modernes: ${Math.round(
    modernRatio * 100
  )}% (${formatsList}), Ratio décoratif: ${Math.round(decorativeRatio * 100)}%`;

  // ===== CALCUL TOTAL ET GRADE =====
  const total = Object.values(scores).reduce((sum, s) => sum + s.score, 0);

  let grade;
  if (total >= 90) grade = "A";
  else if (total >= 80) grade = "B";
  else if (total >= 70) grade = "C";
  else if (total >= 60) grade = "D";
  else grade = "F";

  // ===== RECOMMANDATIONS =====
  const improvements = [];

  if (imagesWithoutAlt > 0) {
    improvements.push(
      `Ajouter des textes alt descriptifs pour ${imagesWithoutAlt} image(s) manquante(s)`
    );
  }

  if (imagesWithPoorAlt > 0) {
    improvements.push(
      `Améliorer la qualité de ${imagesWithPoorAlt} texte(s) alt trop court(s) ou générique(s)`
    );
  }

  if (lazyLoadingRatio < 0.5) {
    const missingLazy = totalImages - imagesWithLazyLoading;
    improvements.push(
      `Activer le lazy loading sur ${missingLazy} image(s) supplémentaire(s) (hors first fold)`
    );
  } else if (lazyLoadingRatio > 0.85) {
    improvements.push(
      "Attention : éviter le lazy loading sur les images above-the-fold (premières images visibles)"
    );
  }

  if (top5AverageWeight !== null && top5AverageWeight / 1024 > 100) {
    improvements.push(
      `Optimiser les 5 images les plus lourdes (moyenne: ${Math.round(
        top5AverageWeight / 1024
      )}KB > 100KB)`
    );
  }

  if (modernRatio < 0.7) {
    improvements.push(
      `Utiliser des formats modernes (AVIF/WebP/SVG) pour ${Math.round(
        (1 - modernRatio) * 100
      )}% des images`
    );
  }

  if (decorativeRatio > 0.3) {
    improvements.push(
      `Ratio d'images décoratives élevé (${Math.round(
        decorativeRatio * 100
      )}%), considérer CSS/background-image`
    );
  }

  if (improvements.length === 0) {
    improvements.push("Excellente optimisation des images !");
  }

  return {
    total,
    breakdown: scores,
    grade,
    improvements,
  };
};

/**
 * Analyse les images HTML et calcule un score de qualité
 * @param {Array} images - Liste des images extraites du HTML
 * @param {Array} lighthouseRequests - Requêtes réseau de Lighthouse
 * @param {string} baseUrl - URL de base pour résoudre les chemins relatifs
 * @returns {object} - Analyse complète avec score
 */
export const analyzeImages = (images, lighthouseRequests, baseUrl) => {
  // Enrichir les images avec les données réseau
  const enrichedImages = enrichImagesWithNetworkData(
    images,
    lighthouseRequests,
    baseUrl
  );

  // Calculer les statistiques
  const totalImages = enrichedImages.length;
  let imagesWithAlt = 0;
  let imagesWithoutAlt = 0;
  let imagesWithGoodAlt = 0;
  let imagesWithPoorAlt = 0;
  let decorativeImages = 0;
  let contentImages = 0;
  let imagesWithLazyLoading = 0;

  const formats = {
    avif: 0,
    webp: 0,
    jpg: 0,
    png: 0,
    svg: 0,
    gif: 0,
    unknown: 0,
  };

  const weights = [];

  enrichedImages.forEach((img) => {
    // Comptage des alt
    const altQuality = evaluateAltQuality(img.alt);
    if (altQuality !== "missing") {
      imagesWithAlt++;
      if (altQuality === "good") imagesWithGoodAlt++;
      if (altQuality === "poor") imagesWithPoorAlt++;
    } else {
      imagesWithoutAlt++;
    }

    // Détection décoratif vs contenu
    if (isDecorativeImage(img)) {
      decorativeImages++;
    } else {
      contentImages++;
    }

    // Lazy loading
    if (img.hasLazyLoading) {
      imagesWithLazyLoading++;
    }

    // Formats
    if (formats[img.format] !== undefined) {
      formats[img.format]++;
    } else {
      formats.unknown++;
    }

    // Poids (exclure les SVG et les null)
    if (img.resourceSize && img.format !== "svg") {
      weights.push(img.resourceSize);
    }
  });

  // Calcul des poids moyens
  const averageWeight =
    weights.length > 0
      ? Math.round(weights.reduce((sum, w) => sum + w, 0) / weights.length)
      : null;

  const top5Weights = weights.sort((a, b) => b - a).slice(0, 5);
  const top5AverageWeight =
    top5Weights.length > 0
      ? Math.round(
          top5Weights.reduce((sum, w) => sum + w, 0) / top5Weights.length
        )
      : null;

  const decorativeRatio = totalImages > 0 ? decorativeImages / totalImages : 0;

  // Données d'analyse
  const analysisData = {
    totalImages,
    imagesWithAlt,
    imagesWithoutAlt,
    imagesWithGoodAlt,
    imagesWithPoorAlt,
    decorativeImages,
    contentImages,
    imagesWithLazyLoading,
    averageWeight,
    top5AverageWeight,
    formats,
    decorativeRatio: parseFloat(decorativeRatio.toFixed(2)),
    images: enrichedImages,
  };

  // Calcul du score
  const score = calculateImagesScore(analysisData);

  return {
    ...analysisData,
    score,
  };
};

/**
 * Synthétise l'analyse des images pour l'ensemble des pages
 * @param {Array} pages - Tableau des pages avec leur imagesAnalysis
 * @returns {object} - Synthèse globale de l'analyse des images
 */
export const synthesizeImagesAnalysis = (pages) => {
  if (!pages || pages.length === 0) {
    return {
      totalPages: 0,
      globalStats: {
        totalImages: 0,
        imagesWithAlt: 0,
        imagesWithoutAlt: 0,
        imagesWithGoodAlt: 0,
        imagesWithPoorAlt: 0,
        decorativeImages: 0,
        contentImages: 0,
        imagesWithLazyLoading: 0,
        averageWeight: null,
        top5AverageWeight: null,
        decorativeRatio: 0,
      },
      formats: {
        avif: 0,
        webp: 0,
        jpg: 0,
        png: 0,
        svg: 0,
        gif: 0,
        unknown: 0,
      },
      globalScore: {
        total: 100,
        breakdown: {
          accessibility: {
            score: 0,
            max: 35,
            details: "Aucune image détectée.",
          },
          performance: { score: 0, max: 35, details: "Aucune image détectée." },
          bestPractices: {
            score: 0,
            max: 30,
            details: "Aucune image détectée.",
          },
        },
        grade: "A",
        improvements: ["Aucune image à optimiser."],
      },
      pageScores: [],
    };
  }

  // Filtrer les pages avec imagesAnalysis valide
  const pagesWithImages = pages.filter(
    (page) => page.imagesAnalysis && typeof page.imagesAnalysis === "object"
  );

  if (pagesWithImages.length === 0) {
    return {
      totalPages: pages.length,
      globalStats: {
        totalImages: 0,
        imagesWithAlt: 0,
        imagesWithoutAlt: 0,
        imagesWithGoodAlt: 0,
        imagesWithPoorAlt: 0,
        decorativeImages: 0,
        contentImages: 0,
        imagesWithLazyLoading: 0,
        averageWeight: null,
        top5AverageWeight: null,
        decorativeRatio: 0,
      },
      formats: {
        avif: 0,
        webp: 0,
        jpg: 0,
        png: 0,
        svg: 0,
        gif: 0,
        unknown: 0,
      },
      globalScore: {
        total: 100,
        breakdown: {
          accessibility: {
            score: 0,
            max: 35,
            details: "Aucune image détectée.",
          },
          performance: { score: 0, max: 35, details: "Aucune image détectée." },
          bestPractices: {
            score: 0,
            max: 30,
            details: "Aucune image détectée.",
          },
        },
        grade: "A",
        improvements: ["Aucune image à optimiser."],
      },
      pageScores: [],
    };
  }

  // Agréger les statistiques de toutes les pages
  const globalStats = {
    totalImages: 0,
    imagesWithAlt: 0,
    imagesWithoutAlt: 0,
    imagesWithGoodAlt: 0,
    imagesWithPoorAlt: 0,
    decorativeImages: 0,
    contentImages: 0,
    imagesWithLazyLoading: 0,
  };

  const globalFormats = {
    avif: 0,
    webp: 0,
    jpg: 0,
    png: 0,
    svg: 0,
    gif: 0,
    unknown: 0,
  };

  const allWeights = [];
  const pageScores = [];

  pagesWithImages.forEach((page) => {
    const analysis = page.imagesAnalysis;

    // Agréger les statistiques
    globalStats.totalImages += analysis.totalImages || 0;
    globalStats.imagesWithAlt += analysis.imagesWithAlt || 0;
    globalStats.imagesWithoutAlt += analysis.imagesWithoutAlt || 0;
    globalStats.imagesWithGoodAlt += analysis.imagesWithGoodAlt || 0;
    globalStats.imagesWithPoorAlt += analysis.imagesWithPoorAlt || 0;
    globalStats.decorativeImages += analysis.decorativeImages || 0;
    globalStats.contentImages += analysis.contentImages || 0;
    globalStats.imagesWithLazyLoading += analysis.imagesWithLazyLoading || 0;

    // Agréger les formats
    if (analysis.formats) {
      Object.keys(globalFormats).forEach((format) => {
        globalFormats[format] += analysis.formats[format] || 0;
      });
    }

    // Collecter les poids
    if (analysis.images && Array.isArray(analysis.images)) {
      analysis.images.forEach((img) => {
        if (img.resourceSize && img.format !== "svg") {
          allWeights.push(img.resourceSize);
        }
      });
    }

    // Collecter les scores par page
    if (analysis.score) {
      pageScores.push({
        page: page.file || page.title || "Page sans nom",
        score: analysis.score.total,
        grade: analysis.score.grade,
      });
    }
  });

  // Calculer les poids moyens globaux
  const averageWeight =
    allWeights.length > 0
      ? Math.round(
          allWeights.reduce((sum, w) => sum + w, 0) / allWeights.length
        )
      : null;

  const sortedWeights = allWeights.sort((a, b) => b - a);
  const top5Weights = sortedWeights.slice(0, Math.min(5, sortedWeights.length));
  const top5AverageWeight =
    top5Weights.length > 0
      ? Math.round(
          top5Weights.reduce((sum, w) => sum + w, 0) / top5Weights.length
        )
      : null;

  const decorativeRatio =
    globalStats.totalImages > 0
      ? parseFloat(
          (globalStats.decorativeImages / globalStats.totalImages).toFixed(2)
        )
      : 0;

  globalStats.averageWeight = averageWeight;
  globalStats.top5AverageWeight = top5AverageWeight;
  globalStats.decorativeRatio = decorativeRatio;

  // Calculer le score global basé sur les données agrégées
  const globalScore = calculateImagesScore({
    ...globalStats,
    formats: globalFormats,
  });

  // Calculer les statistiques des scores par page
  const scoreStats =
    pageScores.length > 0
      ? {
          average: Math.round(
            pageScores.reduce((sum, p) => sum + p.score, 0) / pageScores.length
          ),
          min: Math.min(...pageScores.map((p) => p.score)),
          max: Math.max(...pageScores.map((p) => p.score)),
          median: (() => {
            const sorted = [...pageScores].sort((a, b) => a.score - b.score);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
              ? Math.round((sorted[mid - 1].score + sorted[mid].score) / 2)
              : sorted[mid].score;
          })(),
        }
      : null;

  return {
    totalPages: pages.length,
    pagesWithImages: pagesWithImages.length,
    globalStats,
    formats: globalFormats,
    globalScore,
    pageScores,
    scoreStats,
  };
};
