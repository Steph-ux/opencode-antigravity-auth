# SESSION NOTES — opencode-antigravity-auth

Notes de session détaillées — tout ce qu'on a fait et découvert, pour ne rien oublier.
Dernière mise à jour : 15/08/2026

---

## 1. C'EST QUOI CE PROJET

Plugin OpenCode qui intercepte les appels `fetch()` vers `generativelanguage.googleapis.com`,
les transforme en format Antigravity (backend `cloudcode-pa.googleapis.com`), et gère :
- Auth OAuth Google (login Antigravity/Code Assist)
- Quota & rotation multi-comptes
- Recovery de session
- Nettoyage des thinking blocks Claude
- Fingerprints par compte (anti rate-limit)

Repo : https://github.com/Steph-ux/opencode-antigravity-auth (fork + origin = même repo)
Local : `D:\home\modal\hacking\opencode-antigravity-auth`

---

## 2. COMMITS RÉCENTS (historique des dernières sessions)

| Commit | Message | Contenu |
|---|---|---|
| `47955f4` | feat(plugin): support thinking tier variants for Gemini 3.7 Flash | Variants low/medium/high sur 3.7-flash, tier ré-appliqué au NOM du modèle, `GEMINI_37_FLASH_TIERED_REGEX` exporté, resolveModelWithVariant étendu (6 fichiers, +37/-3) |
| `a60d290` | fix: gemini 3.7 tier mapping, account rotation tight-loop, api-key handling | **Release 1.7.0**. Fix 1-5 (détails §3). 10 fichiers, +215/-26 |
| `c012bc9` | feat: add Gemini 3.7 Flash to model catalog | Ajout 3.7-flash au catalogue |
| `44d2015` | build: add prepare script so git-based plugin installs compile dist | build auto au install git |
| `6b96da6` | fix: use antigravity/cli User-Agent to bypass 404 gate | UA `antigravity/cli/` requis sinon 404 "entity not found" |
| `4815f62` | feat: add Gemini 3.5 Flash support (config + quota filter) | |
| `ed6b952` | fix: Windows ESM imports, Claude apiKey sentinel, plugin/tool subpath | |

---

## 3. FIXES 1-5 (release 1.7.0, commit `a60d290`)

### Fix 1 : propager headerStyle du fallback quota
- `plugin.ts` l.1575-1592 + l.1879 — le fallback de quota devait propager le headerStyle
- Statut : **fait**

### Fix 2 : backoff anti-boucle infinie dans shouldSwitchAccount
- `plugin.ts` l.2462-2485 — boucle infinie de rotation de comptes (OOM / crash dumps)
- Cause : sélecteur hybride filtré par `isRateLimitedForFamily` (AND des 2 pools) → comptes épuisés sélectionnés puis rejetés post-select, sans envoyer de requête
- Fix : filtrer par `isRateLimitedForHeaderStyle` + exclusion cooldown dans `getMinWaitTimeForFamily` + backoff min 500ms avant switch de compte
- Statut : **fait**

### Fix 3 : mapping tier Gemini 3.7 (le 3.7 GA garde le tier dans le NOM)
- `model-resolver.ts` — `resolveModelWithTier` retirait le suffixe tier pour les tiered flash → `gemini-3.7-flash-medium` redevenait `gemini-3.7-flash` → backend 429
- Fix : 3.7 GA garde le tier dans le nom (défaut medium) ; le chemin gemini-cli préserve le tier demandé au lieu de forcer `-preview` (403)
- Statut : **fait**

### Fix 4 : rotation multi-comptes 4/4
- Validé : rotation sur les 4 comptes fonctionne (log 18:00-55)
- Statut : **fait**

### Fix 5 : api-key handling
- Strip du placeholder `x-goog-api-key` (provider apiKey sentinel) rejeté en 400
- Retry des erreurs 400 api-key sur l'endpoint suivant
- Statut : **fait** (test `api-key-retry.test.ts` ajouté)

### Tests
- 1003 → **1004 tests passés** (npm test)
- Typecheck OK, build OK

---

## 4. VARIANTS DE PENSÉE (thinking tiers) — 3.7 FLASH

