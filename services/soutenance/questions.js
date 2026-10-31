/**
 * Lot 4 : trois questions proposées par l'IA sur une portion de code tirée au sort.
 *
 * Désactivé par défaut : il faut que le fichier de promo le demande (ia.questionsSoutenance),
 * le service d'IA devant être autorisé par l'établissement. On n'envoie que la portion de code
 * et le chemin du fichier : ni nom, ni identifiant de l'étudiant.
 * L'IA propose ; le jury choisit. Une question qui ne cite pas des lignes du passage est écartée.
 */
import fs from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import thresholds from "../../config/thresholds.js";

const R = thresholds.portfolio.soutenance.ia;
const PROMPT = fs.readFileSync(fileURLToPath(new URL("../../prompts/questions-soutenance.md", import.meta.url)), "utf-8");
// L'empreinte du prompt, gardée dans le résultat : toute la promo est interrogée avec le même
export const EMPREINTE_PROMPT = createHash("sha256").update(PROMPT).digest("hex").slice(0, 12);

const Reponse = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      lignes: z.string(),
      attendu: z.string(),
    })
  ),
});

/** « 12-15 » ou « 12 » → { debut, fin }, si les lignes sont dans le passage ; sinon null */
export const lignesDansLePassage = (texte, { debut, fin }) => {
  const m = String(texte).match(/^\s*(\d+)\s*(?:[-–à]\s*(\d+))?\s*$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return a >= debut && b <= fin && a <= b ? { debut: a, fin: b } : null;
};

/** La portion telle qu'on l'envoie : chemin, langage et lignes numérotées */
export const passageNumerote = (tirage) =>
  `Fichier : ${tirage.fichier} (${tirage.langage}), lignes ${tirage.debut} à ${tirage.fin}\n\n` +
  tirage.code
    .split("\n")
    .map((ligne, i) => `${String(tirage.debut + i).padStart(4)} | ${ligne}`)
    .join("\n");

/**
 * @param {object} tirage - { fichier, debut, fin, langage, code }
 * @param {object} [client] - Client Anthropic (injecté dans les tests)
 * @returns {Promise<{ questions: Array<{ question, lignes: { debut, fin }, attendu }>, ecartees: number }>}
 */
export const proposerQuestions = async (tirage, client = new Anthropic()) => {
  const reponse = await client.beta.messages.parse({
    model: R.modele,
    max_tokens: R.maxTokens,
    // Un refus de sécurité est rattrapé par le modèle de repli choisi par l'API
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: R.effort, format: betaZodOutputFormat(Reponse) },
    system: PROMPT,
    messages: [{ role: "user", content: passageNumerote(tirage) }],
  });
  if (reponse.stop_reason === "refusal") throw new Error("Le modèle a refusé de proposer des questions sur ce passage");
  if (!reponse.parsed_output) throw new Error(`Réponse du modèle illisible (${reponse.stop_reason})`);
  const questions = reponse.parsed_output.questions
    .map((q) => ({ question: q.question.trim(), attendu: q.attendu.trim(), lignes: lignesDansLePassage(q.lignes, tirage) }))
    .filter((q) => q.question && q.lignes);
  return { questions, ecartees: reponse.parsed_output.questions.length - questions.length };
};
