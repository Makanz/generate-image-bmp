# Agent Guidelines for generate-image-bmp

## Project Overview

This is a TypeScript application that generates a dashboard 1-bit BMP image (800x480) with weather, calendar, and lunch data from n8n webhooks. The app runs an Express server with cron-based image generation and serves a Vite-based frontend.

## Architecture

The app generates an 800×480 dashboard image for an **ESP32 e-paper display**. The full data flow:

```
n8n webhooks (weather/calendar/lunch/indoor)
        │
        ▼
server.ts (Express) ──► src/services/data.ts  (in-memory cache, per-source TTLs)
        │                       └── src/services/homey.ts  (optional Homey direct API)
        │
        ├── GET /          ──► dashboard-web/ (static HTML/JS/CSS)
        ├── GET /api/data  ──► aggregated JSON
        └── POST /api/refresh
                │
                ▼
          capture.ts
          ├── screenshotWithPlaywright()   (default: local Chromium)
          └── screenshotWithBrowserless() (if BROWSERLESS_URL is set)
                │
                ▼
           sharp pipeline → output/dashboard.bmp   (1-bit monochrome, for ESP32)
```

`capture.ts` is both a standalone CLI (`pnpm run generate`) and an importable module.

**Change detection**: `capture.ts` saves `dashboard.previous.bmp` before each capture. `getChanges()` flood-fills pixel diffs to find changed regions, then merges nearby rectangles (`MERGE_DISTANCE = 10px`). Exposed at `GET /api/changes`.

## Project Structure

```
generate-image-bmp/
├── capture.ts          # Image generation (Playwright/Browserless → BMP)
├── server.ts           # Express server with API endpoints and cron scheduler
├── src/
│   ├── image/
│   │   └── bmp-writer.ts    # 1-bit BMP file writer
│   └── services/
│       ├── data.ts          # Data fetching and caching (weather, calendar, lunch, indoor)
│       └── homey.ts         # Homey integration
├── dashboard-web/      # Frontend assets
│   ├── index.html      # Dashboard HTML (Swedish UI)
│   ├── script.js       # Frontend JavaScript
│   └── style.css       # Dashboard styles
├── tests/              # Jest test suite
│   ├── bmp-writer.test.js
│   ├── capture.test.js
│   ├── data.test.js
│   ├── homey.test.js
│   └── server.test.js
├── design/             # Design assets
├── output/             # Generated images (dashboard.bmp, dashboard.previous.bmp)
├── dist/               # Compiled TypeScript output
├── package.json
├── tsconfig.json
├── jest.config.js
├── Dockerfile
├── docker-compose.yml
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
pnpm run generate    # Run capture.ts to generate output/dashboard.bmp
```

### Testing
```bash
pnpm test            # Run Jest test suite
```

## Key Conventions

**Module system**: TypeScript source uses ES module syntax (`import`/`export`), compiled to CommonJS. The `"type": "commonjs"` field is set in `package.json`.

**Swedish language**: All UI labels, server log messages, and HTML are in Swedish (e.g. "Temperatur", "Väder", `lang="sv"` in HTML).

**Page-ready signal**: `capture.ts` waits for `document.body.dataset.loaded === 'true'` before taking a screenshot. `script.js` sets this flag (`markDataLoaded()`) after data is rendered. The frontend falls back to mock data if `/api/data` fails, so the flag is always set.

**Data caching** (`src/services/data.ts`): Each source (weather, calendar, lunch, indoor) has its own TTL. On fetch failure, the cache timestamp is set to `now - CACHE_TTL + ERROR_RETRY_MS` so retries happen after `ERROR_RETRY_MS` rather than waiting for the full TTL.

**Indoor temperature**: Fetched from Homey direct API (`HOMEY_IP` + `HOMEY_TOKEN`) or falls back to the `N8N_WEBHOOK_INDOOR` webhook.

**Weather retry on startup**: `server.ts` retries weather up to 3 times (3s apart) before generating the initial image, to avoid blank weather data on a cold start.

**Output files**: `dashboard.bmp` is written to the `output/` directory. The `output/` directory is created automatically.

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

### JavaScript (Frontend - dashboard-web/)

- **Module System**: Vanilla JS, no modules (script tag in HTML)
- **Indentation**: 4 spaces
- **Semicolons**: Required
- **Functions**: Named function declarations for top-level functions
- **Error Handling**: try/catch with empty catch blocks for expected failures

```javascript
// Good
function updateGauge(elementId, value, max, unit) {
    const gauge = document.getElementById(elementId);
    if (gauge) {
        gauge.querySelector('.gauge-value').textContent = value.toFixed(1) + unit;
    }
}

async function fetchSystemData() {
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
- JavaScript files: `camelCase.js` (e.g., `script.js`)
- CSS files: `kebab-case.css` (e.g., `style.css`)
- HTML files: `kebab-case.html` (e.g., `index.html`)

### Tests

- **Framework**: Jest with ts-jest
- **Location**: `tests/` directory
- **Naming**: `*.test.js` or `*.test.ts`
- **Environment**: Node

## Dependencies

### Production
- `sharp` - Image processing (greyscale conversion, thresholding)
- `playwright` - Browser automation (screenshot capture)
- `axios` - HTTP client (webhook requests)
- `express` - Web server
- `dotenv` - Environment variable management
- `node-cron` - Scheduled tasks
- `jsdom` - DOM simulation

### Development
- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution
- `vite` - Frontend build tool
- `jest`, `ts-jest`, `supertest` - Testing

## Output

Generated images are saved to `output/`:
- `output/dashboard.bmp` - 1-bit monochrome BMP for e-paper display
- `output/dashboard.previous.bmp` - Previous BMP (for change detection)

Ensure the `output/` directory exists before generation (created automatically).

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `REFRESH_INTERVAL_MINUTES` | Cron interval for image regeneration | `15` |
| `N8N_WEBHOOK_WEATHER` | n8n webhook returning Open-Meteo-style JSON | - |
| `N8N_WEBHOOK_CALENDAR` | n8n webhook returning `{ events: [{date, summary}] }` | - |
| `N8N_WEBHOOK_LUNCH` | n8n webhook returning school lunch array | - |
| `N8N_WEBHOOK_INDOOR` | n8n webhook for indoor temperature (fallback) | - |
| `HOMEY_IP` | Homey device IP | - |
| `HOMEY_TOKEN` | Homey API token | - |
| `HOMEY_USERNAME` | Homey username | - |
| `HOMEY_PASSWORD` | Homey password | - |
| `BROWSERLESS_URL` | Browserless REST API URL (optional) | - |
| `BROWSERLESS_TOKEN` | Browserless auth token | - |
| `CAPTURE_URL` | Direct URL for screenshot capture | `http://localhost:5173/` |

## Docker

```bash
cp .env.example .env   # fill in webhook URLs
docker-compose up -d   # builds and starts the container
```

The ESP32 fetches the image via `http://<server-ip>:3001/dashboard.bmp`.

## UI Language

The dashboard UI uses Swedish for labels:
- "Väder" (weather), "Temperatur" (temperature)
- "Kalender" (calendar), "Lunch" (lunch)
- "Utomhus" (outdoor), "Inomhus" (indoor)
