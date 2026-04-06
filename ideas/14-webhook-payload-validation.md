# Medium Impact: Webhook Payload Validation with Type Guards

**Priority:** Medium
**Impact Areas:** Debuggability, reliability, operator experience

## Problem

`createWebhookFetcher()` in `src/services/data.ts` applies normalizer functions to raw `unknown` webhook payloads, but the normalizers use silent optional chaining and return `null` when fields are absent:

```typescript
function normalizeWeather(raw: WeatherRaw | WeatherRaw[] | null): WeatherData | null {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    const current = entry.current?.temperature_2m ?? null;
    // ...
}
```

When an n8n webhook changes its output format — for example returning `{ "temp": 5 }` instead of the expected `{ "current": { "temperature_2m": 5 } }` — `current` silently becomes `null`. The server log shows nothing except the final generated image containing `--` placeholders where real data should appear.

The same silent failure affects `normalizeIndoor()`:

```typescript
const rooms = (entry.rooms || []).filter(r => r.temp !== null && r.temp !== undefined);
if (rooms.length === 0) return null;
```

If the Homey webhook changes `rooms` to `devices` or drops the field entirely, `normalizeIndoor()` returns `null` with no log message explaining why.

Diagnosing a misconfigured webhook currently requires:
1. Manually calling the webhook URL and inspecting the raw JSON
2. Adding temporary `console.log` statements in the normalizer
3. Restarting the server

There is no field-level warning log that identifies the exact missing key.

## Solution

### 1. Add a `validateShape()` helper in `src/utils/validation.ts`

A lightweight runtime check that logs a warning for each missing required field without throwing:

```typescript
type FieldSpec = { key: string; type: 'object' | 'number' | 'string' | 'array' };

export function validateShape(
    sourceName: string,
    value: unknown,
    requiredFields: FieldSpec[]
): boolean {
    if (typeof value !== 'object' || value === null) {
        console.warn(`[validate] ${sourceName}: payload is not an object (got ${typeof value})`);
        return false;
    }

    let valid = true;
    for (const { key, type } of requiredFields) {
        const field = (value as Record<string, unknown>)[key];
        const actualType = Array.isArray(field) ? 'array' : typeof field;
        if (field === undefined || field === null) {
            console.warn(`[validate] ${sourceName}: missing field '${key}'`);
            valid = false;
        } else if (actualType !== type) {
            console.warn(
                `[validate] ${sourceName}: field '${key}' expected ${type}, got ${actualType}`
            );
            valid = false;
        }
    }
    return valid;
}
```

### 2. Call `validateShape()` inside `normalizeWeather()` and `normalizeIndoor()`

Add targeted validation at the entry level before accessing nested fields:

```typescript
function normalizeWeather(raw: WeatherRaw | WeatherRaw[] | null): WeatherData | null {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    validateShape('weather', entry, [
        { key: 'current', type: 'object' },
        { key: 'daily', type: 'object' },
    ]);

    if (entry.current) {
        validateShape('weather.current', entry.current, [
            { key: 'temperature_2m', type: 'number' },
            { key: 'weather_code', type: 'number' },
        ]);
    }

    if (entry.daily) {
        validateShape('weather.daily', entry.daily, [
            { key: 'temperature_2m_max', type: 'array' },
            { key: 'temperature_2m_min', type: 'array' },
        ]);
    }

    // Existing normalisation logic unchanged
    const current = entry.current?.temperature_2m ?? null;
    // ...
}
```

```typescript
function normalizeIndoor(raw: ...): IndoorData | null {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    validateShape('indoor', entry, [
        { key: 'rooms', type: 'array' },
    ]);

    // Existing logic unchanged
    const rooms = (entry.rooms || []).filter(r => r.temp !== null && r.temp !== undefined);
    if (rooms.length === 0) {
        console.warn('[validate] indoor: no rooms with valid temperatures found');
        return null;
    }
    // ...
}
```

### 3. Log raw payload shape on first fetch failure

In `fetchSource()`, when `data` is `null` after a fetch, log the response size and top-level keys to aid debugging:

```typescript
const fetchPromise = (async (): Promise<T | null> => {
    const data = await fetchFn();
    if (data === null) {
        console.warn(`[data] ${key}: fetch returned null — check webhook format or connectivity`);
    }
    // ...
})();
```

## Files to Change

| File | Change |
| ---- | ------ |
| `src/utils/validation.ts` | New: `validateShape()` helper |
| `src/services/data.ts` | Call `validateShape()` in `normalizeWeather()` and `normalizeIndoor()`; add null-result warning in `fetchSource()` |
| `tests/data.test.js` | Add tests: `normalizeWeather` with missing `current` logs a warning; `normalizeIndoor` with missing `rooms` logs a warning |

## Verification

- Calling `normalizeWeather({ daily: {} })` (missing `current`) logs `[validate] weather: missing field 'current'` to `console.warn`.
- Calling `normalizeWeather({ current: { temperature_2m: 5 }, daily: { temperature_2m_max: [] } })` (valid shape) produces no warnings.
- Calling `normalizeIndoor({ rooms: [] })` logs `[validate] indoor: no rooms with valid temperatures found`.
- Calling `normalizeIndoor({ devices: [] })` (wrong key) logs `[validate] indoor: missing field 'rooms'`.
- `pnpm test` passes with no regressions.
- Running the server with a deliberately malformed webhook response produces a targeted warning log within one refresh cycle.
