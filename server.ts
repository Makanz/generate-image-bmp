import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import cron from 'node-cron';
import sharp from 'sharp';
import { generateImage, getChanges } from './capture';
import { fetchAllData, fetchAllDataFresh, fetchWeatherFresh } from './src/services/data';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10);
// When compiled to dist/, __dirname is dist/ — step up to project root
const APP_ROOT = __filename.endsWith('.ts') ? __dirname : path.join(__dirname, '..');

const WEATHER_ENSURE_RETRIES = 3;
const WEATHER_ENSURE_DELAY_MS = 3000;

async function generateImageWhenReady(): Promise<void> {
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


app.use(express.static(path.join(APP_ROOT, 'dashboard-web')));

app.get('/api/data', async (_req: Request, res: Response) => {
    try {
        const data = await fetchAllData();
        res.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error fetching data:', message);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.get('/dashboard.png', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.png'));
});

app.get('/dashboard.bmp', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.bmp'));
});

app.get('/dashboard.previous.png', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.previous.png'));
});

app.get('/api/changes', async (_req: Request, res: Response) => {
    try {
        const changes = await getChanges();
        res.json(changes);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error getting changes:', message);
        res.status(500).json({ error: 'Failed to get changes' });
    }
});

app.get('/api/image-region', async (req: Request, res: Response) => {
    try {
        const { x, y, w, h } = req.query;

        const imagePath = path.join(APP_ROOT, 'output', 'dashboard.png');
        
        const left = parseInt(x as string, 10) || 0;
        const top = parseInt(y as string, 10) || 0;
        const width = parseInt(w as string, 10);
        const height = parseInt(h as string, 10);

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
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error getting image region:', message);
        res.status(500).json({ error: 'Failed to get image region' });
    }
});

app.post('/api/refresh', async (_req: Request, res: Response) => {
    try {
        await fetchAllDataFresh();
        await generateImageWhenReady();
        res.json({ ok: true, timestamp: new Date().toISOString() });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Image generation failed:', message);
        res.status(500).json({ ok: false, error: message });
    }
});

cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    console.log(`[cron] Fetching fresh data and generating image (every ${REFRESH_INTERVAL} min)...`);
    try {
        await fetchAllDataFresh();
        await generateImageWhenReady();
        console.log('[cron] Image generated successfully.');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[cron] Image generation failed:', message);
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
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('[startup] Image generation failed:', message);
        }
    }, 5000);
});

export { app };
