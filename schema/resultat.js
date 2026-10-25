// Copie du schéma du frontend (project-analysis-frontend/src/schema/resultat.js) : les deux doivent rester identiques
/**
 * Schéma du résultat d'analyse, version 2 (CRITERES-SAE105-2026.md, étape 8)
 * Il fixe le contrat entre le backend (qui écrit un JSON par étudiant)
 * et l'interface (qui les lit au build). Correction P3.
 */
import { z } from "zod";

export const AXES = ["graphique", "ergonomie", "accessibilite", "methodologie"];
export const STATUTS = ["C", "R", "B", "I"];
export const VERDICTS = [
  "respecte",
  "non-respecte",
  "partiel",
  "non-mesurable",
  "a-juger",
];
export const METHODES = ["auto", "depot", "navigateur", "manuel"];
export const TYPES_ALERTE = [
  "site-inaccessible",
  "pages-404",
  "site-non-a-jour",
  "js-remplace-css",
  "historique-reecrit",
  "autre-auteur",
];

export const SLUG_REGEX = /^[a-z0-9-]+$/;

/** Une occurrence : où, et quoi (règle du projet : aucun total sans son détail) */
export const occurrenceSchema = z.object({
  fichier: z.string().min(1),
  ligne: z.number().int().positive().nullable(),
  colonne: z.number().int().positive().nullable(),
  extrait: z.string(),
  // Partie fautive de l'extrait : [début, fin[ en caractères
  surligne: z.tuple([z.number().int().min(0), z.number().int().min(0)]).nullable().optional(),
});

export const seuilSchema = z.object({
  operateur: z.enum(["≤", "≥", "=", "<", ">"]),
  nombre: z.number(),
  unite: z.string(),
});

export const critereSchema = z
  .object({
    id: z.string().regex(/^[GEAM]\d+$/),
    axe: z.enum(AXES),
    libelle: z.string().min(1),
    statut: z.enum(STATUTS),
    methode: z.enum(METHODES),
    verdict: z.enum(VERDICTS),
    // Valeur mesurée, dans l'unité du seuil (7 pour « 7 % »)
    valeur: z.number().nullable(),
    detailValeur: z.string().nullable().optional(),
    seuil: seuilSchema.nullable(),
    detailSeuil: z.string().optional(),
    // Points : contraintes et bonus seulement
    points: z.object({ obtenus: z.number().nullable(), max: z.number() }).nullable(),
    piste: z.string(),
    sourceCours: z.string(),
    // Raison obligatoire quand la mesure a échoué
    raison: z.string().optional(),
    occurrences: z.array(occurrenceSchema),
    totalOccurrences: z.number().int().min(0),
    // Ajouté par le frontend depuis data/notes/<slug>.json (mode local) : jamais écrit par l'analyse
    enseignant: z
      .object({
        verdictOutil: z.enum(VERDICTS),
        points: z.number().nullable(),
        commentaire: z.string().nullable(),
        le: z.string(),
      })
      .optional(),
  })
  .refine((c) => c.verdict !== "non-mesurable" || Boolean(c.raison), {
    message: "Un critère « non mesurable » doit donner sa raison",
    path: ["raison"],
  });

const pointsAxeSchema = z.object({ obtenus: z.number(), max: z.number() });

/** Les contrôles vérifiés page par page (colonnes de la matrice) */
export const CONTROLES_PAGE = [
  "lang",
  "titleUnique",
  "descriptionUnique",
  "reperes",
  "h1Unique",
  "titresSansSaut",
  "menuPopover",
  "ariaCurrent",
  "w3c",
  "lighthouseA11y",
];

/** Une cellule de la matrice : un verdict, une valeur courte et le détail au survol */
const celluleSchema = z.object({
  verdict: z.enum(["respecte", "non-respecte", "partiel", "non-mesurable"]),
  valeur: z.string().optional(),
  detail: z.string().optional(),
});

export const pageSchema = z.object({
  fichier: z.string().min(1),
  titre: z.string().nullable(),
  controles: z.object(Object.fromEntries(CONTROLES_PAGE.map((c) => [c, celluleSchema]))),
});

export const ROLES_COULEUR = ["surface", "texte", "accent", "bordure", "autre"];

const tailleSchema = z.object({
  variable: z.string().nullable(),
  valeur: z.string(),
  px: z.number().min(0),
});

