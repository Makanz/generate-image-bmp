# Agent Guidelines for generate-image-bmp

## Project Overview

This is a TypeScript application that generates a dashboard BMP/PNG image (800x480) with weather, calendar, and lunch data from n8n webhooks. The app runs an Express server with cron-based image generation and serves a Vite-based frontend.

## Project Structure

```
generate-image-bmp/
├── capture.ts          # Image generation (Playwright/Browserless → PNG → BMP)
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
├── output/             # Generated images (dashboard.png, dashboard.bmp, dashboard.previous.png)
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
npm install
```

### Development
```bash
npm run dev          # Start Vite dev server for dashboard-web
npm run start        # Start Express server (TypeScript via ts-node)
```

### Build
```bash
npm run build        # Compile TypeScript + build dashboard-web for production
npm run preview      # Preview production build
```

### Image Generation
```bash
npm run generate     # Run capture.ts to generate output/dashboard.png + output/dashboard.bmp
```

### Testing
```bash
npm test             # Run Jest test suite
```

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
    outputPng?: string;
    outputBmp?: string;
}

async function generateImage(options: GenerateImageOptions = {}): Promise<{ png: string; bmp: string }> {
    const { outputPng = path.join(OUTPUT_DIR, 'dashboard.png') } = options;
    
    try {
        await sharp(buffer).toFile(outputPng);
        return { png: outputPng, bmp: outputBmp };
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
- `sharp` - Image processing (PNG output, greyscale conversion)
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
- `output/dashboard.png` - Color PNG
- `output/dashboard.previous.png` - Previous PNG (for change detection)
- `output/dashboard.bmp` - 1-bit monochrome BMP for ESP32

Ensure the `output/` directory exists before generation (created automatically).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `REFRESH_INTERVAL_MINUTES` | Cron interval for image regeneration | `15` |
| `N8N_WEBHOOK_WEATHER` | n8n webhook for weather data | - |
| `N8N_WEBHOOK_CALENDAR` | n8n webhook for calendar data | - |
| `N8N_WEBHOOK_LUNCH` | n8n webhook for lunch data | - |
| `N8N_WEBHOOK_INDOOR` | n8n webhook for indoor temperature | - |
| `HOMEY_IP` | Homey device IP | - |
| `HOMEY_TOKEN` | Homey API token | - |
| `HOMEY_USERNAME` | Homey username | - |
| `HOMEY_PASSWORD` | Homey password | - |
| `BROWSERLESS_URL` | Browserless REST API URL (optional) | - |
| `BROWSERLESS_TOKEN` | Browserless auth token | - |
| `CAPTURE_URL` | Direct URL for screenshot capture | `http://localhost:5173/` |

## UI Language

The dashboard UI uses Swedish for labels:
- "Väder" (weather), "Temperatur" (temperature)
- "Kalender" (calendar), "Lunch" (lunch)
- "Utomhus" (outdoor), "Inomhus" (indoor)
