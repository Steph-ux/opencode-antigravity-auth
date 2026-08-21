import { ANSI, isTTY } from "./ansi";
import type { AccountQuotaResult, QuotaGroup, QuotaGroupSummary } from "../quota";

export const colors = {
  cyan: (s: string) => `${ANSI.cyan}${s}${ANSI.reset}`,
  green: (s: string) => `${ANSI.green}${s}${ANSI.reset}`,
  red: (s: string) => `${ANSI.red}${s}${ANSI.reset}`,
  yellow: (s: string) => `${ANSI.yellow}${s}${ANSI.reset}`,
  gray: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
  bold: (s: string) => `${ANSI.bold}${s}${ANSI.reset}`,
};

export function isColorSupported(): boolean {
  return isTTY() || process.env.FORCE_COLOR === "1";
}

/**
 * Renders a visual ASCII progress bar with ANSI color.
 * e.g., "[████████░░] 82%"
 */
export function renderProgressBar(fraction: number | undefined, width = 10): string {
  if (fraction === undefined || Number.isNaN(fraction)) {
    return "[??????????]  --%";
  }

  const normalized = Math.max(0, Math.min(1, fraction));
  const percent = Math.round(normalized * 100);
  const filledCount = Math.round(normalized * width);
  const emptyCount = width - filledCount;

  const filledChar = "█";
  const emptyChar = "░";

  const bar = `${filledChar.repeat(filledCount)}${emptyChar.repeat(emptyCount)}`;
  const percentStr = `${percent}%`.padStart(4, " ");

  if (!isColorSupported()) {
    return `[${bar}] ${percentStr}`;
  }

  // Color gradient: Green (>50%), Yellow (20-50%), Red (<20%)
  let coloredBar = bar;
  if (percent > 50) {
    coloredBar = colors.green(bar);
  } else if (percent > 20) {
    coloredBar = colors.yellow(bar);
  } else {
    coloredBar = colors.red(bar);
  }

  return `[${coloredBar}] ${percentStr}`;
}

/**
 * Formats countdown until reset.
 */
export function formatResetCountdown(resetTime?: string): string {
  if (!resetTime) {
    return "ready";
  }

  const resetMs = Date.parse(resetTime);
  if (!Number.isFinite(resetMs)) {
    return "ready";
  }

  const diffMs = resetMs - Date.now();
  if (diffMs <= 0) {
    return "resetting now";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `resets in ${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `resets in ${minutes}m ${seconds}s`;
  }
  return `resets in ${seconds}s`;
}

/**
 * Formats a single account's quota lines for terminal display.
 */
export function formatAccountQuotaBlock(result: AccountQuotaResult): string[] {
  const lines: string[] = [];
  const label = result.email ? result.email : `Account #${result.index + 1}`;
  const statusBadge = result.disabled
    ? colors.gray("⚪ DISABLED")
    : result.status === "error"
      ? colors.red("🔴 ERROR")
      : colors.green("🟢 ACTIVE");

  lines.push(`┌── [${result.index + 1}] ${colors.bold(label)}  ${statusBadge}`);

  if (result.status === "error") {
    lines.push(`│   ${colors.red(`Error: ${result.error || "Failed to fetch quota"}`)}`);
    lines.push(`└──`);
    return lines;
  }

  const groups = result.quota?.groups || {};
  const claude = groups.claude;
  const geminiFlash = groups["gemini-flash"];
  const geminiPro = groups["gemini-pro"];

  // Claude Quota Bar
  if (claude) {
    const bar = renderProgressBar(claude.remainingFraction);
    const reset = claude.remainingFraction === 0 ? ` (${colors.yellow(formatResetCountdown(claude.resetTime))})` : "";
    lines.push(`│   Claude (Sonnet/Opus): ${bar}${reset}`);
  }

  // Gemini Flash Quota Bar
  if (geminiFlash) {
    const bar = renderProgressBar(geminiFlash.remainingFraction);
    const reset = geminiFlash.remainingFraction === 0 ? ` (${colors.yellow(formatResetCountdown(geminiFlash.resetTime))})` : "";
    lines.push(`│   Gemini 3.7 Flash:     ${bar}${reset}`);
  }

  // Gemini Pro Quota Bar
  if (geminiPro) {
    const bar = renderProgressBar(geminiPro.remainingFraction);
    const reset = geminiPro.remainingFraction === 0 ? ` (${colors.yellow(formatResetCountdown(geminiPro.resetTime))})` : "";
    lines.push(`│   Gemini 3 Pro:         ${bar}${reset}`);
  }

  lines.push(`└──`);
  return lines;
}

/**
 * Builds the full formatted Quota Dashboard.
 */
export function renderQuotaDashboard(results: AccountQuotaResult[]): string {
  const header = `\n${colors.cyan("╔══════════════════════════════════════════════════════════════════╗")}\n` +
                 `${colors.cyan("║")}        ${colors.bold("⚡ ANTIGRAVITY LIVE ACCOUNT & QUOTA DASHBOARD")}        ${colors.cyan("║")}\n` +
                 `${colors.cyan("╚══════════════════════════════════════════════════════════════════╝")}\n`;

  if (results.length === 0) {
    return `${header}\n  No accounts configured. Run \`opencode auth login\` to add an account.\n`;
  }

  const blocks = results.map(r => formatAccountQuotaBlock(r).join("\n"));
  const summary = `\n  Total Accounts: ${results.length} | Active: ${results.filter(r => r.status === "ok" && !r.disabled).length} | Predictive Zero-429: ${colors.green("ENABLED")}\n`;

  return `${header}\n${blocks.join("\n\n")}\n${summary}`;
}

/**
 * Returns clean Markdown version of dashboard for OpenCode tool calls.
 */
export function renderMarkdownDashboard(results: AccountQuotaResult[]): string {
  let md = `### ⚡ Antigravity Accounts & Live Quota Dashboard\n\n`;
  md += `| # | Account Email | Status | Claude | Gemini 3.7 Flash | Gemini Pro | Reset Countdown |\n`;
  md += `|---|---|---|---|---|---|---|\n`;

  for (const r of results) {
    const email = r.email || `Account #${r.index + 1}`;
    const status = r.disabled ? "⚪ Disabled" : r.status === "error" ? "🔴 Error" : "🟢 Active";
    const claudePct = r.quota?.groups?.claude?.remainingFraction !== undefined
      ? `${Math.round(r.quota.groups.claude.remainingFraction * 100)}%`
      : "-";
    const flashPct = r.quota?.groups?.["gemini-flash"]?.remainingFraction !== undefined
      ? `${Math.round(r.quota.groups["gemini-flash"].remainingFraction * 100)}%`
      : "-";
    const proPct = r.quota?.groups?.["gemini-pro"]?.remainingFraction !== undefined
      ? `${Math.round(r.quota.groups["gemini-pro"].remainingFraction * 100)}%`
      : "-";
    const reset = formatResetCountdown(
      r.quota?.groups?.claude?.resetTime || r.quota?.groups?.["gemini-flash"]?.resetTime
    );

    md += `| ${r.index + 1} | \`${email}\` | ${status} | **${claudePct}** | **${flashPct}** | **${proPct}** | ${reset} |\n`;
  }

  return md;
}
