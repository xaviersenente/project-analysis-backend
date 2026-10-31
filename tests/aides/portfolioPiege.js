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
