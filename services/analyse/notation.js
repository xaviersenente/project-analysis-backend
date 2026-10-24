/**
 * Notation du résultat v2 : points par contrainte, note par axe, bonus et lettre.
 * Un critère non mesurable sort du maximum ; un critère à juger attend la note de l'enseignant.
 */
import thresholds from "../../config/thresholds.js";

const { axes, bonus } = thresholds.sae105;

/** Points maximum de chaque contrainte : les points de l'axe répartis entre ses contraintes */
export const pointsParContrainte = (grille) =>
  Object.fromEntries(
    Object.entries(axes).flatMap(([axe, total]) => {
      const contraintes = grille.criteres.filter((c) => c.axe === axe && c.statut === "C");
      const base = Math.floor(total / contraintes.length);
      let reste = total - base * contraintes.length;
      return contraintes.map((c) => [c.id, base + (reste-- > 0 ? 1 : 0)]);
    })
  );

/** Points d'un critère d'après son verdict */
export const points = (critere, max) => {
  if (critere.statut === "B") return { obtenus: Math.min(critere.bonusPoints ?? 0, bonus.max), max: bonus.max };
  if (critere.statut !== "C") return null;
  const obtenus = {
    respecte: max,
    partiel: Math.round(max / 2),
    "non-respecte": 0,
  }[critere.verdict];
  return { obtenus: obtenus ?? null, max };
};

/** Lettre, d'après les seuils de la configuration (une seule source : X5) */
export const lettre = (pourcentage) =>
  Object.entries(thresholds.scoring.grades)
    .sort((a, b) => b[1] - a[1])
    .find(([, seuil]) => pourcentage >= seuil)?.[0] ?? "F";

/**
 * Note du résultat v2
 * @param {Array} criteres - Critères avec leurs points
 */
export const noter = (criteres) => {
  const parAxe = Object.fromEntries(
    Object.keys(axes).map((axe) => {
      const contraintes = criteres.filter((c) => c.axe === axe && c.statut === "C");
      return [
        axe,
        {
          obtenus: contraintes.reduce((s, c) => s + (c.points.obtenus ?? 0), 0),
          max: contraintes.filter((c) => c.verdict !== "non-mesurable").reduce((s, c) => s + c.points.max, 0),
        },
      ];
    })
  );
  const base = Object.values(parAxe).reduce((s, a) => s + a.obtenus, 0);
  const max = Object.values(parAxe).reduce((s, a) => s + a.max, 0);
  const aJuger = criteres.filter((c) => c.verdict === "a-juger" && c.points).reduce((s, c) => s + c.points.max, 0);
  const pointsBonus = criteres.filter((c) => c.statut === "B").reduce((s, c) => s + (c.points?.obtenus ?? 0), 0);
  const juges = Math.max(max - aJuger, 1);
  return {
    base,
    max,
    bonus: Math.min(pointsBonus, bonus.max),
    totale: Math.min(100, base + Math.min(pointsBonus, bonus.max)),
    lettre: lettre((base / juges) * 100),
    aJuger,
    parAxe,
  };
};
