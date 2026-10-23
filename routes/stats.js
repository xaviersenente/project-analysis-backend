import express from "express";
import {
  calculateClassStats,
  getStudentComparison,
} from "../services/stats/statsService.js";
import { validerSlug } from "../services/promo/promoService.js";
import { asyncHandler } from "../utils/errors.js";

const router = express.Router();

/**
 * Route : GET /stats/class
 * Récupère les statistiques globales de la classe
 */
router.get("/stats/class", async (req, res) => {
  try {
    const classStats = await calculateClassStats();
    res.json(classStats);
  } catch (error) {
    console.error("Error fetching class stats:", error.message);
    res.status(500).json({ error: "Failed to calculate class statistics" });
  }
});

/**
 * Route : GET /stats/student/:slug
 * Compare les scores d'un étudiant avec la moyenne de la classe
 */
router.get(
  "/stats/student/:slug",
  asyncHandler(async (req, res) => {
    // Slug validé avant tout calcul (S4)
    const studentName = validerSlug(req.params.slug);
    try {
      const classStats = await calculateClassStats();
      const comparison = getStudentComparison(studentName, classStats);

      if (comparison.error) {
        return res.status(404).json(comparison);
      }

      res.json(comparison);
    } catch (error) {
      console.error("Error fetching student stats:", error.message);
      res.status(500).json({ error: "Failed to fetch student statistics" });
    }
  })
);

export default router;
