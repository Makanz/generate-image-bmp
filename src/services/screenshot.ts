import axios from 'axios';
import { BROWSERLESS_TIMEOUT_MS, HTTP_TIMEOUT_MS, PAGE_LOAD_TIMEOUT_MS, DATA_LOAD_WAIT_MS, WIDTH, HEIGHT } from '../utils/constants';
import { handleApiError } from '../utils/errors';

export interface ScreenshotProvider {
    capture(url: string, width: number, height: number): Promise<Buffer>;
}

export class BrowserlessProvider implements ScreenshotProvider {
    async capture(url: string, width: number, height: number): Promise<Buffer> {
        const browserlessUrl = process.env.BROWSERLESS_URL;
        const token = process.env.BROWSERLESS_TOKEN;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Basic ${Buffer.from(token).toString('base64')}`;
        }

        const body = {
            url,
            options: { type: 'png', fullPage: false },
            viewport: { width, height },
            gotoOptions: { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT_MS }
        };

        console.log(`[capture] Using Browserless REST API at ${browserlessUrl}/screenshot`);
        const response = await axios.post(`${browserlessUrl}/screenshot`, body, {
            headers,
            responseType: 'arraybuffer',
            timeout: BROWSERLESS_TIMEOUT_MS
        });

        return Buffer.from(response.data);
    }
}

export class PlaywrightProvider implements ScreenshotProvider {
    async capture(url: string, width: number, height: number): Promise<Buffer> {
        const playwright = await import('playwright');

        console.log('[capture] Launching local Chromium...');
        const browser = await playwright.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewportSize({ width, height });

        console.log(`[capture] Loading ${url}...`);
        try {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS });
            if (response && response.status() >= 500) {
                throw new Error(`Server returned ${response.status()}`);
            }
            await page.waitForFunction(
                () => (document.body as HTMLElement).dataset.loaded === 'true',
                { timeout: DATA_LOAD_WAIT_MS }
            ).catch(() => console.warn('[capture] Data load timeout, proceeding with current content'));
        } catch (err: unknown) {
            handleApiError('[capture] Failed to load page', err);
            await browser.close();
            throw err;
        }

        console.log('[capture] Taking screenshot...');
        const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });
        await browser.close();
        return pngBuffer;
    }
}

export function createScreenshotProvider(): ScreenshotProvider {
    if (process.env.BROWSERLESS_URL) {
        return new BrowserlessProvider();
    }
    return new PlaywrightProvider();
}
