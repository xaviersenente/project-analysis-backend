import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const vnuJar = require("vnu-jar");

const execFileAsync = promisify(execFile);

export const validateHTML = async (htmlContent) => {
  const tempFile = join(tmpdir(), `validate-${Date.now()}.html`);

  try {
    // Écrire le HTML dans un fichier temporaire
    await writeFile(tempFile, htmlContent, "utf-8");

    // Exécuter le validateur Nu local via Java
    const { stderr } = await execFileAsync(
      "java",
      ["-jar", vnuJar, "--format", "json", "--exit-zero-always", tempFile],
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 30000, // 30 secondes max
      }
    );

    // Le validateur Nu renvoie les résultats dans stderr en format JSON
    if (!stderr || stderr.trim() === "") {
      console.log("📋 Validation HTML: Aucune erreur détectée");
      return [];
    }

    const parsedResult = JSON.parse(stderr);
    const errors =
      parsedResult.messages?.filter((msg) => msg.type === "error") || [];

    console.log(
      `📋 Validation HTML: ${
        parsedResult.messages?.length || 0
      } message(s) détecté(s), ${errors.length} erreur(s)`
    );

    return errors;
  } catch (error) {
    // Si c'est une erreur de parsing JSON, c'est qu'il n'y a pas d'erreurs
    if (error.message?.includes("Unexpected end of JSON input")) {
      console.log("📋 Validation HTML: Aucune erreur détectée");
      return [];
    }

    console.error("Error validating HTML:", error.message);
    return [
      { type: "error", message: `Failed to validate HTML: ${error.message}` },
    ];
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
 * @param {Array} pages - Tableau des résultats de validation pour chaque page
 * @returns {Object} - Objet contenant le score et les détails
 */
export const calculateValidationScore = (pages) => {
  if (!pages || pages.length === 0) {
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
