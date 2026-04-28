# Dashboard BMP Generator

A TypeScript application that generates a **1-bit monochrome BMP dashboard image** (800×480) for an **ESP32 e-paper display**. It aggregates weather, calendar, school lunch, and indoor temperature data from various sources and renders them into a clean, low-power bitmap.

![Dashboard Preview](docs/dashboard-preview.png)

## Features

- 🌤 **Weather** — Outdoor temperature, 3-day forecast, wind, humidity from [Open-Meteo](https://open-meteo.com/)
- 🏠 **Indoor temperature** — Per-room readings via Homey API or n8n webhook
- 📅 **Calendar** — Today's and tomorrow's events from n8n webhook
- 🍽 **School lunch** — Weekly lunch menu from n8n webhook
- 🖨 **1-bit BMP output** — Optimized for ESP32 e-paper displays (800×480)
- 🔄 **Automatic refresh** — Configurable cron-based image regeneration
- 🌙 **Quiet hours** — Skip generation during configurable hours (e.g., nighttime)
- 📡 **Change detection** — Flood-fill algorithm that identifies changed pixel regions between captures
- 🐳 **Docker support** — Full Docker / docker-compose deployment

## Architecture

```
n8n webhooks (weather/calendar/lunch/indoor)
        │
        ▼
server.ts (Express) ──► src/services/data.ts  (in-memory cache, per-source TTLs)
        │                       └── src/services/homey.ts  (optional Homey API)
        │
        ├── GET /              ──► dashboard-web/ (static Vite frontend)
        ├── GET /api/data      ──► aggregated JSON
        ├── GET /api/changes   ──► pixel diff regions
        ├── GET /dashboard.bmp ──► latest BMP image
        └── POST /api/refresh  ──► triggers regeneration
                │
                ▼
          capture.ts
          ├── Playwright (local Chromium, default)
          └── Browserless SaaS   (if BROWSERLESS_URL is set)
                │
                ▼
          sharp pipeline → output/dashboard.bmp  (1-bit monochrome)
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (recommended) or npm

### Setup

```bash
# Clone the repository
git clone git@github.com:Makanz/generate-image-bmp.git
cd generate-image-bmp

# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys and endpoints
```

### Running

```bash
# Start the dashboard dev server (for previewing in browser)
pnpm run dev

# Or build and start the production server
pnpm run build
pnpm start
```

### Generate an image

```bash
pnpm run generate
```

The generated BMP will be written to `output/dashboard.bmp`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Express server port |
| `TZ` | No | `Europe/Stockholm` | Timezone |
| `OPEN_METEO_LAT` | Yes* | — | Latitude for weather data |
| `OPEN_METEO_LON` | Yes* | — | Longitude for weather data |
| `N8N_WEBHOOK_CALENDAR` | No | — | n8n webhook URL for calendar events |
| `N8N_WEBHOOK_LUNCH` | No | — | n8n webhook URL for lunch menu |
| `N8N_WEBHOOK_INDOOR` | No | — | n8n webhook URL for indoor temps |
| `HOMEY_IP` | No | — | Homey hub IP (alternative to n8n for indoor) |
| `HOMEY_TOKEN` | No | — | Homey long-lived API token |
| `REFRESH_INTERVAL_MINUTES` | No | `15` | Cron interval for auto-regeneration |
| `BROWSERLESS_URL` | No | — | Browserless REST API URL (falls back to Playwright) |
| `BROWSERLESS_TOKEN` | No | — | Basic auth token for Browserless |
| `CAPTURE_URL` | No | `http://localhost:{PORT}` | URL to capture for the BMP screenshot |
| `QUIET_HOURS_START` | No | — | Quiet hours start (hour, e.g. `23`) |
| `QUIET_HOURS_END` | No | — | Quiet hours end (hour, e.g. `6`) |
| `WEATHER_REFRESH_MINUTES` | No | `15` | Weather cache TTL |
| `CALENDAR_REFRESH_MINUTES` | No | `15` | Calendar cache TTL |
| `LUNCH_REFRESH_HOURS` | No | `24` | Lunch cache TTL |
| `INDOOR_REFRESH_MINUTES` | No | `15` | Indoor temp cache TTL |
| `ERROR_RETRY_MINUTES` | No | `2` | Retry delay after a fetch failure |

*\* Required for weather data — other sources are optional.*

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Frontend dashboard preview |
| `GET` | `/api/data` | Aggregated JSON (weather, calendar, lunch, indoor) |
| `GET` | `/api/changes` | Changed pixel regions since last capture |
| `GET` | `/api/image-region?x=&y=&w=&h=` | Extract a BMP sub-region |
| `GET` | `/dashboard.bmp` | Latest generated BMP image |
| `GET` | `/dashboard.previous.bmp` | Previous BMP image |
| `POST` | `/api/refresh` | Force immediate image regeneration |
| `POST` | `/api/refresh-interval` | Update cron interval dynamically |
| `GET` | `/api-docs` | Swagger UI documentation |

## Docker Deployment

```bash
# Build and run
docker compose up -d

# Or build manually
docker build -t dashboard-bmp .
docker run -d \
  --name dashboard \
  -p 3001:3000 \
  -e TZ=Europe/Stockholm \
  -e OPEN_METEO_LAT=... \
  -e OPEN_METEO_LON=... \
  dashboard-bmp
```

The included `docker-compose.yml` provides a production-ready setup with:
- Automatic restart (`restart: unless-stopped`)
- Timezone set to `Europe/Stockholm`
- Persistent output volume for generated BMPs
- Browserless integration for screenshot capture

> **Note:** The Dockerfile installs Chromium for Playwright-based screenshot
> capture. If you use a remote Browserless instance instead, you can skip
> Playwright by setting `BROWSERLESS_URL` and `BROWSERLESS_TOKEN`.

## Output Manifest

Generated images are tracked via `output/dashboard-manifest.json`:

```json
{
  "current": {
    "file": "dashboard-2026-04-28T08-47-49-321Z.bmp",
    "generatedAt": "2026-04-28T08:47:49.321Z",
    "checksum": "sha256:abc123..."
  },
  "previous": {
    "file": "dashboard-2026-04-28T08-42-49-100Z.bmp",
    "generatedAt": "2026-04-28T08:42:49.100Z",
    "checksum": "sha256:def456..."
  }
}
```

## Change Detection

The app can detect which pixel regions changed between captures using a
flood-fill algorithm, exposed via `GET /api/changes`. Nearby regions are
merged (within 10px by default) into bounding rectangles for efficient
partial refreshes on e-paper displays.

## Testing

```bash
pnpm test
```

The test suite covers:
- BMP file writing and parsing
- Screenshot capture and manifest management
- Change detection (flood-fill, region merging)
- Data fetching, caching, and serialization
- Homey API integration
- Server API endpoints (via supertest)

## Project Structure

```
generate-image-bmp/
├── capture.ts                  # Image generation entry point
├── server.ts                   # Express API server + cron
├── src/
│   ├── image/
│   │   └── bmp-writer.ts       # 1-bit BMP file encoder
│   ├── services/
│   │   ├── data.ts             # Data fetching and caching
│   │   ├── homey.ts            # Homey integration
│   │   ├── screenshot.ts       # Playwright / Browserless provider
│   │   ├── change-detection.ts # Flood-fill pixel diff
│   │   └── image-processing.ts # Greyscale, threshold, region extraction
│   └── utils/
│       ├── constants.ts         # Shared configuration constants
│       ├── errors.ts           # Error handling utilities
│       ├── output-manifest.ts  # Manifest read/write helpers
│       └── path.ts             # Path resolution
├── dashboard-web/              # Vite-based frontend
│   ├── index.html
│   ├── script.ts
│   └── style.css
├── tests/                      # Jest test suite
├── output/                     # Generated BMP images
├── design/                     # Design assets
├── Dockerfile
├── docker-compose.yml
└── vite.config.js
```

## Tech Stack

- **Runtime:** Node.js, TypeScript
- **Server:** Express 5
- **Frontend:** Vanilla JS/TS, Vite, CSS
- **Image Processing:** sharp
- **Screenshot:** Playwright (local) or Browserless (remote)
- **Data:** Open-Meteo API, Homey API, n8n webhooks
- **Caching:** In-memory with JSON file persistence
- **Testing:** Jest, supertest
- **Deployment:** Docker

## License

ISC
