# Project Improvement Ideas

Improvement suggestions for the `generate-image-bmp` dashboard project, ordered by priority.

---

## 🔴 High Priority

### 1. Bundle Roboto font locally
**Impact:** Reliability, offline support, screenshot consistency

`index.html` loads Roboto from the Google Fonts CDN:
```html
<link href="https://fonts.googleapis.com/css?family=Roboto:400,700,900&display=swap" rel="stylesheet">
```
If the CDN is unavailable (Docker without internet, offline deployment, network hiccup), the font silently falls back to a system font. Playwright captures the screenshot regardless — but the BMP output will have layout shifts and inconsistent rendering.

**Solution:** Download Roboto 400/700/900 `.woff2` files, place them in `dashboard-web/fonts/`, add `@font-face` declarations in `style.css`, and remove the CDN `<link>` from `index.html`.

---

### 2. Fix `server.test.js` to test the real app
**Impact:** Test coverage correctness

`tests/server.test.js` re-implements simplified routes from scratch instead of importing the real `app` export from `server.ts`. These critical paths are currently **untested**:
- `withErrorHandling()` wrapper (actual error boundary behavior)
- `/output/:filename` security allowlist (path traversal protection)
- `/api/image-region` endpoint (query param parsing, BMP region extraction)
- `generateImageWhenReady()` weather retry logic

**Solution:** Import `app` from `server.ts` and use `supertest(app)`. Mock the same dependencies (`data`, `capture`, `image-processing`) but test the real route handlers.

---

## 🟡 Medium Priority

### 3. Protect `/api/refresh` with a secret token
**Impact:** Security, resource protection

`POST /api/refresh` triggers a full Playwright browser launch + screenshot + BMP generation with no authentication. Any client on the network can call it repeatedly to exhaust CPU/memory.

**Solution:** Add an optional `REFRESH_SECRET` env var. If set, require an `Authorization: Bearer <secret>` header. Requests without the correct secret return `401`. If the var is not configured, the endpoint stays open (backward-compatible). Update `.env.example` and `README.md`.

---

## 🟢 Low Priority

### 4. Remove unused `jsdom` dependency
**Impact:** Code quality, smaller install/Docker image

`jsdom` is listed as a production dependency in `package.json` but is never imported anywhere in the codebase. It adds unnecessary weight to the Docker image and install time.

**Solution:** `pnpm remove jsdom`

---

### 5. Use `WEATHER_FORECAST_*` constants in `data.ts`
**Impact:** Code quality, maintainability

`constants.ts` exports `WEATHER_FORECAST_START_INDEX = 1` and `WEATHER_FORECAST_COUNT = 3`, but `data.ts` hardcodes these values directly:
```ts
const forecast = maxTemps.slice(1, 4).map((max, i) => ({ ... }));
```
The constants are dead exports. Changing the forecast window requires editing two files and knowing which one actually controls behavior.

**Solution:** Import and use the constants in `data.ts`:
```ts
const end = WEATHER_FORECAST_START_INDEX + WEATHER_FORECAST_COUNT;
const forecast = maxTemps.slice(WEATHER_FORECAST_START_INDEX, end).map(...);
```
