# Plan: Dashboard API-koppling + ESP32 bildgenerering

## Problem & Approach

Projektet har en statisk dashboard-frontend med mock-data och ett bildgenereringsskript (capture.js)
som genererar SVG-baserade PNG:er med hårdkodad/slumpad data.

Målet är att:
1. Låta **n8n** (på hemmaservern) sköta all datahämtning (SMHI, Google Calendar, skolmatsedel)
   och exponera webhooks per datakälla — n8n är tillgänglig via duckdns
2. Bygga ett Express-backend som anropar n8n:s webhooks, aggregerar data och serverar dashboarden
3. Generera BMP + PNG (800x480) via Playwright-screenshot som ESP32:n kan hämta
4. Paketera allt i Docker för hemmaservern

## Arkitektur

```
n8n (https://n8nflow.duckdns.org)
├── Webhook: /webhook/6e6ed191-...  →  Skolmatsedel (klar)
├── Webhook: /webhook/<weather-id>  →  SMHI väderdata (skapas i n8n)
└── Webhook: /webhook/<calendar-id> →  Google Calendar-händelser (skapas i n8n)

Node.js app (Express, Docker på hemmaservern)
├── GET /              → Serverar dashboard-web/index.html
├── GET /api/data      → Anropar alla n8n-webhooks, returnerar aggregerad JSON
├── POST /api/refresh  → Triggar bildgenerering manuellt
├── GET /dashboard.png → Senaste genererade PNG
└── GET /dashboard.bmp → Senaste BMP (1-bit monokrom) för ESP32

Bildgenerering:
  Playwright screenshot av GET / → PNG (800×480) → sharp → 1-bit BMP
  Schemalagd med node-cron (konfigurerbart intervall, default 15 min)
```

## Data att visa

| Widget | Källa |
|--------|-------|
| Datum & tid | Lokalt (live i UI) |
| Väder | n8n webhook → SMHI |
| Kalender | n8n webhook → Google Calendar (idag + 7 dagar) |
| Lunch | n8n webhook → foodit.se (vardagar) |

## n8n Webhooks

Webhook-URL:er konfigureras i `.env`:

```env
N8N_WEBHOOK_WEATHER=https://n8nflow.duckdns.org/webhook/<weather-id>
N8N_WEBHOOK_CALENDAR=https://n8nflow.duckdns.org/webhook/<calendar-id>
N8N_WEBHOOK_LUNCH=https://n8nflow.duckdns.org/webhook/6e6ed191-a7c2-44ba-8193-1460fffd9ccb
```

## Hosting

- **Node.js-appen**: Docker-container på hemmaservern
- **n8n**: Körs redan på hemmaservern via `https://n8nflow.duckdns.org`
- `Dockerfile` + `docker-compose.yml` + `.env.example`

## Todos

### 1. `add-express-server` ✅
Skapa `server.js` med Express. Serverar statiska filer från `dashboard-web/`,
anropar n8n-webhooks via axios, aggregerar data i `/api/data`.
Installera: `express`, `node-cron`, `axios`, `dotenv`.

### 2. `add-data-service`
Skapa `src/services/data.js`.
Anropar parallellt de tre n8n-webhooks (weather, calendar, lunch) via axios.
Cacchar svaret i minnet (TTL = `REFRESH_INTERVAL_MINUTES`).
Hanterar fel gracefully (returnerar `null` per källa om webhook är nere).

### 3. `update-dashboard-ui`
Uppdatera `dashboard-web/index.html`, `style.css`, `script.js`.
- Ta bort: CPU, minne, disk, nätverk, system info
- Lägg till: Väderkort, Kalenderkort (idag + kommande), Lunchkort, Datum & tid
- `script.js`: Fetcha `/api/data`, visa fallback-data om API är nere
- Auto-refresh var 5:e minut
- Behåll 800 px bredd för e-paper

### 4. `update-image-generation`
Uppdatera `capture.js`:
- Playwright öppnar `http://localhost:PORT/` och väntar på att sidan laddas
- Screenshot → PNG (800×480)
- sharp konverterar PNG → 1-bit monokrom BMP
- Exporterar `generateImage()` för användning i `server.js`

### 5. `add-image-endpoints`
I `server.js`:
- `GET /dashboard.png` → serverar `output/dashboard.png`
- `GET /dashboard.bmp` → serverar `output/dashboard.bmp`
- `POST /api/refresh`  → triggar `generateImage()`, returnerar `{ ok: true }`

### 6. `add-scheduling`
I `server.js`:
- `node-cron` schema: var `REFRESH_INTERVAL_MINUTES` minut (default 15)
- Kör `generateImage()` automatiskt
- Genererar en bild vid serverstart (efter 5 sek delay)

### 7. `add-docker`
- `Dockerfile`: Node 22 + Playwright-beroenden, exponera `PORT`
- `docker-compose.yml`: dashboard-service, volumes för `output/`
- `.env.example`: `PORT`, `N8N_WEBHOOK_*`, `REFRESH_INTERVAL_MINUTES`
- `.dockerignore`

### 8. `update-readme`
Uppdatera `README.md` med:
- Arkitekturdiagram
- Hur man sätter upp n8n-flödena (weather, calendar) — lunch är klar
- Docker-deploy instruktioner
- ESP32-integration (URL att hämta `/dashboard.bmp` från)

## Beroenden

```
add-express-server  ✅
└── add-data-service
       └── update-dashboard-ui
              └── update-image-generation
                     └── add-image-endpoints
                            └── add-scheduling
                                   └── add-docker
                                          └── update-readme
```

## Nya npm-paket

| Paket | Användning |
|-------|-----------|
| `express` | HTTP-server |
| `node-cron` | Schemaläggning |
| `axios` | HTTP-klient för n8n webhook-anrop |
| `dotenv` | Miljövariabler |
