/**
 * Migration des résultats nominatifs vers des slugs (S4)
 *
 * Renomme data/<Prénom NOM>.json en data/<slug>.json et crée data/promo.json.
 * Les fichiers d'origine sont déplacés dans data/_avant-migration/.
 *
 * Usage :
 *   node scripts/migrerDonnees.js --essai                  affiche sans rien modifier
 *   node scripts/migrerDonnees.js                          slugs anonymes : etu-01, etu-02…
 *   node scripts/migrerDonnees.js --nominatif              slugs tirés du nom : alex-ringenbach
 *   node scripts/migrerDonnees.js --exclure "Ruslana,Xavier SENENTE"
 */
import fs from "fs";
import path from "path";
import { dossierDonnees, SLUG_REGEX } from "../services/promo/promoService.js";

const args = process.argv.slice(2);
const essai = args.includes("--essai");
const nominatif = args.includes("--nominatif");
const iExclure = args.indexOf("--exclure");
const exclus = iExclure >= 0 ? args[iExclure + 1].split(",").map((n) => n.trim()) : [];

const dossier = dossierDonnees();
const fichierPromo = path.join(dossier, "promo.json");
const dossierSauvegarde = path.join(dossier, "_avant-migration");

if (fs.existsSync(fichierPromo)) {
  console.error(`${fichierPromo} existe déjà : migration annulée.`);
  process.exit(1);
}

/**
 * « Mathéo GIRARDIN TARBY » → « matheo-girardin-tarby »
 */
const versSlug = (nom) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const noms = fs
  .readdirSync(dossier)
  .filter((f) => f.endsWith(".json") && f !== "promo.json")
  .map((f) => f.replace(/\.json$/, ""))
  .sort((a, b) => a.localeCompare(b, "fr"));

const retenus = noms.filter((nom) => !exclus.includes(nom));
const largeur = String(retenus.length).length < 2 ? 2 : String(retenus.length).length;

const projets = retenus.map((nom, i) => ({
  slug: nominatif ? versSlug(nom) : `etu-${String(i + 1).padStart(largeur, "0")}`,
  nom,
  groupe: "",
  site: "",
}));

// Contrôles : forme et unicité des slugs
const doublons = projets.filter((p, i) => projets.findIndex((q) => q.slug === p.slug) !== i);
const invalides = projets.filter((p) => !SLUG_REGEX.test(p.slug));
if (doublons.length || invalides.length) {
  console.error("Slugs en double ou invalides :", [...doublons, ...invalides].map((p) => p.nom));
  process.exit(1);
}

console.table(projets.map(({ slug, nom }) => ({ slug, nom })));
if (exclus.length) console.log("Exclus (laissés dans _avant-migration/) :", exclus.join(", "));

if (essai) {
  console.log("Essai : aucun fichier modifié.");
  process.exit(0);
}

fs.mkdirSync(dossierSauvegarde, { recursive: true });
for (const nom of noms) {
  const source = path.join(dossier, `${nom}.json`);
  const projet = projets.find((p) => p.nom === nom);
  if (projet) fs.copyFileSync(source, path.join(dossier, `${projet.slug}.json`));
  fs.renameSync(source, path.join(dossierSauvegarde, `${nom}.json`));
}

fs.writeFileSync(
  fichierPromo,
  JSON.stringify({ dateRendu: "", projets }, null, 2) + "\n"
);

console.log(`${projets.length} projets migrés. Compléter groupe, site et dateRendu dans ${fichierPromo}.`);
