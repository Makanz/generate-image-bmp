# High Impact: Add Health Checks and Error Boundaries

**Priority:** High
**Impact Areas:** Reliability, debuggability, reduced downtime

## Problem

There is currently no way to verify that the server is healthy without manually inspecting logs or triggering a full image generation. When something breaks (a webhook goes down, the cache is stale, Playwright fails), there is no structured signal — just a silent bad image or a log entry.

Additionally, critical operations like image generation and data fetching have inconsistent error handling, making it hard to diagnose failures in production.

## Solution

### 1. Add a `/health` endpoint

Implement `GET /health` in `server.ts` that checks:

- Whether each webhook URL is reachable (weather, calendar, lunch, indoor)
- Cache status for each data source (last fetch time, whether data is stale)
- Whether the last image generation succeeded and when it ran

```typescript
app.get('/health', async (_req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        cache: getCacheStatus(),       // from data.ts
        lastGenerated: getLastGeneratedTime(), // from capture state
    };
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
});
```

Example response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T08:00:00.000Z",
  "cache": {
    "weather": { "age_ms": 45000, "stale": false },
    "calendar": { "age_ms": 120000, "stale": false },
    "lunch": { "age_ms": 3600000, "stale": true },
    "indoor": { "age_ms": 30000, "stale": false }
  },
  "lastGenerated": "2025-01-15T07:45:00.000Z"
}
```

### 2. Expose cache status from `data.ts`

Add a `getCacheStatus()` function to `src/services/data.ts` that returns the age and staleness of each cached source without triggering a fetch.

### 3. Standardize error boundaries

Ensure all route handlers use `withErrorHandling()` consistently, and that errors include enough context to diagnose the failure (which operation failed, what data was involved).

## Files to Change

| File | Change |
|------|--------|
| `server.ts` | Add `GET /health` route |
| `src/services/data.ts` | Export `getCacheStatus()` function |
| `tests/server.test.js` | Add tests for `/health` endpoint |

## Verification

- `GET /health` returns `200` when all sources are fresh.
- `GET /health` returns `503` when a source is stale beyond its TTL.
- Response is valid JSON with expected shape.
