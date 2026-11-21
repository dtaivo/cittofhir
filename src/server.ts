import express from "express";
import path from "node:path";
import { DEFAULT_XLSX, generate, writeFiles } from "./generate.js";

const app = express();
const pub = path.resolve(import.meta.dirname, "..", "public");
app.use(express.static(pub));
app.use("/api", express.raw({ type: "*/*", limit: "50mb" }));

const opts = (q: any) => ({
  ...(q.baseUrl ? { baseUrl: String(q.baseUrl) } : {}),
  ...(q.bundleType === "transaction" ? { bundleType: "transaction" as const } : {}),
});

app.post("/api/generate", async (req, res) => {
  try {
    const body = req.body as Buffer;
    res.json(await generate(Buffer.isBuffer(body) && body.length ? body : DEFAULT_XLSX, opts(req.query)));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/save", async (req, res) => {
  try {
    const body = req.body as Buffer;
    const r = await generate(Buffer.isBuffer(body) && body.length ? body : DEFAULT_XLSX, opts(req.query));
    res.json({ dir: writeFiles(r.files), count: r.files.length });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "127.0.0.1", () => console.log(`cittofhir en http://localhost:${port}`));
