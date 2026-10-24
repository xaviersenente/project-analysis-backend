/**
 * Vignettes des images d'un projet déjà analysé
 *
 * Lit data/<slug>.json, crée les vignettes dans data/vignettes/<slug>/ (hors de Git)
 * et renseigne le champ « vignette » de chaque image du résultat.
 *
 * Usage :
 *   node scripts/vignettes.js --slug etu-01 --site ../chemin/vers/le/site
 */
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { genererVignettes } from "../services/source/vignettes.js";
import { cheminResultat, dossierDonnees, validerSlug } from "../services/promo/promoService.js";

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    site: { type: "string" },
  },
});

if (!values.slug || !values.site) {
  console.error("Usage : node scripts/vignettes.js --slug <slug> --site <dossier du site>");
  process.exit(1);
}

const slug = validerSlug(values.slug);
const fichierResultat = cheminResultat(slug);
if (!fs.existsSync(fichierResultat)) {
  console.error(`Résultat introuvable : ${fichierResultat}`);
  process.exit(1);
}

const resultat = JSON.parse(fs.readFileSync(fichierResultat, "utf-8"));
const dossierSortie = path.join(dossierDonnees(), "vignettes", slug);
const { generees, manquantes } = await genererVignettes({
  racineSite: values.site,
  resultat,
  dossierSortie,
});

// Les vignettes d'images qui ont disparu du site sont retirées
const utilisees = new Set(
  (resultat.ressources?.images ?? []).map((i) => i.vignette && path.basename(i.vignette)).filter(Boolean)
);
for (const fichier of fs.readdirSync(dossierSortie)) {
  if (!utilisees.has(fichier)) fs.unlinkSync(path.join(dossierSortie, fichier));
}

fs.writeFileSync(fichierResultat, JSON.stringify(resultat, null, 2));

console.log(`${generees} vignette(s) dans ${dossierSortie}`);
for (const { fichier, raison } of manquantes) console.log(`  sans vignette : ${fichier} (${raison})`);
