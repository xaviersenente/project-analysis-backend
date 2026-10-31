/**
 * Analyse des projets de la promo, en local
 *
 * Pour chaque projet du fichier de promo : version figée du dépôt, analyse selon la grille
 * de la promo (grille, sinon la SAÉ 105), résultat v3 dans data/<slug>.json
 * et vignettes dans data/vignettes/<slug>/.
 *
 * Usage :
 *   node scripts/analyser.js --slug etu-01
 *   node scripts/analyser.js --tous
 *   node scripts/analyser.js --tous --sans-w3c      (sans Java)
 *   node scripts/analyser.js --tous --sans-navigateur  (sans Chrome : plus rapide)
 *   node scripts/analyser.js --tous --sans-en-ligne    (sans le contrôle du site publié)
 */
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { chargerPromo, cheminResultat, dossierDonnees, validerSlug } from "../services/promo/promoService.js";
import { chargerGrille, GRILLE_PAR_DEFAUT } from "../services/grilles/grilles.js";
import { profilDe } from "../services/profils/index.js";
import { rafraichirVignettes } from "../services/source/vignettes.js";
import { copierPolices } from "../services/source/polices.js";

// .env du backend (FIGMA_TOKEN, GITHUB_TOKEN, DATA_DIR…), d'où que le script soit lancé.
// Les services lisent process.env au moment de l'appel : il suffit de le charger avant l'analyse.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    tous: { type: "boolean", default: false },
    "sans-w3c": { type: "boolean", default: false },
    "sans-navigateur": { type: "boolean", default: false },
    "sans-en-ligne": { type: "boolean", default: false },
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
if (values.slug && projets.length === 0) {
  console.error(`Aucun projet « ${values.slug} » dans le fichier de promo.`);
  process.exit(1);
}
if (projets.length === 0) {
  console.error("Usage : node scripts/analyser.js --slug <slug> | --tous");
  process.exit(1);
}

let grille, profil;
try {
  grille = chargerGrille(promo.grille ?? GRILLE_PAR_DEFAUT);
  profil = profilDe(grille);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Grille : ${grille.nom}`);

for (const projet of projets) {
  if (!projet.depot) {
    console.log(`${projet.slug} : pas de dépôt dans le fichier de promo, ignoré`);
    continue;
  }
  const debut = Date.now();
  const { resultat, racineSite } = await profil.analyser({
    projet,
    promo,
    grille,
    sansValidationW3c: values["sans-w3c"],
    sansNavigateur: values["sans-navigateur"],
    sansEnLigne: values["sans-en-ligne"],
    dossierCaptures: path.join(dossierDonnees(), "captures", projet.slug),
  });

  if (racineSite) {
    const { manquantes } = await rafraichirVignettes({
      racineSite,
      resultat,
      dossierSortie: path.join(dossierDonnees(), "vignettes", projet.slug),
    });
    for (const m of manquantes) console.log(`  sans vignette : ${m.fichier} (${m.raison})`);
    copierPolices({ racineSite, resultat, dossierSortie: path.join(dossierDonnees(), "polices", projet.slug) });
  }

  fs.writeFileSync(cheminResultat(projet.slug), JSON.stringify(resultat, null, 2));
  const { note, nonMesurable, source } = resultat;
  console.log(
    `${projet.slug} : ${note.totale}/${note.max} (${note.lettre}) · ${source.ref} ${source.sha.slice(0, 7)} · ${Math.round((Date.now() - debut) / 1000)} s` +
      (nonMesurable.length ? ` · non mesurable : ${nonMesurable.map((n) => n.etape).join(", ")}` : "")
  );
}
