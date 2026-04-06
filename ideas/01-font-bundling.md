# High Impact: Bundle Roboto Font Locally

**Priority:** High
**Impact Areas:** Reliability, offline support, screenshot consistency

## Problem

`index.html` loads Roboto from the Google Fonts CDN:

```html
<link href="https://fonts.googleapis.com/css?family=Roboto:400,700,900&display=swap" rel="stylesheet">
```

If the CDN is unavailable (Docker without internet, offline deployment, network hiccup), the font silently falls back to a system font. Playwright captures the screenshot regardless — but the BMP output will have layout shifts and inconsistent rendering on the ESP32 e-paper display.

## Solution

1. Download `Roboto-Regular.woff2`, `Roboto-Bold.woff2`, and `Roboto-Black.woff2` (weights 400, 700, 900) and place them in `dashboard-web/fonts/`.

2. Add `@font-face` declarations in `style.css`:

```css
@font-face {
    font-family: 'Roboto';
    font-style: normal;
    font-weight: 400;
    src: url('fonts/Roboto-Regular.woff2') format('woff2');
}

@font-face {
    font-family: 'Roboto';
    font-style: normal;
    font-weight: 700;
    src: url('fonts/Roboto-Bold.woff2') format('woff2');
}

@font-face {
    font-family: 'Roboto';
    font-style: normal;
    font-weight: 900;
    src: url('fonts/Roboto-Black.woff2') format('woff2');
}
```

3. Remove the Google Fonts `<link>` from `index.html`.

## Files to Change

| File | Change |
|------|--------|
| `dashboard-web/index.html` | Remove CDN `<link>` tag |
| `dashboard-web/style.css` | Add `@font-face` declarations |
| `dashboard-web/fonts/` | Add `Roboto-Regular.woff2`, `Roboto-Bold.woff2`, `Roboto-Black.woff2` |

## Verification

- Run `pnpm run generate` with network access blocked and confirm the BMP output looks identical to the connected version.
- Check Playwright screenshot in `output/dashboard.png` for correct font rendering.
