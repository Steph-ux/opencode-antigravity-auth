import fs from "node:fs";

console.log("Analyzing agy.exe...");
const agyPath = "C:\\Users\\stephanea\\AppData\\Local\\agy\\bin\\agy.exe";
if (!fs.existsSync(agyPath)) {
  console.log("agy.exe not found");
  process.exit(1);
}

const buffer = fs.readFileSync(agyPath);
const content = buffer.toString("binary");

function findMatches(regex) {
  const matches = new Set();
  let m;
  while ((m = regex.exec(content)) !== null) {
    matches.add(m[0]);
  }
  return Array.from(matches);
}

console.log("\n=== 1. GOOGLE ENDPOINTS ===");
const endpoints = findMatches(/https:\/\/[a-zA-Z0-9\.\-_/]+googleapis\.com[a-zA-Z0-9\.\-_/:]*/g);
endpoints.filter(e => !e.includes("schema") && !e.includes("w3")).forEach(e => console.log(" -", e));

console.log("\n=== 2. RPC / INTERNAL API METHODS ===");
const methods = findMatches(/:[a-zA-Z0-9_]{4,}/g);
methods.filter(m => m.length < 40 && !m.includes("/") && !m.includes("\\")).slice(0, 30).forEach(m => console.log(" -", m));

console.log("\n=== 3. MODEL IDENTIFIERS ===");
const models = findMatches(/(?:gemini|claude|chat_model|code_model)[a-zA-Z0-9\.\-_]*/gi);
const uniqueModels = Array.from(new Set(models.map(m => m.toLowerCase())))
  .filter(m => (m.includes("claude") || m.includes("gemini") || m.includes("flash") || m.includes("pro") || m.includes("opus") || m.includes("sonnet")) && m.length < 35);
uniqueModels.forEach(m => console.log(" -", m));

console.log("\n=== 4. CLIENT METADATA & HEADERS ===");
const headers = findMatches(/(?:x-goog-[a-zA-Z0-9\-_]+|user-agent:[a-zA-Z0-9\-_]+)/gi);
headers.forEach(h => console.log(" -", h));

console.log("\nDone!");
