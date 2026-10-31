/**
 * Lot 3 du plan hybride : ce que le dépôt du portfolio dit du projet (fichiers déclaratifs,
 * historique, traces d'IA, stack, template, fichiers sensibles). Sans navigateur.
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { preparerDepotPortfolio, PROMO_PORTFOLIO } from "./aides/portfolioPiege.js";
import { analyserPortfolio } from "../services/analyse/analyserPortfolio.js";
import { semainesDuJournal, semaineIso } from "../services/source/depotPortfolio.js";
import { chargerGrille } from "../services/grilles/grilles.js";
import { resultatSchema } from "../schema/resultat.js";

const grille = chargerGrille("s3-portfolio-2026");
const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-cache-portfolio-"));
const depots = [];
let piege, propre;

const analyser = async (options) => {
  const depot = preparerDepotPortfolio(options);
  depots.push(depot);
  const { resultat } = await analyserPortfolio({ projet: { slug: "alice-martin", nom: "Alice Martin", groupe: "S3", depot }, promo: PROMO_PORTFOLIO, grille, cache });
  return resultat;
};

before(async () => {
  piege = await analyser();
  propre = await analyser({ propre: true });
});
after(() => {
  for (const d of [cache, ...depots]) fs.rmSync(d, { recursive: true, force: true });
});

const critere = (r, id) => r.criteres.find((c) => c.id === id);
const extraits = (r, id) => critere(r, id).occurrences.map((o) => `${o.fichier}${o.ligne ? `:${o.ligne}` : ""} ${o.extrait}`).join("\n");

test("les résultats sont valides, avec l'historique ; le site non parcouru reste « Non mesurable »", () => {
  for (const r of [piege, propre]) {
    const verification = resultatSchema.safeParse(r);
    assert.ok(verification.success, JSON.stringify(verification.error?.issues.slice(0, 5), null, 2));
    assert.ok(r.historique.commits.length > 0);
    assert.equal(critere(r, "Q3").verdict, "non-mesurable");
  }
});

test("les semaines d'un journal : dates complètes, sans année, en toutes lettres, ou « Semaine N »", () => {
  const periode = { debut: new Date("2026-09-25T08:00:00+02:00"), fin: new Date("2026-11-20T18:00:00+01:00") };
  assert.equal(semaineIso(new Date(2026, 9, 12)), "2026-W42");
  assert.equal(semainesDuJournal("## 2026-10-05\n## 12/10\n## 19 octobre\n## 20 octobre", periode), 3);
  assert.equal(semainesDuJournal("## Semaine 1\n## Semaine 2\n## S3", periode), 3);
  // Hors de la période : une date de l'an dernier ne compte pas
  assert.equal(semainesDuJournal("## 2025-10-05", periode), 0);
});

test("PC2 : tout le travail dans les 48 dernières heures ; la version propre est étalée", () => {
  assert.equal(critere(piege, "PC2").verdict, "non-respecte");
  assert.match(extraits(piege, "PC2"), /48 dernières heures/);
  assert.equal(critere(propre, "PC2").verdict, "respecte");
});

test("PC3 : un journal sur deux semaines sur huit", () => {
  assert.equal(critere(piege, "PC3").verdict, "partiel");
  assert.match(critere(piege, "PC3").detailValeur, /^2 semaine\(s\) datée\(s\) sur 8/);
  assert.equal(critere(propre, "PC3").verdict, "respecte");
});

test("PC4 : sans IA.md, une alerte ; IA.md qui dit l'étape et les retouches est complet", () => {
  assert.equal(critere(piege, "PC4").verdict, "non-respecte");
  assert.ok(piege.alertes.some((a) => a.type === "ia-non-declaree"));
  assert.equal(critere(propre, "PC4").verdict, "respecte");
  assert.equal(critere(propre, "PC4").detailValeur, "Claude");
  assert.ok(!propre.alertes.some((a) => a.type === "ia-non-declaree"));
});

test("PC5 : le commit co-signé par Claude n'est déclaré nulle part", () => {
  assert.equal(critere(piege, "PC5").verdict, "non-respecte");
  assert.match(extraits(piege, "PC5"), /Claude \(non déclaré dans IA\.md\) · Menu/);
  assert.equal(critere(propre, "PC5").verdict, "respecte");
});

test("Q12 : QUALITE.md absent ; la version propre couvre les quatre domaines", () => {
  assert.equal(critere(piege, "Q12").verdict, "non-respecte");
  assert.equal(critere(propre, "Q12").verdict, "respecte");
  assert.equal(critere(propre, "Q12").valeur, 4);
});

test("TE2 : Astro, PocketBase et une route d'administration donnent le niveau 5 candidat, à juger", () => {
  const te2 = critere(propre, "TE2");
  assert.equal(te2.verdict, "a-juger");
  assert.equal(te2.valeur, 5);
  assert.match(te2.detailValeur, /back-office/);
  assert.match(extraits(propre, "TE2"), /Framework · .*"astro"/);
  assert.match(extraits(propre, "TE2"), /Back-office · /);
  // Une information : aucun point
  assert.equal(te2.points, null);
});

test("TE3 : le crédit html5up dans le CSS", () => {
  assert.equal(critere(piege, "TE3").verdict, "non-respecte");
  assert.match(extraits(piege, "TE3"), /src\/styles\/theme\.css:1 .*html5up/);
  assert.equal(critere(propre, "TE3").verdict, "respecte");
});

test("TE4 : base de données, .env et clé en dur ; la valeur de la clé n'est jamais recopiée", () => {
  const te4 = extraits(piege, "TE4");
  assert.match(te4, /pb_data\/data\.db Base de données versionnée/);
  assert.match(te4, /\.env Fichier de configuration/);
  assert.match(te4, /src\/config\.js:1 clé ou mot de passe en dur : apiKey = « … » \(valeur masquée\)/);
  assert.ok(!JSON.stringify(piege).includes("a1b2c3d4e5f6g7h8i9"));
  assert.ok(piege.alertes.some((a) => a.type === "fichiers-sensibles"));
  assert.equal(critere(propre, "TE4").verdict, "respecte");
});

test("TE5 : Tailwind et PocketBase ne sont nommés dans aucun document", () => {
  assert.equal(critere(piege, "TE5").verdict, "non-respecte");
  assert.match(extraits(piege, "TE5"), /tailwindcss n'est nommé/);
  assert.equal(critere(propre, "TE5").verdict, "respecte");
});
