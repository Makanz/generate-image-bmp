require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { generateImage, getChanges } = require('./capture');
const { fetchAllData, fetchAllDataFresh } = require('./src/services/data');

const app = express();
const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard-web')));

app.get('/api/data', async (req, res) => {
    try {
        const data = await fetchAllData();
        res.json(data);
    } catch (err) {
        console.error('Error fetching data:', err.message);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.get('/dashboard.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'output', 'dashboard.png'));
});

app.get('/dashboard.bmp', (req, res) => {
    res.sendFile(path.join(__dirname, 'output', 'dashboard.bmp'));
});

app.get('/dashboard.previous.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'output', 'dashboard.previous.png'));
});

app.get('/api/changes', async (req, res) => {
    try {
        const changes = await getChanges();
        res.json(changes);
    } catch (err) {
        console.error('Error getting changes:', err.message);
        res.status(500).json({ error: 'Failed to get changes' });
    }
});

app.post('/api/refresh', async (req, res) => {
    try {
        await fetchAllDataFresh();
        await generateImage();
        res.json({ ok: true, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('Image generation failed:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    console.log(`[cron] Fetching fresh data and generating image (every ${REFRESH_INTERVAL} min)...`);
    try {
        await fetchAllDataFresh();
        await generateImage();
        console.log('[cron] Image generated successfully.');
    } catch (err) {
        console.error('[cron] Image generation failed:', err.message);
    }
});

app.listen(PORT, async () => {
    console.log(`Dashboard server running on http://localhost:${PORT}`);
    setTimeout(async () => {
        console.log('[startup] Fetching fresh data and generating initial image...');
        try {
            await fetchAllDataFresh();
            await generateImage();
            console.log('[startup] Initial image ready.');
        } catch (err) {
            console.error('[startup] Image generation failed:', err.message);
        }
    }, 5000);
});
