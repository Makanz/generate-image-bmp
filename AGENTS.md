# Agent Guidelines for generate-image-bmp

## Project Overview

This is a TypeScript application that generates a dashboard 1-bit BMP image (800x480) with weather, calendar, lunch, and indoor data for an **ESP32 e-paper display**. The app runs an Express server with cron-based image generation, serves a Vite-built frontend, and exposes an HTTP API plus Swagger documentation.

## Architecture

The data flow for the dashboard image is:

```
n8n webhooks (calendar/lunch)          Open-Meteo API (weather)         Homey API (indoor fallback)
        │                                        │                                 │
        ▼                                        ▼                                 ▼
server.ts (Express) ──► src/services/data.ts  (in-memory cache + disk cache.json)
        │
        ├── GET /                     ──► dashboard-web/dist/ (built static frontend)
        ├── GET /api/data             ──► aggregated JSON
        ├── GET /api/changes          ──► change regions for partial e-paper refresh
        ├── GET /api/image-region     ──► extract a BMP region
        ├── POST /api/refresh         ──► force immediate image regeneration
        ├── POST /api/refresh-interval ──► update cron interval
        └── /api-docs                 ──► Swagger UI
                │
                ▼
          capture.ts
          └── src/services/screenshot.ts
                ├── PlaywrightProvider  (default: local Chromium)
                └── BrowserlessProvider (if BROWSERLESS_URL is set)
                          │
                          ▼
                 sharp pipeline → output/dashboard-YYYY-MM-DDTHH-MM-SS-msZ.bmp
                          │
                          ▼
                 src/utils/output-manifest.ts (dashboard-manifest.json)
                          │
                          ▼
                 /dashboard.bmp  /dashboard.previous.bmp  (aliases via manifest)
```

`capture.ts` is both a standalone CLI (`pnpm run generate`) and an importable module. The server calls `generateImage()` on startup and on a cron schedule.

**Change detection**: Each generated BMP is tracked as a snapshot in `output/dashboard-manifest.json` with `current` and `previous` entries plus SHA256 checksums. `src/services/change-detection.ts` compares the two snapshots, flood-fills changed pixels into rectangles, and merges nearby rectangles (`MERGE_DISTANCE = 10px`). Exposed at `GET /api/changes`.

## Project Structure

```
generate-image-bmp/
├── capture.ts                    # Image generation entry point
├── server.ts                     # Express server, API endpoints, cron scheduler
├── src/
│   ├── image/
│   │   └── bmp-writer.ts         # 1-bit BMP writer and in-memory BMP buffer helper
│   └── services/
│       ├── data.ts               # Data fetching and caching (weather, calendar, lunch, indoor)
│       ├── homey.ts              # Optional Homey direct API integration
│       ├── screenshot.ts         # Playwright / Browserless screenshot providers
│       ├── image-processing.ts   # Greyscale/threshold pipeline and BMP region extraction
│       └── change-detection.ts   # Detect changed regions between two BMP snapshots
│   └── utils/
│       ├── constants.ts          # Width, height, timeouts, thresholds, etc.
│       ├── errors.ts             # Error formatting helpers
│       ├── output-manifest.ts    # Snapshot manifest handling
│       └── path.ts               # Project root resolution helper
├── dashboard-web/                # Frontend source (Vite)
│   ├── index.html                # Dashboard HTML (Swedish UI, classic design)
│   ├── script.ts                 # Frontend TypeScript / logic
│   ├── style.css                 # Dashboard styles
│   └── summer/                   # Alternative dashboard design
│       ├── index.html
│       └── style.css
├── tests/                        # Jest test suite
│   ├── bmp-writer.test.js
│   ├── capture.test.js
│   ├── change-detection.test.js
│   ├── data.test.js
│   ├── homey.test.js
│   ├── output-manifest.test.js
│   └── server.test.js
├── design/                       # Design assets
├── output/                       # Generated images and cache.json
├── dist/                         # Compiled TypeScript output
├── package.json
├── tsconfig.json
├── jest.config.js
├── vite.config.js
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── AGENTS.md
```

## Commands

### Installation
```bash
pnpm install
```

### Development
```bash
pnpm run dev         # Start Vite dev server for dashboard-web
pnpm start           # Start Express server (TypeScript via ts-node)
```

### Build
```bash
pnpm run build       # Compile TypeScript + build dashboard-web for production
pnpm run preview     # Preview production build
```

