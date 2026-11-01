/**
 * Schéma d'une grille d'évaluation (config/grilles/<id>.json) : une grille par SAÉ.
 * La grille dit quoi évaluer et combien ça vaut ; le profil (services/profils) dit comment mesurer.
 */
import { z } from "zod";
import { STATUTS, METHODES, ID_CRITERE_REGEX, seuilSchema } from "./resultat.js";

export const ID_GRILLE_REGEX = /^[a-z0-9-]+$/;

export const axeGrilleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nom: z.string().min(1),
  points: z.number().positive(),
  description: z.string(),
});

export const critereGrilleSchema = z.object({
  id: z.string().regex(ID_CRITERE_REGEX),
  axe: z.string(),
  libelle: z.string().min(1),
  statut: z.enum(STATUTS),
  methode: z.enum(METHODES),
  seuil: seuilSchema.nullable(),
  detailSeuil: z.string().optional(),
  // Points fixés par la grille ; sans eux, les points de l'axe sont répartis entre ses contraintes
  points: z.number().positive().optional(),
  // Critère « ia » : les niveaux que l'agent peut proposer, du plus faible au plus fort
  echelle: z.array(z.string()).min(2).optional(),
  // Contrainte à juger dont l'outil propose les points, d'après ces mesures de la grille (le jury valide)
  propositionDepuis: z.array(z.string().regex(ID_CRITERE_REGEX)).min(1).optional(),
  // Critère repris d'une SAÉ précédente (un acquis) : la promo qui l'a enseigné (s1-sae…)
  origine: z.string().regex(/^s[1-6]-(sae|projet)(-[a-z0-9]+)*$/).optional(),
  // Critère « ia » : son prompt, prompts/<id de la grille>/<prompt>.md
  prompt: z.string().regex(/^[a-z0-9-]+$/).optional(),
  piste: z.string(),
  sourceCours: z.string(),
});

export const grilleSchema = z
  .object({
    _commentaire: z.string().optional(),
    id: z.string().regex(ID_GRILLE_REGEX),
    nom: z.string().min(1),
    // Le profil qui sait mesurer les critères de cette grille
    profil: z.string().regex(/^[a-z0-9-]+$/),
    bonusMax: z.number().min(0).default(0),
    // Prompts propres au profil, dans prompts/<id de la grille>/ (portfolio : les questions de soutenance)
    prompts: z.object({ questionsSoutenance: z.string().regex(/^[a-z0-9-]+$/).optional() }).optional(),
    axes: z.array(axeGrilleSchema).min(1),
    criteres: z.array(critereGrilleSchema).min(1),
  })
  .superRefine((g, ctx) => {
    const axes = new Set(g.axes.map((a) => a.id));
    const ids = new Set();
    g.criteres.forEach((c, i) => {
      if (!axes.has(c.axe)) ctx.addIssue({ code: "custom", path: ["criteres", i, "axe"], message: `Axe inconnu : ${c.axe}` });
      if (ids.has(c.id)) ctx.addIssue({ code: "custom", path: ["criteres", i, "id"], message: `Critère en double : ${c.id}` });
      ids.add(c.id);
      if (c.methode === "ia" && !c.echelle) ctx.addIssue({ code: "custom", path: ["criteres", i, "echelle"], message: "Un critère « ia » doit donner son échelle" });
      if (c.propositionDepuis) {
        if (c.statut !== "C" || c.methode !== "manuel") ctx.addIssue({ code: "custom", path: ["criteres", i, "propositionDepuis"], message: "Seule une contrainte à juger reçoit des points proposés" });
        for (const id of c.propositionDepuis) {
          if (!g.criteres.some((m) => m.id === id && m.methode !== "manuel")) ctx.addIssue({ code: "custom", path: ["criteres", i, "propositionDepuis"], message: `Mesure inconnue ou à juger : ${id}` });
        }
      }
      if (c.methode === "ia" && !c.prompt) ctx.addIssue({ code: "custom", path: ["criteres", i, "prompt"], message: "Un critère « ia » doit nommer son prompt" });
    });
    // Les points fixés d'un axe ne dépassent pas les points de l'axe
    for (const axe of g.axes) {
      const fixes = g.criteres.filter((c) => c.axe === axe.id && c.statut === "C" && c.points).reduce((s, c) => s + c.points, 0);
      if (fixes > axe.points) ctx.addIssue({ code: "custom", path: ["axes"], message: `Axe ${axe.id} : ${fixes} points fixés pour ${axe.points}` });
    }
  });
