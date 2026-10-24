/**
 * Étape 3 : le CSS fichier par fichier, chaque règle gardant son fichier et sa ligne
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { preparerSite } from "./aides/depotPiege.js";
import { inventorier } from "../services/source/inventaire.js";
import { chargerCss, occurrenceDeclaration } from "../services/css/sources.js";

let racine;
let css;

before(async () => {
  racine = await preparerSite();
  css = chargerCss(inventorier(racine));
});
after(() => fs.rmSync(racine, { recursive: true, force: true }));

const trouverDeclaration = (filtre) => {
  let trouvee = null;
  css.arbre.walkDecls((decl) => {
    if (!trouvee && filtre(decl)) trouvee = decl;
  });
  return trouvee;
};

test("les feuilles liées, dans l'ordre, et celles importées par @import", () => {
  assert.deepEqual(css.feuilles, ["css/style.css", "css/composants.css", "css/contact.css"]);
  assert.deepEqual(css.imports, [{ fichier: "css/style.css", ligne: 2, cible: "css/composants.css" }]);
});

test("une règle importée garde son fichier d'origine et sa ligne", () => {
  const important = trouverDeclaration((d) => d.important);
  const o = occurrenceDeclaration(important, css, "!important");
  assert.equal(o.fichier, "css/composants.css");
  assert.equal(o.ligne, 8);
  assert.equal(o.extrait, ".pied__texte { color: var(--texte) !important; }");
  assert.equal(o.extrait.slice(...o.surligne), "!important");
});

test("une déclaration de la feuille principale : fichier, ligne et colonne", () => {
  const outline = trouverDeclaration((d) => d.prop === "outline");
  const o = occurrenceDeclaration(outline, css, "none");
  assert.equal(o.fichier, "css/style.css");
  assert.equal(o.ligne, 53);
  assert.equal(o.colonne, 3);
  assert.equal(o.extrait, ".menu__lien:focus { outline: none; }");
});

test("l'arbre fusionné ne contient plus d'@import, et chaque règle n'y figure qu'une fois", () => {
  let imports = 0;
  css.arbre.walkAtRules("import", () => imports++);
  assert.equal(imports, 0);
  let pieds = 0;
  css.arbre.walkRules(".pied", () => pieds++);
  assert.equal(pieds, 1);
});

test("une feuille introuvable ou illisible n'empêche pas la lecture des autres", () => {
  const inventaire = inventorier(racine);
  inventaire.pages[0].feuilles.push("css/absente.css");
  const resultat = chargerCss(inventaire);
  assert.ok(resultat.feuilles.includes("css/style.css"));
  assert.deepEqual(resultat.erreurs.map((e) => e.fichier), ["css/absente.css"]);
});
