# Medium Impact: Save Color PNG Preview Alongside BMP

**Priority:** Medium
**Impact Areas:** Debuggability, dashboard UX, change detection accuracy

## Problem

`generateImage()` in `capture.ts` captures a full-color PNG screenshot (`pngBuffer`) from Playwright/Browserless, converts it to a 1-bit BMP, but **discards the PNG without writing it to disk**:

```typescript
const pngBuffer = await provider.capture(url, WIDTH, HEIGHT);

const greyscaleResult = await sharp(pngBuffer)
    .greyscale()
    .threshold(GREYSCALE_THRESHOLD)
    .raw()
    .toBuffer({ resolveWithObject: true });

await writeBmp(greyscaleResult.info.width, greyscaleResult.info.height, greyscaleResult.data, outputBmp);
// pngBuffer is never saved — the color screenshot is lost
```

This causes several problems:

- There is no way to see the color version of the dashboard without re-running a full generation.
- Visual debugging requires comparing the 1-bit BMP output with expectations — fine detail lost during thresholding is invisible.
- The `GET /api/image-region` endpoint extracts pixels from the 1-bit BMP, losing color and anti-aliasing information that could improve region accuracy.
- The `AGENTS.md` documentation states "Both `dashboard.png` and `dashboard.bmp` are always written together in `generateImage()`" — but this is not implemented.

## Solution

### 1. Write `dashboard.png` from `pngBuffer` in `capture.ts`

Before the greyscale conversion, save the raw screenshot and rotate the previous copy, mirroring the existing BMP backup pattern:

```typescript
const outputPng = options.outputPng ?? path.join(OUTPUT_DIR, 'dashboard.png');
const previousPng = path.join(OUTPUT_DIR, 'dashboard.previous.png');

const currentPngExists = await fileExists(outputPng);
if (currentPngExists) {
    await fs.copyFile(outputPng, previousPng);
}

await fs.writeFile(outputPng, pngBuffer);
console.log(`[capture] PNG saved: ${outputPng}`);
```

Update `GenerateImageOptions` and the return type:

```typescript
interface GenerateImageOptions {
    outputBmp?: string;
    outputPng?: string;
}

// Return type: include png path
return { bmp: outputBmp, png: outputPng };
```

### 2. Serve the PNG from `server.ts`

Add `dashboard.png` and `dashboard.previous.png` to the allowed output files and expose a route:

```typescript
const ALLOWED_OUTPUT_FILES = [
    'dashboard.bmp',
    'dashboard.previous.bmp',
    'dashboard.png',
    'dashboard.previous.png',
];

app.get('/dashboard.png', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.png'));
});
```

### 3. Link the PNG preview in the web dashboard

Add a small, optional preview image in `dashboard-web/index.html` that reloads after each browser refresh cycle, giving operators a quick visual check without connecting to the ESP32:

```html
<!-- In a future admin panel or debug view -->
<img id="bmp-preview" src="/dashboard.png" alt="Dashboard preview" style="width:400px;height:240px;">
```

## Files to Change

| File | Change |
|------|--------|
| `capture.ts` | Write `pngBuffer` to `output/dashboard.png`; copy to `dashboard.previous.png`; update `GenerateImageOptions` and return type |
| `server.ts` | Add `dashboard.png` and `dashboard.previous.png` to `ALLOWED_OUTPUT_FILES`; add `GET /dashboard.png` route |
| `tests/capture.test.js` | Add test: after `generateImage()`, `output/dashboard.png` exists and is a valid PNG |
| `tests/server.test.js` | Add test: `GET /dashboard.png` returns 200 with `Content-Type: image/png` |

## Verification

- After `pnpm run generate`, `output/dashboard.png` exists and is a valid PNG (`file output/dashboard.png` reports `PNG image data, 800 x 480`).
- On the second run, `output/dashboard.previous.png` is created before the new PNG is written.
- `GET /dashboard.png` returns `Content-Type: image/png` and a non-empty body.
- `pnpm test` passes with no regressions.
