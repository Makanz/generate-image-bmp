const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('dotenv/config', () => ({}));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

jest.mock('../src/services/data', () => ({
    fetchAllData: jest.fn().mockResolvedValue({
        weather: { outdoor: { current: 20 }, current_weather_code: 1 },
        calendar: { events: [] },
        lunch: [{ datum: 'Monday', meny: ['Soup'] }],
        indoor: { current: 21, rooms: [] },
        timestamp: '2024-01-01T00:00:00.000Z'
    }),
    fetchAllDataFresh: jest.fn().mockResolvedValue({}),
    fetchWeatherFresh: jest.fn().mockResolvedValue({ outdoor: { current: 20 } })
}));

jest.mock('../capture', () => ({
    generateImage: jest.fn().mockResolvedValue({ bmp: 'output/dashboard.bmp' }),
    getChanges: jest.fn().mockResolvedValue({
        changes: [],
        currentChecksum: 'sha256:abc123',
        previousChecksum: 'sha256:def456',
        timestamp: '2024-01-01T00:00:00.000Z'
    })
}));

jest.mock('../src/services/image-processing', () => ({
    extractRegion: jest.fn().mockResolvedValue(Buffer.from('BM'))
}));

jest.mock('../src/utils/output-manifest', () => ({
    resolvePublishedImagePath: jest.fn().mockResolvedValue(null)
}));

describe('isQuietHours()', () => {
    let isQuietHours;

    beforeAll(() => {
        isQuietHours = require('../server').isQuietHours;
    });

    afterEach(() => {
        delete process.env.QUIET_HOURS_START;
        delete process.env.QUIET_HOURS_END;
    });

    test('returns false when vars are not set', () => {
        expect(isQuietHours(2)).toBe(false);
    });

    test('returns false when only one var is set', () => {
        process.env.QUIET_HOURS_START = '23';
        expect(isQuietHours(2)).toBe(false);
    });

    describe('midnight-wrapping range (23–6)', () => {
        beforeEach(() => {
            process.env.QUIET_HOURS_START = '23';
            process.env.QUIET_HOURS_END = '6';
        });

        test('returns true at 01:00 (inside range)', () => {
            expect(isQuietHours(1)).toBe(true);
        });

        test('returns true at 23:00 (start boundary)', () => {
            expect(isQuietHours(23)).toBe(true);
        });

        test('returns true at 05:00 (just before end)', () => {
            expect(isQuietHours(5)).toBe(true);
        });

        test('returns false at 06:00 (end boundary — resume)', () => {
            expect(isQuietHours(6)).toBe(false);
        });

        test('returns false at 12:00 (outside range)', () => {
            expect(isQuietHours(12)).toBe(false);
        });
    });

    describe('non-wrapping range (1–6)', () => {
        beforeEach(() => {
            process.env.QUIET_HOURS_START = '1';
            process.env.QUIET_HOURS_END = '6';
        });

        test('returns true at 03:00 (inside range)', () => {
            expect(isQuietHours(3)).toBe(true);
        });

        test('returns false at 23:00 (outside range)', () => {
            expect(isQuietHours(23)).toBe(false);
        });

        test('returns true at 01:00 (start boundary)', () => {
            expect(isQuietHours(1)).toBe(true);
        });

        test('returns false at 06:00 (end boundary — resume)', () => {
            expect(isQuietHours(6)).toBe(false);
        });
    });
});

