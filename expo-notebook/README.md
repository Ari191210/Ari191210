# Expo Notebook

A mobile-first, offline-first PWA for capturing supplier info, business cards, photos and notes at trade expos.
**No backend, no accounts, no cloud: everything stays on your phone** (IndexedDB).

- **Suppliers / Notes / Photos** tabs, full-text search, filters (All / Hot / Maybe / Follow up)
- **Scan business card** → photo saved first → on-device OCR (Tesseract, runs in a Web Worker) → fills only empty fields → "Filled N fields, check them". Raw OCR text is in a collapsible panel.
- **Snap**: take a photo first; it becomes a note you title later
- **Autosave** on every keystroke (300 ms debounce, flushed when you switch apps). There is no Save button.
- **Backup**: one .zip (data.json + all photos + suppliers.csv), handed to the share sheet (AirDrop, Files, WhatsApp) or downloaded. **Restore** merges by id; the newer `updated_at` wins.
- **Works in airplane mode** after the first load, including OCR. This is tested automatically (see below).
- Optional **Better scanning** with Claude when online, falling back to on-device OCR.

---

## Put it on your phone (fastest: Vercel, about 2 minutes)

1. Go to <https://vercel.com/new> and import the `Ari191210/Ari191210` GitHub repo.
2. Set **Root Directory** to `expo-notebook`. The framework is auto-detected as Vite.
3. Pick the branch `claude/expo-notebook-pwa-gnmk5j` (or `main` after you merge), then click **Deploy**.
4. Open the `https://….vercel.app` URL on your phone **once while online**, then install it (see below).

**Netlify:** import the repo with base directory `expo-notebook`, build command `npm run build`, publish directory `expo-notebook/dist`.

**GitHub Pages:** merge to `main`. In repo **Settings → Pages → Source**, choose **GitHub Actions**. The workflow `.github/workflows/expo-notebook-pages.yml` builds with the right sub-path and deploys to `https://ari191210.github.io/Ari191210/`.

> HTTPS is required for the camera, the service worker and persistent storage. All three hosts give you HTTPS.

### Install on iPhone (important)
1. Open the URL in **Safari** (not Chrome, and not an in-app browser).
2. Tap **Share** (square with arrow), then **Add to Home Screen**, then **Add**.
3. From then on, open it from the Home Screen icon.

iOS can delete website data for sites that are *not* installed after about 7 days without use. Installing protects your data, so install before the expo.

### Install on Android
1. Open the URL in **Chrome**.
2. Tap **⋮**, then **Install app** (or accept the install prompt).

### Before the expo: pre-flight check (1 minute)
1. Open the installed app once while online and wait about 10 s. It downloads the app plus the ~7 MB OCR engine.
2. Turn on **airplane mode**, open the app, and scan any card. It should fill the fields.
3. Settings: check that persistent storage shows granted. If it doesn't, install the app first and try again.

### During the expo
- Back up every evening, or whenever the header turns amber (more than 10 changes not backed up). Go to **Settings → Export everything → Share / Save**, then send it to yourself on WhatsApp or save it to Files.

---

## Local development

```bash
cd expo-notebook
npm install          # also copies Tesseract assets into public/ocr (postinstall)
npm run dev          # http://localhost:5173
npm test             # Vitest: card parser, backup round-trip, Dexie migrations
npm run build        # type-check + production build to dist/
npm run preview      # serve the production build (service worker active)
npm run test:e2e     # build + airplane-mode end-to-end test in headless Chromium
```

To test on your phone over LAN, run `npm run dev -- --host`. The camera and service worker need HTTPS, though, so a deployed preview URL is easier.

The E2E test needs Playwright's Chromium. If it isn't at the default location, set `CHROMIUM_PATH=/path/to/chrome`.

### What the airplane-mode test does
`scripts/e2e-offline.mjs` loads the production build once online and checks that the service worker precached the shell and all OCR assets. It then **goes offline**, reloads, and adds a supplier by scanning a rendered business card. That checks all six OCR-filled fields. Next it edits the entry (priority, booth), filters, reloads offline to prove persistence, checks the Photos tab and exports a backup. It fails if **any request leaves the origin**.

---

## Project layout

