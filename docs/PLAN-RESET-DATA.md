# PLAN: Host Data Reset (D70)

> Status: **IMPLEMENTED in v0.8.2** - see "As shipped" at the end.

> Goal: one explicit action wipes host state (setup, projects, memory,
> vault, usage, connections) so the host boots fresh, exactly like the
> first run. This doc is the design; implementation is task D70.

## 1. Where state actually lives (verified)

Everything below is per-host, rooted at the **data dir** (the directory of
`demo.db`; desktop = Tauri `app_data_dir`, deployment = `yui-data` volume):

| Artifact | Contents | Reset action |
| --- | --- | --- |
| `demo.db` | projects, sessions/messages, memory rows, approvals, workflow runs, delegations, SSO/oauth tokens, usage ledger, persona growth, roster, activity, MCP audit, tasklists | delete |
| `vault.db` + `vault.key` | encrypted vault records + master key (records without the key are inert) | delete both |
| `workspace/` | `USER.md`, `memory/domains/*`, per-project files + `MEMORY.md`, `mcp.user.json` (user MCP installs + tokens), `reports/`, workspace `.git` | delete |
| `budget.json` | admission-control budget | delete |
| `.yuika/browser/<project>/<persona>` | persistent CDP browser profiles | delete |
| `api.log` | engine log | delete |
| `yuika.env` (desktop only) | provider config: base URL, API key, model | delete OR keep (user choice, default keep) |
| `setup.json` (desktop only, lives in `app_config_dir`) | welcome picker last choice | delete via Rust command |

Never touched (image/bundle layer): personas, skills, base `mcp.json`,
engine binary, web UI. A reset must never require reinstalling the app.

## 2. Scopes

Two buttons, not six (v0 keeps the surface small):

1. **Reset work data** — everything in the table above except `yuika.env`
   and `setup.json`. Result: fresh studio, same provider config, still
   signed in to nothing (SSO tokens are inside `demo.db`, so the portal
   link is gone; MCP catalog installs are gone with `mcp.user.json`).
2. **Factory reset** — work data PLUS `yuika.env` and `setup.json`.
   Result: desktop shows the welcome picker again and the env wizard
   path (D67/D68) for a truly first-run experience.

## 3. Reset procedure (engine side)

Reset is not "delete files while running". Order matters:

1. **Quiesce.** Cancel in-flight delegations/workflows, stop all screen
   sessions and terminals, disconnect relay host service (bye, no 4001
   unlink semantics), close MCP connections.
2. **Close handles.** Close every SQLite handle (`demo.db`, `vault.db`)
   so WAL/SHM files flush and vanish with the delete.
3. **Delete.** Remove the artifacts from §1 per scope. Keep a
   `reset.log` (timestamp + scope) in the data dir as the only survivor,
   written AFTER the wipe; the next boot appends "booted fresh".
4. **Restart the process.** The engine exits with a dedicated code
   (e.g. `process.exit(87)`); the supervisor restarts it:
   - desktop: Rust parent watches the child and respawns, then the
     shell re-checks `env_status`/`setup.json` and may re-show welcome;
   - deployment: compose `restart: unless-stopped` boots a fresh
     engine against the now-empty volume.

In-place re-init without a process restart is rejected: too many
module-level singletons (vault, screen, relay, MCP, bus) assume
initialize-once. Restart is the cheap correct path.

## 4. API + UX

- `POST /api/settings/reset` `{ scope: "work" | "factory", confirm: "RESET" }`
  → 202, then the steps above; the API dies mid-request by design, so the
  client treats "connection lost after 202" as success and polls health
  on reconnect.
- Studio UI: Settings → **Danger zone** → scope toggle (work vs factory),
  type-to-confirm `RESET`, red button "Reset data". Copy states plainly
  what survives: "Provider config and sign-in setup are kept" vs
  "Everything is wiped; the welcome setup will run again."
- Desktop: same UI in the webview; after restart the shell may land on
  welcome (factory) or straight into the studio (work).
- Auth: same session rules as settings routes. No reset without an
  authenticated owner (local single-user mode = always allowed).

## 5. Safety and edge cases

- **Backup**: v0 offers no backup; the copy above says so explicitly.
  v1 candidate: zip the data dir next to it before wiping
  (`backup-<timestamp>.zip`), size-capped, one kept.
- **Locked files** (Windows AV scanning `demo.db`): deletion failures are
  collected and reported; the engine still restarts, and boot re-attempts
  leftovers cleanup if `reset.log` exists with incomplete status.
- **Concurrent resets**: single-flight guard; second request gets 409.
- **Relay/portal**: because SSO tokens die with `demo.db`, the device
  stays linked on the portal side until its sweep (or user unlinks in
  portal Devices). Document this in the confirm copy: "Devices may stay
  listed on the portal until you unlink them there."
- **`--main` vs release deployments**: identical behavior; the updater
  never touches the volume, reset is the only sanctioned volume wipe.

## 6. Test plan

- Unit: scope → delete-list builder (exact paths, keep-list for
  work-scope), tombstone-free `reset.log` writer.
- Integration (core): seed runtime (project, session, vault record,
  MCP install, workflow run) → reset("work") → restart → assert empty
  project list, empty vault, no `mcp.user.json`, `yuika.env` intact;
  factory scope additionally removes env + setup marker.
- Desktop e2e: factory reset → welcome picker visible again → env
  wizard reproduces D67 flow.
- Fake-relay: reset while hosting → client sees `host_offline`, not a
  4001 logged-out storm.

## 7. Open questions (resolved in implementation)

1. `yuika.env` on factory reset: **deleted** (truly fresh, spec as-is).
2. `reset.log` includes scope + timestamps + deleted list: useful for
   support, not a privacy leak (paths only, no content).
3. All three compose variants already run `restart: unless-stopped` —
   verified; exit 87 is enough for deployments too.

## 8. As shipped (v0.8.2)

- `packages/core/src/reset.ts`: scope artifact lists, boot-time
  `executePendingWipe` (runs before any store opens), `reset.log`
  survivor, `writeResetPending` marker. **api.log is never deleted**
  (the desktop parent holds its handle; the log is app-level, not
  user data). The `update-in-progress` flag also survives.
- Engine exit path: relay bye + `rt.dispose()` → marker → `exit(87)`.
  Linux tries an immediate best-effort unlink; Windows relies on the
  boot finisher (all handles dead after restart).
- Desktop `lib.rs`: `ApiProcess` stores the PID; a monitor thread owns
  the `Child`, respawns on exit code 87 (factory scope also removes
  `setup.json`), reloads the webview to `welcome.html?reset=1` (factory)
  or `./` (work). Non-reset exits route back to the welcome picker.
- API `POST /api/settings/reset` ({scope, confirm:"RESET"}); 400/409/202
  contract covered by tests with an injected executor. UI: Settings →
  Reset section with type-to-confirm and auto-reload polling.
