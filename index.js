import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import scanRoute from "./routes/scan.js";
import statsRoute from "./routes/stats.js";
import { errorHandler } from "./utils/errors.js";

// Charger les variables d'environnement
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);

// Utilisation des routes
app.use("/scan", scanRoute);
app.use("/", statsRoute);

// Middleware de gestion d'erreurs (doit être en dernier)
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
