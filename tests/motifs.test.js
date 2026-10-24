/**
 * Étape 4 : le JavaScript qui remplace du CSS (critère M4)
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chercherMotifs } from "../services/js/motifs.js";

const fichier = (chemin, contenu) => ({ chemin, contenu, ligneDepart: 1 });

test("un menu ouvert par classList.toggle, avec son alternative popover", () => {
  const motifs = chercherMotifs([
    fichier("js/menu.js", '// Menu\nconst b = document.querySelector(".burger");\nb.addEventListener("click", () => menu.classList.toggle("ouvert"));\n'),
  ]);
  assert.equal(motifs.length, 1);
  const [m] = motifs;
  assert.equal(m.occurrence.fichier, "js/menu.js");
  assert.equal(m.occurrence.ligne, 3);
  assert.equal(m.occurrence.extrait.slice(...m.occurrence.surligne), "classList.toggle");
  assert.match(m.alternative.code, /popover/);
});

test("chaque motif de la grille est reconnu", () => {
  const code = [
    'el.style.display = "none";',
    'carte.addEventListener("mouseenter", survol);',
    'window.addEventListener("scroll", suivre);',
    'cible.scrollIntoView({ behavior: "smooth" });',
    'form.addEventListener("submit", (e) => { if (email.value.length === 0) e.preventDefault(); });',
  ].join("\n");
  const noms = chercherMotifs([fichier("js/site.js", code)]).map((m) => m.motif);
  assert.deepEqual(noms, [
    "Affichage piloté par element.style",
    "Effet de survol en JavaScript",
    "Écouteur de défilement",
    "Défilement doux en JavaScript",
    "Validation de formulaire écrite à la main",
  ]);
});

test("un JavaScript légitime ne coûte rien", () => {
  const code = 'const annee = new Date().getFullYear();\ndocument.querySelector(".annee").textContent = annee;\nfetch("data.json").then((r) => r.json());\n';
  assert.deepEqual(chercherMotifs([fichier("js/annee.js", code)]), []);
});

test("un motif en commentaire n'est pas relevé ; les lignes restent justes", () => {
  const code = '/* ancien : menu.classList.toggle("x") */\n// el.style.display = "none";\nmenu.classList.add("ouvert");\n';
  const motifs = chercherMotifs([fichier("js/menu.js", code)]);
  assert.equal(motifs.length, 1);
  assert.equal(motifs[0].occurrence.ligne, 3);
});

test("un script en ligne : la ligne compte depuis la balise <script> de la page", () => {
  const motifs = chercherMotifs([{ chemin: "index.html", contenu: '\n  btn.onclick = () => nav.classList.toggle("ouvert");\n', ligneDepart: 40 }]);
  assert.equal(motifs[0].occurrence.ligne, 41);
});