### Image Generation
```bash
pnpm run generate    # Run capture.ts to generate the current dashboard BMP snapshot
```

### Testing
```bash
pnpm test            # Run Jest test suite
```

## Key Conventions

**Module system**: TypeScript source uses ES module syntax (`import`/`export`), compiled to CommonJS. The `"type": "commonjs"` field is set in `package.json`.

**Swedish language**: All UI labels, server log messages, and HTML are in Swedish (e.g. "Väder", "Kalender", `lang="sv"` in HTML).

**Page-ready signal**: `capture.ts` waits for `document.body.dataset.loaded === 'true'` before taking a screenshot. `dashboard-web/script.ts` sets this flag (`markDataLoaded()`) after data is rendered. The frontend falls back to mock data if `/api/data` fails, so the flag is always set.

**Data caching** (`src/services/data.ts`): Each source (weather, calendar, lunch, indoor) has its own TTL. On fetch failure, the cache timestamp is set to `now - CACHE_TTL + ERROR_RETRY_MS` so retries happen after `ERROR_RETRY_MS` rather than waiting for the full TTL. The cache is persisted to `output/cache.json` and restored on server startup.

**Weather source**: Fetched directly from Open-Meteo (`api.open-meteo.com`) using `OPEN_METEO_LAT` and `OPEN_METEO_LON`. A webhook fallback is no longer used.

**Indoor temperature**: Fetched from the Homey direct API (`HOMEY_IP` + `HOMEY_TOKEN`, or `HOMEY_USERNAME`/`HOMEY_PASSWORD`) or falls back to the `N8N_WEBHOOK_INDOOR` webhook.

**Weather retry on startup**: `server.ts` retries weather up to 3 times (3s apart) before generating the initial image, to avoid blank weather data on a cold start.

**Output files**: Snapshot BMPs are written to `output/dashboard-YYYY-MM-DDTHH-MM-SS-msZ.bmp`. A manifest (`output/dashboard-manifest.json`) tracks `current` and `previous`. The endpoints `/dashboard.bmp` and `/dashboard.previous.bmp` serve those aliases. The `output/` directory is created automatically.

**BMP format**: 1-bit monochrome (BITMAPINFOHEADER, top-down with negative height, 2-color table: black `0x000000` / white `0xFFFFFF`, row padded to 4-byte boundary).

## Code Style Guidelines

### TypeScript (Backend - capture.ts, server.ts, src/)

- **Module System**: ES modules with `import`/`export` (compiled to CommonJS)
- **Indentation**: 4 spaces
- **Semicolons**: Required
- **Type Annotations**: Explicit types for function parameters and return types
- **Error Handling**: Use `try/catch` with `err: unknown` and type narrowing
- **Async/Await**: Prefer async/await over raw Promises
- **Constants**: UPPER_SNAKE_CASE for module-level constants (e.g., `WIDTH`, `HEIGHT`)

```typescript
// Good
import sharp from 'sharp';
import path from 'path';

const WIDTH = 800;
const HEIGHT = 480;

interface GenerateImageOptions {
    outputBmp?: string;
}

async function generateImage(options: GenerateImageOptions = {}): Promise<{ bmp: string }> {
    const { outputBmp = path.join(OUTPUT_DIR, 'dashboard.bmp') } = options;

    try {
        const result = await sharp(buffer)
            .greyscale()
            .threshold(128)
            .raw()
            .toBuffer({ resolveWithObject: true });

        await writeBmp(result.info.width, result.info.height, result.data, outputBmp);
        return { bmp: outputBmp };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to generate image:', message);
        throw err;
    }
}

export { generateImage };
```

### TypeScript (Frontend - dashboard-web/)

- **Module System**: TypeScript module, bundled by Vite
- **Indentation**: 4 spaces
- **Semicolons**: Required
- **Functions**: Named function declarations for top-level functions
- **Error Handling**: try/catch with minimal catch blocks for expected failures
- **No external font dependency**: The classic design currently references Google Fonts. Prefer self-hosted fonts or a clean system stack to avoid offline/rendering issues.

```typescript
// Good
function updateGauge(elementId: string, value: number, max: number, unit: string): void {
    const gauge = document.getElementById(elementId);
    if (gauge) {
        gauge.querySelector('.gauge-value')!.textContent = value.toFixed(1) + unit;
    }
}

async function fetchSystemData(): Promise<SystemData | null> {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}
```

