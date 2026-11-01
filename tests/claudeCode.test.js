/**
 * La voie « Claude Code » : sans clé d'API, l'analyse écrit les demandes, la commande /webscope-ia
 * y répond dans reponses.json, l'analyse suivante les relit et les vérifie comme celles de l'API.
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { preparerDepotPortfolio, PROMO_PORTFOLIO } from "./aides/portfolioPiege.js";
import { analyserPortfolio } from "../services/analyse/analyserPortfolio.js";
import { chargerGrille } from "../services/grilles/grilles.js";
import { resultatSchema } from "../schema/resultat.js";

const grille = chargerGrille("s3-portfolio-2026");
const depot = preparerDepotPortfolio({ propre: true });
const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-cache-cc-"));
const dossierIa = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-ia-"));
after(() => {
  for (const d of [depot, cache, dossierIa]) fs.rmSync(d, { recursive: true, force: true });
});

const promo = { ...PROMO_PORTFOLIO, ia: { mode: "claude-code", criteres: true, questionsSoutenance: true } };
const analyser = () =>
  analyserPortfolio({ projet: { slug: "alice-martin", nom: "Alice Martin", groupe: "S3", depot }, promo, grille, cache, dossierIa }).then((r) => r.resultat);
const lire = (fichier) => JSON.parse(fs.readFileSync(path.join(dossierIa, fichier), "utf-8"));

/** Ce que ferait Claude Code : une réponse conforme, qui cite la première ligne du premier document */
const repondre = (demande) => {
  if (demande.schema.properties.questions) {
    const debut = Number(demande.consigne.match(/lignes (\d+) à/)[1]);
    return { questions: [{ question: "Que fait ce passage ?", lignes: String(debut + 1), attendu: "…" }] };
  }
  const fichier = demande.consigne.match(/=== (.+) ===/)[1];
  const ligne = demande.consigne.match(/=== .+ ===\n\s*1 \| (.+)/)[1];
  const niveau = demande.consigne.match(/Échelle, du plus faible au plus fort : (.+)/)[1].split(" < ")[2];
  return { niveau, justification: "Réponse de test.", preuves: [{ fichier, ligne: 1, extrait: ligne }] };
};

test("premier passage : rien n'est appelé, les demandes sont écrites, pseudonymisées, et le résultat le dit", async () => {
  const resultat = await analyser();
  assert.ok(resultatSchema.safeParse(resultat).success);
  for (const id of ["Q13", "PC6"]) {
    const c = resultat.criteres.find((x) => x.id === id);
    assert.equal(c.verdict, "non-mesurable");
    assert.match(c.raison, /En attente de Claude Code/);
  }
  assert.equal(resultat.soutenance.ia.statut, "en-attente");
  assert.ok(resultat.nonMesurable.some((n) => n.etape === "IA (Claude Code)" && /5 demande\(s\) en attente/.test(n.raison)));
  const { demandes } = lire("demandes.json");
  // Q13, PC6 et trois portions tirées
  assert.equal(demandes.length, 5);
  assert.ok(demandes.every((d) => d.cle && d.systeme && d.consigne && d.schema));
  assert.doesNotMatch(JSON.stringify(demandes), /Alice|Martin/);
});

test("après /webscope-ia : les réponses sont relues, validées et vérifiées comme celles de l'API", async () => {
  const { demandes } = lire("demandes.json");
  const reponses = Object.fromEntries(demandes.map((d) => [d.cle, { reponse: repondre(d), modele: "claude-test", le: "2026-11-01T10:00:00Z" }]));
  fs.writeFileSync(path.join(dossierIa, "reponses.json"), JSON.stringify({ reponses }));

  const resultat = await analyser();
  assert.ok(resultatSchema.safeParse(resultat).success);
  for (const id of ["Q13", "PC6"]) {
    const c = resultat.criteres.find((x) => x.id === id);
    assert.equal(c.verdict, "a-juger", `${id} : ${c.raison}`);
    assert.equal(c.proposition.modele, "Claude Code · claude-test");
    assert.equal(c.proposition.preuves.length, 1);
  }
  assert.equal(resultat.soutenance.ia.statut, "proposees");
  assert.equal(resultat.soutenance.ia.modele, "Claude Code");
  assert.ok(resultat.soutenance.tirages.every((t) => t.questions.length === 1));
  // Plus rien en attente
  assert.equal(lire("demandes.json").demandes.length, 0);
  assert.ok(!resultat.nonMesurable.some((n) => n.etape === "IA (Claude Code)"));
});

test("une réponse hors schéma (niveau hors échelle) est refusée, pas intégrée", async () => {
  const fichier = path.join(dossierIa, "reponses.json");
  const { reponses } = JSON.parse(fs.readFileSync(fichier, "utf-8"));
  const cle = Object.keys(reponses).find((k) => reponses[k].reponse.niveau);
  reponses[cle].reponse.niveau = "excellent";
  fs.writeFileSync(fichier, JSON.stringify({ reponses }));
  const resultat = await analyser();
  const refuse = resultat.criteres.find((c) => ["Q13", "PC6"].includes(c.id) && c.verdict === "non-mesurable");
  assert.ok(refuse);
  assert.match(refuse.raison, /Proposition non disponible/);
});
