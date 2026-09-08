const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Set the token BEFORE requiring the server so the module-level constant picks it up.
process.env.API_TOKEN = 'test-secret-token';

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
    isGenerating: jest.fn().mockReturnValue(false),
    getInFlightGeneration: jest.fn().mockReturnValue(null)
}));

jest.mock('../src/services/change-detection', () => ({
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
    resolvePublishedImagePath: jest.fn().mockResolvedValue(null),
    readOutputManifest: jest.fn().mockResolvedValue({ current: null, previous: null })
}));

describe('API token protection', () => {
    let app;
    let server;

    beforeAll(() => {
        process.env.PORT = '0';
        delete process.env.REFRESH_INTERVAL_MINUTES;
        jest.useFakeTimers();
        const mod = require('../server');
        app = mod.app;
        server = mod.server;
    });

    afterAll((done) => {
        jest.useRealTimers();
        server.close(done);
    });

    describe('POST /api/refresh', () => {
        test('rejects requests without a token header', async () => {
            const res = await request(app).post('/api/refresh');
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error', 'Unauthorized');
        });

        test('rejects requests with a wrong token', async () => {
            const res = await request(app)
                .post('/api/refresh')
                .set('X-Api-Token', 'wrong-token');
            expect(res.status).toBe(401);
        });

        test('accepts requests with the correct token', async () => {
            const res = await request(app)
                .post('/api/refresh')
                .set('X-Api-Token', 'test-secret-token');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });
    });

    describe('POST /api/refresh-interval', () => {
        test('rejects requests without a token header', async () => {
            const res = await request(app)
                .post('/api/refresh-interval')
                .send({ refreshInterval: 30 });
            expect(res.status).toBe(401);
        });

        test('accepts requests with the correct token', async () => {
            const res = await request(app)
                .post('/api/refresh-interval')
                .set('X-Api-Token', 'test-secret-token')
                .send({ refreshInterval: 30 });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });
    });

    describe('GET endpoints remain open', () => {
        test('GET /api/data does not require a token', async () => {
            const res = await request(app).get('/api/data');
            expect(res.status).toBe(200);
        });
    });
});