### Ce qui marche (contournement validé E2E)
```
opencode run "<msg>" --model google/antigravity-gemini-3.7-flash-high
```
- Le tier passe par le **NOM** du modèle (`...-flash-high/medium/low`)
- Logs : `rawModel=antigravity-gemini-3.7-flash-high → resolvedModel=gemini-3.7-flash-high → resolvedTier=high`
- Réponse OK, exit 0

### Ce qui ne marche PAS
```
--variant high          → variantLevel=none providerOptions.google=null (jamais transmis au plugin)
--model google/...:high → "Unexpected server error"
```
- **Cause confirmée** : build opencode `dev-202608121637` ne mappe pas `--variant` → `providerOptions` pour les providers custom. C'est une limite opencode, pas du plugin.
- Le log `[ThinkingResolution]` (avec `OPENCODE_ANTIGRAVITY_CONSOLE_LOG=1`) montre toujours `variantLevel=none` → le plugin ne reçoit jamais le variant.

### Comment le tier est appliqué dans le code
1. `models.ts` l.45-54 : `variants: { low: {thinkingLevel:"low"}, medium: {thinkingLevel:"medium"}, high: {thinkingLevel:"high"} }`
2. `request.ts` l.920-952 : extraction du variant + ré-application du tier au NOM du modèle (requis par le backend antigravity)
3. `model-resolver.ts` l.71 : `GEMINI_37_FLASH_TIERED_REGEX` exporté + `resolveModelWithVariant`

---

## 5. CATALOGUE DE MODÈLES ACTUEL (models.ts)

```ts
"antigravity-gemini-3.7-flash":        # context 1M, output 64K — variants low/medium/high
"antigravity-gemini-3.6-flash-tiered": # context 1M, output 64K — pas de variants
"antigravity-claude-sonnet-4-6":       # context 200K, output 64K
"antigravity-claude-opus-4-6-thinking":# context 200K, output 64K — variants low (8192) / max (32768)
```

⚠️ Le commentaire "Only these models work; all others return API errors" est **FAUX** :
le backend expose ~25 modèles (voir §7) dont certains non catalogués qui fonctionnent probablement.

---

## 6. CONFIG OPENCODE (C:\Users\stephanea\.config\opencode\opencode.json)

- **whitelist** : 10 entrées dont `antigravity-gemini-3.7-flash-high/medium/low`
- **models** : 7 entrées (`antigravity-gemini-3.7-flash` + high/medium/low + 3.6-tiered + claude sonnet + claude opus)
- ⚠️ GOTCHA : une entrée doit être dans `whitelist` **ET** `models` — whitelist seule → "Unexpected server error"
- ⚠️ GOTCHA : ConvertTo-Json (PowerShell) reformate tout le fichier ; la première manip avait NULLÉ la whitelist — toujours vérifier après édition PowerShell
- Logs de session : `C:\Users\stephanea\AppData\Roaming\opencode\antigravity-logs\antigravity-debug-*.log`

---

## 7. MODÈLES CACHÉS DÉCOUVERTS (fetchAvailableModels — backend)

`POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels` renvoie **25 modèles** (compte lolmp023) :

