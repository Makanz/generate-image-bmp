# Medium Impact: WMO Weather Code Icon Rendering

**Priority:** Medium
**Impact Areas:** Dashboard informativeness, UX, e-paper value

## Problem

`normalizeWeather()` in `src/services/data.ts` captures `current_weather_code` and per-day `weather_code` from the Open-Meteo webhook and passes them through to the `/api/data` response:

```typescript
return {
    outdoor: { current, forecast },
    current_weather_code: entry.current?.weather_code ?? null,
    wind_speed: entry.current?.wind_speed_10m ?? null,
    humidity: entry.current?.relative_humidity_2m ?? null
};
```

The `WeatherData` interface in `dashboard-web/script.ts` does not even declare `current_weather_code` — the field is completely ignored on the frontend:

```typescript
interface WeatherData {
    outdoor: OutdoorWeather;
    temperature?: number;
    // current_weather_code is missing — never read
}
```

`updateTemperature()` renders only `outdoor.current` (the number) and a trend arrow. The HTML `<div class="temp-main" id="ute-temp">` contains no icon element. On the e-paper display, a value like `3°↓` gives no indication of whether the conditions are clear, rainy, or snowing — information already fetched and discarded.

Each forecast day's `weather_code` is also fetched in `forecast[]` but not rendered:

```typescript
const forecast = maxTemps.slice(WEATHER_FORECAST_START_INDEX, end).map((max, i) => ({
    temp: ...,
    max,
    min: ...,
    precipitation_probability: ...,
    weather_code: (daily.weather_code || [])[i + WEATHER_FORECAST_START_INDEX] ?? null
}));
```

## Solution

### 1. Add a `weatherCodeToSymbol()` helper in `dashboard-web/script.ts`

Map the subset of WMO weather codes actually produced by Open-Meteo to a single Unicode character. The full mapping covers the codes documented at open-meteo.com/en/docs#weathervariables:

```typescript
function weatherCodeToSymbol(code: number | null | undefined): string {
    if (code === null || code === undefined) return '';
    if (code === 0)           return '☀';   // Clear sky
    if (code <= 2)            return '🌤';  // Mainly clear / partly cloudy
    if (code === 3)           return '☁';   // Overcast
    if (code <= 49)           return '🌫';  // Fog / depositing rime fog
    if (code <= 55)           return '🌦';  // Drizzle
    if (code <= 67)           return '🌧';  // Rain / freezing rain
    if (code <= 77)           return '❄';   // Snow
    if (code <= 82)           return '🌦';  // Rain showers
    if (code <= 86)           return '🌨';  // Snow showers
    if (code <= 99)           return '⛈';  // Thunderstorm
    return '';
}
```

For 1-bit BMP rendering, Unicode characters require the bundled font (see `01-font-bundling.md`) to include these glyphs. As a fallback, use ASCII-safe short text codes instead of emoji:

```typescript
const WMO_SYMBOL: Record<number, string> = {
    0: 'SOL', 1: 'SOL', 2: 'HALVKLAR', 3: 'MOLNIG',
    45: 'DIMMA', 48: 'DIMMA',
    51: 'DUGG', 53: 'DUGG', 55: 'DUGG',
    61: 'REGN', 63: 'REGN', 65: 'REGN',
    71: 'SNÖ', 73: 'SNÖ', 75: 'SNÖ', 77: 'SNÖ',
    80: 'SKURAR', 81: 'SKURAR', 82: 'SKURAR',
    95: 'ÅSKA', 96: 'ÅSKA', 99: 'ÅSKA',
};

function weatherCodeToSymbol(code: number | null | undefined): string {
    if (code === null || code === undefined) return '';
    return WMO_SYMBOL[code] ?? '';
}
```

### 2. Extend the `WeatherData` interface in `dashboard-web/script.ts`

```typescript
interface WeatherData {
    outdoor: OutdoorWeather;
    temperature?: number;
    current_weather_code?: number | null;
}

interface ForecastDay {
    temp: number;
    weather_code?: number | null;
}
```

### 3. Render the icon in `updateTemperature()`

Add a `<span>` for the weather symbol next to the current temperature in `index.html`:

```html
<div class="temp-main" id="ute-temp">
    <span id="ute-weather-symbol" class="weather-symbol"></span>
    <span id="ute-temp-val">--</span>
    <span class="temp-trend" id="ute-trend"></span>
</div>
```

Update `updateTemperature()` to populate it:

```typescript
const symbolEl = document.getElementById('ute-weather-symbol');
if (symbolEl) {
    symbolEl.textContent = weatherCodeToSymbol(weather.current_weather_code);
}
```

Optionally render a small symbol alongside each forecast day:

```typescript
const el = document.getElementById(`forecast-${i}`);
if (el) {
    const sym = weatherCodeToSymbol(forecast[i].weather_code);
    const tmp = forecast[i].temp !== undefined ? Math.round(forecast[i].temp) + '°' : '--°';
    el.textContent = sym ? `${sym} ${tmp}` : tmp;
}
```

### 4. Add `weather-symbol` CSS class in `style.css`

```css
.weather-symbol {
    font-size: 1.2em;
    margin-right: 4px;
    vertical-align: middle;
}
```

## Files to Change

| File | Change |
| ---- | ------ |
| `dashboard-web/script.ts` | Add `weatherCodeToSymbol()`; extend `WeatherData` and `ForecastDay` interfaces; populate symbol element in `updateTemperature()` |
| `dashboard-web/index.html` | Add `<span id="ute-weather-symbol">` inside `#ute-temp`; add symbol spans inside forecast items |
| `dashboard-web/style.css` | Add `.weather-symbol` rule |

## Verification

- With `current_weather_code: 0`, `#ute-weather-symbol` contains `'SOL'` (or the sun character).
- With `current_weather_code: 63`, the symbol reads `'REGN'`.
- With `current_weather_code: null`, the symbol element is empty and no layout shift occurs.
- Forecast items display a symbol prefix alongside the temperature for days that have a `weather_code`.
- `pnpm test` passes with no regressions.
- The generated `output/dashboard.bmp` shows weather symbols next to the temperature on the e-paper preview.
