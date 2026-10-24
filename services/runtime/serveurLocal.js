/**
 * Étape 5 : le dépôt servi en local, monté sous /<nom-du-dépôt>/ comme un site de projet
 * GitHub Pages. Un chemin en / échoue alors comme en ligne, et la casse est respectée
 * même sur un disque qui l'ignore : le rendu local ne masque plus ces erreurs.
 */
import path from "path";
import express from "express";

/** Nom du dépôt : la dernière partie de « propriétaire/dépôt », d'une URL ou d'un chemin */
export const nomDuDepot = (depot) =>
  path.posix.basename(depot.replace(/\\/g, "/").replace(/\/+$/, "")).replace(/\.git$/, "");

/**
 * @param {string} racine - Racine du site
 * @param {string} nom - Nom du dépôt (préfixe des adresses)
 * @param {string[]} fichiers - Fichiers du site, en chemins relatifs (casse exacte)
 * @returns {Promise<{ url: string, fermer: () => Promise<void> }>}
 */
export const servir = async (racine, nom, fichiers) => {
  const connus = new Set(fichiers);
  const app = express();
  const prefixe = `/${encodeURIComponent(nom)}`;

  app.use(prefixe, (req, res, next) => {
    let chemin;
    try {
      chemin = decodeURIComponent(req.path).replace(/^\//, "");
    } catch {
      return res.sendStatus(400);
    }
    if (chemin === "" || chemin.endsWith("/")) chemin += "index.html";
    // La casse exacte, comme sur GitHub Pages ; rien hors de la liste des fichiers
    if (!connus.has(path.posix.normalize(chemin))) return res.sendStatus(404);
    next();
  });
  app.use(prefixe, express.static(racine, { dotfiles: "ignore", redirect: false, fallthrough: false }));
  app.use((req, res) => res.sendStatus(404));

  const serveur = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    url: `http://127.0.0.1:${serveur.address().port}${prefixe}/`,
    fermer: () => new Promise((resolve) => serveur.close(() => resolve())),
  };
};
