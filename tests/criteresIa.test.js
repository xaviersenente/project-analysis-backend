/**
 * Lot 5 du plan hybride : les critères dont un niveau est proposé par l'IA (Q13, ED2, PC6).
 * Pseudonymisation, vérificateur de preuves, autorisation de la promo. Client simulé : aucun appel réel.
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { preparerDepotPortfolio, PROMO_PORTFOLIO } from "./aides/portfolioPiege.js";
import { pseudonymiser, verifierPreuves, documentNumerote, proposerNiveau, lirePrompt } from "../services/ia/evaluer.js";
import { analyserPortfolio } from "../services/analyse/analyserPortfolio.js";
import { chargerGrille } from "../services/grilles/grilles.js";
import { resultatSchema } from "../schema/resultat.js";

const grille = chargerGrille("s3-portfolio-2026");
const depot = preparerDepotPortfolio({ propre: true });
const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-cache-ia-"));
after(() => {
  fs.rmSync(depot, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
});

const clientSimule = (repondre) => {
  const requetes = [];
  return { requetes, beta: { messages: { parse: async (params) => (requetes.push(params), repondre(params)) } } };
};
const critere = (id) => grille.criteres.find((c) => c.id === id);

test("pseudonymisation : le nom (avec ou sans accents), l'e-mail et le téléphone sont remplacés", () => {
  const texte = "Andréa MESTRE · andrea.mestre@exemple.fr · 06 12 34 56 78 · Andrea a fait le logo. Mestrel n'est pas un nom.";
  const sortie = pseudonymiser(texte, "Andrea MESTRE");
  assert.equal(sortie, "[NOM] [NOM] · [e-mail] · [téléphone] · [NOM] a fait le logo. Mestrel n'est pas un nom.");
});

test("une preuve n'est gardée que si son extrait est à la ligne citée (ou passe à la ligne suivante)", () => {
  const documents = [{ fichier: "QUALITE.md", texte: "# Qualité\n| Contrastes | WAVE | couleur du lien |\nCe critère continue\nsur deux lignes." }];
  const { retenues, ecartees } = verifierPreuves(
    [
      { fichier: "QUALITE.md", ligne: 2, extrait: "Contrastes | WAVE" },
      { fichier: "QUALITE.md", ligne: 3, extrait: "continue sur deux lignes" },
      { fichier: "QUALITE.md", ligne: 1, extrait: "Contrastes | WAVE" },
      { fichier: "QUALITE.md", ligne: 2, extrait: "WAVE" },
      { fichier: "autre.md", ligne: 1, extrait: "n'importe quoi ici" },
    ],
    documents
  );
  assert.deepEqual(retenues.map((p) => p.ligne), [2, 3]);
  assert.equal(ecartees, 3);
  assert.match(documentNumerote(documents[0]), /^=== QUALITE\.md ===\n   1 \| # Qualité\n   2 \| \| Contrastes/);
});

test("une proposition sans aucune preuve retrouvée est écartée ; un niveau hors échelle est refusé par le schéma", async () => {
  const documents = [{ fichier: "IA.md", texte: "| Claude | Intégration | J'ai corrigé le menu |" }];
  const inventee = clientSimule(() => ({ stop_reason: "end_turn", parsed_output: { niveau: "cohérente", justification: "…", preuves: [{ fichier: "IA.md", ligne: 1, extrait: "j'ai tout écrit seul" }] } }));
  await assert.rejects(proposerNiveau({ critere: critere("PC6"), prompt: "ia-md", documents, client: inventee }), /aucune des 1 preuve/);
  // Le schéma de sortie structurée porte l'échelle de la grille
  const client = clientSimule((params) => ({ stop_reason: "end_turn", parsed_output: { niveau: "partielle", justification: "…", preuves: [{ fichier: "IA.md", ligne: 1, extrait: "J'ai corrigé le menu" }] } }));
  const p = await proposerNiveau({ critere: critere("PC6"), prompt: "ia-md", documents, client });
  assert.equal(p.niveau, "partielle");
  assert.equal(p.prompt, lirePrompt("ia-md").empreinte);
  assert.match(JSON.stringify(client.requetes[0].output_config.format), /incohérente/);
});

const analyser = (promo, clientIa) =>
  analyserPortfolio({ projet: { slug: "alice-martin", nom: "Alice Martin", groupe: "S3", depot }, promo, grille, cache, clientIa }).then((r) => r.resultat);

test("sans autorisation, aucun appel : les critères IA sont « Non mesurable » et le disent", async () => {
  const client = clientSimule(() => assert.fail("aucun appel attendu"));
  const resultat = await analyser(PROMO_PORTFOLIO, client);
  for (const id of ["Q13", "ED2", "PC6"]) {
    const c = resultat.criteres.find((x) => x.id === id);
    assert.equal(c.verdict, "non-mesurable");
    assert.match(c.raison, /ia\.criteres/);
  }
  assert.equal(client.requetes.length, 0);
});

test("avec l'autorisation : une proposition à juger, avec ses preuves ; le nom n'est jamais envoyé", async () => {
  // Le client répond en citant la première ligne de chaque document qu'on lui envoie
  const client = clientSimule((params) => {
    const contenu = params.messages[0].content;
    const fichier = contenu.match(/=== (.+) ===/)[1];
    const ligne = contenu.match(/=== .+ ===\n\s*1 \| (.+)/)[1];
    return { stop_reason: "end_turn", parsed_output: { niveau: params.output_config.format.schema?.properties?.niveau?.enum?.[2] ?? "partielle", justification: "Proposition de test.", preuves: [{ fichier, ligne: 1, extrait: ligne }] } };
  });
  const resultat = await analyser({ ...PROMO_PORTFOLIO, ia: { criteres: true } }, client);
  assert.ok(resultatSchema.safeParse(resultat).success);
  // Sans site parcouru, ED2 ne peut rien évaluer ; Q13 et PC6 lisent le dépôt
  assert.equal(resultat.criteres.find((c) => c.id === "ED2").verdict, "non-mesurable");
  for (const id of ["Q13", "PC6"]) {
    const c = resultat.criteres.find((x) => x.id === id);
    assert.equal(c.verdict, "a-juger", `${id} : ${c.raison}`);
    assert.ok(c.proposition.preuves.length >= 1);
    assert.equal(c.occurrences.length, c.proposition.preuves.length);
    assert.match(c.detailValeur, /^niveau proposé : /);
    // Une information : aucun point, la note ne bouge pas
    assert.equal(c.points, null);
  }
  assert.equal(client.requetes.length, 2);
  for (const r of client.requetes) assert.doesNotMatch(JSON.stringify(r.messages), /Alice|Martin/);
});

test("ED2 : seules les pages de projets sont envoyées, pseudonymisées, une par document", async () => {
  const { default: criteresIa } = await import("../services/analyse/criteresIa.js");
  const page = (chemin, texte) => ({ page: true, chemin, titre: chemin, texte });
  const ctx = {
    projet: { nom: "Alice Martin" },
    promo: { ia: { criteres: true } },
    parcours: {
      url: "https://alice.fr/",
      pages: [
        page("/", "Bonjour, je suis Alice Martin."),
        page("/projets", "Mes projets"),
        page("/projets/affiche", "La commande : une affiche pour le festival. Mon rôle : direction artistique."),
        page("/projets/site-asso", "Contexte : une association. Alice a codé le site en Astro."),
      ],
    },
  };
  ctx.clientIa = clientSimule((params) => ({
    stop_reason: "end_turn",
    parsed_output: { niveau: "partielle", justification: "…", preuves: [{ fichier: "/projets/affiche", ligne: 3, extrait: "La commande : une affiche pour le festival" }] },
  }));
  const mesure = await criteresIa.ED2(ctx, critere("ED2"));
  assert.equal(mesure.verdict, "a-juger");
  const envoye = ctx.clientIa.requetes[0].messages[0].content;
  assert.deepEqual([...envoye.matchAll(/=== (.+) ===/g)].map((m) => m[1]), ["/projets/affiche", "/projets/site-asso"]);
  assert.match(envoye, /\[NOM\] a codé le site/);
  assert.doesNotMatch(envoye, /Alice/);
});
