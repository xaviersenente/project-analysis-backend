import express from "express";
import cors from "cors";
import scanRoute from "./routes/scan.js";
import statsRoute from "./routes/stats.js";
import { errorHandler } from "./utils/errors.js";
import { exigerJeton } from "./utils/auth.js";

const app = express();

// CORS limité au domaine du frontend (S2) ; plusieurs domaines séparés par des virgules
const originesAutorisees = (process.env.CORS_ORIGIN || "http://localhost:4321")
  .split(",")
  .map((origine) => origine.trim());

app.use(cors({ origin: originesAutorisees }));
app.use(express.json());

// Toutes les routes exigent le jeton (S2)
app.use(exigerJeton);

// Utilisation des routes
app.use("/scan", scanRoute);
app.use("/", statsRoute);

// Middleware de gestion d'erreurs (doit être en dernier)
app.use(errorHandler);

export default app;
