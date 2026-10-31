/**
 * Notation : points par contrainte, note par axe, bonus et lettre, d'après la grille de la SAÉ.
 * Un critère non mesurable sort du maximum ; un critère à juger attend la note de l'enseignant.
 */
import thresholds from "../../config/thresholds.js";

/**
 * Points maximum de chaque contrainte : ceux que la grille fixe, sinon le reste de l'axe
 * réparti entre ses autres contraintes
 */
export const pointsParContrainte = (grille) =>
  Object.fromEntries(
    grille.axes.flatMap(({ id: axe, points: total }) => {
      const contraintes = grille.criteres.filter((c) => c.axe === axe && c.statut === "C");
      const fixes = contraintes.filter((c) => c.points);
      const libres = contraintes.filter((c) => !c.points);
      const aRepartir = total - fixes.reduce((s, c) => s + c.points, 0);
      const base = libres.length ? Math.floor(aRepartir / libres.length) : 0;
      let reste = aRepartir - base * libres.length;
      return contraintes.map((c) => [c.id, c.points ?? base + (reste-- > 0 ? 1 : 0)]);
    })
  );

/** Points d'un critère d'après son verdict */
export const points = (critere, max, bonusMax = 0) => {
  if (critere.statut === "B") return { obtenus: Math.min(critere.bonusPoints ?? 0, bonusMax), max: bonusMax };
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
 * Note du résultat
 * @param {Array} criteres - Critères avec leurs points
 * @param {object} grille - La grille de la SAÉ (axes, bonusMax)
 */
export const noter = (criteres, grille) => {
  const parAxe = Object.fromEntries(
    grille.axes.map(({ id: axe }) => {
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
  const total = grille.axes.reduce((s, a) => s + a.points, 0);
  const base = Object.values(parAxe).reduce((s, a) => s + a.obtenus, 0);
  const max = Object.values(parAxe).reduce((s, a) => s + a.max, 0);
  const aJuger = criteres.filter((c) => c.verdict === "a-juger" && c.points).reduce((s, c) => s + c.points.max, 0);
  const pointsBonus = criteres.filter((c) => c.statut === "B").reduce((s, c) => s + (c.points?.obtenus ?? 0), 0);
  const bonus = Math.min(pointsBonus, grille.bonusMax);
  const juges = Math.max(max - aJuger, 1);
  return {
    base,
    max,
    total,
    bonus,
    totale: Math.min(total, base + bonus),
    // Rien n'est encore jugé (portfolio avant le jury) : pas de lettre
    lettre: max - aJuger <= 0 ? "—" : lettre((base / juges) * 100),
    // Le barème des lettres, pour que le frontend recalcule la note après les corrections de l'enseignant
    lettres: thresholds.scoring.grades,
    aJuger,
    parAxe,
  };
};