**Gemini (liste réelle du backend) :**
- gemini-3.6-flash-tiered / low / medium / high
- gemini-3.1-pro-high / gemini-3.1-pro-low
- gemini-pro-agent (displayName "Gemini 3.1 Pro (High)")
- gemini-3.5-flash-low / gemini-3.5-flash-extra-low
- gemini-3-flash (recommended, supportsThinking, thinkingBudget -1, maxTokens 1048576, maxOutput 65536)
- gemini-3-flash-agent
- gemini-3.1-flash-lite
- gemini-3.1-flash-image (génération d'images)
- gemini-2.5-pro / gemini-2.5-flash / gemini-2.5-flash-lite / gemini-2.5-flash-thinking

**Claude :** claude-opus-4-6-thinking, claude-sonnet-4-6

**Autres :** gpt-oss-120b-medium, tab_flash_lite_preview, tab_jump_flash_lite_preview, chat_23310, chat_20706

### MYSTÈRE NON RÉSOLU
`gemini-3.7-flash` **n'apparaît PAS** dans fetchAvailableModels mais **fonctionne** (200 OK en E2E).
→ La liste n'est pas exhaustive, le backend accepte des noms non listés.

### Test des candidats non-listés (gemini-3.7-pro, etc.)
- **Résultat : NON CONCLUSIF** — tous les comptes épuisés (429 "Resource has been exhausted")
- Le backend vérifie le **quota AVANT le modèle** → 429 sur les baselines connues aussi
- Seul un 200 ou un 400/404 "model not found" discriminerait
- **À RELANCER quand le quota est dispo** (script §9)

---

## 8. ENDPOINTS & AUTH (constants.ts)

```ts
ANTIGRAVITY_CLIENT_ID     = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"   (l.4)
ANTIGRAVITY_CLIENT_SECRET = "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"                                          (l.9)
ANTIGRAVITY_SCOPES        = cloud-platform, userinfo.email, userinfo.profile, cclog, experimentsandconfigs (l.14-20)
ANTIGRAVITY_REDIRECT_URI  = http://localhost:51121/oauth-callback                                            (l.25)

Endpoints (ordre de fallback daily → autopush → prod) :
  daily    = https://daily-cloudcode-pa.sandbox.googleapis.com   (l.32) — ANTIGRAVITY_ENDPOINT par défaut
  autopush = https://autopush-cloudcode-pa.sandbox.googleapis.com (l.33)
  prod     = https://cloudcode-pa.googleapis.com                  (l.34)

Endpoints API :
  POST {base}/v1internal:generateContent
  POST {base}/v1internal:streamGenerateContent?alt=sse
  POST {base}/v1internal:fetchAvailableModels
  POST {base}/v1internal:retrieveUserQuota
  POST https://oauth2.googleapis.com/token  (refresh token → access token)
```

### GOTCHAS AUTH/HEADERS (vérifiés en dur)

1. **UA obligatoire** : `antigravity/cli/{version} (aidev_client; os_type=darwin|windows; arch=amd64|arm64; cl=962369648; auth_method=consumer)` — sinon 404 "Requested entity was not found" (fix `6b96da6`)

2. **UA Gemini CLI** (quota CLI, pools séparés) : `GeminiCLI/1.0.0/gemini-2.5-pro (win32; x64)` — donne des buckets quota DIFFÉRENTS des pools antigravity

3. **Body WRAPPED obligatoire** : `{ project: "...", request: { model, contents, generationConfig } }` — sinon 400 "Invalid JSON payload received. Unknown name contents"

4. **Headers antigravity mode** (request.ts l.1551-1561) : SEULEMENT `User-Agent` du fingerprint (pas de X-Goog-Api-Client, pas de Client-Metadata)

5. **Headers gemini-cli mode** (request.ts l.1562-1566) : UA + `X-Goog-Api-Client` + `Client-Metadata` (GEMINI_CLI_HEADERS)

6. **Strip obligatoire** : `x-api-key`, `x-goog-api-key` (placeholder sentinel → 400), `x-goog-user-project` (→ 403)

7. **Fingerprint** (fingerprint.ts) : deviceId (UUID v4), sessionToken (16 bytes hex), userAgent, apiClient, clientMetadata {ideType: ANTIGRAVITY, platform: WINDOWS|MACOS, pluginType: GEMINI}. Historique max 5 par compte, restorable. `buildFingerprintHeaders()` ne renvoie QUE User-Agent.

8. **Quota avant modèle** : le backend renvoie 429 pour tout quand le compte est épuisé, impossible de distinguer "modèle inexistant" de "quota épuisé" avec un compte sec

---

## 9. SCRIPTS DE PROBE (dans C:\Users\STEPHA~1\AppData\Local\Temp\opencode\)

| Script | But | Statut |
|---|---|---|
| `probe-models.cjs` | Liste les modèles (fetchAvailableModels) + quota (retrieveUserQuota) par compte | ✅ Fonctionne (25 modèles découverts) |
| `probe-candidates.cjs` | Teste 19 candidats via generateContent | ❌ 403 scopes (headers manquants, 1er jet) |
| `probe-pro.cjs` | Teste 31 candidats (dont gemini-3.7-pro, 3.5-pro, 3.6-pro...) avec body wrappé + UA antigravity | ⏸️ Bloqué : 429 quota partout — **à relancer quand quota dispo** |

### Candidats testés dans probe-pro.cjs (31)
Baselines : gemini-3.7-flash-medium, gemini-3.6-flash-tiered, claude-sonnet-4-6
Candidats : gemini-3.7-pro (+high/medium/low), gemini-3.7-flash-pro, gemini-3.6-pro (+high/medium/low), gemini-3.5-pro (+high/medium/low), gemini-3.5-flash (+medium/high), gemini-3.4-flash, gemini-3.7-flash (+high/low), gemini-3.6-flash, gemini-3.6-flash-pro, gemini-3.1-pro, gemini-3.1-flash, gemini-3-pro (+high/medium/low)

---

## 10. COMPTES ANTIGRAVITY (C:\Users\stephanea\.config\opencode\antigravity-accounts.json)

4 comptes (index 0-3) :
- **account-0** : pas d'email visible — quota status 429
- **lolmp023@gmail.com** : fetchAvailableModels 200 (25 modèles), quota buckets gemini-2.5* — épuisé
- **h4ckone9@gmail.com** : compte actif sélectionné par le plugin ("3/4") — épuisé
- **mathiasassogba86@gmail.com** : buckets gemini-2.5* — épuisé

Chaque compte : refreshToken, fingerprints (historique max 5), projectId/managedProjectId.
⚠️ NE PAS COMMITTER les refresh tokens.

---

## 11. COMMANDES UTILES

```bash
# Build / tests / typecheck (depuis la racine du repo)
npm run build
npm run typecheck
npm test
npx vitest run src/plugin/auth.test.ts        # test unique
npx vitest run -t "test name"                 # test par nom
npm run test:coverage
npm run test:e2e:models / test:e2e:regression

# E2E plugin via opencode
opencode run "<msg>" --model google/antigravity-<model>

# Debug plugin (logs)
OPENCODE_ANTIGRAVITY_DEBUG=1          # active l'écriture du fichier debug
OPENCODE_ANTIGRAVITY_CONSOLE_LOG=1    # log.debug → console (TUI)
# Fichier : C:\Users\stephanea\AppData\Roaming\opencode\antigravity-logs\antigravity-debug-*.log

# CLI officielle Antigravity
C:\Users\stephanea\AppData\Local\agy\bin\agy.exe --model gemini-3.7-flash-medium
```

### GOTCHA LOGS
- `log.debug` (logger.ts) → **jamais** dans le fichier debug, seulement TUI (`debug_tui`) ou console (`OPENCODE_ANTIGRAVITY_CONSOLE_LOG`)
- Le fichier debug n'est écrit que par `logDebug` (debug.ts)
- Le fichier n'est créé QUE si `config.debug` ou `OPENCODE_ANTIGRAVITY_DEBUG` (schema.ts:98, défaut false)
- Log vide (0 octet) sur un run réussi = artefact de flush, pas une erreur

---

## 12. TODO / PROCHAINES ÉTAPES

1. **Relancer `probe-pro.cjs` quand le quota est dispo** (demain, ou compte neuf) pour tester gemini-3.7-pro et les autres candidats
2. **Éclaircir le mystère 3.7-flash** : pourquoi marche-t-il sans être dans fetchAvailableModels ?
3. Si 200 OK sur des candidats : ajouter au catalogue (models.ts) + opencode.json (whitelist + models), valider E2E, commit
4. Corriger le commentaire trompeur "Only these models work" dans models.ts (le backend en expose 25)
5. Candidats prometteurs à ajouter si confirmés : gemini-3.1-pro-high/low, gemini-3.5-flash-low, gemini-3-flash, gemini-3.1-flash-image, gpt-oss-120b-medium

---

## 13. RAPPELS PERSO (contexte)

- Routage agents : qwen-coder/devstral (code), oracle (recherche), prometheus (archi), metis (long-contexte), multimodal-looker (UI), librarian/sisyphus-junior (lookup), document-writer (docs), zeus (quota limité)
- AGENTS.md : Effect v4 beta API, imports avec extension .ts, exports nommés, pas de `as any`/`@ts-ignore`, tests vitest colocalisés
- Style : double quotes, pas de semicolons, trailing commas, 2 espaces