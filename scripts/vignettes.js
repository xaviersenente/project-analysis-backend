/**
 * Vignettes des images d'un projet déjà analysé
 *
 * Lit data/<promo>/<slug>.json, crée les vignettes dans data/<promo>/vignettes/<slug>/ (hors de Git)
 * et renseigne le champ « vignette » de chaque image du résultat.
 *
 * Usage :
 *   node scripts/vignettes.js s1-sae --slug etu-01 --site ../chemin/vers/le/site
 */
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { rafraichirVignettes } from "../services/source/vignettes.js";
import { cheminResultat, choisirPromo, dossierDonnees, validerSlug } from "../services/promo/promoService.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: "string" },
    site: { type: "string" },
  },
});

if (!values.slug || !values.site) {
  console.error("Usage : node scripts/vignettes.js <promo> --slug <slug> --site <dossier du site>");
  process.exit(1);
}
try {
  choisirPromo(positionals[0]);
} catch (error) {
  console.error(error.message);
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
const { generees, manquantes } = await rafraichirVignettes({
  racineSite: values.site,
  resultat,
  dossierSortie,
});

fs.writeFileSync(fichierResultat, JSON.stringify(resultat, null, 2));

console.log(`${generees} vignette(s) dans ${dossierSortie}`);
for (const { fichier, raison } of manquantes) console.log(`  sans vignette : ${fichier} (${raison})`);
