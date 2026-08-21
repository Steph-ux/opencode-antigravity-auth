import { createLogger } from "./logger";
import { accessTokenExpired } from "./auth";
import { refreshAccessToken } from "./token";
import type { AccountManager } from "./accounts";
import type { PluginClient } from "./types";
import { ANTIGRAVITY_PROVIDER_ID } from "../constants";

const log = createLogger("token-refresher");
const PROACTIVE_REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes before expiry
const REFRESHER_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

let refresherTimer: NodeJS.Timeout | null = null;
let isRefreshing = false;

/**
 * Preemptively refresh tokens for all accounts in the pool before they expire.
 * This eliminates token refresh latency during user requests (Zero-Wait TTFT).
 */
export async function refreshExpiringTokens(
  manager: AccountManager,
  client?: PluginClient,
  providerId: string = ANTIGRAVITY_PROVIDER_ID,
): Promise<number> {
  if (isRefreshing) {
    return 0;
  }

  isRefreshing = true;
  let refreshedCount = 0;

  try {
    const accounts = manager.getAccounts();
    const now = Date.now();

    for (const account of accounts) {
      if (!account.parts.refreshToken) {
        continue;
      }

      const expires = account.expires ?? 0;
      const isExpiringSoon = !account.access || expires <= now + PROACTIVE_REFRESH_WINDOW_MS;

      if (isExpiringSoon) {
        try {
          const auth = {
            type: "oauth" as const,
            refresh: account.parts.refreshToken,
            access: account.access,
            expires: account.expires,
          };

          const clientToUse = client || ({ auth: { get: async () => ({}) }, tui: { showToast: async () => {} } } as any);
          const refreshed = await refreshAccessToken(auth, clientToUse, providerId);
          if (refreshed?.access) {
            account.access = refreshed.access;
            account.expires = refreshed.expires ?? now + 3600 * 1000;
            refreshedCount++;
            log.debug("Proactively refreshed token for account", {
              email: account.email ?? `account-${account.index}`,
              expiresInSec: Math.round(((account.expires ?? now) - now) / 1000),
            });
          }
        } catch (err) {
          log.warn("Failed background token refresh for account", {
            email: account.email ?? `account-${account.index}`,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } finally {
    isRefreshing = false;
  }

  return refreshedCount;
}

/**
 * Start the background token refresher timer.
 */
export function startBackgroundTokenRefresher(
  manager: AccountManager,
  client?: PluginClient,
  intervalMs: number = REFRESHER_INTERVAL_MS,
): void {
  if (refresherTimer) {
    return;
  }

  // Initial trigger after short delay
  setTimeout(() => {
    refreshExpiringTokens(manager, client).catch(() => {});
  }, 2000);

  refresherTimer = setInterval(() => {
    refreshExpiringTokens(manager, client).catch(() => {});
  }, intervalMs);

  if (refresherTimer.unref) {
    refresherTimer.unref();
  }
}

/**
 * Stop the background token refresher.
 */
export function stopBackgroundTokenRefresher(): void {
  if (refresherTimer) {
    clearInterval(refresherTimer);
    refresherTimer = null;
  }
}