```
src/
  config/expo.ts        ← categories, company keywords, nudge threshold. Edit this to reuse for another expo.
  db/schema.ts          Dexie schema + versioned migrations
  db/repo.ts            data access (save, delete, discard-empty, meta, backup counter)
  lib/cardParser.ts     business-card text → fields (pure, heavily tested)
  lib/ocr.ts            Tesseract worker (self-hosted assets, lazy, warmed on "New supplier")
  lib/claudeScan.ts     optional Claude extraction
  lib/photos.ts         on-device compression + thumbnails
  lib/backup.ts         zip export/import, CSV, Web Share
  screens/, components/, hooks/
scripts/copy-ocr-assets.mjs   copies worker/WASM/eng.traineddata into public/ocr
scripts/gen-icons.mjs         generates PWA icons (no image deps)
scripts/e2e-offline.mjs       airplane-mode test
```

---

## Decisions I made (and why)

| Decision | Why |
|---|---|
| App lives in `expo-notebook/`, not the repo root | The repo root is your GitHub profile README, so I left it untouched. |
| Hash routing (`#/supplier/<id>`) | Works on every static host with zero rewrite rules, including GitHub Pages sub-paths. |
| Timestamps stored as epoch ms | Cheap indexed range queries (the "changes since backup" count). CSV exports them as ISO dates. |
| Company is "required" but never blocks saving | Autosave means you never lose data. A missing company shows a red hint and "No company name" in the list. |
| Empty new entries are discarded on exit | Tapping + and backing out doesn't litter the list. Anything with a photo or any text is kept. |
| SW update = "prompt", not auto-reload | A new version never reloads the page while you're typing. You tap **Reload** when ready. |
| Export is two taps (build, then **Share / Save**) | iOS requires a fresh tap for `navigator.share()`, and building a big zip can outlast the first one. |
| `lastBackupAt` is set only after Share/Download succeeds | If you cancel the share sheet, it doesn't count as a backup. |
| Changes counted for the backup nudge = edited suppliers + edited notes + new photos | Photos are the heaviest thing to lose. |
| "Original photos" in the zip = the stored 1600 px JPEGs | Per spec we compress before storing, so no raw originals are kept. Thumbnails are also included so restore is instant with no re-decoding. |
| Photos are named `<Company>_<n>.jpg` (notes: `note_<Title>_<n>.jpg`) | Human-browsable zip. data.json maps each file back to its entry. |
| Import never deletes | If you deleted something locally and then import an older backup, it comes back. That's the safe direction for a "only copy" app. |
| EXIF orientation via `<img>` decode | Every current browser applies EXIF orientation on decode, so drawing to canvas is upright with no EXIF parser. |
| OCR: LSTM-only English "best_int" model, SIMD core + non-SIMD fallback | Smallest model tesseract.js ships (~3 MB). The relaxed-SIMD core is skipped (Chrome-only, marginal gain) to keep the precache at ~11 MB. |
| CSV cells starting with `= + - @` are prefixed with `'` | Prevents formula injection from scanned text when opened in Excel or Sheets. |
| Claude scanning uses the official SDK, lazy-loaded (~48 KB gz) | Loaded only if you enable it, and it never touches offline use. |

### Better scanning (Claude)
Settings → paste an Anthropic API key (`sk-ant-…`). With that on, card scans go to the Messages API (`claude-sonnet-4-5`, set in `src/config/expo.ts`) with a strict JSON schema. If you're offline or anything fails, it silently falls back to on-device OCR and tells you why. The key is stored only in IndexedDB on the device and is never logged. **Use a key with a low spend limit**, because anyone holding your unlocked phone could read it.

### Data model
`Supplier { id, company, person, role, phone, email, website, booth, category, priority: 'hot'|'maybe'|'no'|null, follow_up, price_notes, notes, created_at, updated_at }`
`Note { id, title, text, created_at, updated_at }`
`Photo { id, owner_type: 'supplier'|'note', owner_id, blob, thumb_blob, width, height, created_at }`

To add a schema change, append `this.version(3).stores({...}).upgrade(...)` in `src/db/schema.ts` and add a test like `tests/migrations.test.ts`. Never edit a past version.

### Reusing for another expo
Edit `src/config/expo.ts` (name, categories, company keywords) and redeploy.
