import { timingSafeEqual } from "crypto";

/**
 * Authentification par jeton (S2)
 * Le client envoie « Authorization: Bearer <jeton> », comparé à API_TOKEN (.env).
 * Sans API_TOKEN configuré, l'API reste fermée.
 */
export const exigerJeton = (req, res, next) => {
  const attendu = process.env.API_TOKEN;
  if (!attendu) {
    return res.status(503).json({ error: "Authentification non configurée (API_TOKEN)" });
  }

  const [type, recu] = (req.get("Authorization") || "").split(" ");
  const a = Buffer.from(recu || "");
  const b = Buffer.from(attendu);

  if (type !== "Bearer" || a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Jeton manquant ou invalide" });
  }
  next();
};
