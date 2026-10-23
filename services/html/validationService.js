import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import vnuJar from "vnu-jar";
import thresholds from "../../config/thresholds.js";

const execFileAsync = promisify(execFile);

/**
 * Valide un HTML avec le validateur Nu (W3C), en local via Java.
 * Un échec (Java absent, délai dépassé, sortie illisible) rend « Non mesurable »,
 * jamais une erreur imputée à l'étudiant (F2).
 * @param {string} htmlContent - Code HTML de la page
 * @returns {Promise<{ mesurable: boolean, erreurs: Array|null, raison?: string }>}
 */
export const validateHTML = async (htmlContent) => {
  // Un nom unique : plusieurs validations peuvent tourner en parallèle
  const tempFile = join(tmpdir(), `validate-${randomUUID()}.html`);

  try {
    await writeFile(tempFile, htmlContent, "utf-8");

    // --stdout : le JSON sort sur stdout, loin des messages de Java sur stderr
    // (« Picked up JAVA_TOOL_OPTIONS… »)
    const { stdout } = await execFileAsync(
      process.env.JAVA_BIN || "java",
      ["-jar", vnuJar, "--format", "json", "--exit-zero-always", "--stdout", tempFile],
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: thresholds.performance.timeouts.validation,
      }
    );

    const parsedResult = JSON.parse(stdout);
    if (!Array.isArray(parsedResult.messages)) {
      throw new Error("Réponse du validateur sans liste de messages");
    }

    const erreurs = parsedResult.messages.filter((msg) => msg.type === "error");

    console.log(
      `📋 Validation HTML: ${parsedResult.messages.length} message(s) détecté(s), ${erreurs.length} erreur(s)`
    );

    return { mesurable: true, erreurs };
  } catch (error) {
    console.error("Validation HTML non mesurable :", error.message);
    return {
      mesurable: false,
      erreurs: null,
      raison: `Validation W3C impossible : ${error.message.split("\n")[0]}`,
    };
  } finally {
    // Nettoyer le fichier temporaire
    try {
      await unlink(tempFile);
    } catch (cleanupError) {
      // Ignorer les erreurs de nettoyage
    }
  }
};

/**
 * Calcule le score de validation basé sur le nombre moyen d'erreurs
 * @param {Array} allPages - Tableau des résultats de validation pour chaque page
 * @returns {Object} - Objet contenant le score et les détails
 */
export const calculateValidationScore = (allPages) => {
  // Les pages dont la validation a échoué ne comptent pas (F2)
  const pages = (allPages || []).filter((page) => Array.isArray(page.validationErrors));

  if (allPages?.length > 0 && pages.length === 0) {
    return {
      total: null,
      mesurable: false,
      raison: "Aucune page n'a pu être validée",
      breakdown: null,
      grade: null,
      improvements: [],
      stats: {
        totalErrors: null,
        totalWarnings: null,
        averageErrors: null,
        pagesAnalyzed: 0,
      },
    };
  }

  if (pages.length === 0) {
    return {
      total: 0,
      breakdown: {
        errorPenalty: 100,
        warningPenalty: 0,
      },
      grade: "F",
      improvements: ["Aucune page n'a été validée"],
      stats: {
        totalErrors: 0,
        totalWarnings: 0,
        averageErrors: 0,
        pagesAnalyzed: 0,
      },
    };
  }

  // Calculer le nombre total d'erreurs et d'avertissements
  const totalErrors = pages.reduce(
    (sum, page) => sum + (page.validationErrors?.length || 0),
    0
  );
  const totalWarnings = pages.reduce(
    (sum, page) =>
      sum +
      (page.validationErrors?.filter((e) => e.type === "warning")?.length || 0),
    0
  );
  const pagesAnalyzed = pages.length;
  const averageErrors = totalErrors / pagesAnalyzed;

  // Formule: 100 - min(avgErrors/10, 1) * 100
  const score = Math.round(100 - Math.min(averageErrors / 10, 1) * 100);

  // Déterminer la note
  let grade;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  // Générer les suggestions d'amélioration
  const improvements = [];
  if (totalErrors > 0) {
    improvements.push(
      `Corriger les ${totalErrors} erreur(s) de validation HTML`
    );
  }
  if (totalWarnings > 5) {
    improvements.push(
      `Examiner et corriger les ${totalWarnings} avertissement(s)`
    );
  }
  if (score === 100) {
    improvements.push("Excellent ! Code HTML parfaitement valide.");
  }

  return {
    total: score,
    mesurable: true,
    pagesNonMesurables: allPages.length - pages.length,
    breakdown: {
      errorPenalty: Math.round(Math.min(averageErrors / 10, 1) * 100),
      warningPenalty: 0, // Les avertissements n'affectent pas le score pour l'instant
    },
    grade,
    improvements:
      improvements.length > 0
        ? improvements
        : ["Continuez à maintenir un code valide"],
    stats: {
      totalErrors,
      totalWarnings,
      averageErrors: Math.round(averageErrors * 100) / 100,
      pagesAnalyzed,
    },
  };
};
