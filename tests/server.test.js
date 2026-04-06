const request = require('supertest');

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

describe('server - API endpoints', () => {
    let app;
    let server;

    beforeAll(() => {
        process.env.PORT = '0';
        delete process.env.REFRESH_INTERVAL_MINUTES;
        delete process.env.N8N_WEBHOOK_WEATHER;
        delete process.env.N8N_WEBHOOK_CALENDAR;
        delete process.env.N8N_WEBHOOK_LUNCH;
        delete process.env.N8N_WEBHOOK_INDOOR;

        jest.useFakeTimers();
        const mod = require('../server');
        app = mod.app;
        server = mod.server;
    });

    afterAll((done) => {
        jest.useRealTimers();
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

        test('allows dashboard.bmp (allowlisted)', async () => {
            // File may not exist in test env, so 404 from sendFile is acceptable — not a 403/allowlist block
            const res = await request(app).get('/output/dashboard.bmp');
            expect(res.status).not.toBe(403);
            expect(res.body.error).not.toBe('File not found');
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
            const res = await request(app).get('/api/image-region?x=0&y=0&w=100&h=50');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/image\/bmp/);
        });
    });
});

