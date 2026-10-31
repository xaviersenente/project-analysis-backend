/**
 * Lot 4 du plan hybride : la fiche de soutenance. Tirage reproductible d'une portion de code
 * écrite par l'étudiant ; questions proposées par l'IA, seulement si la promo l'autorise.
 * Aucun appel réel à l'API : le client est simulé.
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { preparerDepotPortfolio, PROMO_PORTFOLIO } from "./aides/portfolioPiege.js";
import { generateur, blocs, tirerPortions } from "../services/soutenance/tirage.js";
import { proposerQuestions, lignesDansLePassage, EMPREINTE_PROMPT } from "../services/soutenance/questions.js";
import { fichiersDuDepot } from "../services/source/depotPortfolio.js";
import { analyserPortfolio } from "../services/analyse/analyserPortfolio.js";
import { chargerGrille } from "../services/grilles/grilles.js";
import { resultatSchema } from "../schema/resultat.js";
import { execFileSync } from "child_process";

const depot = preparerDepotPortfolio({ propre: true });
const sha = execFileSync("git", ["-C", depot, "rev-parse", "HEAD"]).toString().trim();
const fichiers = fichiersDuDepot(depot);
const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-cache-soutenance-"));
after(() => {
  fs.rmSync(depot, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

/** Un client simulé : il garde la requête et rend la réponse donnée */
const clientSimule = (reponse) => {
  const requetes = [];
  return {
    requetes,
    beta: { messages: { parse: async (params) => (requetes.push(params), typeof reponse === "function" ? reponse(params) : reponse) } },
  };
};
const reponseAvec = (questions) => ({ stop_reason: "end_turn", parsed_output: { questions } });

test("le générateur est déterministe : même graine, même suite", () => {
  const a = generateur("alice·abc1234·1");
  const b = generateur("alice·abc1234·1");
  const c = generateur("alice·abc1234·2");
  const suite = (g) => Array.from({ length: 5 }, g);
  assert.deepEqual(suite(a), suite(b));
  assert.notDeepEqual(suite(generateur("alice·abc1234·1")), suite(c));
});

test("un bloc a assez de lignes utiles ; commentaires, imports et lignes vides ne comptent pas", () => {
  const vide = Array.from({ length: 30 }, (_, i) => (i % 2 ? "// commentaire" : "")).join("\n");
  assert.equal(blocs(vide).length, 0);
  const plein = Array.from({ length: 45 }, (_, i) => `const a${i} = ${i};`).join("\n");
  const trouves = blocs(plein);
  assert.ok(trouves.length >= 2);
  assert.equal(trouves[0].debut, 1);
  assert.equal(trouves[0].fin, 20);
});

