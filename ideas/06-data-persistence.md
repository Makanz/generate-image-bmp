# High Impact: Persist Cache to Disk on Restart

**Priority:** High
**Impact Areas:** Reliability, cold-start UX, data availability

## Problem

All fetched data (weather, calendar, lunch, indoor) is stored in an in-memory `cache` object inside `src/services/data.ts`. When the server restarts (Docker container restart, deployment, crash), the cache is lost. The startup sequence immediately re-fetches all sources, but:

- If any webhook is temporarily unreachable at startup, the dashboard renders with blank or default data.
- The weather retry logic (`WEATHER_ENSURE_RETRIES`) only covers cold-start weather, not calendar or lunch.
- A container restart during a network outage means the display goes blank until connectivity is restored.

## Solution

### 1. Write `output/cache.json` after every successful fetch

In `fetchSource()` in `src/services/data.ts`, write the updated cache to disk whenever a source is successfully refreshed:

```typescript
import fs from 'fs/promises';
import path from 'path';

const CACHE_FILE = path.join(getAppRoot(), 'output', 'cache.json');

async function persistCache(): Promise<void> {
    try {
        await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    } catch {
        // Non-fatal — in-memory cache is still valid
    }
}
```

Call `persistCache()` inside `fetchSource()` after a successful data fetch (i.e., when `data !== null`).

### 2. Restore from `cache.json` on startup

Add a `restoreCache()` function called once at module load time:

```typescript
async function restoreCache(): Promise<void> {
    try {
        const raw = await fs.readFile(CACHE_FILE, 'utf-8');
        const saved: Cache = JSON.parse(raw);

        for (const key of Object.keys(saved) as (keyof Cache)[]) {
            const entry = saved[key];
            const age = Date.now() - entry.timestamp;
            // Only restore entries that are not yet expired
            if (entry.data !== null && age < CACHE_TTL_MS[key]) {
                cache[key] = entry;
            }
        }

        console.log('[data] Cache restored from disk.');
    } catch {
        // File missing or corrupt — start with empty cache
    }
}
```

Call `restoreCache()` before the first `fetchAllData()` in `server.ts`.

### 3. Validate restored data shape

Before using restored data, confirm it has the expected top-level shape to guard against reading a stale file from a previous version:

```typescript
function isValidCacheEntry(entry: unknown): entry is CacheEntry<unknown> {
    return (
        typeof entry === 'object' &&
        entry !== null &&
        'data' in entry &&
        'timestamp' in entry &&
        typeof (entry as CacheEntry<unknown>).timestamp === 'number'
    );
}
```

## Files to Change

| File | Change |
|------|--------|
| `src/services/data.ts` | Add `persistCache()`, `restoreCache()`, call them at appropriate points |
| `server.ts` | Call `restoreCache()` before startup image generation |
| `tests/data.test.js` | Add tests for cache persistence and restore logic |

## Verification

- On first startup with no `cache.json`, the server fetches all sources normally.
- After a successful fetch, `output/cache.json` exists and contains the expected structure.
- Restarting the server immediately after a fetch does **not** trigger another fetch (cache is valid from disk).
- Restarting the server with a stale `cache.json` (timestamps older than TTL) triggers a fresh fetch.
- If `cache.json` is malformed or missing, the server starts cleanly with an empty cache.
