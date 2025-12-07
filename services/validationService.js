import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import vnuJar from "vnu-jar";

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
