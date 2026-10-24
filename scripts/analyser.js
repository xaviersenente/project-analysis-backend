/**
 * Analyse des projets de la promo, en local (lot 1 : analyse statique du dépôt)
 *
 * Pour chaque projet du fichier de promo : version figée du dépôt, analyse,
 * résultat v2 dans data/<slug>.json et vignettes dans data/vignettes/<slug>/.
 *
 * Usage :
 *   node scripts/analyser.js --slug etu-01
 *   node scripts/analyser.js --tous
 *   node scripts/analyser.js --tous --sans-w3c      (sans Java)
 */
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { chargerPromo, cheminResultat, dossierDonnees, validerSlug } from "../services/promo/promoService.js";
import { analyserDepot } from "../services/analyse/analyserDepot.js";
import { rafraichirVignettes } from "../services/source/vignettes.js";

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    tous: { type: "boolean", default: false },
    "sans-w3c": { type: "boolean", default: false },
  },
});

const promo = chargerPromo();
if (!promo.dateRendu) {
  console.error("Le fichier de promo doit donner la date de rendu (dateRendu).");
  process.exit(1);
}

const projets = values.tous
  ? promo.projets
  : values.slug
    ? promo.projets.filter((p) => p.slug === validerSlug(values.slug))
    : [];
if (projets.length === 0) {
  console.error("Usage : node scripts/analyser.js --slug <slug> | --tous");
  process.exit(1);
}

for (const projet of projets) {
  if (!projet.depot) {
    console.log(`${projet.slug} : pas de dépôt dans le fichier de promo, ignoré`);
    continue;
  }
  const debut = Date.now();
  const { resultat, racineSite } = await analyserDepot({
    projet,
    promo,
    sansValidationW3c: values["sans-w3c"],
  });

  if (racineSite) {
    const { manquantes } = await rafraichirVignettes({
      racineSite,
      resultat,
      dossierSortie: path.join(dossierDonnees(), "vignettes", projet.slug),
    });
    for (const m of manquantes) console.log(`  sans vignette : ${m.fichier} (${m.raison})`);
  }

  fs.writeFileSync(cheminResultat(projet.slug), JSON.stringify(resultat, null, 2));
  const { note, nonMesurable, source } = resultat;
  console.log(
    `${projet.slug} : ${note.totale}/${note.max} (${note.lettre}) · ${source.ref} ${source.sha.slice(0, 7)} · ${Math.round((Date.now() - debut) / 1000)} s` +
      (nonMesurable.length ? ` · non mesurable : ${nonMesurable.map((n) => n.etape).join(", ")}` : "")
  );
}
