import { createLogger } from "./logger";
import { ensureProjectContext } from "./project";
import { accessTokenExpired } from "./auth";
import { refreshAccessToken } from "./token";
import { checkAccountsQuota } from "./quota";
import { loadAccounts, saveAccounts } from "./storage";
import type { AccountManager } from "./accounts";
import type { PluginClient, OAuthAuthDetails } from "./types";
import { ANTIGRAVITY_PROVIDER_ID } from "../constants";

const log = createLogger("auto-heal");
let isHealing = false;
let quotaSyncTimer: NodeJS.Timeout | null = null;

/**
 * Auto-heals accounts in the pool:
 * 1. Automatically provisions & discovers missing managed project IDs (Zero Config)
 * 2. Pre-warms initial live quota metrics into account memory for predictive routing
 * 3. Persists discovered project IDs back to storage
 */
export async function autoHealAccounts(
  manager: AccountManager,
  client?: PluginClient,
  providerId: string = ANTIGRAVITY_PROVIDER_ID,
): Promise<{ healedProjects: number; quotaSynced: boolean }> {
  if (isHealing) {
    return { healedProjects: 0, quotaSynced: false };
  }

  isHealing = true;
  let healedProjects = 0;

  try {
    const accounts = manager.getAccounts();
    const stored = await loadAccounts();
    let storageChanged = false;

    for (const account of accounts) {
      if (!account.parts.refreshToken) {
        continue;
      }

      // 1. Auto-discover missing managedProjectId
      if (!account.parts.managedProjectId && !account.parts.projectId) {
        try {
          let auth: OAuthAuthDetails = {
            type: "oauth",
            refresh: account.parts.refreshToken,
            access: account.access,
            expires: account.expires,
          };

          const clientToUse = client || ({ auth: { get: async () => ({}) }, tui: { showToast: async () => {} } } as any);

          if (accessTokenExpired(auth)) {
            const refreshed = await refreshAccessToken(auth, clientToUse, providerId);
            if (refreshed?.access) {
              auth = refreshed;
              account.access = refreshed.access;
              account.expires = refreshed.expires;
            }
          }

          if (auth.access) {
            const context = await ensureProjectContext(auth);
            if (context.effectiveProjectId) {
              account.parts.managedProjectId = context.effectiveProjectId;
              healedProjects++;
              storageChanged = true;

              log.info("Auto-healed account with managed project ID", {
                email: account.email ?? `account-${account.index}`,
                projectId: context.effectiveProjectId,
              });

              // Update storage record
              if (stored && stored.accounts && stored.accounts[account.index]) {
                stored.accounts[account.index]!.managedProjectId = context.effectiveProjectId;
              }
            }
          }
        } catch (err) {
          log.warn("Auto-heal failed to discover project for account", {
            email: account.email ?? `account-${account.index}`,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (storageChanged && stored) {
      await saveAccounts(stored);
    }

    // 2. Pre-sync live quotas to prime predictive routing cache
    let quotaSynced = false;
    if (client && stored && stored.accounts && stored.accounts.length > 0) {
      try {
        const quotaResults = await checkAccountsQuota(stored.accounts, client, providerId);
        for (const res of quotaResults) {
          if (res.status === "ok" && res.quota?.groups) {
            const acc = manager.getAccounts()[res.index];
            if (acc) {
              acc.cachedQuota = res.quota.groups;
              acc.cachedQuotaUpdatedAt = Date.now();
            }
          }
        }
        quotaSynced = true;
      } catch (err) {
        log.debug("Initial background quota sync completed with warning", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { healedProjects, quotaSynced };
  } finally {
    isHealing = false;
  }
}

/**
 * Periodically sync quotas in the background (every 3 minutes)
 * to keep predictive routing cache 100% up to date without adding latency.
 */
export function startPeriodicQuotaSync(
  manager: AccountManager,
  client?: PluginClient,
  intervalMs: number = 3 * 60 * 1000,
): void {
  if (quotaSyncTimer || !client) {
    return;
  }

  quotaSyncTimer = setInterval(async () => {
    try {
      const stored = await loadAccounts();
      if (!stored || !stored.accounts || stored.accounts.length === 0) return;

      const quotaResults = await checkAccountsQuota(stored.accounts, client);
      for (const res of quotaResults) {
        if (res.status === "ok" && res.quota?.groups) {
          const acc = manager.getAccounts()[res.index];
          if (acc) {
            acc.cachedQuota = res.quota.groups;
            acc.cachedQuotaUpdatedAt = Date.now();
          }
        }
      }
    } catch {
      // Background sync failures are silent to never disrupt user sessions
    }
  }, intervalMs);

  if (quotaSyncTimer.unref) {
    quotaSyncTimer.unref();
  }
}

export function stopPeriodicQuotaSync(): void {
  if (quotaSyncTimer) {
    clearInterval(quotaSyncTimer);
    quotaSyncTimer = null;
  }
}
