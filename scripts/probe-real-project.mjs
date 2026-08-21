import fs from "node:fs";
import path from "node:path";
import { getAntigravityHeaders, ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "../dist/src/constants.js";

const accountsPath = path.join(process.env.USERPROFILE, ".config", "opencode", "antigravity-accounts.json");
const data = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
const account = data.accounts[0];

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: account.refreshToken,
  }),
});

const tokenData = await tokenRes.json();
const accessToken = tokenData.access_token;
const headers = getAntigravityHeaders();

console.log("=== Testing with REAL managed project: concentrated-rhino-59dxp ===");

// 1. Test generateContent on PROD with Gemini CLI style headers & real project
const prodReq = {
  project: "concentrated-rhino-59dxp",
  model: "gemini-2.5-flash",
  request: {
    contents: [{ role: "user", parts: [{ text: "Say 'Gemini CLI with managed project is working!' in 7 words" }] }],
  },
};

const prodRes = await fetch("https://cloudcode-pa.googleapis.com/v1internal:generateContent", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/22.17.0",
    "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
  },
  body: JSON.stringify(prodReq),
});

console.log("Prod Gemini CLI status:", prodRes.status);
const prodData = await prodRes.json().catch(() => ({}));
if (prodRes.ok) {
  const text = prodData?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("Prod Gemini CLI response:", text?.trim() || JSON.stringify(prodData));
} else {
  console.log("Prod Gemini CLI error:", JSON.stringify(prodData?.error || prodData));
}

// 2. Test retrieveUserQuota with real project
const quotaRes = await fetch("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...headers,
  },
  body: JSON.stringify({ project: "concentrated-rhino-59dxp" }),
});

console.log("Quota status:", quotaRes.status);
const quotaData = await quotaRes.json().catch(() => ({}));
console.log("Quota response:", JSON.stringify(quotaData, null, 2).slice(0, 1000));
