/**
 * Étape 8 : le résultat complet d'une analyse de dépôt respecte le schéma v2 du frontend
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { preparerDepot, DATE_RENDU } from "./aides/depotPiege.js";
import { analyserDepot } from "../services/analyse/analyserDepot.js";
import { resultatSchema } from "../schema/resultat.js";

const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-cache-"));
after(() => fs.rmSync(cache, { recursive: true, force: true }));

const projet = (depot) => ({ slug: "etu-01", nom: "Dupont Alice", groupe: "TP2", depot });

test("le résultat du dépôt piégé est valide au regard du schéma v2", async () => {
  const { dossier, shaAvant } = await preparerDepot();
  const { resultat, racineSite } = await analyserDepot({
    projet: projet(dossier),
    promo: { dateRendu: DATE_RENDU },
    cache,
    sansValidationW3c: true,
    sansNavigateur: true,
  });
  const verification = resultatSchema.safeParse(resultat);
  assert.ok(verification.success, JSON.stringify(verification.error?.issues.slice(0, 5), null, 2));
  assert.equal(resultat.source.sha, shaAvant);
  assert.equal(resultat.liens.site, "https://exemple.github.io/depot-piege/");
  assert.equal(resultat.liens.figma, null);
  assert.ok(fs.existsSync(path.join(racineSite, "index.html")));
});

test("un dépôt inaccessible donne un résultat valide, entièrement « Non mesurable »", async () => {
  const { resultat } = await analyserDepot({
    projet: projet(path.join(os.tmpdir(), "depot-absent")),
    promo: { dateRendu: DATE_RENDU },
    cache,
  });
  assert.ok(resultatSchema.safeParse(resultat).success);
  assert.ok(resultat.criteres.every((c) => c.verdict === "non-mesurable"));
  assert.match(resultat.criteres[0].raison, /Version du dépôt/);
  assert.equal(resultat.note.max, 0);
});

test("les deux copies du schéma (backend et frontend) sont identiques", () => {
  const frontend = fileURLToPath(new URL("../../project-analysis-frontend/src/schema/resultat.js", import.meta.url));
  if (!fs.existsSync(frontend)) return; // Le frontend n'est pas à côté (CI) : rien à comparer
  const backend = fs.readFileSync(fileURLToPath(new URL("../schema/resultat.js", import.meta.url)), "utf-8");
  assert.equal(backend.split("\n").slice(1).join("\n"), fs.readFileSync(frontend, "utf-8"));
});
