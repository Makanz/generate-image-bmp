# Medium Impact: Web-Based Configuration UI

**Priority:** Medium
**Impact Areas:** Maintainability, ease of deployment, operator experience

## Problem

All runtime configuration (webhook URLs, refresh interval, Homey credentials, display threshold) lives in environment variables that require restarting the server to change. In practice this means:

- Adjusting a webhook URL during testing requires editing `.env`, stopping the container, and restarting it.
- There is no way to see the current active configuration at a glance without inspecting the process environment.
- Non-technical operators who maintain the display have no safe interface for changing settings.

## Solution

### 1. Add a `GET /admin` page serving a minimal configuration form

Serve a small HTML form at `/admin` (static or dynamically rendered) that displays:

- Current values for each configurable env var (masked for secrets like tokens)
- Input fields for non-secret values (webhook URLs, `REFRESH_INTERVAL_MINUTES`, `CAPTURE_URL`)
- A "Save & Restart cron" button that applies changes without a full server restart

### 2. Add `POST /api/config` endpoint in `server.ts`

Accept a JSON body of key-value pairs for the allowed config keys. Apply them to `process.env` and reschedule the cron task:

```typescript
const EDITABLE_CONFIG_KEYS = [
    'N8N_WEBHOOK_WEATHER',
    'N8N_WEBHOOK_CALENDAR',
    'N8N_WEBHOOK_LUNCH',
    'N8N_WEBHOOK_INDOOR',
    'REFRESH_INTERVAL_MINUTES',
    'CAPTURE_URL',
    'WEATHER_REFRESH_MINUTES',
    'CALENDAR_REFRESH_MINUTES',
    'LUNCH_REFRESH_HOURS',
    'INDOOR_REFRESH_MINUTES',
] as const;

app.post('/api/config', express.json(), withErrorHandling('Config update failed', async (req, res) => {
    for (const [key, value] of Object.entries(req.body)) {
        if (EDITABLE_CONFIG_KEYS.includes(key as typeof EDITABLE_CONFIG_KEYS[number])) {
            process.env[key] = String(value);
        }
    }
    rescheduleCron(); // rebuild the node-cron task with the new interval
    res.json({ ok: true });
}));
```

### 3. Add `GET /api/config` endpoint to return current (safe) config

Return only non-secret keys so the admin UI can populate its form:

```typescript
app.get('/api/config', (_req, res) => {
    const config: Record<string, string> = {};
    for (const key of EDITABLE_CONFIG_KEYS) {
        config[key] = process.env[key] || '';
    }
    res.json(config);
});
```

### 4. Persist changes to `output/config-overrides.json`

Write accepted config key-value pairs to disk so they survive a server restart. Load them during startup before dotenv, so they take precedence over `.env`:

```typescript
// At startup, before cron setup
await loadConfigOverrides(); // reads output/config-overrides.json and applies to process.env
```

### 5. Protect the admin UI

Add a simple Bearer token check using a `ADMIN_TOKEN` env var to protect both `/admin` and `/api/config` routes from unauthorized access.

## Files to Change

| File | Change |
|------|--------|
| `server.ts` | Add `GET /api/config`, `POST /api/config`, `GET /admin` routes; `rescheduleCron()` helper |
| `dashboard-web/admin.html` | New: minimal config form page |
| `src/utils/config-overrides.ts` | New: load/save `output/config-overrides.json` |
| `tests/server.test.js` | Add tests for config GET/POST endpoints |

## Verification

- `GET /api/config` returns all editable keys with current values (no secrets).
- `POST /api/config` with `{ "REFRESH_INTERVAL_MINUTES": "5" }` updates the cron schedule without restarting the server.
- Config overrides written to `output/config-overrides.json` are applied on next server start.
- Requests to `/api/config` without the correct `ADMIN_TOKEN` receive a `401` response.
