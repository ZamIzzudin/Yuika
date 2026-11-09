# Codemagic: Mobile CI/CD for Yuika (and any project)

Codemagic is a hosted CI/CD service for mobile apps: Android (APK/AAB) and
iOS (IPA, needs macOS machines it provides). It supports React Native/Expo,
Flutter, native, Ionic, KMM, Unity and more. Use it when you need signed
release binaries without maintaining local SDKs or flaky self-hosted runners.

This doc is written to be executed by an AI agent (or a human in a hurry).
Everything here was verified against the official docs
(https://docs.codemagic.io/rest-api/, fetched June 2026) plus live route
probing of `api.codemagic.io`.

---

## 1. Mental model

| Concept | What it is |
| --- | --- |
| **Application (app)** | A connected Git repository. Has an `appId` (Mongo ObjectId, e.g. `6172cc7d57278d06d4e915f1`). |
| **codemagic.yaml** | Build config committed in the repo root. Defines named **workflows** (e.g. `android-release`). This is the recommended style. |
| **Workflow** | A named build pipeline. With yaml apps, the `workflowId` you pass to the API is the **workflow NAME from the yaml file**, not an ObjectId. |
| **Build** | One run. Started via UI, webhook, or `POST /builds`. Has `buildId`, status, branch/tag, artifacts. |
| **Artifacts** | Files a workflow exports (APK/IPA). Referenced by `secureFilename`; download via authenticated URL or a temporary public URL. |
| **Variable groups** | Named sets of secrets configured in the UI/teams; referenced by yaml. |
| **API token** | Personal token: Codemagic UI → Account settings → API token. Sent in the `x-auth-token` header (NOT `Authorization: Bearer`). |

Quirks an agent must know (verified):

- **There is no `GET /builds/:id`.** Poll build status via `GET /builds`
  (list; filter by `appId`, `limit`) and find the build by `_id`.
- **Yaml workflow names are not listable via API.** The API only knows
  workflows from the legacy Workflow Editor. To know valid `workflowId`
  values, read `codemagic.yaml` in the repo.
- The REST API is marked "preview" and may change without notice.
- `POST /builds/:id/cancel` returns `208` if the build already finished.
- Public artifact URLs are bearer-by-possession: anyone with the URL can
  download until `expiresAt`. Keep expiry short.

## 2. REST API quick reference

Base URL: `https://api.codemagic.io` — Auth header: `x-auth-token: <token>`

### List apps

```
GET /apps
→ { "applications": [ { "_id", "appName", "workflowIds", "workflows": {...} } ] }
```

### Get one app

```
GET /apps/:id
→ { "application": { "_id", "appName", "branches": [...], "workflows": {...} } }
```

### Add app (public repo)

```
POST /apps   body: { "repositoryUrl": "git@github.com:org/repo.git", "teamId": "optional" }
→ { "_id": "<appId>", "appName": "repo" }
```

### Add app (private repo, needs SSH key)

```
POST /apps/new   body: { "repositoryUrl": "...", "sshKey": { "data": "<base64 private key>", "passphrase": null } }
→ { "application": { "_id": "<appId>", ... } }
```

In practice: adding the repo via the Codemagic UI once (GitHub app install +
pick repo) is easier than the API; after that everything is API-driven.

### Start a build

```
POST /builds   body: {
  "appId":     "<appId>",
  "workflowId": "android-release",      // name from codemagic.yaml
  "branch":    "main",                  // or "tag": "v1.2.0" (one is required)
  "labels":    ["api"],                 // optional
  "environment": {                      // optional overrides
    "variables": { "ENVIRONMENT_VARIABLE_1": "..." },
    "groups": ["variable_group_1"],
    "softwareVersions": { "xcode": "16.4" }
  },
  "instanceType": "mac_mini_m2"         // optional machine override
}
→ { "buildId": "5fabc6414c483700143f4f92" }
```

Note: trigger/branch filters in yaml are IGNORED for API-started builds;
you pass branch/tag explicitly.

### Poll build status

```
GET /builds?limit=50            (add &appId=<id> to filter)
→ find entry with _id == buildId; inspect .status, .finishedAt, artifacts
```

### Cancel a build

```
POST /builds/:id/cancel      (208 if already finished)
```

### Download an artifact

Step 1 — get the `secureFilename` (shape `<uuid1>/<uuid2>/<file>`, e.g.
`ef45fb91-.../2dd0b3d6-.../app-release.apk`) from the build record
(`GET /builds`) or the Codemagic UI.

Step 2 — mint a temporary public URL:

```
POST /artifacts/:secureFilename/public-url   body: { "expiresAt": 1750000000 }
→ { "url": "https://api.codemagic.io/artifacts/.eJw...", "expiresAt": "..." }
```

## 3. codemagic.yaml (Yuika-Mobile reference)

The repo `Yuika-Mobile` carries a signing keystore (`keys/`, private repo)
and an Expo config plugin that patches `android/app/build.gradle` to sign
releases (`plugins/with-release-signing.js`). The yaml only has to:

1. `npm ci`
2. bump `expo.android.versionCode` to `CM_BUILD_NUMBER` (Codemagic's
   auto-incrementing build number) so installs upgrade in place
3. `npx expo prebuild -p android --no-install`
4. `./gradlew assembleRelease`
5. export `android/app/build/outputs/apk/release/*.apk`

`CM_BUILD_NUMBER` is a built-in variable. Other useful built-ins:
`CM_BUILD_ID`, `CM_BRANCH`, `CM_TAG`, `CM_COMMIT`, `CM_REPO_SLUG`,
`CM_TEAM_ID`, `CM_PROJECT_ID`.

For iOS later: add a workflow with an `instance_type: mac_*` machine,
Xcode version pin, and Apple code signing (automatic signing with an app
store key, or manual with certs/profiles in variable groups). Keep Android
on a Linux instance — it is cheaper than macOS minutes.

## 4. Wiring a NEW project (checklist an agent can follow)

1. Write `codemagic.yaml` at repo root (copy from Yuika-Mobile, adjust
   scripts/artifacts). Commit and push.
2. One-time (human): add the repo as an app in the Codemagic UI
   (or `POST /apps`). Note the `appId`.
3. Give the agent access: put `CM_API_TOKEN=<personal token>` in the
   environment where the agent's engine runs (Yuika: `yuika.env`).
4. Trigger and fetch:
   - `cm_start_build { appId, workflowId: "<yaml workflow name>", branch: "main" }`
   - `cm_wait_build { buildId }` (polls until finished)
   - take `secureFilename` from the build record → `cm_artifact_url` →
     hand the URL to the user (it expires; default 1h).
5. Status labels seen in the wild: `queued`, `building`/`running`,
   `success`/`finished`, `failed`, `canceled` — treat anything not in
   `{queued, running, building, preparing, fetching}` as terminal.

## 5. Using it from Yuika (Neo and friends)

- **MCP server**: `mcp-servers/codemagic/index.mjs` (this repo). Tools:
  `cm_apps`, `cm_app`, `cm_start_build`, `cm_builds`, `cm_wait_build`,
  `cm_cancel_build`, `cm_artifact_url`. Requires `CM_API_TOKEN` in the
  engine environment (e.g. `yuika.env` → engine env → MCP child env).
  Register in `mcp.json`:
  ```json
  "codemagic": {
    "command": "node",
    "args": ["{workspace}/../mcp-servers/codemagic/index.mjs"]
  }
  ```
- **Skill**: `packages/skills/codemagic-builds/SKILL.md` — when and how a
  persona should trigger builds, wait, and deliver artifact URLs.
- **Test the server by hand** (before wiring into an agent):
  ```bash
  CM_API_TOKEN=... node mcp-servers/codemagic/index.mjs
  # lalu baris JSON-RPC:
  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
  {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cm_apps","arguments":{}}}
  ```

## 6. Comparison with GitHub Actions (why both)

- GitHub Actions builds the same APK but has been hitting transient
  `504`s downloading from `services.gradle.org` / `repo.maven.apache.org`
  (June 2026). Mitigations already in place: curl+cache the Gradle
  distribution, `networkTimeout=120000`, dependency caching, retry loop.
- Codemagic machines cache dependencies on their side and are purpose-built
  for mobile (Android SDKs, NDK, Xcode, signing). It is the primary path
  for release binaries; Actions stays as fallback and for non-mobile repos.
- Pricing/limits: check https://codemagic.io/pricing (free tier exists;
  macOS minutes cost more than Linux).

## 7. Failure playbook

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401` on every call | token missing/wrong header | use `x-auth-token`, not Bearer; check `CM_API_TOKEN` |
| `workflow not found` | workflowId is an ObjectId or typo | use the workflow NAME from `codemagic.yaml` |
| Build stuck `queued` | no machine available / billing | check UI, cancel and retry, check plan |
| APK installs but won't upgrade over old one | versionCode not bumped | ensure `versionCode = CM_BUILD_NUMBER` patch step ran |
| Artifact URL 404 | build still exporting or filename wrong | poll again; use exact `secureFilename` incl. uuids |
