---
name: codemagic-builds
description: "Trigger and babysit mobile release builds (Android APK / iOS IPA) on Codemagic via its REST API: start a workflow build, wait until it finishes, then hand the user a temporary download URL for the artifact."
version: 0.1.0
author: Yuika Team
license: MIT
platforms: [linux, macos, windows]
metadata:
  yui:
    tags: [build, mobile, android, ios, ci, release, codemagic]
    category: build
    personas: [yui-coder, yui-neo]
---

# Codemagic Builds

Ship a signed mobile binary without touching a local Android SDK or Xcode.
Read `docs/CODEMAGIC.md` for the full reference; this skill is the
operational loop.

## When to use

- The user asks for an APK/IPA, a "release build", or wants to test the
  mobile app on a device after code changes.
- A mobile repo changed and the user wants to install the result.
- Do NOT use for web/desktop builds — those have their own pipelines.

## Prerequisites (fail fast if missing)

1. `CM_API_TOKEN` in the environment (Yuika: `yuika.env`). No token →
   tell the user exactly where to get it (Codemagic → Account settings →
   API token) and stop.
2. The repo is registered as a Codemagic app (`cm_apps` → find `appId`).
   If absent: the user must add the repo once in the Codemagic UI
   (GitHub app → pick repo). You cannot do it without their account.
3. `codemagic.yaml` exists in the repo root — read it to learn the
   workflow NAME (e.g. `android-release`) and what artifacts it exports.
   The API cannot list yaml workflow names; reading the file is the only way.

## Loop

1. **Identify inputs**: repo (default: current project), branch (default:
   the branch you just pushed), workflow (from yaml).
2. **Start**: `cm_start_build { appId, workflowId, branch }`.
   Keep the returned `buildId`.
3. **Wait**: `cm_wait_build { buildId }` (polls every 20s, 30min default).
   Report status to the user if they ask; otherwise stay quiet until done.
4. **Deliver**: from the finished build record take the artifact
   `secureFilename` → `cm_artifact_url` (default expiry 1h) → give the
   user the URL and warn that it expires. For an APK: "enable install
   from unknown sources, then open the URL on the phone and install".
5. **On failure**: fetch `cm_builds`, read the build record's
   failure stage, read the yaml step that matches, fix the repo,
   push, and start a new build. Do not retry blindly more than twice.

## Rules

- Never print the API token; never put it in URLs, logs, or commits.
- Public artifact URLs are as good as credentials for the file — keep
  `expiresAt` short (≤ 1h) and never post them into shared channels.
- Version discipline: Android must bump `versionCode` every build
  (Yuika-Mobile yaml does this via `CM_BUILD_NUMBER`). If installs
  refuse to upgrade, this is the first suspect.
- If the user asks for iOS: check that an `instance_type: mac_*`
  workflow with signing exists in yaml before promising anything.
