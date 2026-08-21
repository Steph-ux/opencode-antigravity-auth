#!/usr/bin/env node
import { loadAccounts } from "./plugin/storage";
import { checkAccountsQuota } from "./plugin/quota";
import { renderQuotaDashboard } from "./plugin/ui/dashboard";
import { autoHealAccounts } from "./plugin/auto-heal";
import { AccountManager } from "./plugin/accounts";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
⚡ Opencode Antigravity CLI

Usage:
  npx opencode-antigravity status     Show real-time visual quota dashboard
  npx opencode-antigravity heal       Auto-heal accounts & discover companion projects
  npx opencode-antigravity help       Show this help message
`);
    return;
  }

  if (command === "heal") {
    console.log("Auto-healing Antigravity accounts...");
    const manager = await AccountManager.loadFromDisk();
    const result = await autoHealAccounts(manager);
    console.log(`✓ Healed ${result.healedProjects} account project(s). Live quota synced: ${result.quotaSynced ? "YES" : "NO"}`);
    return;
  }

  if (command === "status") {
    console.log("Fetching live account quotas from Google Antigravity...");
    const stored = await loadAccounts();
    if (!stored || stored.accounts.length === 0) {
      console.log("No accounts registered. Run `opencode auth login` to add an account.");
      return;
    }

    const mockClient = {
      tui: { showToast: async () => {} },
      auth: { get: async () => ({}) },
    };

    const results = await checkAccountsQuota(stored.accounts, mockClient as any);
    console.log(renderQuotaDashboard(results));
    return;
  }

  console.log(`Unknown command: ${command}. Run with --help for options.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
