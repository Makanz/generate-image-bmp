# GenerateImageBmp

Dashboard app that generates BMP images (800x480) with weather, calendar, and lunch data from n8n webhooks.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  n8n (https://n8nflow.duckdns.org)                              │
│  ├── Webhook: /webhook/<weather-id>  →  SMHI weather data       │
│  ├── Webhook: /webhook/<calendar-id> →  Google Calendar        │
│  ├── Webhook: /webhook/6e6ed191-...  →  School lunch (foodit)  │
│  └── Webhook: /webhook/<indoor-id>   →  Indoor temperature      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard App (TypeScript/Express, Docker)                     │
│  ├── GET /              → Dashboard HTML                         │
│  ├── GET /api/data     → Aggregated data from n8n              │
│  ├── POST /api/refresh → Generate image manually               │
│  ├── GET /api/changes  → Pixel changes between images          │
│  ├── GET /dashboard.bmp → Latest BMP (1-bit monochrome)        │
│  ├── GET /dashboard.previous.bmp → Previous BMP                │
│  └── GET /output/:filename → Files from output directory       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  ESP32 with e-paper display                                     │
│  Fetches /dashboard.bmp from the server                        │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
REFRESH_INTERVAL_MINUTES=15

N8N_WEBHOOK_WEATHER=https://n8nflow.duckdns.org/webhook/<weather-id>
N8N_WEBHOOK_CALENDAR=https://n8nflow.duckdns.org/webhook/<calendar-id>
N8N_WEBHOOK_LUNCH=https://n8nflow.duckdns.org/webhook/6e6ed191-a7c2-44ba-8193-1460fffd9ccb
N8N_WEBHOOK_INDOOR=https://n8nflow.duckdns.org/webhook/<indoor-id>

HOMEY_IP=192.168.x.x
HOMEY_TOKEN=
HOMEY_USERNAME=
HOMEY_PASSWORD=

BROWSERLESS_TOKEN=
```

### n8n Webhooks

#### Lunch (done)
Use existing webhook: `/webhook/6e6ed191-a7c2-44ba-8193-1460fffd9ccb`

#### Weather (SMHI)
Create an n8n workflow with:
1. **HTTP Request** → Fetch from SMHI API (example: `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/18.0686/lat/59.3293/data.json`)
2. **Webhook** → Expose as `GET` endpoint
3. **Transform** the response to the format:
   ```json
   {
     "temperature": 18.5,
     "description": "Partly cloudy",
     "location": "Stockholm",
     "precipitation": 20
   }
   ```

#### Calendar (Google Calendar)
Create an n8n workflow with:
1. **Google Calendar Trigger** → Fetch events for today + 7 days
2. **Webhook** → Expose as `GET` endpoint
3. **Transform** the response to the format:
   ```json
   {
     "events": [
       { "date": "2024-01-15", "summary": "Meeting" },
       { "date": "2024-01-16", "summary": "Groceries" }
     ]
   }
   ```

## Local Development

```bash
pnpm run dev         # Start Vite dev server for dashboard-web
```

```bash
pnpm start           # Start Express server (TypeScript)
```

```bash
pnpm run generate    # Generate image manually (standalone, no server required)
```

```bash
pnpm run build       # Build TypeScript + production frontend
pnpm run preview     # Preview production build
```

```bash
pnpm test            # Run tests with Jest
```

After `pnpm run build`, the server serves the built frontend bundle from `dashboard-web/dist`. If that build output is missing, it falls back to serving the source files from `dashboard-web` for local development.

## Docker

### Build and Start

```bash
cp .env.example .env
# Edit .env with your webhook URLs

docker-compose up -d
```

### Image Generation

Images are saved to `output/`:
- `output/dashboard-<timestamp>.bmp` - Versioned 1-bit monochrome BMP snapshots
- `output/dashboard-manifest.json` - Atomic current/previous snapshot pointers used by the server routes

The public aliases stay the same:
- `/dashboard.bmp` serves the current snapshot
- `/dashboard.previous.bmp` serves the previous snapshot

### ESP32 Integration

ESP32 can fetch the image via:
```
http://<server-ip>:3000/dashboard.bmp
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard HTML |
| `/api/data` | GET | Aggregated data from n8n |
| `/api/refresh` | POST | Generate image manually |
| `/api/changes` | GET | Pixel changes between current and previous image (includes `refreshInterval` in seconds) |
| `/api/refresh-interval` | POST | Update the refresh interval for polling |
| `/dashboard.bmp` | GET | Latest BMP image via the current manifest alias |
| `/dashboard.previous.bmp` | GET | Previous BMP image via the previous manifest alias |
| `/output/:filename` | GET | Alias access to `dashboard.bmp` or `dashboard.previous.bmp` |

### Refresh Interval

**Server-side default**: 15 minutes (can be changed via `REFRESH_INTERVAL_MINUTES` in `.env`)

**Dynamic polling**: The display fetches `/api/changes` to get the current `refreshInterval` (in seconds), allowing runtime configuration.

**Update refresh interval**:
```bash
curl -X POST http://localhost:3000/api/refresh-interval \
  -H "Content-Type: application/json" \
  -d '{"refreshInterval": 60}'
```

**Request body**:
```json
{
  "refreshInterval": 60
}
```

**Constraints**:
- Minimum: 1 second
- Maximum: 3600 seconds (1 hour)
- Must be an integer

**Response**:
```json
{
  "ok": true,
  "newInterval": 60
}
```

**Example workflow**:
1. ESP32/display starts up and polls `/api/changes`
2. Response includes `"refreshInterval": 900` (15 minutes in seconds)
3. Display uses this interval for subsequent polling
4. To change interval, send `POST /api/refresh-interval` with new value
5. Next `/api/changes` call will reflect the updated interval

## Screenshot Options

Image generation uses Playwright (local Chromium) by default. Alternatively, [Browserless](https://www.browserless.io/) can be used:

```env
BROWSERLESS_URL=http://<host>:3000
BROWSERLESS_TOKEN=<token>
```

Or provide a ready dashboard URL directly:

```env
CAPTURE_URL=http://<host>:3001
```
