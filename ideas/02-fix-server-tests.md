# High Impact: Fix server.test.js to Test the Real App

**Priority:** High
**Impact Areas:** Test coverage correctness, regression safety

## Problem

`tests/server.test.js` re-implements simplified routes from scratch instead of importing the real `app` export from `server.ts`. This means the following critical paths are currently **untested**:

- `withErrorHandling()` wrapper — the actual error boundary behavior
- `/output/:filename` security allowlist — path traversal protection
- `/api/image-region` endpoint — query param parsing and BMP region extraction
- `generateImageWhenReady()` — weather retry logic on startup

Any bug introduced in these areas will not be caught by the test suite.

## Solution

Import `app` from `server.ts` and use `supertest(app)` to test the real route handlers. Mock the same external dependencies (`data`, `capture`, `image-processing`) but let the actual Express routes run.

### Example structure

```js
const request = require('supertest');

jest.mock('../src/services/data');
jest.mock('../capture');

let app;

beforeEach(() => {
    jest.resetModules();
    app = require('../server').app;
});

test('GET /output/dashboard.bmp serves the file', async () => {
    const res = await request(app).get('/output/dashboard.bmp');
    expect(res.status).not.toBe(403);
});

test('GET /output/../server.ts is blocked', async () => {
    const res = await request(app).get('/output/../server.ts');
    expect(res.status).toBe(403);
});

test('withErrorHandling returns 500 on thrown error', async () => {
    const capture = require('../capture');
    capture.generateImage.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/api/refresh');
    expect(res.status).toBe(500);
});
```

## Files to Change

| File | Change |
|------|--------|
| `tests/server.test.js` | Rewrite to import real `app` and use `supertest` |
| `server.ts` | Ensure `app` is exported (may already be) |

## Coverage Gained

- Path traversal protection on `/output/:filename`
- `withErrorHandling()` error response shape
- `/api/image-region` query validation
- Weather retry loop in `generateImageWhenReady()`
