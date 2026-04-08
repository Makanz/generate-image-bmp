# High Impact: Serve the Built Dashboard Bundle in Production

**Priority:** High
**Impact Areas:** Reliability, performance, deployment consistency

## Problem

`server.ts` serves the raw `dashboard-web` source directory directly:

```typescript
app.use(express.static(path.join(APP_ROOT, 'dashboard-web')));
```

But `dashboard-web/index.html` references a TypeScript entry file:

```html
<script type="module" src="script.ts"></script>
```

And `vite.config.js` already builds the frontend into `dist`:

```typescript
export default defineConfig({
    root: 'dashboard-web',
    build: {
        outDir: 'dist'
    }
});
```

So the current server path ignores the actual Vite output and exposes source assets instead of the production bundle. That costs the project in three ways:

1. A plain Express deployment can end up serving raw TypeScript that the browser cannot execute directly.
2. The build step produces optimized assets that are never used by the server.
3. Production responses miss hashed filenames and cache-friendly delivery that Vite already provides.

## Solution

### 1. Resolve the frontend root dynamically in `server.ts`

Prefer `dist/` when it exists, and fall back to `dashboard-web/` only for local development.

```typescript
import fs from 'fs';

function resolveFrontendRoot(appRoot: string): string {
    const builtRoot = path.join(appRoot, 'dist');
    if (fs.existsSync(path.join(builtRoot, 'index.html'))) {
        return builtRoot;
    }

    return path.join(appRoot, 'dashboard-web');
}

const FRONTEND_ROOT = resolveFrontendRoot(APP_ROOT);
app.use(express.static(FRONTEND_ROOT));
```

This aligns the runtime with the existing Vite build instead of bypassing it.

### 2. Serve `index.html` explicitly from the resolved frontend root

Make the root route deterministic and avoid accidental coupling to Express static-directory defaults.

```typescript
app.get('/', (_req, res) => {
    res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});
```

If the built bundle exists, the server returns the compiled HTML that points to Vite's generated JS files. If not, development still works with the source tree.

### 3. Add cache headers for built assets only

Once the app serves Vite output, static JS/CSS assets can use aggressive immutable caching while `index.html` stays fresh.

```typescript
app.use(express.static(FRONTEND_ROOT, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
        }

        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));
```

That reduces repeat downloads in browser previews without making deployments sticky to old HTML.

### 4. Make the build/start workflow explicit in docs and scripts

The server should document that production mode serves `dist/` and that `pnpm run build` is the step that prepares those assets.

```json
{
  "scripts": {
    "build": "tsc && vite build dashboard-web",
    "start": "ts-node --transpile-only server.ts"
  }
}
```

If desired, add a `start:prod` entry later that runs from compiled backend output and assumes `dist/` already exists.

## Files to Change

| File | Change |
| ---- | ------ |
| `server.ts` | Resolve and serve `dist/` when available, with explicit root route and cache headers |
| `vite.config.js` | Keep output layout aligned with the server's resolved static root |
| `README.md` | Document development vs production asset serving |
| `tests/server.test.js` | Add coverage that the root route serves the built frontend when `dist/index.html` exists |

## Verification

- After `pnpm run build`, starting the server serves `dist/index.html` and compiled JS assets instead of raw `dashboard-web/script.ts`.
- With no build output present, local development still serves the source frontend as it does today.
- Built JS and CSS assets are returned with long-lived cache headers, while `index.html` is returned with `no-cache`.
- `pnpm test` passes with new coverage for frontend-root resolution.
