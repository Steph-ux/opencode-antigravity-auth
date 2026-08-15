const fs = require("fs");
const path = require("path");

const CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ENDPOINT = "https://cloudcode-pa.googleapis.com";

const accountsPath = path.join(process.env.USERPROFILE, ".config", "opencode", "antigravity-accounts.json");
const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8")).accounts;

const CANDIDATES = [
  // modèles déjà connus (baseline)
  "gemini-3.7-flash-medium",
  "gemini-3.6-flash-tiered",
  "claude-sonnet-4-6",
  // candidats non listés à tester
  "gemini-3.7-pro",
  "gemini-3.7-pro-high",
  "gemini-3.7-pro-medium",
  "gemini-3.7-pro-low",
  "gemini-3.7-flash-pro",
  "gemini-3.6-pro",
  "gemini-3.6-pro-high",
  "gemini-3.6-pro-medium",
  "gemini-3.6-pro-low",
  "gemini-3.5-pro",
  "gemini-3.5-pro-high",
  "gemini-3.5-pro-medium",
  "gemini-3.5-pro-low",
  "gemini-3.5-flash",
  "gemini-3.5-flash-medium",
  "gemini-3.5-flash-high",
  "gemini-3.4-flash",
  "gemini-3.7-flash",
  "gemini-3.7-flash-high",
  "gemini-3.7-flash-low",
  "gemini-3.6-flash",
  "gemini-3.6-flash-pro",
  "gemini-3.1-pro",
  "gemini-3.1-flash",
  "gemini-3-pro",
  "gemini-3-pro-high",
  "gemini-3-pro-medium",
  "gemini-3-pro-low",
];

async function refresh(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function probe(token, model) {
  const url = `${ENDPOINT}/v1internal:generateContent`;
  const body = {
    project: "rising-fact-p41fc",
    request: {
      model,
      contents: [{ role: "user", parts: [{ text: "Say OK" }] }],
      generationConfig: { maxOutputTokens: 10 },
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "antigravity/cli/1.18.3 (aidev_client; os_type=darwin; arch=amd64; cl=962369648; auth_method=consumer)",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 200) };
  } catch (e) {
    return { status: -1, text: e.message };
  }
}

async function checkQuota(token) {
  const url = `${ENDPOINT}/v1internal:retrieveUserQuota`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "GeminiCLI/1.0.0/gemini-2.5-pro (win32; x64)",
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return { status: res.status };
    const data = await res.json();
    return { status: 200, buckets: data.buckets };
  } catch (e) {
    return { status: -1, text: e.message };
  }
}

async function main() {
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    try {
      const token = await refresh(acc.refreshToken);
      const q = await checkQuota(token);
      if (q.status === 200 && q.buckets) {
        console.log(`--- account ${i}: ${acc.email || acc.label || acc.id} ---`);
        for (const b of q.buckets) {
          if (!b.modelId) continue;
          console.log(`  ${b.modelId}: remaining=${b.remaining} limit=${b.limit || "?"} consumed=${b.consumed || "?"}`);
        }
      } else {
        console.log(`--- account ${i}: ${acc.email || acc.label || acc.id}: quota status ${q.status} ---`);
      }
    } catch (e) {
      console.log(`--- account ${i}: refresh failed: ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 800));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});