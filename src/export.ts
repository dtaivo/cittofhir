import { DEFAULT_XLSX, generate, writeFiles } from "./generate.js";

const res = await generate(DEFAULT_XLSX, process.env.BASE_URL ? { baseUrl: process.env.BASE_URL } : {});
const dir = writeFiles(res.files);
console.log(`${res.rows} filas → ${res.files.length} recursos en ${dir}`);
res.warnings.forEach((w) => console.log("aviso:", w));
res.issues.forEach((i) => console.log("PROBLEMA:", i));
process.exit(res.issues.length ? 1 : 0);
