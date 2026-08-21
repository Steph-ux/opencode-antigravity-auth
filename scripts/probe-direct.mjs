import fs from "node:fs";
import path from "node:path";
import { getAntigravityHeaders, ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET } from "../dist/src/constants.js";

const accountsPath = path.join(process.env.USERPROFILE, ".config", "opencode", "antigravity-accounts.json");
const data = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
const headers = getAntigravityHeaders();
for (const [i, acc] of data.accounts.entries()) {
  console.log(`\n========================================`);
  console.log(`Testing Account ${i} (${acc.email || "no-email"})`);
  console.log(`========================================`);

  // Refresh token
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
    console.error("Token refresh failed:", tokenData);
    continue;
  }
  const accessToken = tokenData.access_token;

  // Test Claude Sonnet 4.6
  const claudeReq = {
    project: acc.projectId || acc.managedProjectId || "rising-fact-p41fc",
    model: "claude-sonnet-4-6",
    request: {
      contents: [{ role: "user", parts: [{ text: "Say 'Claude is working!' in 3 words" }] }],
    },
    userAgent: "antigravity",
    requestId: "test-" + Date.now(),
  };

  const claudeRes = await fetch("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(claudeReq),
  });

  console.log("Claude status:", claudeRes.status);
  const claudeData = await claudeRes.json().catch(() => ({}));
  if (claudeRes.ok) {
    const text = claudeData?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("Claude response:", text?.trim() || JSON.stringify(claudeData));
  } else {
    console.log("Claude error:", JSON.stringify(claudeData?.error?.message || claudeData));
  }

  // Test Gemini 3.7 Flash
  const geminiReq = {
    project: acc.projectId || acc.managedProjectId || "rising-fact-p41fc",
    model: "gemini-3.7-flash-medium",
    request: {
      contents: [{ role: "user", parts: [{ text: "Say 'Gemini is working!' in 3 words" }] }],
    },
    userAgent: "antigravity",
    requestId: "test-" + Date.now(),
  };

  const geminiRes = await fetch("https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(geminiReq),
  });

  console.log("Gemini status:", geminiRes.status);
  const geminiData = await geminiRes.json().catch(() => ({}));
  if (geminiRes.ok) {
    const text = geminiData?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("Gemini response:", text?.trim() || JSON.stringify(geminiData));
  } else {
    console.log("Gemini error:", JSON.stringify(geminiData?.error?.message || geminiData));
  }
}
