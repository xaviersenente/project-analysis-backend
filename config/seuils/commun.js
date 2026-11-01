/**
 * Seuils communs à toutes les grilles : délais et écran émulé, contrôle du site en ligne,
 * vignettes d'images, lettres de la note. Rassemblés par config/thresholds.js.
 */

export default {
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
