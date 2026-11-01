/**
 * Lot 2 du plan hybride : le profil portfolio, sur le site en ligne parcouru (portfolio piégé,
 * et sa version propre). Sans Chrome sur la machine, les tests en navigateur ne font rien.
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import * as chromeLauncher from "chrome-launcher";
import sharp from "sharp";
import { servirPortfolio } from "./aides/portfolioPiege.js";
import { analyserPortfolio, evaluerCriteres } from "../services/analyse/analyserPortfolio.js";
import { domaineDe, estTiers, normaliser } from "../services/runtime/parcours.js";
import { chargerGrille } from "../services/grilles/grilles.js";
import { profilDe } from "../services/profils/index.js";
import { resultatSchema } from "../schema/resultat.js";

const chrome = chromeLauncher.Launcher.getInstallations().length > 0;
const grille = chargerGrille("s3-portfolio-2026");
const captures = fs.mkdtempSync(path.join(os.tmpdir(), "captures-portfolio-"));
const projet = (site) => ({ slug: "alice-martin", nom: "Alice Martin", groupe: "S3", site });
const promo = { dateRendu: "2026-11-20T18:00:00+01:00" };
let piege, propre;

before(async () => {
  if (!chrome) return;
  for (const [cle, options] of [["piege", {}], ["propre", { propre: true }]]) {
    const serveur = await servirPortfolio(options);
    try {
      const { resultat } = await analyserPortfolio({ projet: projet(serveur.url), promo, grille, dossierCaptures: path.join(captures, cle) });
      if (cle === "piege") piege = resultat;
      else propre = resultat;
    } finally {
      await serveur.fermer();
    }
  }
});
after(() => fs.rmSync(captures, { recursive: true, force: true }));

const critere = (resultat, id) => resultat.criteres.find((c) => c.id === id);
const extraits = (resultat, id) => critere(resultat, id).occurrences.map((o) => `${o.fichier} ${o.extrait}`).join("\n");

test("la grille portfolio vaut 20 points, tous au jury, et pointe vers le profil portfolio", () => {
  assert.equal(grille.axes.reduce((s, a) => s + a.points, 0), 20);
  assert.equal(profilDe(grille).analyser.name, "analyserPortfolio");
  const notes = grille.criteres.filter((c) => c.statut === "C");
  assert.ok(notes.every((c) => c.methode === "manuel"));
  assert.equal(notes.reduce((s, c) => s + c.points, 0), 20);
});

test("un service tiers : un autre propriétaire que le site, sous-domaines compris", () => {
  assert.equal(domaineDe("portfolio.bryan-thierry.fr"), "bryan-thierry.fr");
  assert.equal(estTiers("api.bryan-thierry.fr", "portfolio.bryan-thierry.fr"), false);
  assert.equal(estTiers("fonts.googleapis.com", "portfolio.bryan-thierry.fr"), true);
  assert.equal(estTiers("localhost", "127.0.0.1"), true);
  assert.equal(normaliser("https://a.fr/projets/#haut"), "https://a.fr/projets");
  assert.equal(normaliser("https://a.fr/"), "https://a.fr/");
});

test("sans adresse du site ni dépôt, les mesures sont « Non mesurable » et les contraintes attendent le jury", async () => {
  const { resultat } = await analyserPortfolio({ projet: projet(undefined), promo, grille });
  assert.ok(resultatSchema.safeParse(resultat).success);
  const mesures = resultat.criteres.filter((c) => c.statut === "I");
  assert.ok(mesures.filter((c) => c.methode === "navigateur").every((c) => c.verdict === "non-mesurable" && /adresse du site/.test(c.raison)));
  // Sans dépôt non plus, les mesures du dépôt (lot 3) le disent
  assert.ok(mesures.filter((c) => c.methode === "depot").every((c) => c.verdict === "non-mesurable" && /Pas de dépôt/.test(c.raison)));
  assert.ok(resultat.criteres.filter((c) => c.statut === "C").every((c) => c.verdict === "a-juger"));
  assert.equal(resultat.note.total, 20);
  assert.equal(resultat.note.aJuger, 20);
});

test("un critère manuel sans analyseur attend le jury ; un critère mesuré sans analyseur est « Non mesurable »", async () => {
  const mini = { ...grille, criteres: [grille.criteres[0], { ...grille.criteres.find((c) => c.id === "Q3"), id: "Q99" }] };
  const [manuel, mesure] = await evaluerCriteres(mini, {}, {});
  assert.equal(manuel.verdict, "a-juger");
  assert.equal(mesure.verdict, "non-mesurable");
});

test("le résultat du portfolio piégé est valide, et parcourt toutes les pages reliées", { skip: !chrome }, () => {
  const verification = resultatSchema.safeParse(piege);
  assert.ok(verification.success, JSON.stringify(verification.error?.issues.slice(0, 5), null, 2));
  const chemins = piege.parcours.pages.map((p) => p.chemin).sort();
  assert.deepEqual(chemins, ["/", "/ancienne-page", "/contact", "/mentions-legales", "/projets"]);
  // Captures : l'accueil aux trois largeurs, les autres pages à 360 px
  assert.equal(piege.parcours.pages[0].captures.length, 3);
  for (const c of piege.parcours.pages.flatMap((p) => p.captures)) assert.ok(fs.existsSync(path.join(captures, "piege", path.basename(c.image))));
});

test("captures : un contenu révélé au défilement est visible, sans faire défiler la page", { skip: !chrome }, async () => {
  const accueil = propre.parcours.pages.find((p) => p.chemin === "/");
  const capture = path.join(captures, "propre", path.basename(accueil.captures[0].image));
  // Le bloc rouge est à 2 500 px sous le contenu de tête : au milieu de sa hauteur
  const { data, info } = await sharp(capture).extract({ left: 180, top: 2780, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1);
  assert.ok(data[0] > 200 && data[1] < 60 && data[2] < 60, `pixel ${[...data].join(",")} : le bloc devrait être rouge`);
});

test("Q3 : l'image sans alt est une erreur d'accessibilité", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q3").verdict, "non-respecte");
  assert.match(extraits(piege, "Q3"), /image-alt/);
  assert.equal(critere(propre, "Q3").verdict, "respecte");
});

test("Q4 : le bloc de 600 px élargit l'accueil au-delà de 360 px", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q4").verdict, "non-respecte");
  assert.match(extraits(piege, "Q4"), /^\/ 6\d\d px de large pour 360 px/);
  assert.equal(critere(propre, "Q4").verdict, "respecte");
});

test("Q5 : title partagé, description absente et deux h1 sur la page projets", { skip: !chrome }, () => {
  const q5 = extraits(piege, "Q5");
  assert.match(q5, /\/projets title partagé.*meta description absente.*2 h1/);
  assert.equal(critere(propre, "Q5").verdict, "respecte");
});

test("Q6 : ni robots.txt ni sitemap.xml ; la version propre a les deux", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q6").verdict, "non-respecte");
  assert.equal(critere(propre, "Q6").verdict, "respecte");
  assert.equal(propre.parcours.sitemap.urls, 4);
});

test("Q7 : chaque page a son EcoIndex", { skip: !chrome }, () => {
  assert.ok(propre.parcours.pages.every((p) => p.ecoindex.score > 0));
  assert.equal(critere(propre, "Q7").verdict, "respecte");
});

test("Q8 : la police chargée chez un tiers, sans action du visiteur", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q8").verdict, "non-respecte");
  assert.match(extraits(piege, "Q8"), /localhost/);
  assert.deepEqual(piege.parcours.tiers.map((t) => t.hote), ["localhost"]);
  assert.equal(critere(propre, "Q8").verdict, "respecte");
});

test("Q9 : l'éditeur n'est pas nommé, et la page contact n'a pas de lien vers les mentions", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q9").verdict, "partiel");
  assert.match(extraits(piege, "Q9"), /éditeur du site n'est pas nommé/);
  assert.match(extraits(piege, "Q9"), /\/contact Pas de lien vers les mentions légales/);
  assert.equal(critere(propre, "Q9").verdict, "respecte");
});

test("Q10 : un site en http n'est pas en HTTPS", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q10").verdict, "non-respecte");
  assert.match(extraits(piege, "Q10"), /pas servi en HTTPS/);
});

test("Q11 : le lien de l'accueil vers une page absente", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q11").verdict, "non-respecte");
  assert.match(extraits(piege, "Q11"), /^\/ Lien vers \/ancienne-page : 404/);
  assert.equal(critere(propre, "Q11").verdict, "respecte");
});

test("PR2 : LinkedIn et Behance sont reliés depuis le site", { skip: !chrome }, () => {
  assert.equal(critere(piege, "PR2").verdict, "respecte");
  assert.equal(critere(piege, "PR2").valeur, 2);
});

test("les mesures ne changent pas la note : 20 points au jury", { skip: !chrome }, () => {
  assert.equal(piege.note.total, 20);
  assert.equal(piege.note.aJuger, 20);
  assert.equal(piege.note.lettre, "—");
  assert.equal(piege.note.base, 0);
});

// ---------- Les acquis du S1, mesurés sur le site publié ----------

const ACQUIS = ["G4", "G5", "G6", "G8", "G9", "A3", "A4", "A5", "A7", "A8", "A10", "A11", "A14", "E2", "E3", "E4", "E7", "E8", "E10", "E11", "E12", "E13", "E14", "M1", "E9"];

test("acquis S1 : 25 critères d'information, marqués s1-sae, qui gardent leur identifiant et ne changent pas la note", () => {
  const acquis = grille.criteres.filter((c) => c.origine === "s1-sae");
  assert.deepEqual(acquis.map((c) => c.id).sort(), [...ACQUIS].sort());
  assert.ok(acquis.every((c) => c.statut === "I" && c.methode === "navigateur" && /^SAÉ 105 \(S1\)/.test(c.sourceCours)));
  // Rangés dans les axes du portfolio, par thème
  const axe = (id) => acquis.find((c) => c.id === id).axe;
  assert.deepEqual([axe("G4"), axe("A5"), axe("E10"), axe("M1"), axe("E9")], ["direction-artistique", "qualite-web", "qualite-web", "technique", "presence"]);
});

test("acquis S1 : chaque critère est mesuré sur le site propre, et l'origine passe dans le résultat", { skip: !chrome }, () => {
  for (const id of ACQUIS) {
    const c = critere(propre, id);
    assert.equal(c.origine, "s1-sae", id);
    assert.equal(c.verdict, "respecte", `${id} : ${c.verdict} ${c.raison ?? ""} ${extraits(propre, id)}`);
  }
});

test("acquis S1 : structure et accessibilité du HTML rendu (A3, A4, A5, A7, A8)", { skip: !chrome }, () => {
  assert.match(extraits(piege, "A3"), /\/contact manque : footer/);
  assert.match(extraits(piege, "A4"), /^\/ .*h4/m);
  assert.match(extraits(piege, "A5"), /^\/ <img src="\/photo\.svg"/m);
  assert.match(extraits(piege, "A7"), /^\/contact <input name="email" type="text">/m);
  assert.match(extraits(piege, "A8"), /^\/ <button>/m);
  for (const id of ["A3", "A4", "A5", "A7", "A8"]) assert.equal(critere(piege, id).verdict, "non-respecte", id);
});

test("acquis S1 : ergonomie (E2 page courante, E7 lien vague, E8 champ e-mail, E9 contact, E13 dimensions, E14 vidéo)", { skip: !chrome }, () => {
  for (const id of ["E2", "E7", "E8", "E9", "E13", "E14"]) assert.equal(critere(piege, id).verdict, "non-respecte", id);
  assert.match(extraits(piege, "E2"), /^\/ <a href="\/">/m);
  assert.match(extraits(piege, "E7"), /Voir plus|<a href="\/projets">/);
  assert.match(extraits(piege, "E8"), /type="text"/);
  assert.match(extraits(piege, "E13"), /grande\.png/);
  assert.match(extraits(piege, "E14"), /<video/);
});

test("acquis S1 : poids et formats d'après le réseau du parcours (E10, E12) ; l'accueil reste léger (E11)", { skip: !chrome }, () => {
  assert.equal(critere(piege, "E10").verdict, "non-respecte");
  assert.match(extraits(piege, "E10"), /^\/ grande\.png · \d{3} Ko/);
  assert.equal(critere(piege, "E12").verdict, "non-respecte");
  assert.match(extraits(piege, "E12"), /grande\.png · image\/png/);
  assert.equal(critere(piege, "E11").verdict, "respecte");
});

test("acquis S1 : polices (G4 woff, sans swap ni pile de secours ; G6 sans preload)", { skip: !chrome }, () => {
  const g4 = critere(piege, "G4");
  assert.equal(g4.verdict, "non-respecte");
  assert.equal(g4.detailValeur, "woff2 ✕ · swap ✕ · pile de secours ✕");
  assert.match(extraits(piege, "G4"), /police\.woff/);
  assert.equal(critere(piege, "G6").verdict, "non-respecte");
  assert.equal(critere(propre, "G4").detailValeur, "woff2 ✓ · swap ✓ · pile de secours ✓");
});

test("acquis S1 : M1 valide le HTML servi (un div dans un p)", { skip: !chrome }, () => {
  const m1 = critere(piege, "M1");
  if (m1.verdict === "non-mesurable") return; // sans Java
  assert.equal(m1.verdict, "non-respecte");
  assert.match(extraits(piege, "M1"), /^\/ .*div/m);
});

// ---------- Acquis du S1, lot 2 : les styles appliqués ----------

test("acquis S1, lot 2 : A10 focus supprimé au clavier ; E3 ni :hover ni :active ; A11 mouvement sans réduction", { skip: !chrome }, () => {
  const a10 = critere(piege, "A10");
  assert.equal(a10.verdict, "non-respecte");
  assert.match(extraits(piege, "A10"), /aucun changement visible au focus/);
  assert.equal(critere(piege, "E3").verdict, "non-respecte");
  assert.equal(critere(piege, "E3").detailValeur, "manque :hover, :focus-visible, :active");
  assert.equal(critere(piege, "A11").verdict, "non-respecte");
  assert.equal(critere(propre, "A11").detailValeur, "présent (CSS)");
  assert.equal(critere(propre, "E3").detailValeur, "les trois");
});

test("acquis S1, lot 2 : E4 bouton trop petit ; A14 le bloc de 600 px au zoom 200 %", { skip: !chrome }, () => {
  assert.equal(critere(piege, "E4").verdict, "non-respecte");
  assert.match(extraits(piege, "E4"), /<button> {2}← \d+ × \d+ px/);
  assert.equal(critere(piege, "A14").verdict, "non-respecte");
  assert.match(extraits(piege, "A14"), /^\/ <div style="width:600px">/m);
});

test("acquis S1, lot 2 : G8 huit tailles de plus ; G9 un paragraphe de plus de 80 caractères par ligne à 1 280 px", { skip: !chrome }, () => {
  const g8 = critere(piege, "G8");
  assert.equal(g8.verdict, "non-respecte");
  assert.ok(g8.valeur > 7);
  const g9 = critere(piege, "G9");
  assert.equal(g9.verdict, "non-respecte");
  assert.ok(g9.valeur > 80);
  assert.match(extraits(piege, "G9"), /<p class="carte">/);
  assert.ok(critere(propre, "G9").valeur <= 80);
});
