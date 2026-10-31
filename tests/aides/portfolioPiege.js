/**
 * Portfolio piégé (lot 2 du plan hybride) : un site servi sur 127.0.0.1, et un faux service tiers
 * sur localhost (un autre domaine). Les pièges, page par page :
 * - index : police chargée chez le tiers, bloc de 600 px (défilement à 360 px), image sans alt,
 *   lien vers une page absente, liens LinkedIn et Behance, lien vers les mentions légales
 * - projets : même title que l'accueil, pas de description, deux h1
 * - mentions-legales : l'hébergeur nommé, pas l'éditeur
 * - contact : sans lien vers les mentions légales
 * - ni robots.txt ni sitemap.xml ; servi en http
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import express from "express";

const page = ({ titre, description, corps, police = "" }) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre}</title>
${description ? `<meta name="description" content="${description}">` : ""}
${police}
</head>
<body>
<header><nav aria-label="Principale"><a href="/">Accueil</a> <a href="/projets">Projets</a> <a href="/contact">Contact</a></nav></header>
<main>${corps}</main>
</body>
</html>`;

const ecouter = (app) =>
  new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

/**
 * @param {{ propre?: boolean }} [options] - propre : la version sans piège (robots, sitemap, rien chez un tiers)
 * @returns {Promise<{ url: string, fermer: () => Promise<void> }>}
 */
export const servirPortfolio = async ({ propre = false } = {}) => {
  const tiers = express();
  tiers.get("/police.css", (req, res) => res.type("css").send("body { font-family: serif; }"));
  const serveurTiers = await ecouter(tiers);
  const police = propre ? "" : `<link rel="stylesheet" href="http://localhost:${serveurTiers.address().port}/police.css">`;
  const mentions = '<footer><a href="/mentions-legales">Mentions légales</a></footer>';

  const pages = {
    "/": page({
      titre: "Alice Martin, designer",
      description: "Le portfolio d'Alice Martin.",
      police,
      corps: propre
        ? `<h1>Alice Martin</h1><p>Designer graphique.</p><img src="/photo.svg" alt="Alice au travail" width="100" height="100">
           <a href="https://www.linkedin.com/in/alice">LinkedIn</a> <a href="https://www.behance.net/alice">Behance</a>${mentions}`
        : `<h1>Alice Martin</h1><div style="width:600px">Un bandeau trop large</div><img src="/photo.svg" width="100" height="100">
           <a href="/ancienne-page">Ancien projet</a> <a href="https://www.linkedin.com/in/alice">LinkedIn</a> <a href="https://www.behance.net/alice">Behance</a>${mentions}`,
    }),
    "/projets": page(
      propre
        ? { titre: "Projets · Alice Martin", description: "Trois projets.", corps: `<h1>Projets</h1>${mentions}` }
        : { titre: "Alice Martin, designer", corps: `<h1>Projets</h1><h1>Encore un titre</h1>${mentions}` }
    ),
    "/mentions-legales": page({
      titre: "Mentions légales · Alice Martin",
      description: "Mentions légales du site.",
      corps: propre
        ? "<h1>Mentions légales</h1><p>Éditeur : Alice Martin. Hébergeur : OVH, 2 rue Kellermann, Roubaix.</p>"
        : "<h1>Mentions légales</h1><p>Site hébergé par OVH, 2 rue Kellermann, Roubaix.</p>",
    }),
    "/contact": page({ titre: "Contact · Alice Martin", description: "Écrire à Alice.", corps: `<h1>Contact</h1>${propre ? mentions : ""}` }),
  };

  const site = express();
  site.get("/photo.svg", (req, res) => res.type("svg").send('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>'));
  if (propre) {
    site.get("/robots.txt", (req, res) => res.type("text").send(`User-agent: *\nSitemap: ${req.protocol}://${req.get("host")}/sitemap.xml\n`));
    site.get("/sitemap.xml", (req, res) =>
      res.type("xml").send(`<?xml version="1.0"?><urlset>${Object.keys(pages).map((p) => `<url><loc>${req.protocol}://${req.get("host")}${p}</loc></url>`).join("")}</urlset>`)
    );
  }
  for (const [chemin, html] of Object.entries(pages)) site.get(chemin, (req, res) => res.type("html").send(html));
  site.use((req, res) => res.status(404).type("html").send(page({ titre: "Introuvable", corps: "<h1>Introuvable</h1>" })));
  const serveurSite = await ecouter(site);

  const fermer = (s) => new Promise((resolve) => s.close(() => resolve()));
  return {
    url: `http://127.0.0.1:${serveurSite.address().port}/`,
    fermer: async () => {
      await fermer(serveurSite);
      await fermer(serveurTiers);
    },
  };
};

// ---------- Le dépôt du portfolio (lot 3) ----------


export const PROMO_PORTFOLIO = { dateDebut: "2026-09-25T08:00:00+02:00", dateRendu: "2026-11-20T18:00:00+01:00" };

const git = (dossier, args, date) =>
  execFileSync("git", args, {
    cwd: dossier,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Alice Martin",
      GIT_AUTHOR_EMAIL: "alice@etu.test",
      GIT_COMMITTER_NAME: "Alice Martin",
      GIT_COMMITTER_EMAIL: "alice@etu.test",
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
    stdio: "pipe",
  }).toString();

const ecrire = (dossier, fichiers) => {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(dossier, chemin)), { recursive: true });
    fs.writeFileSync(path.join(dossier, chemin), contenu);
  }
};

