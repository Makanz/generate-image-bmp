const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

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
    generateImage: jest.fn().mockResolvedValue({ png: 'output/dashboard.png', bmp: 'output/dashboard.bmp' }),
    getChanges: jest.fn().mockResolvedValue({
        changes: [],
        currentChecksum: 'sha256:abc123',
        previousChecksum: 'sha256:def456',
        timestamp: '2024-01-01T00:00:00.000Z'
    })
}));

describe('server.js - API endpoints', () => {
    let app;
    let server;

    beforeAll(async () => {
        process.env.PORT = '0';
        delete process.env.REFRESH_INTERVAL_MINUTES;
        delete process.env.N8N_WEBHOOK_WEATHER;
        delete process.env.N8N_WEBHOOK_CALENDAR;
        delete process.env.N8N_WEBHOOK_LUNCH;
        delete process.env.N8N_WEBHOOK_INDOOR;

        const express = require('express');
        const { fetchAllData, fetchAllDataFresh, fetchWeatherFresh } = require('../src/services/data');
        const { generateImage, getChanges } = require('../capture');

        app = express();
        app.use(express.static(path.join(__dirname, '..', 'dashboard-web')));

        app.get('/api/data', async (req, res) => {
            try {
                const data = await fetchAllData();
                res.json(data);
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch data' });
            }
        });

        app.get('/api/changes', async (req, res) => {
            try {
                const changes = await getChanges();
                res.json(changes);
            } catch (err) {
                res.status(500).json({ error: 'Failed to get changes' });
            }
        });

        app.post('/api/refresh', async (req, res) => {
            try {
                await fetchAllDataFresh();
                await generateImage();
                res.json({ ok: true, timestamp: new Date().toISOString() });
            } catch (err) {
                res.status(500).json({ ok: false, error: err.message });
            }
        });
    });

    describe('GET /api/data', () => {
        test('returns JSON with all data sources', async () => {
            const response = await request(app).get('/api/data');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('weather');
            expect(response.body).toHaveProperty('calendar');
            expect(response.body).toHaveProperty('lunch');
            expect(response.body).toHaveProperty('indoor');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('returns 500 on error', async () => {
            const { fetchAllData } = require('../src/services/data');
            fetchAllData.mockRejectedValueOnce(new Error('API error'));

            const response = await request(app).get('/api/data');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /api/changes', () => {
        test('returns changes with checksums', async () => {
            const response = await request(app).get('/api/changes');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('changes');
            expect(response.body).toHaveProperty('currentChecksum');
            expect(response.body).toHaveProperty('previousChecksum');
            expect(response.body).toHaveProperty('timestamp');
        });

        test('returns 500 on error', async () => {
            const { getChanges } = require('../capture');
            getChanges.mockRejectedValueOnce(new Error('File error'));

            const response = await request(app).get('/api/changes');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /api/refresh', () => {
        test('returns ok true on success', async () => {
            const response = await request(app).post('/api/refresh');
            expect(response.status).toBe(200);
            expect(response.body.ok).toBe(true);
            expect(response.body).toHaveProperty('timestamp');
        });

        test('returns error on failure', async () => {
            const { generateImage } = require('../capture');
            generateImage.mockRejectedValueOnce(new Error('Generation failed'));

            const response = await request(app).post('/api/refresh');
            expect(response.status).toBe(500);
            expect(response.body.ok).toBe(false);
        });
    });
});