export const blocsSchema = z
  .object({
    graphique: z
      .object({
        // Variables de couleur de :root, avec le rôle déduit de leur nom
        palette: z.array(z.object({ variable: z.string(), valeur: z.string(), role: z.enum(ROLES_COULEUR) })),
        espacements: z.array(tailleSchema),
        typographie: z.object({
          famille: z.string().nullable(),
          tailles: z.array(tailleSchema),
        }),
        // G11 : chaque écran de la maquette Figma avec sa page, ses textes comparés et deux captures
        maquette: z.object({
          url: z.url().nullable(),
          version: z.object({ id: z.string(), date: z.string() }),
          ecrans: z.array(
            z.object({
              nom: z.string(),
              fichier: z.string().nullable(),
              largeur: z.number().nullable(),
              // conformes comprend les justifiés : écarts qui corrigent l'accessibilité de la maquette
              textes: z.object({ total: z.number(), conformes: z.number(), justifies: z.number(), ecarts: z.number(), absents: z.number() }).nullable(),
              // WebP relatifs à la page du projet (captures/<nom>.webp), comme les vignettes
              captures: z.object({ maquette: z.string().nullable(), site: z.string().nullable() }),
            })
          ),
          pagesSansEcran: z.array(z.string()),
          couleursHorsMaquette: z.array(z.string()),
        }),
      })
      .partial(),
    accessibilite: z
      .object({
        // Scores sur 100 ; seul celui d'accessibilité compte dans la note
        lighthouse: z.object({
          performance: z.number().nullable(),
          accessibilite: z.number().nullable(),
          bonnesPratiques: z.number().nullable(),
          seo: z.number().nullable(),
        }),
        contrastes: z.array(
          z.object({
            texte: z.string(),
            fond: z.string(),
            rapport: z.number(),
            requis: z.number(),
            page: z.string(),
            selecteur: z.string(),
          })
        ),
        // Balises imposées par le sujet (fichier de promo) et les pages où elles figurent
        contenusAttendus: z.array(z.object({ balise: z.string(), pages: z.array(z.string()) })),
      })
      .partial(),
    methodologie: z
      .object({
        javascript: z.object({
          fichiers: z.number().int().min(0),
          lignes: z.number().int().min(0),
          motifs: z.array(
            z.object({
              motif: z.string(),
              occurrence: occurrenceSchema,
              alternative: z.object({ titre: z.string(), code: z.string() }),
            })
          ),
        }),
        classesInutilisees: z.object({
          total: z.number().int().min(0),
          classes: z.array(z.string()),
        }),
        bem: z.object({
          ratio: z.number().min(0).max(100),
          points: z.number().min(0),
          totalClasses: z.number().int().min(0),
          horsConvention: z.array(z.string()),
        }),
      })
      .partial(),
  })
  .partial();

export const DRAPEAUX_COMMIT = ["message-generique", "dates-divergentes", "autre-auteur"];

const dateSchema = z.iso.datetime({ offset: true });

export const historiqueSchema = z.object({
  dateRendu: dateSchema,
  // Seuils du critère M10, copiés depuis la configuration du backend
  seuils: z.object({
    sessionsMin: z.number().int(),
    joursMin: z.number().int(),
    partDernieres48hMax: z.number().min(0).max(1),
  }),
  indicateurs: z.object({
    commits: z.number().int().min(0),
    sessions: z.number().int().min(0),
    joursActifs: z.number().int().min(0),
    dureeProjetJours: z.number().min(0),
    // Estimation : une session dure du premier au dernier commit, plus 30 min
    dureeEstimeeMinutes: z.number().min(0),
    partDernieres48h: z.number().min(0).max(1),
    plusGrosCommit: z.number().int().min(0),
    commitsAutreAuteur: z.number().int().min(0),
  }),
  sessions: z.array(z.object({ debut: dateSchema, fin: dateSchema, commits: z.number().int().min(1) })),
  commits: z.array(
    z.object({
      sha: z.string(),
      auteur: z.string(),
      dateAuteur: dateSchema,
      dateCommit: dateSchema,
      message: z.string(),
      ajouts: z.number().int().min(0),
      suppressions: z.number().int().min(0),
      fichiers: z.number().int().min(0),
      drapeaux: z.array(z.enum(DRAPEAUX_COMMIT)),
    })
  ),
  tags: z.array(z.object({ nom: z.string(), sha: z.string(), date: dateSchema })),
});

