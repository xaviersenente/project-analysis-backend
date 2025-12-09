import express from "express";
import {
  calculateClassStats,
  getStudentComparison,
} from "../services/stats/statsService.js";

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
 * Route : GET /stats/student/:studentName
 * Compare les scores d'un étudiant avec la moyenne de la classe
 */
router.get("/stats/student/:studentName", async (req, res) => {
  try {
    const { studentName } = req.params;
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
});

export default router;
