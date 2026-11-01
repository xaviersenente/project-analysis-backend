/**
 * Portfolio S3 (lot 5) : les critères dont un niveau est proposé par l'IA.
 * Q13 : QUALITE.md face aux mesures du site ; ED2 : les études de cas ; PC6 : IA.md face à l'historique.
 *
 * Désactivés par défaut : le fichier de promo doit le demander (ia.criteres), le service d'IA devant
 * être autorisé par l'établissement. Le résultat est « À juger », avec la proposition et ses preuves :
 * l'enseignant valide ou corrige en mode local.
 */
import thresholds from "../../config/thresholds.js";
import { nonMesurable, aJuger } from "./mesure.js";
import { proposerNiveau, pseudonymiser } from "../ia/evaluer.js";
import { declaratif, indicesStack } from "../source/depotPortfolio.js";
import qualiteWeb, { pagesLues } from "./qualiteWeb.js";

const { declaratifs } = thresholds.portfolio;
const R = thresholds.portfolio.ia;

const raccourcir = (texte) => (texte.length > R.documentMaxCaracteres ? `${texte.slice(0, R.documentMaxCaracteres)}\n[… coupé]` : texte);

/** Un document prêt à l'envoi : pseudonymisé, à la taille maximale */
const documentPour = (ctx, fichier, texte) => ({ fichier, texte: raccourcir(pseudonymiser(texte, ctx.projet?.nom ?? "")) });

/**
 * Un critère IA : la promo doit l'autoriser ; les documents viennent du socle
 * Le prompt est celui que la grille nomme pour ce critère : prompts/<id de la grille>/<prompt>.md
 * @param {(ctx) => Array<{fichier, texte}> | string} documents - Les documents, ou la raison de ne pas évaluer
 */
const critereIa = (documents) => async (ctx, modele) => {
  if (!ctx.promo?.ia?.criteres) return nonMesurable("IA désactivée : le fichier de promo ne la demande pas (ia.criteres)");
  const docs = documents(ctx);
  if (typeof docs === "string") return nonMesurable(docs);
  try {
    const proposition = await proposerNiveau({ critere: modele, prompt: `${ctx.grille.id}/${modele.prompt}`, documents: docs, client: ctx.clientIa });
    return aJuger(proposition.preuves, { detailValeur: `niveau proposé : ${proposition.niveau}`, proposition });
  } catch (error) {
    if (error.name === "EnAttenteClaudeCode") return nonMesurable(error.message);
    return nonMesurable(`Proposition non disponible : ${error.message.split("\n")[0]}`);
  }
};

/** Les mesures du site, une ligne par critère, avec quelques occurrences */
const mesuresDuSite = async (ctx) => {
  const lignes = [];
  for (const [id, analyser] of Object.entries(qualiteWeb)) {
    if (id === "PR2") continue;
    const m = await analyser(ctx);
    lignes.push(`${id} : ${m.verdict}${m.detailValeur ? ` (${m.detailValeur})` : ""}`);
    for (const o of m.occurrences.slice(0, 3)) lignes.push(`  ${o.fichier} · ${o.extrait.slice(0, 160)}`);
  }
  return lignes.join("\n");
};

/** Q13 : QUALITE.md face aux mesures du site */
const Q13 = async (ctx, modele) => {
  if (!ctx.depot) return nonMesurable(ctx.raisonDepot ?? "Le dépôt n'a pas pu être lu");
  const qualite = declaratif(ctx.depot.dossier, ctx.depot.fichiers, declaratifs.qualite);
  if (!qualite) return nonMesurable("QUALITE.md absent : rien à confronter (voir Q12)");
  const mesures = ctx.parcours && pagesLues(ctx).length ? await mesuresDuSite(ctx) : null;
  return critereIa(() => [
    documentPour(ctx, qualite.chemin, qualite.texte),
    documentPour(ctx, "mesures du site", mesures ?? "Le site en ligne n'a pas été parcouru : aucune mesure."),
  ])(ctx, modele);
};

/** ED2 : les études de cas, d'après le texte des pages de projets */
const ED2 = critereIa((ctx) => {
  if (!ctx.parcours) return ctx.raisonParcours ?? "Le site en ligne n'a pas été parcouru";
  const projets = pagesLues(ctx)
    .filter((p) => R.pagesProjets.test(p.chemin))
    .slice(0, R.pagesMax);
  if (projets.length === 0) return "Aucune page de projet trouvée (adresses en /projets/…, /works/…)";
  return projets.map((p) => documentPour(ctx, p.chemin, `${p.titre ?? ""}\n\n${p.texte}`));
});

/** PC6 : IA.md face à l'historique et à la stack */
const PC6 = critereIa((ctx) => {
  if (!ctx.depot) return ctx.raisonDepot ?? "Le dépôt n'a pas pu être lu";
  const ia = declaratif(ctx.depot.dossier, ctx.depot.fichiers, declaratifs.ia);
  if (!ia) return "IA.md absent : rien à confronter (voir PC4)";
  const commits = (ctx.historique?.commits ?? [])
    .slice(-R.commitsMax)
    .map((c) => `${c.dateAuteur.slice(0, 16).replace("T", " ")} · +${c.ajouts} −${c.suppressions} · ${c.fichiers} fichier(s) · ${c.message}`)
    .join("\n");
  const { indices } = indicesStack(ctx.depot.dossier, ctx.depot.fichiers, ctx.parcours ? pagesLues(ctx) : []);
  const stack = Object.entries(indices)
    .filter(([, liste]) => liste.length)
    .map(([cle, liste]) => `${cle} : ${liste.slice(0, 5).map((o) => o.extrait).join(" ; ")}`)
    .join("\n");
  return [documentPour(ctx, ia.chemin, ia.texte), documentPour(ctx, "historique", commits || "Historique indisponible."), documentPour(ctx, "stack", stack || "Rien de détecté.")];
});

export default { Q13, ED2, PC6 };
