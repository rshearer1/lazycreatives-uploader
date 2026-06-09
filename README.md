# LazyCreatives Uploader

**Automatically publish your finished mixes to SoundCloud.**

Point it at the folder you bounce mixes into. It finds every new render, lets you
publish with one click — or watches the folder and uploads automatically — and never
double-posts the same mix (de-duplicated by audio content hash, not filename). It also
**manages your existing SoundCloud tracks**: edit titles/tags/genre, flip public↔private,
or delete — without leaving the app.

A sibling to [LazyCreatives Backups](https://github.com/rshearer1/lazycreatives-backups):
same Electron + Python/FastAPI sidecar architecture, same brand, same licensing model —
built so both tools can sit behind one dashboard / subscription later.

> Runs fully **offline in demo mode** with no SoundCloud account, so you can try the
> entire flow before you have API credentials.

---

## How it works

```
Setup (once)   →   Scan   →   Pick   →   Publish   →   Manage
folders + connect   find new   choose &   POST to       edit / privacy /
SoundCloud          renders    metadata   SoundCloud     delete existing
```

- **Never double-posts.** Each mix is hashed; if that exact audio is already on
  SoundCloud it's skipped. Re-render with a change and it's treated as new.
- **One-click or hands-off.** Publish selected mixes manually, or (Pro) let it watch
  a folder and upload new renders on a schedule.
- **Manages your whole library.** Lists every track on your account; edit title,
  description, tags and genre, toggle public/private, or delete — all in-app.
- **Your account stays yours.** OAuth tokens are stored locally and refreshed
  automatically; no third-party server sees your audio.

## Architecture

An **Electron** shell + React/TypeScript renderer over a **Python/FastAPI** sidecar
that does the scanning, hashing, OAuth and uploading.

```
electron/   desktop shell + flow-first UI (Setup → Home → Upload → Manage → History → Settings)
backend/    lazyupload/ — the engine
  soundcloud   OAuth2 (Authorization Code + PKCE) + multipart upload; mock client
  connect      loopback browser sign-in session
  scanner      discover audio in the watched folders
  service      scan-with-dedupe, the upload engine, the connected account, overview
  catalog      SQLite history + dedupe index + settings
  scheduler    APScheduler watch-folder auto-upload (Pro)
  entitlement  Free/Pro tiers (HMAC-signed local cache; Lemon Squeezy activation)
```

## SoundCloud setup (for real uploads)

The app ships ready to run in **demo mode**. To publish for real you (the developer)
register **one** SoundCloud API app and bake its credentials into the build:

1. Subscribe to **SoundCloud Artist Pro** — required to register API apps.
2. Create an app at <https://soundcloud.com/you/apps/new>.
3. Add this **redirect URI** exactly: `http://127.0.0.1:8765/callback`
4. Provide the credentials to the backend via environment (or a git-ignored
   `backend/lazyupload/_buildsecret.py`):

   ```
   LAZYUP_SC_CLIENT_ID=<your client id>
   LAZYUP_SC_CLIENT_SECRET=<your client secret>
   ```

With those set, the mock is bypassed and end-users sign in with their own SoundCloud
accounts (no Pro subscription needed to *authorize* an upload). Set `LAZYUP_MOCK=1` to
force demo mode even when credentials exist.

> **Reality check:** SoundCloud gates API access fairly tightly. Getting the API app
> approved is the one external dependency for going live — the code is ready either way.

## Develop / run

Prereqs: Node 18+, Python 3.11+.

```bash
# backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"   # Windows  (.venv/bin/pip on macOS/Linux)

# app (spawns the sidecar automatically; runs in demo mode)
cd ../electron
npm install
npm start
```

Headless CLI (handy for a dry run against the mock):

```bash
cd backend
.venv/Scripts/python -m lazyupload.cli scan   --source "D:/Mixes" --db catalog.db
.venv/Scripts/python -m lazyupload.cli upload --source "D:/Mixes" --db catalog.db --sharing private
```

## Tests

```bash
cd backend  && .venv/Scripts/python -m pytest   # backend engine + API (31 tests)
cd electron && npm test                         # renderer
```

## Plans

| Feature | Free | Pro |
|---|---|---|
| Manual upload (one at a time) | ✅ | ✅ |
| Public / private release | ✅ | ✅ |
| Manage existing tracks (edit / privacy / delete) | ✅ | ✅ |
| Dedupe (never double-post) | ✅ | ✅ |
| Batch upload a whole folder | — | ✅ |
| Watch-folder auto-upload | — | ✅ |
| Scheduled public release | — | ✅ |
| Multiple SoundCloud accounts | — | ✅ |

Licensing (`entitlement.py`) is a deliberate near-clone of the Backups tool's, so a
future "buy tools separately / all-access subscription" dashboard can point both at
one shared licensing service with minimal change.

## Status

Active development. Packaging (installers) wired via `electron-builder`; `npm start`
runs it in dev. App icons are placeholders pending final brand art.
