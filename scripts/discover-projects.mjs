import fs from "node:fs";
import path from "node:path";
import { getAntigravityHeaders, ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "../dist/src/constants.js";

const accountsPath = path.join(process.env.USERPROFILE, ".config", "opencode", "antigravity-accounts.json");
const data = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
const headers = getAntigravityHeaders();

console.log("Discovering managed companion project IDs for all accounts...\n");

for (const [i, acc] of data.accounts.entries()) {
  console.log(`Account ${i} (${acc.email || "no-email"}):`);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: acc.refreshToken,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("  Token refresh failed:", tokenData);
    continue;
  }
  const accessToken = tokenData.access_token;

  const res = await fetch("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist", {
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

  if (!res.ok) {
    console.log(`  ❌ loadCodeAssist failed with status ${res.status}:`, await res.text());
    continue;
  }

  const payload = await res.json();
  let projectId = typeof payload.cloudaicompanionProject === "string" 
    ? payload.cloudaicompanionProject 
    : payload.cloudaicompanionProject?.id;

  if (!projectId) {
    // try onboard
    console.log("  No project ID yet, calling onboardUser...");
    const onboardRes = await fetch("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:onboardUser", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        tierId: "free-tier",
        metadata: {
          ideType: "ANTIGRAVITY",
          platform: "PLATFORM_UNSPECIFIED",
          pluginType: "GEMINI",
        },
      }),
    });
    const onboardPayload = await onboardRes.json();
    projectId = onboardPayload?.response?.cloudaicompanionProject?.id;
  }

  console.log(`  ✅ Discovered managedProjectId: "${projectId}"`);
  acc.managedProjectId = projectId;
}

fs.writeFileSync(accountsPath, JSON.stringify(data, null, 2), "utf8");
console.log("\nUpdated accounts file successfully!");
