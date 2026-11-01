import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import vnuJar from "vnu-jar";
import thresholds from "../../config/thresholds.js";

const execFileAsync = promisify(execFile);

/**
 * Valide des pages HTML avec le validateur Nu (W3C), en local via Java, en un seul lancement :
 * démarrer Java coûte près d'une seconde, autant ne le faire qu'une fois pour tout le site.
 * Un échec (Java absent, délai dépassé, sortie illisible) rend « Non mesurable »,
 * jamais une erreur imputée à l'étudiant (F2).
 * @param {string[]} pages - Le code HTML de chaque page
 * @returns {Promise<{ mesurable: boolean, erreurs: Array<Array>|null, raison?: string }>} - Les erreurs de chaque page, dans l'ordre
 */
export const validerHtmlEnLot = async (pages) => {
  // Un dossier par lot : plusieurs validations peuvent tourner en parallèle
  const dossier = await mkdtemp(join(tmpdir(), "validation-"));
  try {
    const fichiers = pages.map((_, i) => join(dossier, `page-${i}.html`));
    await Promise.all(pages.map((html, i) => writeFile(fichiers[i], html, "utf-8")));
    // --stdout : le JSON sort sur stdout, loin des messages de Java sur stderr
    // (« Picked up JAVA_TOOL_OPTIONS… »)
    const { stdout } = await execFileAsync(
      process.env.JAVA_BIN || "java",
      ["-jar", vnuJar, "--format", "json", "--exit-zero-always", "--stdout", ...fichiers],
      {
        maxBuffer: 10 * 1024 * 1024,
        // Le délai d'une page, pour chacune
        timeout: thresholds.performance.timeouts.validation * Math.max(1, pages.length),
      }
    );
    const { messages } = JSON.parse(stdout);
    if (!Array.isArray(messages)) throw new Error("Réponse du validateur sans liste de messages");
    const erreurs = pages.map(() => []);
    for (const m of messages) {
      if (m.type !== "error") continue;
      const index = m.url ? fichiers.indexOf(fileURLToPath(m.url)) : -1;
      if (index >= 0) erreurs[index].push(m);
    }
    return { mesurable: true, erreurs };
  } catch (error) {
    return { mesurable: false, erreurs: null, raison: `Validation W3C impossible : ${error.message.split("\n")[0]}` };
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
};

/** Valide une seule page (voir validerHtmlEnLot) */
export const validateHTML = async (html) => {
  const { mesurable, erreurs, raison } = await validerHtmlEnLot([html]);
  return mesurable ? { mesurable, erreurs: erreurs[0] } : { mesurable, erreurs: null, raison };
};

/**
 * Valide des feuilles de style avec le validateur Nu (son vérificateur CSS), en local via Java,
 * en un seul lancement pour toutes les feuilles. Un échec rend « Non mesurable » (F2).
 * @param {string[]} chemins - Chemins absolus des feuilles
 * @returns {Promise<{ mesurable: boolean, erreurs: Array<{ fichier, ligne, colonne, message, extrait, hiliteStart, hiliteLength }>|null, raison?: string }>}
 */
export const validateCSS = async (chemins) => {
  try {
    const { stdout } = await execFileAsync(
      process.env.JAVA_BIN || "java",
      ["-jar", vnuJar, "--css", "--format", "json", "--exit-zero-always", "--stdout", ...chemins],
      { maxBuffer: 10 * 1024 * 1024, timeout: thresholds.performance.timeouts.validation }
    );
    const { messages } = JSON.parse(stdout);
    if (!Array.isArray(messages)) throw new Error("Réponse du validateur sans liste de messages");
    const erreurs = messages
      .filter((m) => m.type === "error" && m.url)
      .map((m) => ({
        fichier: fileURLToPath(m.url),
        ligne: m.lastLine ?? null,
        colonne: m.firstColumn ?? m.lastColumn ?? null,
        message: m.message.replace(/^CSS: /, ""),
        extrait: m.extract ?? "",
        hiliteStart: m.hiliteStart,
        hiliteLength: m.hiliteLength,
      }));
    return { mesurable: true, erreurs };
  } catch (error) {
    return { mesurable: false, erreurs: null, raison: `Validation CSS impossible : ${error.message.split("\n")[0]}` };
  }
};
