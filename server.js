require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const sharp = require('sharp');
const { generateImage, getChanges } = require('./capture');
const { fetchAllData, fetchAllDataFresh, fetchWeatherFresh } = require('./src/services/data');

const app = express();
const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10);

const WEATHER_ENSURE_RETRIES = 3;
const WEATHER_ENSURE_DELAY_MS = 3000;

async function generateImageWhenReady() {
    let weather = (await fetchAllData()).weather;
    for (let i = 0; i < WEATHER_ENSURE_RETRIES && (weather?.outdoor?.current == null); i++) {
        console.warn(`[server] Väderdata saknas, försöker hämta igen (${i + 1}/${WEATHER_ENSURE_RETRIES})...`);
        await new Promise(r => setTimeout(r, WEATHER_ENSURE_DELAY_MS));
        weather = await fetchWeatherFresh();
    }
    if (weather?.outdoor?.current == null) {
        console.warn('[server] Väderdata fortfarande otillgänglig, genererar bild ändå');
    }
    await generateImage();
}


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

app.get('/api/image-region', async (req, res) => {
    try {
        const { x, y, w, h } = req.query;

        const imagePath = path.join(__dirname, 'output', 'dashboard.png');
        
        const left = parseInt(x, 10) || 0;
        const top = parseInt(y, 10) || 0;
        const width = parseInt(w, 10);
        const height = parseInt(h, 10);

        if (!width || !height) {
            return res.status(400).json({ error: 'Missing or invalid w, h parameters' });
        }

        const regionBuffer = await sharp(imagePath)
            .extract({ left, top, width, height })
            .png()
            .toBuffer();

        const format = req.query.format || 'base64';
        if (format === 'base64') {
            res.json({ 
                image: `data:image/png;base64,${regionBuffer.toString('base64')}`
            });
        } else {
            res.set('Content-Type', 'image/png');
            res.send(regionBuffer);
        }
    } catch (err) {
        console.error('Error getting image region:', err.message);
        res.status(500).json({ error: 'Failed to get image region' });
    }
});

app.post('/api/refresh', async (req, res) => {
    try {
        await fetchAllDataFresh();
        await generateImageWhenReady();
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
        await generateImageWhenReady();
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
            await generateImageWhenReady();
            console.log('[startup] Initial image ready.');
        } catch (err) {
            console.error('[startup] Image generation failed:', err.message);
        }
    }, 5000);
});
