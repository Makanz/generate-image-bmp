# High Impact: Code Clarity Improvements

**Priority:** High
**Impact Areas:** Maintainability, onboarding, bug prevention

## Problem

Several patterns across the codebase make it harder to understand, extend, and safely modify:

- Public functions in `capture.ts`, `server.ts`, `data.ts`, `homey.ts`, and `bmp-writer.ts` have no JSDoc documentation.
- Magic numbers are scattered inline (e.g. `slice(1, 4)`, `MERGE_DISTANCE = 10`) with no explanation of their meaning.
- Constants exported from `constants.ts` (`WEATHER_FORECAST_START_INDEX`, `WEATHER_FORECAST_COUNT`) are unused — `data.ts` hardcodes the same values directly.
- Error handling style is inconsistent: some catch blocks use `err: unknown` with narrowing, others do not.
- The frontend `script.js` uses several large functions that each do multiple unrelated things, making them hard to test or modify in isolation.

## Solution

### 1. Add JSDoc to all public functions

Document the purpose, parameters, and return value of every exported function:

```typescript
/**
 * Captures a screenshot of the dashboard and converts it to a 1-bit BMP.
 * Writes both `dashboard.png` and `dashboard.bmp` to the output directory.
 *
 * @param options - Optional overrides for output file paths.
 * @returns Paths to the generated PNG and BMP files.
 */
export async function generateImage(options: GenerateImageOptions = {}): Promise<GenerateImageResult> {
```

### 2. Use constants from `constants.ts` in `data.ts`

Replace the hardcoded slice in `data.ts`:

```typescript
// Before
const forecast = maxTemps.slice(1, 4).map((max, i) => ({ ... }));

// After
import { WEATHER_FORECAST_START_INDEX, WEATHER_FORECAST_COUNT } from './constants';
const end = WEATHER_FORECAST_START_INDEX + WEATHER_FORECAST_COUNT;
const forecast = maxTemps.slice(WEATHER_FORECAST_START_INDEX, end).map((max, i) => ({ ... }));
```

### 3. Standardize error handling

Use `err: unknown` with type narrowing consistently across all catch blocks:

```typescript
// Consistent pattern
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Operation failed:', message);
    throw err;
}
```

### 4. Decompose large frontend functions

Split overloaded functions in `script.js` into focused helpers:

- `updateTemperature()` → `renderOutdoorTemperature()`, `renderIndoorTemperature()`, `renderForecast()`, `renderRoomChart()`
- `generateMockData()` → separate mock data factory and UI update call

### 5. Add comment on `MERGE_DISTANCE` in `capture.ts`

```typescript
// Maximum pixel distance between changed regions before they are merged into one rectangle.
// Keeps the change list small and avoids sending dozens of tiny adjacent regions to the ESP32.
const MERGE_DISTANCE = 10;
```

## Files to Change

| File | Change |
|------|--------|
| `capture.ts` | JSDoc on `generateImage`, `getChanges`; comment on `MERGE_DISTANCE` |
| `server.ts` | JSDoc on route handlers and middleware |
| `src/services/data.ts` | Use `WEATHER_FORECAST_*` constants; JSDoc on fetch functions |
| `src/services/homey.ts` | JSDoc on public functions |
| `src/image/bmp-writer.ts` | JSDoc on `writeBmp` |
| `dashboard-web/script.js` | Decompose large functions into focused helpers |

## Verification

- `pnpm test` passes with no regressions.
- No functional behavior changes — this is documentation and structural cleanup only.
