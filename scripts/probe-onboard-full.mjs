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

console.log("=== Testing loadCodeAssist with PLATFORM_UNSPECIFIED on prod and sandbox ===");

for (const endpoint of [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://cloudcode-pa.googleapis.com"
]) {
  console.log(`\n--- Endpoint: ${endpoint} ---`);
  const res = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      metadata: {
        ideType: "ANTIGRAVITY",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
      },
    }),
  });

  console.log(`Status: ${res.status}`);
  const body = await res.json().catch(async () => await res.text());
  console.log("Response:", JSON.stringify(body, null, 2));

  // If there are allowedTiers or onboardUser:
  if (body?.currentTier?.id || body?.allowedTiers) {
    const tierId = body.currentTier?.id || body.allowedTiers?.[0]?.id || "free-tier";
    console.log(`Trying onboardUser with tierId: ${tierId}...`);
    const onboardRes = await fetch(`${endpoint}/v1internal:onboardUser`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        tierId,
        metadata: {
          ideType: "ANTIGRAVITY",
          platform: "PLATFORM_UNSPECIFIED",
          pluginType: "GEMINI",
        },
      }),
    });
    console.log(`Onboard status: ${onboardRes.status}`);
    const onboardBody = await onboardRes.json().catch(async () => await onboardRes.text());
    console.log("Onboard response:", JSON.stringify(onboardBody, null, 2));
  }
}