test("le tirage est reproductible, varie les fichiers tant qu'il en reste, et jamais sur la configuration", () => {
  const un = tirerPortions({ dossier: depot, sha, fichiers, slug: "alice-martin" });
  const encore = tirerPortions({ dossier: depot, sha, fichiers, slug: "alice-martin" });
  assert.deepEqual(un, encore);
  assert.equal(un.graine, `alice-martin·${sha.slice(0, 7)}·1`);
  // Trois portions ; deux fichiers seulement en fournissent : les deux sont tirés avant d'en reprendre un
  assert.equal(un.tirages.length, 3);
  assert.equal(new Set(un.tirages.map((t) => t.fichier)).size, 2);
  assert.ok(un.tirages.every((t) => /^src\/(scripts|styles)\//.test(t.fichier)));
  const autre = tirerPortions({ dossier: depot, sha, fichiers, slug: "alice-martin", graine: 7 });
  assert.equal(autre.graine.endsWith("·7"), true);
});

test("une question doit citer des lignes du passage", () => {
  const passage = { debut: 20, fin: 39 };
  assert.deepEqual(lignesDansLePassage("22-25", passage), { debut: 22, fin: 25 });
  assert.deepEqual(lignesDansLePassage("30", passage), { debut: 30, fin: 30 });
  assert.equal(lignesDansLePassage("10-25", passage), null);
  assert.equal(lignesDansLePassage("vers la fin", passage), null);
});

test("les questions : celle qui sort du passage est écartée ; rien d'identifiant n'est envoyé", async () => {
  const tirage = { fichier: "src/scripts/filtres.js", debut: 1, fin: 20, langage: "javascript", code: "const a = 1;\n".repeat(20).trimEnd() };
  const client = clientSimule(
    reponseAvec([
      { question: "Que fait la boucle ?", lignes: "3-10", attendu: "Elle masque les cartes." },
      { question: "Pourquoi aria-pressed ?", lignes: "11", attendu: "L'état du bouton." },
      { question: "Et la ligne 80 ?", lignes: "80", attendu: "—" },
    ])
  );
  const { questions, ecartees } = await proposerQuestions(tirage, client);
  assert.equal(questions.length, 2);
  assert.equal(ecartees, 1);
  const requete = JSON.stringify(client.requetes[0]);
  assert.match(requete, /src\/scripts\/filtres\.js/);
  assert.match(requete, /   1 \| const a = 1;/);
  assert.equal(client.requetes[0].fallbacks, "default");
  assert.doesNotMatch(requete, /alice|Martin/i);
  assert.match(EMPREINTE_PROMPT, /^[0-9a-f]{12}$/);
});

test("un refus du modèle n'invente rien : la question manque, l'erreur est dite", async () => {
  const tirage = { fichier: "a.js", debut: 1, fin: 20, langage: "javascript", code: "x" };
  await assert.rejects(proposerQuestions(tirage, clientSimule({ stop_reason: "refusal", parsed_output: null })), /refusé/);
});

const grille = chargerGrille("s3-portfolio-2026");
const analyser = (promo, clientIa) =>
  analyserPortfolio({ projet: { slug: "alice-martin", nom: "Alice Martin", groupe: "S3", depot }, promo, grille, cache, clientIa });

test("sans autorisation dans le fichier de promo, aucune question n'est demandée", async () => {
  const client = clientSimule(reponseAvec([]));
  const { resultat } = await analyser(PROMO_PORTFOLIO, client);
  assert.ok(resultatSchema.safeParse(resultat).success);
  assert.equal(resultat.soutenance.ia.statut, "desactivees");
  assert.equal(client.requetes.length, 0);
  assert.ok(resultat.soutenance.tirages.length >= 2);
});

test("avec l'autorisation, chaque portion tirée reçoit ses questions ; une panne est dite, pas cachée", async () => {
  const client = clientSimule((params) => {
    const debut = Number(params.messages[0].content.match(/lignes (\d+) à/)[1]);
    return reponseAvec([{ question: "Que fait ce passage ?", lignes: String(debut + 1), attendu: "…" }]);
  });
  const { resultat } = await analyser({ ...PROMO_PORTFOLIO, ia: { questionsSoutenance: true } }, client);
  const verification = resultatSchema.safeParse(resultat);
  assert.ok(verification.success, JSON.stringify(verification.error?.issues.slice(0, 3)));
  assert.equal(resultat.soutenance.ia.statut, "proposees");
  assert.equal(resultat.soutenance.ia.prompt, EMPREINTE_PROMPT);
  assert.ok(resultat.soutenance.tirages.every((t) => t.questions.length === 1));

  const enPanne = { beta: { messages: { parse: async () => { throw new Error("réseau indisponible"); } } } };
  const { resultat: echec } = await analyser({ ...PROMO_PORTFOLIO, ia: { questionsSoutenance: true } }, enPanne);
  assert.equal(echec.soutenance.ia.statut, "echec");
  assert.match(echec.soutenance.ia.raison, /réseau indisponible/);
  assert.ok(echec.soutenance.tirages.every((t) => t.questions === null));
});
