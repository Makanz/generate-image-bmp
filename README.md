# GenerateImageBmp

Dashboard-app som genererar BMP/PNG-bilder (800x480) med väder, kalender och lunchdata från n8n-webhooks.

## Arkitektur

```
┌─────────────────────────────────────────────────────────────────┐
│  n8n (https://n8nflow.duckdns.org)                              │
│  ├── Webhook: /webhook/<weather-id>  →  SMHI väderdata          │
│  ├── Webhook: /webhook/<calendar-id> →  Google Calendar        │
│  └── Webhook: /webhook/6e6ed191-...  →  Skolmatsedel (foodit)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard App (Node.js/Express, Docker)                        │
│  ├── GET /              → Dashboard HTML                         │
│  ├── GET /api/data     → Aggregerad data från n8n              │
│  ├── POST /api/refresh → Generera bild manuellt                │
│  ├── GET /dashboard.png → Senaste PNG                           │
│  └── GET /dashboard.bmp → Senaste BMP (1-bit monokrom)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ESP32 med e-paper display                                      │
│  Hämtar /dashboard.bmp från servern                            │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install
```

## Konfiguration

Kopiera `.env.example` till `.env` och konfigurera:

```env
PORT=3000
REFRESH_INTERVAL_MINUTES=15

N8N_WEBHOOK_WEATHER=https://n8nflow.duckdns.org/webhook/<weather-id>
N8N_WEBHOOK_CALENDAR=https://n8nflow.duckdns.org/webhook/<calendar-id>
N8N_WEBHOOK_LUNCH=https://n8nflow.duckdns.org/webhook/6e6ed191-a7c2-44ba-8193-1460fffd9ccb
```

### n8n-webhooks

#### Lunch (klar)
Använd befintlig webhook: `/webhook/6e6ed191-a7c2-44ba-8193-1460fffd9ccb`

#### Väder (SMHI)
Skapa ett n8n-workflow med:
1. **HTTP Request** → Hämta från SMHI API (exempel: `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/18.0686/lat/59.3293/data.json`)
2. **Webhook** → Exponera som `GET`-endpoint
3. **Transformera** svaret till formatet:
   ```json
   {
     "temperature": 18.5,
     "description": "Delvis molnigt",
     "location": "Stockholm",
     "precipitation": 20
   }
   ```

#### Kalender (Google Calendar)
Skapa ett n8n-workflow med:
1. **Google Calendar Trigger** → Hämta händelser för idag + 7 dagar
2. **Webhook** → Exponera som `GET`-endpoint
3. **Transformera** svaret till formatet:
   ```json
   {
     "events": [
       { "date": "2024-01-15", "summary": "Möte" },
       { "date": "2024-01-16", "summary": "Handla" }
     ]
   }
   ```

## Lokal utveckling

```bash
npm run dev          # Starta Vite dev-server för dashboard-web
```

```bash
node server.js       # Starta Express-server
```

```bash
npm run generate     # Generera bild manuellt (kräver att server.js kör)
```

## Docker

### Bygga och starta

```bash
cp .env.example .env
# Redigera .env med dina webhook-URL:er

docker-compose up -d
```

### Bildgenerering

Bilder sparas i `output/`:
- `output/dashboard.png` - Färg-PNG
- `output/dashboard.bmp` - 1-bit monokrom BMP för ESP32

### ESP32-integration

ESP32 kan hämta bilden via:
```
http://<server-ip>:3000/dashboard.bmp
```

## API

| Endpoint | Metod | Beskrivning |
|----------|-------|-------------|
| `/` | GET | Dashboard HTML |
| `/api/data` | GET | Aggregerad data från n8n |
| `/api/refresh` | POST | Generera bild manuellt |
| `/dashboard.png` | GET | Senaste PNG-bild |
| `/dashboard.bmp` | GET | Senaste BMP-bild |

## Bildintervall

Standard är 15 minuter. Ändra med `REFRESH_INTERVAL_MINUTES` i `.env`.