export const ressourcesSchema = z.object({
  images: z.array(
    z.object({
      fichier: z.string(),
      // Vignette créée par l'analyse locale, relative à la page du projet ; null si l'image manque
      vignette: z
        .string()
        .regex(/^vignettes\/[a-z0-9-]+\.(webp|svg)$/)
        .nullable()
        .optional(),
      format: z.string(),
      poidsKo: z.number().min(0),
      largeur: z.number().int().positive().nullable(),
      hauteur: z.number().int().positive().nullable(),
      // null : attribut absent ; "" : image décorative
      alt: z.string().nullable(),
      loading: z.enum(["lazy", "eager"]).nullable(),
      pages: z.array(z.string()),
    })
  ),
  // Poids transféré de la page d'accueil (navigateur) ; null si non mesuré
  poidsAccueilKo: z.number().min(0).nullable(),
  polices: z.array(
    z.object({
      fichier: z.string(),
      famille: z.string(),
      graisse: z.string(),
      format: z.string(),
      poidsKo: z.number().min(0),
      prechargee: z.boolean(),
    })
  ),
  // Fichiers du dépôt ; un nom fautif porte ses problèmes
  arborescence: z.array(
    z.object({
      chemin: z.string(),
      problemes: z.array(z.enum(["majuscule", "espace", "accent", "caractere"])),
    })
  ),
});

export const resultatSchema = z.object({
  version: z.literal(2),
  source: z.object({
    depot: z.string(),
    ref: z.string(),
    sha: z.string(),
    raison: z.string(),
    analyseLe: z.iso.datetime({ offset: true }),
  }),
  projet: z.object({
    slug: z.string().regex(SLUG_REGEX),
    nom: z.string(),
    groupe: z.string(),
  }),
  // Fichier de promo, sinon README de l'étudiant ; null si non renseigné
  liens: z.object({
    site: z.url().nullable(),
    depot: z.url().nullable(),
    figma: z.url().nullable(),
  }),
  note: z.object({
    base: z.number(),
    // 100, moins les points des critères non mesurables (jamais imputés à l'étudiant)
    max: z.number().max(100),
    bonus: z.number().min(0),
    totale: z.number().max(100),
    lettre: z.string(),
    // Barème des lettres (pourcentage minimal de chacune) ; absent des résultats plus anciens
    lettres: z.record(z.string(), z.number()).optional(),
    // Points des critères « À juger », pas encore attribués
    aJuger: z.number().min(0),
    parAxe: z.object(Object.fromEntries(AXES.map((a) => [a, pointsAxeSchema]))),
  }),
  criteres: z.array(critereSchema),
  alertes: z.array(
    z.object({
      type: z.enum(TYPES_ALERTE),
      message: z.string(),
      details: z.string().optional(),
    })
  ),
  nonMesurable: z.array(z.object({ etape: z.string(), raison: z.string() })),
  // Commentaire général de l'enseignant (mode local), publié avec la note
  commentaire: z.string().nullable().optional(),
  // Vue par page : absente si l'inventaire des pages a échoué
  pages: z.array(pageSchema).optional(),
  ressources: ressourcesSchema.optional(),
  // Blocs propres à chaque axe ; un bloc absent est « Non mesurable »
  blocs: blocsSchema.optional(),
  // Historique Git et timeline (lot 3) ; absent si le dépôt n'a pas pu être lu
  historique: historiqueSchema.optional(),
  // Contrôle léger du site en ligne (lot 4) : rien de noté ; absent sans adresse de site
  enLigne: z
    .object({
      url: z.string(),
      verifieLe: z.string(),
      repond: z.boolean(),
      raison: z.string().optional(),
      pages: z.object({ total: z.number(), enErreur: z.number() }),
      ressources: z.object({ total: z.number(), enErreur: z.number(), nonVerifiees: z.number() }),
      erreurs: z.array(
        z.object({
          type: z.enum(["page", "ressource"]),
          chemin: z.string(),
          url: z.string(),
          // 0 : aucune réponse
          statut: z.number(),
          // Ce que le dépôt explique ; null : le fichier existe dans la version évaluée
          cause: z.enum(["casse", "chemin-racine", "absent-du-depot"]).nullable(),
          citePar: z.array(z.object({ page: z.string(), ligne: z.number().nullable() })),
        })
      ),
      // Dernier déploiement GitHub Pages ; null si l'API ne le donne pas
      deploiement: z.object({ sha: z.string(), date: z.string(), versionEvaluee: z.boolean() }).nullable(),
    })
    .optional(),
});

export const promoSchema = z.object({
  promo: z.string(),
  dateRendu: z.iso.datetime({ offset: true }),
  projets: z.array(
    z.object({
      slug: z.string().regex(SLUG_REGEX),
      nom: z.string(),
      groupe: z.string(),
    })
  ),
});
