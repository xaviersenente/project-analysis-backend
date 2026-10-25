/**
 * M2 : validation CSS par le validateur Nu (W3C), en local. Le CSS récent qu'il ne connaît pas
 * encore (@starting-style, requêtes de conteneur…) n'est jamais compté comme une erreur.
 * Sans Java sur la machine, les tests ne vérifient que le « Non mesurable ».
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { validateCSS } from "../services/html/validationService.js";
import { analyserSite } from "../services/analyse/analyserSite.js";

const racine = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-css-"));
let resultat;
let java = true;

before(async () => {
  fs.mkdirSync(path.join(racine, "css"));
  fs.writeFileSync(
    path.join(racine, "index.html"),
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Accueil</title>
<link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/menu.css"></head>
<body><main><h1>Accueil</h1></main></body></html>`
  );
  fs.writeFileSync(
    path.join(racine, "css/style.css"),
    `:root { --accent: oklch(70% 0.15 200); }
.carte {
  colr: red;
  padding: 10px 2em 3;
  &:hover { color: var(--accent); }
}
`
  );
  fs.writeFileSync(
    path.join(racine, "css/menu.css"),
    `[popover] { transition: opacity .3s, display .3s allow-discrete; }
@starting-style { [popover]:popover-open { opacity: 0; } }
.liste { container-type: inline-size; }
@container (min-width: 30rem) { .liste { padding: 2rem; } }
`
  );
  java = (await validateCSS([path.join(racine, "css/style.css")])).mesurable;
  resultat = await analyserSite({ racine, sansNavigateur: true });
});
after(() => fs.rmSync(racine, { recursive: true, force: true }));

const m2 = () => resultat.criteres.find((c) => c.id === "M2");

test("les erreurs CSS ressortent avec leur fichier, leur ligne et le message du validateur", (t) => {
  if (!java) return t.skip("Java absent");
  assert.equal(m2().verdict, "non-respecte");
  assert.equal(m2().valeur, 2);
  const lignes = m2().occurrences.map((o) => [o.fichier, o.ligne]);
  assert.deepEqual(lignes, [["css/style.css", 3], ["css/style.css", 4]]);
  assert.match(m2().occurrences[0].extrait, /colr: red;\s+← .*colr/);
});

test("le CSS récent inconnu du validateur n'est pas compté, mais il est signalé", (t) => {
  if (!java) return t.skip("Java absent");
  assert.ok(m2().occurrences.every((o) => o.fichier !== "css/menu.css"));
  assert.match(m2().detailValeur, /4 messages ignorés/);
});

test("le validateur rend bien ces messages : c'est M2 qui les écarte", async (t) => {
  if (!java) return t.skip("Java absent");
  const { erreurs } = await validateCSS([path.join(racine, "css/menu.css")]);
  assert.equal(erreurs.length, 4);
  assert.ok(erreurs.every((e) => e.fichier === path.join(racine, "css/menu.css")));
});

test("sans Java, la validation CSS est « Non mesurable », jamais une erreur de l'étudiant", async () => {
  process.env.JAVA_BIN = "/chemin/inexistant/java";
  try {
    const r = await validateCSS([path.join(racine, "css/style.css")]);
    assert.equal(r.mesurable, false);
    assert.match(r.raison, /Validation CSS impossible/);
  } finally {
    delete process.env.JAVA_BIN;
  }
});
