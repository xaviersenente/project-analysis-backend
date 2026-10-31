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

test("sans adresse du site, les mesures sont « Non mesurable » et les contraintes attendent le jury", async () => {
  const { resultat } = await analyserPortfolio({ projet: projet(undefined), promo, grille });
  assert.ok(resultatSchema.safeParse(resultat).success);
  assert.ok(resultat.criteres.filter((c) => c.statut === "I").every((c) => c.verdict === "non-mesurable" && /adresse du site/.test(c.raison)));
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

test("Q3 : l'image sans alt est une erreur d'accessibilité", { skip: !chrome }, () => {
  assert.equal(critere(piege, "Q3").verdict, "non-respecte");
  assert.match(extraits(piege, "Q3"), /image-alt/);
  assert.equal(critere(propre, "Q3").verdict, "respecte");
});

test("Q4 : le bloc de 600 px fait défiler l'accueil à 360 px", { skip: !chrome }, () => {
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
