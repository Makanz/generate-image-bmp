import 'dotenv/config';
import express, { type Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { extractRegion } from './src/services/image-processing';
import { generateImage, getChanges } from './capture';
import { fetchAllData, fetchAllDataFresh, fetchWeatherFresh, restoreCache } from './src/services/data';
import { handleApiError } from './src/utils/errors';
import { resolvePublishedImagePath, readOutputManifest } from './src/utils/output-manifest';
import { getAppRoot } from './src/utils/path';
import { SERVER_STARTUP_DELAY_MS } from './src/utils/constants';

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Dashboard BMP API',
            version: '1.0.0',
            description: 'API for ESP32 e-paper dashboard image generation. Provides weather, calendar, lunch data and BMP image generation for 800x480 e-paper displays.',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
        components: {
            schemas: {
                WeatherData: {
                    type: 'object',
                    properties: {
                        outdoor: {
                            type: 'object',
                            properties: {
                                current: { type: 'number', nullable: true },
                                forecast: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            max: { type: 'number' },
                                            min: { type: 'number', nullable: true },
                                            precipitation_probability: { type: 'number', nullable: true },
                                            weather_code: { type: 'number', nullable: true },
                                        },
                                    },
                                },
                            },
                        },
                        current_weather_code: { type: 'number', nullable: true },
                        wind_speed: { type: 'number', nullable: true },
                        humidity: { type: 'number', nullable: true },
                    },
                },
                CalendarData: {
                    type: 'object',
                    properties: {
                        events: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    datetime: { type: 'string' },
                                    date: { type: 'string' },
                                    summary: { type: 'string' },
                                    title: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                LunchItem: {
                    type: 'object',
                    properties: {
                        datum: { type: 'string' },
                        meny: { type: 'array', items: { type: 'string' } },
                    },
                },
                IndoorData: {
                    type: 'object',
                    properties: {
                        current: { type: 'number' },
                        rooms: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    temp: { type: 'number', nullable: true },
                                },
                            },
                        },
                    },
                },
                DashboardData: {
                    type: 'object',
                    properties: {
                        weather: { $ref: '#/components/schemas/WeatherData' },
                        calendar: { $ref: '#/components/schemas/CalendarData' },
                        lunch: { type: 'array', items: { $ref: '#/components/schemas/LunchItem' } },
                        indoor: { $ref: '#/components/schemas/IndoorData' },
                        timestamp: { type: 'string' },
                    },
                },
                ChangeRegion: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        width: { type: 'number' },
                        height: { type: 'number' },
                    },
                },
                ChangesResponse: {
                    type: 'object',
                    properties: {
                        changes: { type: 'array', items: { $ref: '#/components/schemas/ChangeRegion' } },
                        currentChecksum: { type: 'string', nullable: true },
                        previousChecksum: { type: 'string', nullable: true },
                        timestamp: { type: 'string' },
                        refreshInterval: { type: 'number' },
                    },
                },
                RefreshResponse: {
                    type: 'object',
                    properties: {
                        ok: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
                RefreshIntervalRequest: {
                    type: 'object',
                    required: ['refreshInterval'],
                    properties: {
                        refreshInterval: { type: 'number', minimum: 1, maximum: 3600 },
                    },
                },
                RefreshIntervalResponse: {
                    type: 'object',
                    properties: {
                        ok: { type: 'boolean' },
                        newInterval: { type: 'number' },
                    },
                },
            },
        },
    },
    apis: ['./server.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

const app: Express = express();
app.use(express.json()); // Parse JSON bodies
const PORT = parseInt(process.env.PORT || '3000', 10);
let refreshInterval = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10) * 60;
const APP_ROOT = getAppRoot();
const OUTPUT_DIR = path.join(APP_ROOT, 'output');

const WEATHER_ENSURE_RETRIES = 3;
const WEATHER_ENSURE_DELAY_MS = 3000;
const ALLOWED_OUTPUT_FILES = ['dashboard.bmp', 'dashboard.previous.bmp'] as const;
const FRONTEND_ROOT = resolveFrontendRoot(APP_ROOT);
type PublishedImageAlias = typeof ALLOWED_OUTPUT_FILES[number];
const PUBLISHED_IMAGE_ALIAS_MAP: Record<PublishedImageAlias, 'current' | 'previous'> = {
    'dashboard.bmp': 'current',
    'dashboard.previous.bmp': 'previous'
};

