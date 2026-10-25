/**
 * Fidélité à la maquette Figma (G11) : lecture de la maquette, écrans associés aux pages,
 * comparaison des textes et des couleurs avec le site relevé en navigateur.
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";
import { cleFigma, choisirVersion } from "../services/maquette/figma.js";
import { extraireEcrans, apparier } from "../services/maquette/ecrans.js";
import { comparerEcran, normaliserTexte, distanceCouleur } from "../services/maquette/comparaison.js";

const maquette = createRequire(import.meta.url)("./fixtures/maquette-piege.json");
const { ecrans, palette } = extraireEcrans(maquette);
const ecran = (nom) => ecrans.find((e) => e.nom === nom);

test("clé du fichier lue dans les différentes formes de lien Figma", () => {
  assert.equal(cleFigma("https://www.figma.com/design/JbpYD4vvwPGzffeUQ3icGg/BBrands-Agency?node-id=0-1&t=abc"), "JbpYD4vvwPGzffeUQ3icGg");
  assert.equal(cleFigma("https://www.figma.com/file/AbCdEf1234567890/Maquette"), "AbCdEf1234567890");
  assert.equal(cleFigma("https://www.figma.com/proto/AbCdEf1234567890/Maquette?page-id=1"), "AbCdEf1234567890");
  assert.equal(cleFigma("https://exemple.fr/maquette"), null);
  assert.equal(cleFigma(null), null);
});

test("version de référence : la dernière enregistrée avant la date de rendu", () => {
  const versions = [
    { id: "3", created_at: "2027-01-07T09:00:00Z" },
    { id: "2", created_at: "2027-01-06T16:30:00Z" },
    { id: "1", created_at: "2026-10-21T08:00:00Z" },
  ];
  assert.equal(choisirVersion(versions, "2027-01-06T18:00:00+01:00").id, "2");
  assert.equal(choisirVersion(versions, "2026-10-01T00:00:00+02:00"), null);
});

test("écrans : les cadres mobiles des pages de maquette, sections comprises", () => {
  // Guide de style et moodboard écartés, cadre de 1 440 px écarté
  assert.deepEqual(ecrans.map((e) => e.nom), ["Accueil Mobile", "Contact Mobile", "Menu ouvert"]);
  assert.equal(ecran("Accueil Mobile").largeur, 393);
  assert.equal(ecran("Accueil Mobile").id, "3:1");
});

test("textes d'un écran : visibles seulement, avec police, taille, graisse et couleur, de haut en bas", () => {
  const textes = ecran("Accueil Mobile").textes;
  assert.deepEqual(textes.map((t) => t.texte), [
    "Le studio Piège",
    "NOTRE DERNIER PROJET",
    "Un site sobre pour une association de quartier.",
    "Des sites rapides et accessibles",
    "bonjour@piege.test",
  ]);
  assert.deepEqual(textes[0], { texte: "Le studio Piège", police: "Texte", taille: 32, graisse: 700, couleur: "#1a1a1a", y: 80 });
});

test("palette de la maquette : guide de style compris, moodboard écarté", () => {
  assert.ok(palette.includes("#1d4ed8"));
  assert.ok(palette.includes("#e2e2e2"));
  assert.ok(palette.includes("#ffffff"));
  assert.ok(!palette.includes("#ff0000"));
});

test("écrans associés aux pages par leur nom ; le reste est signalé", () => {
  const pages = [
    { fichier: "index.html", titre: "Studio Piège — Accueil" },
    { fichier: "contact.html", titre: "Studio Piège — Contact" },
  ];
  const { paires, ecransSansPage, pagesSansEcran } = apparier(ecrans, pages);
  assert.deepEqual(paires.map((p) => [p.ecran.nom, p.fichier]), [
    ["Accueil Mobile", "index.html"],
    ["Contact Mobile", "contact.html"],
  ]);
  assert.deepEqual(ecransSansPage, ["Menu ouvert"]);
  assert.deepEqual(pagesSansEcran, []);
});

test("association : liste et fiche, accueil en anglais, forçage du fichier de promo", () => {
  const noms = (liste) => liste.map((nom, i) => ({ id: String(i), nom, largeur: 393, textes: [] }));
  const pages = ["index.html", "events.html", "event.html", "works.html", "work.html", "team.html"].map((fichier) => ({ fichier, titre: "" }));
  const { paires } = apparier(noms(["Home Mobile", "Event List Mobile", "Event Single Mobile", "Works Mobile", "Works Single Mobile", "Team Mobile"]), pages);
  assert.deepEqual(paires.map((p) => p.fichier), ["index.html", "events.html", "event.html", "works.html", "work.html", "team.html"]);

  const forcees = apparier(noms(["Page 1", "Hamburger"]), pages, { "Page 1": "team.html", Hamburger: null });
  assert.deepEqual(forcees.paires.map((p) => [p.ecran.nom, p.fichier]), [["Page 1", "team.html"]]);
  assert.deepEqual(forcees.ecransSansPage, []);
});

test("textes comparés sans tenir compte de la casse, des espaces, des apostrophes typographiques ni de la ponctuation finale", () => {
  assert.equal(normaliserTexte("  NOTRE   dernier\nprojet "), "notre dernier projet");
  assert.equal(normaliserTexte("L’équipe"), normaliserTexte("L'équipe"));
  assert.equal(normaliserTexte("Date :"), "date");
  assert.equal(distanceCouleur("#000000", "#000000"), 0);
  assert.ok(distanceCouleur("#1a1a1a", "#111111") < 20);
  assert.ok(distanceCouleur("#1d4ed8", "#dc2626") > 100);
});

test("comparaison d'un écran : conformes, écarts de style, textes absents, couleurs hors maquette", () => {
  const releve = {
    textes: [
      { texte: "Le studio Piège", police: '"Texte", system-ui, sans-serif', taille: 32, graisse: 700, couleur: "#1a1a1a", extrait: '<h1 class="contenu__titre">' },
      // text-transform: uppercase côté site : même texte
      { texte: "Notre dernier projet", police: "Texte, sans-serif", taille: 24, graisse: 700, couleur: "#1a1a1a", extrait: '<h2 class="carte__titre">' },
      { texte: "Un site sobre pour une association de quartier.", police: "Arial", taille: 16, graisse: 400, couleur: "#dc2626", extrait: '<p class="carte__texte">' },
      { texte: "bonjour@piege.test", police: "Texte", taille: 16.4, graisse: 400, couleur: "#1d4ed8", extrait: '<a href="mailto:bonjour@piege.test">' },
    ],
    couleurs: [
      { couleur: "#1a1a1a", extrait: "<body>" },
      { couleur: "#dc2626", extrait: '<p class="carte__texte">' },
      { couleur: "#ffffff", extrait: "<body>" },
    ],
  };
  const r = comparerEcran(ecran("Accueil Mobile"), releve, palette);
  assert.equal(r.total, 5);
  assert.equal(r.trouves, 4);
  assert.equal(r.conformes, 2);
  const parTexte = Object.fromEntries(r.textes.map((t) => [t.texte, t]));
  assert.equal(parTexte["Le studio Piège"].statut, "conforme");
  // Taille arrondie au pixel : 16,4 px reste conforme à 16 px
  assert.equal(parTexte["bonjour@piege.test"].statut, "conforme");
  assert.deepEqual(parTexte["NOTRE DERNIER PROJET"].ecarts, [{ propriete: "taille", maquette: "20 px", site: "24 px" }]);
  assert.equal(parTexte["NOTRE DERNIER PROJET"].extrait, '<h2 class="carte__titre">');
  assert.deepEqual(parTexte["Un site sobre pour une association de quartier."].ecarts.map((e) => e.propriete), ["police", "couleur"]);
  assert.equal(parTexte["Des sites rapides et accessibles"].statut, "absent");
  assert.deepEqual(r.couleursHorsMaquette, [{ couleur: "#dc2626", extrait: '<p class="carte__texte">' }]);
});

test("un texte affiché passe avant le même texte dans un menu fermé", () => {
  const ecranTeam = { nom: "Team", largeur: 393, textes: [{ texte: "TEAM", police: "Inter", taille: 12, graisse: 400, couleur: "#000000", y: 400 }] };
  const releve = { textes: [
    { texte: "Team", police: "Inter", taille: 24, graisse: 600, couleur: "#ffffff", extrait: '<a class="menu__link">', affiche: false },
    { texte: "TEAM", police: "Inter", taille: 12, graisse: 400, couleur: "#000000", extrait: '<p class="surtitre">', affiche: true },
  ], couleurs: [] };
  const [t] = comparerEcran(ecranTeam, releve, ["#000000"]).textes;
  assert.equal(t.statut, "conforme");
  assert.equal(t.extrait, '<p class="surtitre">');
});

test("écarts justifiés : texte trop petit agrandi à 12 px, gris sans contraste foncé jusqu'au contraste requis", () => {
  const ecranA11y = { nom: "Équipe", largeur: 393, textes: [
    { texte: "UX Designer @Google", police: "Inter", taille: 10, graisse: 400, couleur: "#7b7b7b", y: 10 },
    { texte: "Morganne Flaherty", police: "Inter", taille: 14, graisse: 500, couleur: "#7b7b7b", y: 30 },
    { texte: "Contact", police: "Inter", taille: 10, graisse: 400, couleur: "#000000", y: 50 },
  ] };
  const releve = { textes: [
    { texte: "UX Designer @Google", police: "Inter", taille: 12, graisse: 400, couleur: "#5f5f5f", fond: "#ffffff", extrait: "<p>" },
    // Même gris, mais une graisse différente : seul l'écart de graisse reste
    { texte: "Morganne Flaherty", police: "Inter", taille: 14, graisse: 600, couleur: "#5f5f5f", fond: "#ffffff", extrait: "<h2>" },
    // 16 px : au-delà de la taille lisible, c'est un vrai écart
    { texte: "Contact", police: "Inter", taille: 16, graisse: 400, couleur: "#000000", fond: "#ffffff", extrait: "<a>" },
  ], couleurs: [] };
  const r = comparerEcran(ecranA11y, releve, ["#7b7b7b", "#000000", "#ffffff"]);
  assert.deepEqual(r.textes.map((t) => t.statut), ["justifie", "ecart", "ecart"]);
  assert.deepEqual(r.textes[1].ecarts.map((e) => e.propriete), ["graisse"]);
  assert.deepEqual(r.textes[1].justifies.map((e) => e.propriete), ["couleur"]);
  assert.equal(r.conformes, 1);
  assert.equal(r.justifies, 1);
});

test("un texte répété est apparié dans l'ordre : chaque exemplaire du site ne sert qu'une fois", () => {
  const repete = { nom: "Liste", largeur: 393, textes: [
    { texte: "See All", police: "Inter", taille: 20, graisse: 600, couleur: "#000000", y: 10 },
    { texte: "See All", police: "Inter", taille: 20, graisse: 600, couleur: "#000000", y: 900 },
  ] };
  const releve = { textes: [{ texte: "See all", police: "Inter", taille: 20, graisse: 600, couleur: "#000000", extrait: "<a>" }], couleurs: [] };
  const r = comparerEcran(repete, releve, ["#000000"]);
  assert.deepEqual(r.textes.map((t) => t.statut), ["conforme", "absent"]);
});
