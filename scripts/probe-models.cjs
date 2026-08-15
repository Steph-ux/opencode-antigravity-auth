const fs = require("fs");
const path = require("path");

const CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const MODELS_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";

const accountsPath = path.join(process.env.USERPROFILE, ".config", "opencode", "antigravity-accounts.json");
const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8")).accounts;

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
  if (!res.ok) {
    throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function postJson(url, token, body, ua) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": ua,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  for (const [i, acc] of accounts.entries()) {
    const email = acc.email || `account-${i}`;
    console.log(`\n===== ${email} =====`);
    try {
      const token = await refresh(acc.refreshToken);
      const project = acc.projectId || acc.managedProjectId;
      const body = project ? { project } : {};
      const ua = "antigravity/windows/amd64";

      console.log(`-- fetchAvailableModels (project=${project ?? "none"}) --`);
      const models = await postJson(MODELS_URL, token, body, ua);
      console.log(`status=${models.status}`);
      if (models.status === 200) {
        try {
          const parsed = JSON.parse(models.text);
          const keys = parsed.models ? Object.keys(parsed.models) : Object.keys(parsed);
          console.log(`models keys: ${JSON.stringify(keys)}`);
          console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));
        } catch {
          console.log(models.text.slice(0, 2000));
        }
      } else {
        console.log(models.text.slice(0, 500));
      }

      console.log(`-- retrieveUserQuota (project=${project ?? "none"}) --`);
      const quota = await postJson(QUOTA_URL, token, body, "GeminiCLI/1.0.0/gemini-2.5-pro (win32; x64)");
      console.log(`status=${quota.status}`);
      if (quota.status === 200) {
        try {
          const parsed = JSON.parse(quota.text);
          const bucketModels = (parsed.buckets || []).map((b) => b.modelId);
          console.log(`bucket modelIds: ${JSON.stringify(bucketModels)}`);
        } catch {
          console.log(quota.text.slice(0, 500));
        }
      } else {
        console.log(quota.text.slice(0, 500));
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});