describe('frontend asset serving helpers', () => {
    let resolveFrontendRoot;
    let setFrontendCacheHeaders;
    let tempRoot;

    beforeAll(() => {
        const serverModule = require('../server');
        resolveFrontendRoot = serverModule.resolveFrontendRoot;
        setFrontendCacheHeaders = serverModule.setFrontendCacheHeaders;
    });

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-root-'));
        fs.mkdirSync(path.join(tempRoot, 'dashboard-web'), { recursive: true });
        fs.writeFileSync(path.join(tempRoot, 'dashboard-web', 'index.html'), '<!doctype html><title>Source</title>');
    });

    afterEach(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('prefers the built frontend when dashboard-web/dist/index.html exists', () => {
        const builtRoot = path.join(tempRoot, 'dashboard-web', 'dist');
        fs.mkdirSync(builtRoot, { recursive: true });
        fs.writeFileSync(path.join(builtRoot, 'index.html'), '<!doctype html><title>Built</title>');

        expect(resolveFrontendRoot(tempRoot)).toBe(builtRoot);
    });

    test('falls back to dashboard-web when no built index exists', () => {
        expect(resolveFrontendRoot(tempRoot)).toBe(path.join(tempRoot, 'dashboard-web'));
    });

    test('uses immutable cache headers for built js and css assets', () => {
        const headers = new Map();
        const builtRoot = path.join(tempRoot, 'dashboard-web', 'dist');
        const res = {
            setHeader: (key, value) => headers.set(key, value)
        };

        setFrontendCacheHeaders(res, builtRoot, path.join(builtRoot, 'assets', 'index.js'));
        expect(headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

        headers.clear();
        setFrontendCacheHeaders(res, builtRoot, path.join(builtRoot, 'assets', 'index.css'));
        expect(headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    });

    test('uses no-cache for built html files only', () => {
        const headers = new Map();
        const builtRoot = path.join(tempRoot, 'dashboard-web', 'dist');
        const res = {
            setHeader: (key, value) => headers.set(key, value)
        };

        setFrontendCacheHeaders(res, builtRoot, path.join(builtRoot, 'index.html'));
        expect(headers.get('Cache-Control')).toBe('no-cache');

        headers.clear();
        setFrontendCacheHeaders(res, path.join(tempRoot, 'dashboard-web'), path.join(tempRoot, 'dashboard-web', 'script.ts'));
        expect(headers.has('Cache-Control')).toBe(false);
    });
});

describe('server - API endpoints', () => {
    let app;
    let server;
    let tempDir;
    let currentBmpPath;
    let previousBmpPath;

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-images-'));
        currentBmpPath = path.join(tempDir, 'dashboard-current.bmp');
        previousBmpPath = path.join(tempDir, 'dashboard-previous.bmp');
        fs.writeFileSync(currentBmpPath, 'BM');
        fs.writeFileSync(previousBmpPath, 'BM');

        process.env.PORT = '0';
        delete process.env.REFRESH_INTERVAL_MINUTES;
        delete process.env.N8N_WEBHOOK_WEATHER;
        delete process.env.N8N_WEBHOOK_CALENDAR;
        delete process.env.N8N_WEBHOOK_LUNCH;
        delete process.env.N8N_WEBHOOK_INDOOR;

        jest.useFakeTimers();
        const { resolvePublishedImagePath } = require('../src/utils/output-manifest');
        resolvePublishedImagePath.mockImplementation(async (_outputDir, which) => {
            if (which === 'current') {
                return currentBmpPath;
            }
            if (which === 'previous') {
                return previousBmpPath;
            }
            return null;
        });
        const mod = require('../server');
        app = mod.app;
        server = mod.server;
    });

    afterAll((done) => {
        jest.useRealTimers();
        fs.rmSync(tempDir, { recursive: true, force: true });
        server.close(done);
    });

    describe('GET /api/data', () => {
        test('returns JSON with all data sources', async () => {
            const res = await request(app).get('/api/data');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('weather');
            expect(res.body).toHaveProperty('calendar');
            expect(res.body).toHaveProperty('lunch');
            expect(res.body).toHaveProperty('indoor');
            expect(res.body).toHaveProperty('timestamp');
        });

        test('returns 500 with generic error message on failure', async () => {
            const { fetchAllData } = require('../src/services/data');
            fetchAllData.mockRejectedValueOnce(new Error('API error'));

            const res = await request(app).get('/api/data');
            expect(res.status).toBe(500);
            expect(res.body).toHaveProperty('error', 'Internal server error');
        });
    });

    describe('GET /', () => {
        test('returns the dashboard html', async () => {
            const res = await request(app).get('/');
            expect(res.status).toBe(200);
            expect(res.text).toContain('<title>Dashboard</title>');
        });
    });

    describe('GET /api/changes', () => {
        test('returns changes with checksums', async () => {
            const res = await request(app).get('/api/changes');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('changes');
            expect(res.body).toHaveProperty('currentChecksum');
            expect(res.body).toHaveProperty('previousChecksum');
            expect(res.body).toHaveProperty('timestamp');
        });

        test('returns 500 with generic error message on failure', async () => {
            const { getChanges } = require('../capture');
            getChanges.mockRejectedValueOnce(new Error('File error'));

            const res = await request(app).get('/api/changes');
            expect(res.status).toBe(500);
            expect(res.body).toHaveProperty('error', 'Internal server error');
        });
    });

    describe('POST /api/refresh', () => {
        test('returns ok true on success', async () => {
            const res = await request(app).post('/api/refresh');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body).toHaveProperty('timestamp');
        });

        test('withErrorHandling returns 500 with generic message on failure', async () => {
            const { generateImage } = require('../capture');
            generateImage.mockRejectedValueOnce(new Error('Generation failed'));

            const res = await request(app).post('/api/refresh');
            expect(res.status).toBe(500);
            expect(res.body).toHaveProperty('error', 'Internal server error');
            expect(res.body).not.toHaveProperty('ok');
        });
    });

    describe('GET /output/:filename', () => {
        test('blocks filenames not in the allowlist with 404', async () => {
            const res = await request(app).get('/output/malicious.txt');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error', 'File not found');
        });

        test('blocks filenames with path separators', async () => {
            const res = await request(app).get('/output/..%2Fserver.ts');
            expect(res.status).toBe(404);
        });

        test('serves dashboard.bmp through the current manifest alias', async () => {
            const res = await request(app).get('/output/dashboard.bmp');
            expect(res.status).toBe(200);
        });

        test('serves dashboard.previous.bmp through the previous manifest alias', async () => {
            const res = await request(app).get('/output/dashboard.previous.bmp');
            expect(res.status).toBe(200);
        });
    });

    describe('GET /dashboard.bmp and /dashboard.previous.bmp', () => {
        test('serves the current published image', async () => {
            const res = await request(app).get('/dashboard.bmp');
            expect(res.status).toBe(200);
        });

        test('returns 404 before the first image has been published', async () => {
            const { resolvePublishedImagePath } = require('../src/utils/output-manifest');
            resolvePublishedImagePath.mockResolvedValueOnce(null);

            const res = await request(app).get('/dashboard.bmp');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error', 'Image not generated yet');
        });

        test('serves the previous published image', async () => {
            const res = await request(app).get('/dashboard.previous.bmp');
            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/image-region', () => {
        test('returns 400 when w or h is missing', async () => {
            const res = await request(app).get('/api/image-region?x=0&y=0&w=100');
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error', 'Missing or invalid w, h parameters');
        });

        test('returns 400 when both w and h are missing', async () => {
            const res = await request(app).get('/api/image-region');
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error', 'Missing or invalid w, h parameters');
        });

        test('returns BMP buffer with valid params', async () => {
            const { extractRegion } = require('../src/services/image-processing');
            const res = await request(app).get('/api/image-region?x=0&y=0&w=100&h=50');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/image\/bmp/);
            expect(extractRegion).toHaveBeenCalledWith(currentBmpPath, 0, 0, 100, 50);
        });
    });
});

