import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import cron from 'node-cron';
import { extractRegion } from './src/services/image-processing';
import { generateImage, getChanges } from './capture';
import { fetchAllData, fetchAllDataFresh, fetchWeatherFresh, restoreCache } from './src/services/data';
import { handleApiError } from './src/utils/errors';
import { getAppRoot } from './src/utils/path';
import { SERVER_STARTUP_DELAY_MS } from './src/utils/constants';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10);
const APP_ROOT = getAppRoot();

const WEATHER_ENSURE_RETRIES = 3;
const WEATHER_ENSURE_DELAY_MS = 3000;
const ALLOWED_OUTPUT_FILES = ['dashboard.bmp', 'dashboard.previous.bmp'];

async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function generateImageWhenReady(): Promise<void> {
    let weather = (await fetchAllData()).weather;
    for (let i = 0; i < WEATHER_ENSURE_RETRIES && (weather?.outdoor?.current == null); i++) {
        console.warn(`[server] Väderdata saknas, försöker hämta igen (${i + 1}/${WEATHER_ENSURE_RETRIES})...`);
        await sleep(WEATHER_ENSURE_DELAY_MS);
        weather = await fetchWeatherFresh();
    }
    if (weather?.outdoor?.current == null) {
        console.warn('[server] Väderdata fortfarande otillgänglig, genererar bild ändå');
    }
    await generateImage();
}

function withErrorHandling(context: string, handler: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        try {
            await handler(req, res);
        } catch (err: unknown) {
            handleApiError(context, err);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

app.use(express.static(path.join(APP_ROOT, 'dashboard-web')));

app.get('/api/data', withErrorHandling('Error fetching data', async (_req, res) => {
    const data = await fetchAllData();
    res.json(data);
}));

app.get('/output/:filename', (_req: Request, res: Response) => {
    const filename = Array.isArray(_req.params.filename) ? _req.params.filename[0] : _req.params.filename;
    if (!ALLOWED_OUTPUT_FILES.includes(filename)) {
        return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(path.join(APP_ROOT, 'output', filename));
});

app.get('/dashboard.bmp', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.bmp'));
});

app.get('/dashboard.previous.bmp', (_req: Request, res: Response) => {
    res.sendFile(path.join(APP_ROOT, 'output', 'dashboard.previous.bmp'));
});

app.get('/api/changes', withErrorHandling('Error getting changes', async (_req, res) => {
    const changes = await getChanges();
    res.json(changes);
}));

app.get('/api/image-region', withErrorHandling('Error getting image region', async (req, res) => {
    const { x, y, w, h } = req.query;

    const imagePath = path.join(APP_ROOT, 'output', 'dashboard.bmp');

    const left = parseInt(x as string, 10) || 0;
    const top = parseInt(y as string, 10) || 0;
    const width = parseInt(w as string, 10);
    const height = parseInt(h as string, 10);

    if (!width || !height) {
        res.status(400).json({ error: 'Missing or invalid w, h parameters' });
        return;
    }

    const regionBuffer = await extractRegion(imagePath, left, top, width, height);
    res.set('Content-Type', 'image/bmp');
    res.send(regionBuffer);
}));

app.post('/api/refresh', withErrorHandling('Image generation failed', async (_req, res) => {
    await fetchAllDataFresh();
    await generateImageWhenReady();
    res.json({ ok: true, timestamp: new Date().toISOString() });
}));

async function scheduledImageGeneration(): Promise<void> {
    console.log(`[cron] Fetching fresh data and generating image (every ${REFRESH_INTERVAL} min)...`);
    await fetchAllDataFresh();
    await generateImageWhenReady();
    console.log('[cron] Image generated successfully.');
}

export function isQuietHours(hour: number = new Date().getHours()): boolean {
    const start = parseInt(process.env.QUIET_HOURS_START || '', 10);
    const end   = parseInt(process.env.QUIET_HOURS_END   || '', 10);

    if (isNaN(start) || isNaN(end)) return false;

    if (start < end) {
        return hour >= start && hour < end;
    }
    // Wraps midnight (e.g. 23–06)
    return hour >= start || hour < end;
}

let wasInQuietHours = false;

cron.schedule(`*/${REFRESH_INTERVAL} * * * *`, async () => {
    const quiet = isQuietHours();
    if (!wasInQuietHours && quiet) {
        console.log('[cron] Stilla timmar börjar — genererar sista bild...');
        try {
            await scheduledImageGeneration();
        } catch (err: unknown) {
            handleApiError('[cron] Final quiet-hours image failed', err);
        }
    }
    wasInQuietHours = quiet;
    if (quiet) {
        console.log('[cron] Stilla timmar aktiva — hoppar över generering.');
        return;
    }
    try {
        await scheduledImageGeneration();
    } catch (err: unknown) {
        handleApiError('[cron] Image generation failed', err);
    }
});

const server = app.listen(PORT, async () => {
    console.log(`Dashboard server running on http://localhost:${PORT}`);
    setTimeout(async () => {
        await restoreCache();
        console.log('[startup] Fetching fresh data and generating initial image...');
        try {
            await fetchAllDataFresh();
            await generateImageWhenReady();
            console.log('[startup] Initial image ready.');
        } catch (err: unknown) {
            handleApiError('[startup] Image generation failed', err);
        }
    }, SERVER_STARTUP_DELAY_MS);
});

export { app, server };
