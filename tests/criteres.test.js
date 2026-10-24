/**
 * Les critères du lot 1 sur le dépôt piégé (étape 10) : chaque faute est relevée
 * avec le bon fichier et la bonne ligne ; ce qui est juste ne l'est pas.
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { preparerSite } from "./aides/depotPiege.js";
import { analyserSite } from "../services/analyse/analyserSite.js";

let racine;
let resultat;
const critere = (id) => resultat.criteres.find((c) => c.id === id);
const positions = (id) => critere(id).occurrences.map((o) => `${o.fichier}:${o.ligne}`);

before(async () => {
  racine = await preparerSite();
  resultat = await analyserSite({
    racine,
    promo: { contenusAttendus: ["header", "nav", "main", "footer", "article", "form", "label", "blockquote"] },
    // La validation W3C (Java) est testée à part
    sansValidationW3c: true,
  });
});
after(() => fs.rmSync(racine, { recursive: true, force: true }));

test("tous les critères de la grille sont présents, chacun avec ses occurrences", () => {
  assert.equal(resultat.criteres.length, 55);
  for (const c of resultat.criteres) {
    assert.ok(Array.isArray(c.occurrences), c.id);
    assert.equal(c.totalOccurrences, c.occurrences.length, c.id);
    if (c.verdict === "non-mesurable") assert.ok(c.raison, c.id);
  }
});

// --- Les fautes du dépôt piégé ---

test("M3 : le !important d'une feuille importée, dans son fichier d'origine", () => {
  assert.equal(critere("M3").verdict, "non-respecte");
  assert.deepEqual(positions("M3"), ["css/composants.css:8"]);
});

test("A10 : outline: none sans règle :focus-visible qui le remplace", () => {
  assert.equal(critere("A10").verdict, "non-respecte");
  assert.deepEqual(positions("A10"), ["css/style.css:53"]);
});

test("M9 : l'image citée avec la mauvaise casse et le chemin en /", () => {
  assert.equal(critere("M9").verdict, "non-respecte");
  assert.deepEqual(positions("M9").sort(), ["index.html:29", "index.html:8"]);
});

test("E10 : l'image de 300 Ko", () => {
  assert.equal(critere("E10").verdict, "non-respecte");
  assert.deepEqual(positions("E10"), ["assets/img/lourde.jpg:null"]);
});

test("A5 : alt=\"\" est un choix valable, il n'est pas relevé", () => {
  assert.equal(critere("A5").verdict, "respecte");
  assert.equal(critere("A5").valeur, 100);
});

test("M6 : une seconde feuille liée à une seule page, et un @import", () => {
  assert.equal(critere("M6").verdict, "non-respecte");
  const fichiers = critere("M6").occurrences.map((o) => o.fichier);
  assert.ok(fichiers.includes("contact.html"));
  assert.ok(fichiers.includes("css/style.css"));
});

test("M12 : le README sans URL Figma", () => {
  assert.equal(critere("M12").verdict, "non-respecte");
  assert.deepEqual(positions("M12"), ["README.md:6"]);
});

test("E3 : :focus-visible manque", () => {
  assert.equal(critere("E3").verdict, "partiel");
  assert.match(critere("E3").detailValeur, /:focus-visible/);
});

// --- Ce qui est juste n'est pas relevé ---

test("le reste du dépôt piégé est respecté", () => {
  for (const id of ["G1", "G4", "G7", "G9", "E1", "E2", "E7", "E8", "E9", "E13", "A1", "A2", "A3", "A4", "A7", "A8", "A9", "A11", "M8"]) {
    assert.equal(critere(id).verdict, "respecte", `${id} : ${JSON.stringify(critere(id).occurrences.slice(0, 2))}`);
  }
});

test("A15 : la balise attendue absente (blockquote)", () => {
  assert.equal(critere("A15").verdict, "non-respecte");
  assert.match(critere("A15").occurrences[0].extrait, /blockquote/);
});

// --- Écarts relevés sur le corrigé du TP 5, corrigés dans l'outil ---

/** Analyse d'une copie du site piégé, modifiée pour un test */
const analyserVariante = async (modifier, promo = {}) => {
  const copie = await preparerSite();
  modifier(copie);
  const r = await analyserSite({ racine: copie, promo, sansValidationW3c: true });
  fs.rmSync(copie, { recursive: true, force: true });
  return (id) => r.criteres.find((c) => c.id === id);
};

test("E2 : une page absente du menu n'a pas de lien à marquer aria-current", async () => {
  const c = await analyserVariante((copie) => {
    const contact = fs.readFileSync(`${copie}/contact.html`, "utf-8");
    fs.writeFileSync(`${copie}/mentions.html`, contact.replace('aria-current="page"', "").replace("Contact</h1>", "Mentions</h1>"));
  });
  assert.equal(c("E2").verdict, "respecte");
});

test("E6 : une transition de couleur est permise ; une transition de hauteur est relevée", async () => {
  const c = await analyserVariante((copie) => {
    fs.appendFileSync(`${copie}/css/style.css`, "\n.bloc {\n  transition: color 0.2s, height 0.3s;\n}\n");
  });
  assert.equal(c("E6").verdict, "non-respecte");
  assert.equal(c("E6").occurrences.length, 1);
  assert.equal(c("E6").occurrences[0].extrait.slice(...c("E6").occurrences[0].surligne), "height");
});

test("A15 : sans liste dans le fichier de promo, la liste requiredTags de la configuration", async () => {
  const c = await analyserVariante(() => {});
  assert.ok(c("A15").occurrences.some((o) => o.extrait.includes("<textarea>")));
});

// --- Ce qui relève d'un autre lot est « Non mesurable », jamais imputé à l'étudiant ---

test("contrôles en navigateur, JavaScript et timeline : non mesurables au lot 1", () => {
  for (const id of ["E4", "E5", "E11", "E15", "A12", "A13", "A14", "M4", "M10"]) {
    assert.equal(critere(id).verdict, "non-mesurable", id);
  }
  for (const id of ["G10", "A6", "A16"]) assert.equal(critere(id).verdict, "a-juger", id);
});

test("la note ne compte pas les critères non mesurables", () => {
  const nonMesurables = resultat.criteres
    .filter((c) => c.statut === "C" && c.verdict === "non-mesurable")
    .reduce((s, c) => s + c.points.max, 0);
  assert.equal(resultat.note.max, 100 - nonMesurables);
  assert.ok(resultat.note.base <= resultat.note.max);
});
