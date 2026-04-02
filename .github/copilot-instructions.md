# Copilot Instructions

## Commands

```bash
npm install               # Install dependencies
npm start                 # Start Express server (port 3000 by default)
npm run dev               # Vite dev server for dashboard-web (hot reload)
npm run generate          # Run capture.js once to regenerate output images (requires server running)
npm run build             # Production build of dashboard-web
npm run preview           # Preview production build
```

> No test suite exists yet. `npm test` exits with an error.

## Architecture

The app generates an 800×480 dashboard image for an **ESP32 e-paper display**. The full data flow:

```
n8n webhooks (weather/calendar/lunch/indoor)
        │
        ▼
server.js (Express) ──► src/services/data.js  (in-memory cache, per-source TTLs)
        │                       └── src/services/homey.js  (optional Homey direct API)
        │
        ├── GET /          ──► dashboard-web/ (static HTML/JS/CSS)
        ├── GET /api/data  ──► aggregated JSON
        └── POST /api/refresh
                │
                ▼
          capture.js
          ├── screenshotWithPlaywright()   (default: local Chromium)
          └── screenshotWithBrowserless() (if BROWSERLESS_URL is set)
                │
                ▼
           sharp pipeline → output/dashboard.png  (color PNG)
                         → output/dashboard.bmp   (1-bit monochrome, for ESP32)
```

`capture.js` is both a standalone CLI (`npm run generate`) and a module (`require('./capture')`).

**Change detection**: `capture.js` saves `dashboard.previous.png` before each capture. `getChanges()` flood-fills pixel diffs to find changed regions, then merges nearby rectangles (`MERGE_DISTANCE = 10px`). Exposed at `GET /api/changes`.

## Key Conventions

**Module system**: All Node.js files use CommonJS (`require` / `module.exports`). The `"type": "commonjs"` field is set in `package.json`.

**Swedish language**: All UI labels, server log messages, and HTML are in Swedish (e.g. "Temperatur", "Väder", `lang="sv"` in HTML).

**Page-ready signal**: `capture.js` waits for `document.body.dataset.loaded === 'true'` before taking a screenshot. `script.js` sets this flag (`markDataLoaded()`) after data is rendered. The frontend falls back to mock data if `/api/data` fails, so the flag is always set.

**Data caching** (`src/services/data.js`): Each source (weather, calendar, lunch, indoor) has its own TTL. On fetch failure, the cache timestamp is set to `now - CACHE_TTL + ERROR_RETRY_MS` so retries happen after `ERROR_RETRY_MS` rather than waiting for the full TTL.

**Indoor temperature**: Fetched from Homey direct API (`HOMEY_IP` + `HOMEY_TOKEN`) or falls back to the `N8N_WEBHOOK_INDOOR` webhook.

**Weather retry on startup**: `server.js` retries weather up to 3 times (3s apart) before generating the initial image, to avoid blank weather data on a cold start.

**Output files**: Both `dashboard.png` and `dashboard.bmp` are always written together in `generateImage()`. The `output/` directory is created automatically.

**BMP format**: 1-bit monochrome (BITMAPINFOHEADER, top-down with negative height, 2-color table: black `0x000000` / white `0xFFFFFF`, row padded to 4-byte boundary).

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Description |
|---|---|
| `PORT` | Express server port (default `3000`) |
| `REFRESH_INTERVAL_MINUTES` | Cron interval for image regeneration (default `15`) |
| `N8N_WEBHOOK_WEATHER` | n8n webhook URL returning Open-Meteo-style JSON |
| `N8N_WEBHOOK_CALENDAR` | n8n webhook URL returning `{ events: [{date, summary}] }` |
| `N8N_WEBHOOK_LUNCH` | n8n webhook URL returning school lunch array |
| `N8N_WEBHOOK_INDOOR` | n8n webhook URL for indoor temps (fallback) |
| `HOMEY_IP` / `HOMEY_TOKEN` | Direct Homey Pro 2023+ API credentials |
| `BROWSERLESS_URL` | If set, uses Browserless REST API instead of local Playwright |
| `CAPTURE_URL` | Override the URL captured by Playwright (default: `http://localhost:{PORT}/`) |

## Docker

```bash
cp .env.example .env   # fill in webhook URLs
docker-compose up -d   # builds and starts the container
```

The ESP32 fetches the image via `http://<server-ip>:3000/dashboard.bmp`.
