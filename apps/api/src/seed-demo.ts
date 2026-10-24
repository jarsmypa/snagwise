import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { seedDemo } from "./seed.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SNAGWISE_DB ?? resolve(HERE, "../data/snagwise.db");

const db = openDb(DB_PATH);
const { transactions } = seedDemo(db);
db.close();
console.log(`Demo data ready in ${DB_PATH} (${transactions} transactions checked)`);
