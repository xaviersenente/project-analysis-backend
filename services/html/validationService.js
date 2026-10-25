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