const PACKAGE = (deps) => JSON.stringify({ name: "portfolio", type: "module", dependencies: deps }, null, 2);

/**
 * Le dépôt Astro du portfolio. Pièges : pas d'IA.md, journal sur deux semaines, pas de QUALITE.md,
 * base de données et .env versionnés (une clé en dur), un commit co-signé par Claude, crédit html5up,
 * bibliothèques absentes du README, tout le travail dans les 48 dernières heures.
 * Version propre : les trois fichiers à la racine, une semaine par entrée, travail étalé.
 * @returns {string} - Le dossier du dépôt
 */
export const preparerDepotPortfolio = ({ propre = false } = {}) => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-depot-"));
  git(dossier, ["init", "-q", "-b", "main"]);
  const commun = {
    "package.json": PACKAGE({ astro: "^5.0.0", tailwindcss: "^4.0.0", pocketbase: "^0.26.0" }),
    "src/pages/index.astro": "---\nimport Carte from '../components/Carte.astro';\n---\n<Carte />\n",
    "src/pages/admin/index.astro": "<h1>Administration</h1>\n",
    "src/components/Carte.astro": "<article><slot /></article>\n",
    "src/components/Entete.astro": "<header />\n",
    "src/lib/pb.js": "import PocketBase from 'pocketbase';\nexport const pb = new PocketBase(import.meta.env.PB_URL);\nexport const projets = () => pb.collection('projets').getFullList();\n",
  };
  if (propre) {
    const semaines = Array.from({ length: 8 }, (_, i) => new Date(Date.UTC(2026, 8, 28 + i * 7, 9)));
    ecrire(dossier, {
      ...commun,
      "README.md": "# Portfolio d'Alice\n\nConstruit avec Astro, Tailwind et PocketBase.\n",
      "IA.md": "# Déclaration IA\n\n| Outil | Étape | Usage | Ce que j'ai modifié |\n|---|---|---|---|\n| Claude | Intégration | Composants Astro | J'ai corrigé l'accessibilité du menu et rejeté la grille proposée |\n",
      "QUALITE.md": "# Qualité\n\n| Critère | Vérification | Correction |\n|---|---|---|\n| Contrastes (accessibilité) | WAVE | couleur du lien |\n| Poids des images (sobriété) | EcoIndex | AVIF |\n| Meta description (référencement) | Lighthouse | ajoutée |\n| Mentions légales (juridique) | relecture | hébergeur ajouté |\n",
      "JOURNAL.md": semaines.map((d) => `## ${d.toISOString().slice(0, 10)}\n\nTravail de la semaine.\n`).join("\n"),
    });
    git(dossier, ["add", "-A"]);
    git(dossier, ["commit", "-q", "-m", "Mise en place"], "2026-09-26T10:00:00+02:00");
    // Douze jours de travail, un par semaine ou presque
    for (let i = 1; i <= 12; i++) {
      fs.appendFileSync(path.join(dossier, "src/components/Carte.astro"), `<!-- étape ${i} -->\n`);
      git(dossier, ["commit", "-q", "-am", `Étape ${i} du portfolio`], new Date(Date.UTC(2026, 8, 27 + i * 4, 14)).toISOString());
    }
    return dossier;
  }
  ecrire(dossier, {
    ...commun,
    "README.md": "# Portfolio\n\nFait avec Astro.\n",
    "JOURNAL.md": "## 13/11\n\nDébut.\n\n## 18/11\n\nFin.\n",
    "src/styles/theme.css": "/* Design by HTML5 UP | html5up.net */\nbody { margin: 0; }\n",
    "pb_data/data.db": "SQLite format 3",
    ".env": "PB_URL=http://127.0.0.1:8090\n",
    "src/config.js": 'export const config = { apiKey: "a1b2c3d4e5f6g7h8i9" };\n',
  });
  // -f : un .gitignore global ne doit pas retirer le piège
  git(dossier, ["add", "-A", "-f"]);
  git(dossier, ["commit", "-q", "-m", "Tout le site"], "2026-11-19T22:00:00+01:00");
  fs.appendFileSync(path.join(dossier, "src/components/Carte.astro"), "<!-- menu -->\n");
  git(dossier, ["commit", "-q", "-am", "Menu\n\nCo-Authored-By: Claude <noreply@anthropic.com>"], "2026-11-20T10:00:00+01:00");
  return dossier;
};
