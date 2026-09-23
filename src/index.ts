import express from "express";
import { connectDatabase } from "./config/database.ts";
import { checkElasticsearch, checkMongo, checkRedis } from "./health/checks.ts";
import { aggregateHealth } from "./health/status.ts";
import documentRoutes from "./routes/document.ts";
import searchRoutes from "./routes/search.ts";

const app = express();

app.use(express.json());

app.get("/health", async (_req, res) => {
  const body = aggregateHealth({
    mongodb: await checkMongo(),
    redis: await checkRedis(),
    elasticsearch: await checkElasticsearch(),
  });

  res.status(body.status === "ok" ? 200 : 503).json(body);
});

app.use("/documents", documentRoutes);
app.use("/search", searchRoutes);
const PORT = 3000;

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();