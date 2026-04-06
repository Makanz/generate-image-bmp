# Low Impact: Quiet Hours for Image Generation

**Priority:** Low
**Impact Areas:** Resource efficiency, reliability, ESP32 power consumption

## Problem

The cron scheduler in `server.ts` fires `scheduledImageGeneration()` unconditionally on a fixed interval — every `REFRESH_INTERVAL` minutes, around the clock:

```typescript
cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    try {
        await scheduledImageGeneration();
    } catch (err: unknown) {
        handleApiError('[cron] Image generation failed', err);
    }
});
```

Between roughly 23:00 and 06:00 nobody is looking at the e-paper display, but the server still:

- Launches a Playwright Chromium browser every 15 minutes
- Makes HTTP requests to all four n8n webhooks (weather, calendar, lunch, indoor)
- Calls the Homey API (if configured)
- Writes `dashboard.bmp` and `dashboard.previous.bmp` to disk
- Invalidates change-detection state, so the ESP32 may wake to fetch a "new" image that looks identical

There are no environment variables or configuration keys in `src/utils/constants.ts` that control which hours are active. Adding a quiet-hours window lets operators stop overnight refreshes with a one-line `.env` change.

## Solution

### 1. Add `QUIET_HOURS_START` and `QUIET_HOURS_END` environment variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `QUIET_HOURS_START` | integer 0–23 | *(unset — no quiet hours)* | Hour (local time) at which generation stops |
| `QUIET_HOURS_END` | integer 0–23 | *(unset — no quiet hours)* | Hour (local time) at which generation resumes |

If both variables are unset the behaviour is identical to today. A typical configuration:

```dotenv
QUIET_HOURS_START=23
QUIET_HOURS_END=6
```

This skips all scheduled generations from 23:00 through 05:59.

### 2. Add an `isQuietHours()` helper in `server.ts`

```typescript
function isQuietHours(): boolean {
    const start = parseInt(process.env.QUIET_HOURS_START || '', 10);
    const end   = parseInt(process.env.QUIET_HOURS_END   || '', 10);

    if (isNaN(start) || isNaN(end)) return false;  // not configured

    const hour = new Date().getHours();

    if (start < end) {
        // e.g. 01–06: quiet between 01:00 and 05:59
        return hour >= start && hour < end;
    }
    // e.g. 23–06: wraps midnight
    return hour >= start || hour < end;
}
```

### 3. Guard the cron callback with `isQuietHours()`

```typescript
cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    if (isQuietHours()) {
        console.log('[cron] Quiet hours active — skipping generation.');
        return;
    }
    try {
        await scheduledImageGeneration();
    } catch (err: unknown) {
        handleApiError('[cron] Image generation failed', err);
    }
});
```

### 4. Expose the quiet-hours status in the `/health` response

When a `/health` endpoint exists (see `03-health-checks.md`), include the current quiet-hours state so operators can confirm the schedule at a glance:

```typescript
const health = {
    // ...
    quietHours: {
        active: isQuietHours(),
        start: process.env.QUIET_HOURS_START ?? null,
        end:   process.env.QUIET_HOURS_END   ?? null,
    },
};
```

### 5. Generate one final image at the start of quiet hours (optional)

To ensure the e-paper shows up-to-date content when quiet hours begin, trigger a single forced generation at the boundary:

```typescript
let wasInQuietHours = false;

cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    const quiet = isQuietHours();
    if (!wasInQuietHours && quiet) {
        // Entering quiet hours — generate a final image
        console.log('[cron] Entering quiet hours, generating final image...');
        try {
            await scheduledImageGeneration();
        } catch (err: unknown) {
            handleApiError('[cron] Final quiet-hours image failed', err);
        }
    }
    wasInQuietHours = quiet;
    if (quiet) {
        console.log('[cron] Quiet hours active — skipping generation.');
        return;
    }
    try {
        await scheduledImageGeneration();
    } catch (err: unknown) {
        handleApiError('[cron] Image generation failed', err);
    }
});
```

## Files to Change

| File | Change |
| ---- | ------ |
| `server.ts` | Add `isQuietHours()` helper; guard cron callback; add `wasInQuietHours` transition logic |
| `tests/server.test.js` | Add tests for `isQuietHours()`: non-wrapping range, midnight-wrapping range, unset variables |

## Verification

- With `QUIET_HOURS_START=23` and `QUIET_HOURS_END=6`, calling `isQuietHours()` at 01:30 returns `true` and at 12:00 returns `false`.
- With `QUIET_HOURS_START=1` and `QUIET_HOURS_END=6` (non-wrapping), `isQuietHours()` at 03:00 returns `true` and at 23:00 returns `false`.
- With neither variable set, `isQuietHours()` always returns `false` and behavior is identical to the current implementation.
- During quiet hours, the cron log shows `[cron] Quiet hours active — skipping generation.` instead of launching a Playwright browser.
- `POST /api/refresh` is **not** affected by quiet hours — manual refreshes always execute.
- `pnpm test` passes with no regressions.
