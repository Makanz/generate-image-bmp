# Medium Impact: Source Freshness Metadata and Stale Badges

**Priority:** Medium
**Impact Areas:** Reliability, UX, operator experience

## Problem

`src/services/data.ts` already tracks a separate cache timestamp for `weather`, `calendar`, `lunch`, and `indoor`, and even adjusts timestamps on fetch failure so retries happen after `ERROR_RETRY_MS`:

```typescript
cache[key] = {
    data: cache[key].data as never,
    timestamp: Math.max(1, now - CACHE_TTL_MS[key] + ERROR_RETRY_MS)
};
```

However, `fetchAllData()` only returns a single top-level `timestamp`, and `dashboard-web/script.ts` renders the values without showing whether each source is fresh, cached, or stale:

```typescript
return {
    weather,
    calendar,
    lunch,
    indoor,
    timestamp: new Date().toISOString()
};
```

This creates an operator blind spot. If weather has been stale for an hour because the webhook is down, the dashboard can still look "normal" because old cached data is rendered as if it were current. That is especially misleading on an e-paper display where the same values may stay visible for long periods.

## Solution

### 1. Return per-source freshness metadata from `fetchAllData()`

Expose cache age and staleness alongside the data payload.

```typescript
interface SourceFreshness {
    updatedAt: string | null;
    ageMs: number | null;
    stale: boolean;
    hasData: boolean;
}

interface AllData {
    weather: WeatherData | null;
    calendar: CalendarData | null;
    lunch: LunchItem[] | null;
    indoor: IndoorData | null;
    freshness: Record<'weather' | 'calendar' | 'lunch' | 'indoor', SourceFreshness>;
    timestamp: string;
}
```

This lets the frontend distinguish between fresh data, cached-but-acceptable data, and truly stale data.

### 2. Add compact stale indicators in the dashboard

Add a tiny status line or badge near each section header instead of hiding freshness inside logs.

```typescript
function setFreshnessState(elementId: string, freshness: SourceFreshness | undefined): void {
    const el = document.getElementById(elementId);
    if (!el || !freshness) return;

    if (!freshness.hasData) {
        el.textContent = 'Ingen data';
    } else if (freshness.stale) {
        el.textContent = 'Ej uppdaterad';
    } else {
        el.textContent = '';
    }
}
```

For a 1-bit display, short Swedish labels such as `Ej uppdaterad` or `Cache` are clearer than icons.

### 3. Render exact age in the browser preview only when needed

If the project wants to keep the e-paper layout minimal, the browser preview can show richer age text while the BMP keeps the compact label.

```typescript
function formatAgeMinutes(ageMs: number | null): string {
    if (ageMs === null) return '';
    return `${Math.round(ageMs / 60000)} min`;
}
```

This makes it much easier to tell whether the issue is "no data yet" or "old data still being served".

## Files to Change

| File | Change |
| ---- | ------ |
| `src/services/data.ts` | Add freshness metadata derived from cache timestamps and TTLs |
| `server.ts` | Keep `/api/data` returning the richer response shape |
| `dashboard-web/index.html` | Add compact freshness placeholder elements near the weather, lunch, and calendar labels |
| `dashboard-web/script.ts` | Render stale badges and optional age text from the new `freshness` payload |
| `dashboard-web/style.css` | Add styles for freshness text that remain legible in monochrome |
| `tests/data.test.js` | Add tests for fresh vs stale metadata calculation |
| `tests/server.test.js` | Add test coverage for `/api/data` freshness shape |

## Verification

- `/api/data` includes `freshness.weather`, `freshness.calendar`, `freshness.lunch`, and `freshness.indoor` with `updatedAt`, `ageMs`, `stale`, and `hasData`.
- When a webhook fetch fails but cached data still exists, the dashboard shows a stale indicator instead of silently rendering the old value as fresh.
- When a source has never produced data, the UI shows `Ingen data` rather than an empty freshness label.
- The generated BMP remains readable in 1-bit mode with the new status labels enabled.

