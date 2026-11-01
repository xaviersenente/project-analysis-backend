/**
 * Lot 5 : la couche IA pour ce qui dépend du sujet. Un appel ciblé par critère, pas un agent
 * qui explore le dépôt : le socle prépare les documents (fichiers déclaratifs, mesures, textes
 * des pages), l'IA propose un niveau de l'échelle de la grille, avec ses preuves.
 *
 * Trois règles (PLAN-ARCHITECTURE-HYBRIDE.md, §5) :
 * - l'IA propose un niveau, jamais des points ; l'enseignant valide ou corrige ;
 * - chaque preuve doit se retrouver, mot pour mot, à la ligne citée ; sinon elle est écartée,
 *   et une proposition sans preuve retrouvée n'est pas gardée ;
 * - même modèle, même prompt (versionné, empreinte dans le résultat) pour toute la promo.
 *
 * Les documents sont pseudonymisés avant l'envoi : nom de l'étudiant, adresses e-mail et numéros
 * de téléphone remplacés. Les preuves gardées le sont dans leur forme pseudonymisée.
 */
import fs from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import thresholds from "../../config/thresholds.js";

const R = thresholds.portfolio.ia;

/** Le prompt d'un critère (prompts/<nom>.md) et son empreinte */
export const lirePrompt = (nom) => {
  const texte = fs.readFileSync(fileURLToPath(new URL(`../../prompts/${nom}.md`, import.meta.url)), "utf-8");
  return { texte, empreinte: createHash("sha256").update(texte).digest("hex").slice(0, 12) };
};

const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Remplace ce qui identifie l'étudiant : son nom (chaque mot de plus de deux lettres, avec ou sans
 * accents), ses adresses e-mail et ses numéros de téléphone
 */
export const pseudonymiser = (texte, nom = "") => {
  let sortie = texte
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g, "[téléphone]");
  const sansAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const mot of nom.split(/[\s-]+/).filter((m) => m.length > 2)) {
    // « Andréa » et « Andrea » : la lettre accentuée ou non
    const motif = [...sansAccents(mot)].map((c) => (/[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}\\u00C0-\\u017F]` : echapper(c))).join("");
    sortie = sortie.replace(new RegExp(`(?<![\\p{L}])${motif}(?![\\p{L}])`, "gu"), (trouve) => (sansAccents(trouve).toLowerCase() === sansAccents(mot).toLowerCase() ? "[NOM]" : trouve));
  }
  return sortie;
};

/** Un document tel qu'on l'envoie : son nom, puis ses lignes numérotées */
export const documentNumerote = ({ fichier, texte }) =>
  `=== ${fichier} ===\n` +
  texte
    .split("\n")
    .map((ligne, i) => `${String(i + 1).padStart(4)} | ${ligne}`)
    .join("\n");

const normaliser = (texte) => texte.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Les preuves retrouvées mot pour mot dans le document cité, à la ligne indiquée
 * (ou dans les deux suivantes, pour un extrait qui passe à la ligne)
 * @param {Array<{ fichier, ligne, extrait }>} preuves
 * @param {Array<{ fichier, texte }>} documents - Tels qu'envoyés (pseudonymisés)
 */
export const verifierPreuves = (preuves, documents) => {
  const lignesDe = new Map(documents.map((d) => [d.fichier, d.texte.split("\n")]));
  const retenues = [];
  for (const p of preuves) {
    const lignes = lignesDe.get(p.fichier);
    const extrait = normaliser(p.extrait ?? "");
    if (!lignes || !Number.isInteger(p.ligne) || p.ligne < 1 || p.ligne > lignes.length || extrait.length < R.extraitMin) continue;
    // L'extrait doit commencer sur la ligne citée ; il peut se poursuivre sur les deux suivantes
    const citee = normaliser(lignes[p.ligne - 1]);
    const position = normaliser(lignes.slice(p.ligne - 1, p.ligne + 2).join(" ")).indexOf(extrait);
    if (position >= 0 && position < citee.length) {
      retenues.push({ fichier: p.fichier, ligne: p.ligne, colonne: null, extrait: p.extrait.trim() });
    }
  }
  return { retenues, ecartees: preuves.length - retenues.length };
};

/**
 * Une proposition de l'IA pour un critère
 * @param {object} options
 * @param {{ id: string, libelle: string, echelle: string[] }} options.critere - Le critère de la grille
 * @param {string} options.prompt - Nom du prompt (prompts/<nom>.md)
 * @param {Array<{ fichier: string, texte: string }>} options.documents - Déjà pseudonymisés
 * @param {object} [options.client] - Client Anthropic (injecté dans les tests)
 * @returns {Promise<object>} - { niveau, justification, preuves, preuvesEcartees, modele, prompt }
 * @throws {Error} - Refus, réponse illisible, ou aucune preuve retrouvée
 */
export const proposerNiveau = async ({ critere, prompt, documents, client = new Anthropic() }) => {
  const { texte: systeme, empreinte } = lirePrompt(prompt);
  const Reponse = z.object({
    niveau: z.enum(critere.echelle),
    justification: z.string(),
    preuves: z.array(z.object({ fichier: z.string(), ligne: z.number().int(), extrait: z.string() })),
  });
  const consigne =
    `Critère ${critere.id} : ${critere.libelle}\n` +
    `Échelle, du plus faible au plus fort : ${critere.echelle.join(" < ")}\n\n` +
    documents.map(documentNumerote).join("\n\n");
  const reponse = await client.beta.messages.parse({
    model: R.modele,
    max_tokens: R.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: R.effort, format: betaZodOutputFormat(Reponse) },
    system: systeme,
    messages: [{ role: "user", content: consigne }],
  });
  if (reponse.stop_reason === "refusal") throw new Error("Le modèle a refusé d'évaluer ce critère");
  if (!reponse.parsed_output) throw new Error(`Réponse du modèle illisible (${reponse.stop_reason})`);
  const { niveau, justification, preuves } = reponse.parsed_output;
  const { retenues, ecartees } = verifierPreuves(preuves, documents);
  if (retenues.length === 0) throw new Error(`Proposition écartée : aucune des ${preuves.length} preuve(s) citée(s) n'a été retrouvée à sa ligne`);
  // Le modèle qui a vraiment répondu (repli de l'API compris, ou Claude Code)
  return { niveau, justification: justification.trim(), preuves: retenues, preuvesEcartees: ecartees, modele: reponse.model ?? R.modele, prompt: empreinte };
};
