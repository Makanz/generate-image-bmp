# Agent Guidelines for generate-image-bmp

## Project Overview

This is a Node.js console application that generates a dashboard BMP/PNG image (800x480) with system metrics. The frontend is served via Vite for development preview.

## Project Structure

```
generate-image-bmp/
├── capture.js          # Main Node.js script - generates dashboard image
├── dashboard-web/      # Frontend assets
│   ├── index.html      # Dashboard HTML (Swedish UI)
│   ├── script.js       # Frontend JavaScript
│   └── style.css       # Dashboard styles
├── output/             # Generated images go here
├── package.json
└── AGENTS.md
```

## Commands

### Installation
```bash
npm install
```

### Development
```bash
npm run dev          # Start Vite dev server for dashboard-web
```

### Build
```bash
npm run build        # Build dashboard-web for production
npm run preview      # Preview production build
```

### Image Generation
```bash
npm run generate     # Run capture.js to generate output/dashboard.png
```

### Testing
```bash
npm test             # Run tests (currently a placeholder)
```

To add real tests, install a testing framework:
```bash
npm install --save-dev jest
```

## Code Style Guidelines

### JavaScript (Node.js - capture.js)

- **Module System**: Use CommonJS (`require()` and `module.exports`)
- **Indentation**: 4 spaces
- **Semicolons**: Required
- **Async/Await**: Prefer async/await over raw Promises
- **Error Handling**: Always use `.catch()` for promises or try/catch in async functions
- **Constants**: UPPER_SNAKE_CASE for module-level constants (e.g., `WIDTH`, `HEIGHT`)

```javascript
// Good
const sharp = require('sharp');
const WIDTH = 800;

async function generateDashboardImage(options = {}) {
    try {
        await sharp(buffer).toFile(outputPath);
    } catch (error) {
        console.error('Failed to generate image:', error);
        throw error;
    }
}

module.exports = { generateDashboardImage };
```

### JavaScript (Frontend - dashboard-web/)

- **Module System**: Vanilla JS, no modules (script tag in HTML)
- **Indentation**: 4 spaces
- **Semicolons**: Required
- **Functions**: Named function declarations for top-level functions
- **Error Handling**: try/catch with empty catch blocks for expected failures

```javascript
// Good
function updateGauge(elementId, value, max, unit) {
    const gauge = document.getElementById(elementId);
    if (gauge) {
        gauge.querySelector('.gauge-value').textContent = value.toFixed(1) + unit;
    }
}

async function fetchSystemData() {
    try {
        const response = await fetch('/api/system');
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}
```

### CSS (style.css)

- **Indentation**: 4 spaces
- **Naming**: kebab-case for class names
- **Properties**: Alphabetical order within selectors (preferred)

```css
/* Good */
.dashboard {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
}

.gauge-fill {
    background: #000;
    height: 100%;
}
```

### HTML (index.html)

- **Lang attribute**: Use `lang="sv"` for Swedish
- **Semantic elements**: Use `<header>`, `<main>`, `<section>`, etc.
- **Indentation**: 4 spaces

### File Naming

- JavaScript files: `camelCase.js` (e.g., `capture.js`, `script.js`)
- CSS files: `kebab-case.css` (e.g., `style.css`)
- HTML files: `kebab-case.html` (e.g., `index.html`)

### SVG Generation

- Template literals for SVG string construction
- Use Swedish labels in generated SVGs to match frontend
- SVG dimensions match output: 800x480 pixels

## Dependencies

Key libraries used:
- `sharp` - Image processing (PNG output)
- `puppeteer`, `playwright` - Browser automation (optional)
- `jsdom` - DOM simulation (optional)
- `canvas` - Canvas API (optional)
- `vite` - Build tool for frontend

## Output

Generated images are saved to `output/dashboard.png`. Ensure the `output/` directory exists before generation.

## UI Language

The dashboard UI uses Swedish for labels:
- "Temperatur", "CPU", "Nätverk", "Disk"
- "Uppe" (up), "Nere" (down)
- "Användning" (usage), "Minne" (memory)