### CSS (style.css)

- **Indentation**: 4 spaces
- **Naming**: kebab-case for class names
- **Properties**: Alphabetical order within selectors (preferred)

```css
/* Good */
.dashboard {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
}

.gauge-fill {
    background: #000;
    height: 100%;
}
```

### HTML (index.html)

- **Lang attribute**: Use `lang="sv"` for Swedish
- **Semantic elements**: Use `<header>`, `<main>`, `<section>`, etc.
- **Indentation**: 4 spaces

### File Naming

- TypeScript files: `kebab-case.ts` or `camelCase.ts` (e.g., `capture.ts`, `bmp-writer.ts`)
- JavaScript files: `camelCase.js` (e.g., `vite.config.js`, test files)
- CSS files: `kebab-case.css` (e.g., `style.css`)
- HTML files: `kebab-case.html` (e.g., `index.html`)

### Tests

- **Framework**: Jest with ts-jest
- **Location**: `tests/` directory
- **Naming**: `*.test.js` or `*.test.ts`
- **Environment**: Node

## Dependencies

### Production
- `sharp` - Image processing (greyscale conversion, thresholding, resizing)
- `playwright` - Browser automation (local Chromium screenshots)
- `axios` - HTTP client (webhook requests, Homey API, Browserless API)
- `express` - Web server
- `dotenv` - Environment variable management
- `node-cron` - Scheduled tasks
- `swagger-jsdoc` - OpenAPI spec generation
- `swagger-ui-express` - Swagger UI middleware

### Development
- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution
- `vite` - Frontend build tool
- `jest`, `ts-jest`, `supertest` - Testing

## Output

Generated artifacts are saved to `output/`:
- `output/dashboard-YYYY-MM-DDTHH-MM-SS-msZ.bmp` - 1-bit monochrome BMP snapshot
- `output/dashboard-manifest.json` - Snapshot manifest with `current` and `previous` entries and checksums
- `output/cache.json` - Persisted data cache

Ensure the `output/` directory exists before generation (created automatically).

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `REFRESH_INTERVAL_MINUTES` | Cron interval for image regeneration | `15` |
| `DASHBOARD_DESIGN` | Which dashboard design to serve: `classic` (default) or `summer` | `classic` |
| `QUIET_HOURS_START` | Quiet hours start (0-23), skip scheduled generation | - |
| `QUIET_HOURS_END` | Quiet hours end (0-23) | - |
| `WEATHER_REFRESH_MINUTES` | Weather cache TTL | `15` |
| `CALENDAR_REFRESH_MINUTES` | Calendar cache TTL | `15` |
| `LUNCH_REFRESH_HOURS` | Lunch cache TTL | `24` |
| `INDOOR_REFRESH_MINUTES` | Indoor cache TTL | `15` |
| `ERROR_RETRY_MINUTES` | Retry delay after a failed data source | `2` |
| `OPEN_METEO_LAT` | Latitude for Open-Meteo weather | - |
| `OPEN_METEO_LON` | Longitude for Open-Meteo weather | - |
| `N8N_WEBHOOK_CALENDAR` | n8n webhook returning `{ events: [{date, summary}] }` | - |
| `N8N_WEBHOOK_LUNCH` | n8n webhook returning school lunch array | - |
| `N8N_WEBHOOK_INDOOR` | n8n webhook for indoor temperature (fallback) | - |
| `HOMEY_IP` | Homey device IP | - |
| `HOMEY_TOKEN` | Homey API token | - |
| `HOMEY_USERNAME` | Homey username (local login) | - |
| `HOMEY_PASSWORD` | Homey password (local login) | - |
| `BROWSERLESS_URL` | Browserless REST API URL (optional) | - |
| `BROWSERLESS_TOKEN` | Browserless auth token | - |
| `CAPTURE_URL` | Direct URL for screenshot capture | `http://localhost:5173/` |

## Docker

```bash
cp .env.example .env   # fill in coordinates and webhook URLs
docker-compose up -d   # builds and starts the container
```

The ESP32 fetches the image via `http://<server-ip>:3001/dashboard.bmp`.

## UI Language

The dashboard UI uses Swedish for labels:
- "Väder" (weather), "Temperatur" (temperature)
- "Kalender" (calendar), "Lunch" (lunch)
- "Utomhus" (outdoor), "Inomhus" (indoor)
