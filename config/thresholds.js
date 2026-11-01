/**
 * Configuration centralisée des seuils : aucun seuil en dur dans un analyseur.
 * Un fichier par usage, dans config/seuils/ ; ce fichier les rassemble, et les analyseurs
 * continuent de l'importer (thresholds.sae105, thresholds.portfolio…).
 *
 * - seuils/commun.js : performance (délais, écran émulé), enLigne, vignettes, scoring
 * - seuils/sae105.js : tags (contenus attendus par défaut, A15) et sae105 (les seuils, axe par axe)
 * - seuils/portfolio.js : portfolio (parcours, qualité web, dépôt, soutenance, IA)
 *
 * Une nouvelle SAÉ ajoute son fichier ici, sous une clé à son nom.
 */
import commun from "./seuils/commun.js";
import sae105 from "./seuils/sae105.js";
import portfolio from "./seuils/portfolio.js";

export default { ...commun, ...sae105, ...portfolio };