async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

export function resolveFrontendRoot(appRoot: string): string {
    const builtRoot = path.join(appRoot, 'dashboard-web', 'dist');
    if (fs.existsSync(path.join(builtRoot, 'index.html'))) {
        return builtRoot;
    }

    return path.join(appRoot, 'dashboard-web');
}

export function setFrontendCacheHeaders(
    res: Response,
    frontendRoot: string,
    filePath: string
): void {
    const isBuiltFrontend =
        path.basename(frontendRoot) === 'dist'
        && path.basename(path.dirname(frontendRoot)) === 'dashboard-web';

    if (!isBuiltFrontend) {
        return;
    }

    if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
    }

    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}

async function generateImageWhenReady(forceRefresh = false): Promise<void> {
    let data = forceRefresh ? await fetchAllDataFresh() : await fetchAllData();
    let weather = data.weather;
    // Only retry if weather is completely unavailable (total API failure),
    // not just because current temperature is missing in an otherwise valid response.
    for (let i = 0; i < WEATHER_ENSURE_RETRIES && weather === null; i++) {
        console.warn(`[server] Väderdata saknas, försöker hämta igen (${i + 1}/${WEATHER_ENSURE_RETRIES})...`);
        await sleep(WEATHER_ENSURE_DELAY_MS);
        weather = await fetchWeatherFresh();
    }
    if (weather === null) {
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

async function resolvePublishedAliasPath(alias: PublishedImageAlias): Promise<string | null> {
    return resolvePublishedImagePath(OUTPUT_DIR, PUBLISHED_IMAGE_ALIAS_MAP[alias]);
}

async function sendPublishedImage(res: Response, alias: PublishedImageAlias): Promise<void> {
    const imagePath = await resolvePublishedAliasPath(alias);
    if (!imagePath) {
        res.status(404).json({ error: 'Image not generated yet' });
        return;
    }

    res.sendFile(imagePath);
}

app.get('/', (_req: Request, res: Response) => {
    setFrontendCacheHeaders(res, FRONTEND_ROOT, path.join(FRONTEND_ROOT, 'index.html'));
    res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});

app.use(express.static(FRONTEND_ROOT, {
    setHeaders: (res, filePath) => {
        setFrontendCacheHeaders(res, FRONTEND_ROOT, filePath);
    }
}));

app.get('/api/data', withErrorHandling('Error fetching data', async (_req, res) => {
    /**
     * @openapi
     * /api/data:
     *   get:
     *     summary: Get aggregated dashboard data
     *     description: Returns weather, calendar, lunch, and indoor temperature data from cached sources.
     *     tags:
     *       - Data
     *     responses:
     *       200:
     *         description: Dashboard data
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/DashboardData'
     */
    const data = await fetchAllData();
    res.json(data);
}));

app.get('/output/:filename', async (_req: Request, res: Response) => {
    const filename = Array.isArray(_req.params.filename) ? _req.params.filename[0] : _req.params.filename;
    if (!ALLOWED_OUTPUT_FILES.includes(filename as PublishedImageAlias)) {
        return res.status(404).json({ error: 'File not found' });
    }
    await sendPublishedImage(res, filename as PublishedImageAlias);
});

app.get('/dashboard.bmp', async (_req: Request, res: Response) => {
    await sendPublishedImage(res, 'dashboard.bmp');
});

app.get('/dashboard.previous.bmp', async (_req: Request, res: Response) => {
    await sendPublishedImage(res, 'dashboard.previous.bmp');
});

app.get('/api/changes', withErrorHandling('Error getting changes', async (_req, res) => {
    /**
     * @openapi
     * /api/changes:
     *   get:
     *     summary: Get image change regions
     *     description: Returns rectangular regions that have changed between current and previous BMP images. Uses flood-fill algorithm to detect changed pixels and merges nearby rectangles.
     *     tags:
     *       - Image
     *     responses:
     *       200:
     *         description: Changed regions
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ChangesResponse'
     */
    const [changes, manifest] = await Promise.all([getChanges(), readOutputManifest(OUTPUT_DIR)]);
    const generatedAt = manifest.current?.generatedAt ?? changes.timestamp;
    res.json({ ...changes, timestamp: generatedAt, refreshInterval });
}));

app.get('/api/image-region', withErrorHandling('Error getting image region', async (req, res) => {
    /**
     * @openapi
     * /api/image-region:
     *   get:
     *     summary: Extract region from BMP image
     *     description: Extracts a rectangular region from the current dashboard BMP image. Returns raw BMP data for the specified region.
     *     tags:
     *       - Image
     *     parameters:
     *       - name: x
     *         in: query
     *         required: true
     *         schema:
     *           type: integer
     *         description: Left coordinate in pixels
     *       - name: y
     *         in: query
     *         required: true
     *         schema:
     *           type: integer
     *         description: Top coordinate in pixels
     *       - name: w
     *         in: query
     *         required: true
     *         schema:
     *           type: integer
     *         description: Width of region in pixels
     *       - name: h
     *         in: query
     *         required: true
     *         schema:
     *           type: integer
     *         description: Height of region in pixels
     *     responses:
     *       200:
     *         description: BMP image region
     *         content:
     *           image/bmp:
     *             schema:
     *               type: string
     *               format: binary
     *       400:
     *         description: Invalid parameters
     *       404:
     *         description: Image not generated yet
     */
    const { x, y, w, h } = req.query;

    const imagePath = await resolvePublishedAliasPath('dashboard.bmp');
    if (!imagePath) {
        res.status(404).json({ error: 'Image not generated yet' });
        return;
    }

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
    /**
     * @openapi
     * /api/refresh:
     *   post:
     *     summary: Force image regeneration
     *     description: Forces immediate regeneration of the dashboard BMP image. Fetches fresh data from all sources and generates a new 800x480 1-bit monochrome image.
     *     tags:
     *       - Control
     *     responses:
     *       200:
     *         description: Image regenerated successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/RefreshResponse'
     */
    await generateImageWhenReady(true);
    res.json({ ok: true, timestamp: new Date().toISOString() });
}));

// New endpoint to configure refresh interval
app.post('/api/refresh-interval', withErrorHandling('Error setting refresh interval', async (req, res) => {
    /**
     * @openapi
     * /api/refresh-interval:
     *   post:
     *     summary: Update refresh interval
     *     description: Updates the cron refresh interval for automatic image generation.
     *     tags:
     *       - Control
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/RefreshIntervalRequest'
     *     responses:
     *       200:
     *         description: Interval updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/RefreshIntervalResponse'
     *       400:
     *         description: Invalid interval value
     */
    const { refreshInterval: newInterval } = req.body;
    
    if (!Number.isInteger(newInterval) || newInterval < 1 || newInterval > 3600) {
        res.status(400).json({ error: 'Invalid interval (must be 1-3600 seconds)' });
        return;
    }
    
    refreshInterval = newInterval;
    process.env.REFRESH_INTERVAL_MINUTES = String(Math.round(newInterval / 60));
    scheduleCron();
    res.json({ ok: true, newInterval });
}));

async function scheduledImageGeneration(): Promise<void> {
    console.log(`[cron] Fetching data and generating image (every ${refreshInterval}s)...`);
    await generateImageWhenReady(false);
    console.log('[cron] Image generated successfully.');
}

function getCronExpression(intervalSeconds: number): string {
    const minutes = Math.max(1, Math.round(intervalSeconds / 60));
    return `*/${minutes} * * * *`;
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

let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function scheduleCron(): void {
    if (cronTask) {
        cronTask.stop();
    }
    cronTask = cron.schedule(getCronExpression(refreshInterval), async () => {
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
}

scheduleCron();

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const server = app.listen(PORT, async () => {
    console.log(`Dashboard server running on http://localhost:${PORT}`);
    setTimeout(async () => {
        await restoreCache();
        console.log('[startup] Fetching fresh data and generating initial image...');
        try {
            await generateImageWhenReady(true);
            console.log('[startup] Initial image ready.');
        } catch (err: unknown) {
            handleApiError('[startup] Image generation failed', err);
        }
    }, SERVER_STARTUP_DELAY_MS);
});

export { app, server };
