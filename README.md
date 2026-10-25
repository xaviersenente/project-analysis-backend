# WebScope : analyse (backend)

Analyse les dépôts GitHub des projets de la SAÉ 105 (BUT1 MMI) selon la grille de `CRITERES-SAE105-2026.md`, et écrit un résultat JSON par étudiant. Le frontend (`project-analysis-frontend`) en fait un site statique.

L'analyse tourne **en local**, en ligne de commande. Il n'y a plus d'API ni de serveur à héberger.

## Prérequis

- Node 24 (`nvm use`)
- Git
- Google Chrome : contrôles en navigateur (Lighthouse, Puppeteer)
- Java : validation W3C (vnu)

Sans Chrome ou sans Java, les critères concernés passent en « Non mesurable », jamais en erreur de l'étudiant.

```bash
npm install
cp .env.example .env
```

## Le fichier de promo

`data/promo.json` (hors de Git) donne la date de rendu et les projets :

```json
{
  "promo": "R111 · 2026-2027",
  "dateRendu": "2027-01-06T18:00:00+01:00",
  "projets": [
    {
      "slug": "etu-01",
      "nom": "Dupont Alice",
      "groupe": "TP A1",
      "depot": "proprietaire/nom-du-depot",
      "site": "",
      "figma": "",
      "email": "",
      "ecrans": {}
    }
  ]
}
```

- `slug` : minuscules, chiffres et tirets ; il nomme le résultat (`data/<slug>.json`).
- `site`, `figma` : laissés vides, ils sont lus dans le README de l'étudiant.
- `email` : facultatif, pour repérer les commits d'un autre auteur.
- `ecrans` : facultatif, corrige l'association entre écrans Figma et pages (`{ "Page 1": "team.html", "Hamburger": null }`).
- `contenusAttendus` (au niveau de la promo) : facultatif, remplace la liste de balises attendues par défaut (A15).

## Lancer une analyse

```bash
npm run analyser -- --slug etu-01
npm run analyser:tous
```

Options : `--sans-w3c` (sans Java), `--sans-navigateur` (sans Chrome, plus rapide), `--sans-en-ligne` (sans le contrôle du site publié).

Pour chaque projet, l'outil :

1. récupère le dépôt à une version figée : le tag `v1`, sinon le dernier commit avant la date de rendu (clone partiel, dans `cache/`) ;
2. inventorie les pages et les ressources, lit le CSS fichier par fichier et le JavaScript ;
3. sert le site en local sous `/<nom-du-dépôt>/` et le mesure dans Chrome à 360 px (Lighthouse, Puppeteer) ;
4. lit l'historique Git (timeline, M10) ;
5. compare le site à la maquette Figma, dans sa dernière version avant le rendu (G11) ;
6. vérifie le site en ligne : pages et ressources en erreur, version déployée (rien de noté) ;
7. écrit `data/<slug>.json`, les vignettes d'images (`data/vignettes/<slug>/`) et les captures maquette / site (`data/captures/<slug>/`).

Chaque critère rend ses occurrences (`fichier`, `ligne`, `colonne`, `extrait`). Une étape qui échoue rend ses critères « Non mesurable », avec la raison.

## Organisation

| Dossier | Rôle |
|---|---|
| `config/` | La grille (`grille-sae105-2026.json`) et tous les seuils (`thresholds.js`) |
| `schema/` | Le format du résultat (v2), partagé avec le frontend |
| `scripts/` | `analyser.js`, `vignettes.js`, `migrerDonnees.js` |
| `services/source/` | Dépôt, inventaire, historique, vignettes |
| `services/css/`, `services/js/` | Lecture du CSS et des motifs JavaScript |
| `services/runtime/` | Serveur local, mesures en navigateur, site en ligne |
| `services/html/` | Lighthouse et validation W3C |
| `services/maquette/` | Maquette Figma : lecture, écrans, comparaison |
| `services/analyse/` | Les critères par axe, la notation, l'orchestration |
| `tests/` | Tests (`npm test`), dont le dépôt piégé et le corrigé du TP 5 |

Les données des étudiants (`data/`, `cache/`) ne sont jamais versionnées.
