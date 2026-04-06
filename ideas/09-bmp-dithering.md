# Medium Impact: Configurable BMP Dithering

**Priority:** Medium
**Impact Areas:** Visual quality, e-paper rendering, image fidelity

## Problem

The current 1-bit BMP conversion in `capture.ts` uses a simple global threshold (`GREYSCALE_THRESHOLD = 128`):

```typescript
const greyscaleResult = await sharp(pngBuffer)
    .greyscale()
    .threshold(GREYSCALE_THRESHOLD)
    .raw()
    .toBuffer({ resolveWithObject: true });
```

A hard threshold maps every pixel to either fully black or fully white with no intermediate tones. This produces visually sharp results for text and icons, but performs poorly on:

- Anti-aliased text at small sizes (thin strokes disappear or bleed together)
- Weather icons that use gradients or semi-transparent fills
- Any future dashboard element using shades of grey

On a high-quality e-paper display, ordered or error-diffusion dithering can substantially improve perceived image quality at no cost in file size.

## Solution

### 1. Add a `DITHER_MODE` environment variable

Support three modes:

| Value | Behaviour |
|-------|-----------|
| `threshold` (default) | Current behaviour — hard global threshold at `GREYSCALE_THRESHOLD` |
| `ordered` | Bayer 4×4 ordered dithering (fast, deterministic, no artefacts between frames) |
| `floyd-steinberg` | Floyd-Steinberg error-diffusion dithering (highest quality, slower) |

### 2. Implement dithering in `src/image/bmp-writer.ts` or a new `src/image/dither.ts`

```typescript
export type DitherMode = 'threshold' | 'ordered' | 'floyd-steinberg';

/**
 * Converts a greyscale pixel buffer to 1-bit using the specified dither mode.
 * @param pixels  - Raw greyscale pixel data (1 byte per pixel).
 * @param width   - Image width in pixels.
 * @param height  - Image height in pixels.
 * @param mode    - Dithering algorithm to apply.
 * @param threshold - Hard threshold used in 'threshold' mode (0–255).
 */
export function ditherTo1Bit(
    pixels: Buffer,
    width: number,
    height: number,
    mode: DitherMode,
    threshold = 128
): Buffer {
    const out = Buffer.from(pixels);

    if (mode === 'threshold') {
        for (let i = 0; i < out.length; i++) {
            out[i] = out[i] >= threshold ? 255 : 0;
        }
        return out;
    }

    if (mode === 'ordered') {
        const BAYER4 = [
             0, 136,  34, 170,
            204,  68, 238, 102,
             51, 187,  17, 153,
            255, 119, 221,  85,
        ];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const bayer = BAYER4[(y % 4) * 4 + (x % 4)];
                out[i] = out[i] > bayer ? 255 : 0;
            }
        }
        return out;
    }

    if (mode === 'floyd-steinberg') {
        const f = new Float32Array(out);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const old = f[i];
                const nw = old >= 128 ? 255 : 0;
                f[i] = nw;
                const err = old - nw;
                if (x + 1 < width)             f[i + 1]         += err * 7 / 16;
                if (y + 1 < height) {
                    if (x > 0)                 f[i + width - 1] += err * 3 / 16;
                                               f[i + width]     += err * 5 / 16;
                    if (x + 1 < width)         f[i + width + 1] += err * 1 / 16;
                }
            }
        }
        for (let i = 0; i < out.length; i++) {
            out[i] = f[i] >= 128 ? 255 : 0;
        }
        return out;
    }

    return out;
}
```

### 3. Use `ditherTo1Bit()` in `capture.ts`

Replace the `sharp().threshold()` pipeline with a raw greyscale capture followed by `ditherTo1Bit()`:

```typescript
import { ditherTo1Bit } from './src/image/dither';

const mode = (process.env.DITHER_MODE || 'threshold') as DitherMode;

const greyscaleResult = await sharp(pngBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

const dithered = ditherTo1Bit(
    greyscaleResult.data,
    greyscaleResult.info.width,
    greyscaleResult.info.height,
    mode,
    GREYSCALE_THRESHOLD
);

await writeBmp(greyscaleResult.info.width, greyscaleResult.info.height, dithered, outputBmp);
```

## Files to Change

| File | Change |
|------|--------|
| `capture.ts` | Replace `sharp().threshold()` with `ditherTo1Bit()` call; read `DITHER_MODE` env var |
| `src/image/dither.ts` | New: `ditherTo1Bit()` implementing threshold, ordered, and Floyd-Steinberg modes |
| `src/utils/constants.ts` | Export `DITHER_MODE` default and `DitherMode` type |
| `tests/capture.test.js` | Add tests for each dither mode producing correct 1-bit output |

## Verification

- With `DITHER_MODE=threshold` (default), output is identical to the current behaviour.
- With `DITHER_MODE=ordered`, the BMP contains a regular crosshatch pattern in grey areas.
- With `DITHER_MODE=floyd-steinberg`, grey anti-aliased text produces a finer dot pattern.
- All modes produce a valid 1-bit BMP that the ESP32 can parse without errors.
- `pnpm test` passes for all three modes.
