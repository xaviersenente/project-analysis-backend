import express from "express";
import cors from "cors";
import scanRoute from "./routes/scan.js";
import statsRoute from "./routes/stats.js";

const app = express();
const port = 3000;

app.use(cors());
// Utilisation des routes
app.use("/scan", scanRoute);
app.use("/", statsRoute);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
