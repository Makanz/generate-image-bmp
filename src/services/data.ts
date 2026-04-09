import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fetchIndoorTemperatures } from './homey';
import { HTTP_TIMEOUT_MS, WEATHER_FORECAST_START_INDEX, WEATHER_FORECAST_COUNT } from '../utils/constants';
import { handleApiError } from '../utils/errors';
import { getAppRoot } from '../utils/path';

const CACHE_TTL_MS: Record<string, number> = {
    weather:  parseInt(process.env.WEATHER_REFRESH_MINUTES  || '15', 10) * 60 * 1000,
    calendar: parseInt(process.env.CALENDAR_REFRESH_MINUTES || '15', 10) * 60 * 1000,
    lunch:    parseInt(process.env.LUNCH_REFRESH_HOURS      || '24', 10) * 60 * 60 * 1000,
    indoor:   parseInt(process.env.INDOOR_REFRESH_MINUTES   || '15', 10) * 60 * 1000,
};

const ERROR_RETRY_MS = parseInt(process.env.ERROR_RETRY_MINUTES || '2', 10) * 60 * 1000;

interface ForecastDay {
    max: number;
    min: number | null;
    precipitation_probability: number | null;
    weather_code: number | null;
}

interface OutdoorWeather {
    current: number | null;
    forecast: ForecastDay[];
}

interface WeatherData {
    outdoor: OutdoorWeather;
    current_weather_code: number | null;
    wind_speed: number | null;
    humidity: number | null;
}

interface Room {
    name: string;
    temp: number | null;
}

interface IndoorData {
    current: number;
    rooms: Room[];
}

interface CalendarData {
    events: Array<{
        datetime?: string;
        date?: string;
        summary?: string;
        title?: string;
    }>;
}

interface LunchItem {
    datum?: string;
    meny?: string[];
}

interface AllData {
    weather: WeatherData | null;
    calendar: CalendarData | null;
    lunch: LunchItem[] | null;
    indoor: IndoorData | null;
    timestamp: string;
}

interface CacheEntry<T> {
    data: T | null;
    timestamp: number;
}

interface Cache {
    weather: CacheEntry<WeatherData>;
    calendar: CacheEntry<CalendarData>;
    lunch: CacheEntry<LunchItem[]>;
    indoor: CacheEntry<IndoorData>;
}

let cache: Cache = {
    weather: { data: null, timestamp: 0 },
    calendar: { data: null, timestamp: 0 },
    lunch: { data: null, timestamp: 0 },
    indoor: { data: null, timestamp: 0 }
};

let pendingFetches: Partial<Record<keyof Cache, Promise<unknown>>> = {};

const CACHE_FILE = path.join(getAppRoot(), 'output', 'cache.json');

function isCacheValid(source: keyof Cache): boolean {
    const cacheEntry = cache[source];
    if (!cacheEntry || cacheEntry.timestamp <= 0) {
        return false;
    }

    const now = Date.now();
    const age = now - cacheEntry.timestamp;
    return age >= 0 && age < CACHE_TTL_MS[source];
}

interface WeatherRaw {
    current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        relative_humidity_2m?: number;
    };
    daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        weather_code?: number[];
    };
}

function normalizeWeather(raw: WeatherRaw | WeatherRaw[] | null): WeatherData | null {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    const current = entry.current?.temperature_2m ?? null;
    const daily = entry.daily || {};
    const maxTemps = daily.temperature_2m_max || [];
    const minTemps = daily.temperature_2m_min || [];

    const end = WEATHER_FORECAST_START_INDEX + WEATHER_FORECAST_COUNT;
const forecast = maxTemps.slice(WEATHER_FORECAST_START_INDEX, end).map((max, i) => ({
          max,
          min: minTemps[i + WEATHER_FORECAST_START_INDEX] ?? null,
          precipitation_probability: (daily.precipitation_probability_max || [])[i + WEATHER_FORECAST_START_INDEX] ?? null,
          weather_code: (daily.weather_code || [])[i + WEATHER_FORECAST_START_INDEX] ?? null
        }));

    return {
        outdoor: {
            current,
            forecast
        },
        current_weather_code: entry.current?.weather_code ?? null,
        wind_speed: entry.current?.wind_speed_10m ?? null,
        humidity: entry.current?.relative_humidity_2m ?? null
    };
}

function normalizeIndoor(raw: { current?: number; rooms?: Room[] } | { current?: number; rooms?: Room[] }[] | null): IndoorData | null {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    const rooms = (entry.rooms || []).filter(r => r.temp !== null && r.temp !== undefined);
    if (rooms.length === 0) return null;

    const avg = rooms.reduce((sum, r) => sum + (r.temp as number), 0) / rooms.length;

    return {
        current: entry.current ?? Math.round(avg * 10) / 10,
        rooms
    };
}

function createWebhookFetcher<T>(
    sourceName: string,
    envVar: string,
    normalizer?: (raw: unknown) => T | null
): () => Promise<T | null> {
    return async (): Promise<T | null> => {
        const url = process.env[envVar];
        if (!url) {
            console.warn(`[data] ${envVar} not configured`);
            return null;
        }
        try {
            const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
            return normalizer ? normalizer(response.data) : response.data;
        } catch (err: unknown) {
            handleApiError(`[data] ${sourceName} fetch failed`, err);
            return null;
        }
    };
}

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_PARAMS = [
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    'daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    'timezone=auto',
    'forecast_days=4',
    'wind_speed_unit=ms'
].join('&');

async function fetchWeather(): Promise<WeatherData | null> {
    const lat = process.env.OPEN_METEO_LAT;
    const lon = process.env.OPEN_METEO_LON;
    if (!lat || !lon) {
        console.warn('[data] OPEN_METEO_LAT/OPEN_METEO_LON not configured');
        return null;
    }
    const url = `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lon}&${OPEN_METEO_PARAMS}`;
    try {
        const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS });
        return normalizeWeather(response.data as WeatherRaw);
    } catch (err: unknown) {
        handleApiError('[data] Weather fetch failed', err);
        return null;
    }
}
const fetchCalendar = createWebhookFetcher<CalendarData>('Calendar', 'N8N_WEBHOOK_CALENDAR');
const fetchLunch = createWebhookFetcher<LunchItem[]>('Lunch', 'N8N_WEBHOOK_LUNCH');

async function fetchIndoor(): Promise<IndoorData | null> {
    if (process.env.HOMEY_IP && process.env.HOMEY_TOKEN) {
        return fetchIndoorTemperatures();
    }

    const webhookFetcher = createWebhookFetcher<IndoorData>('Indoor', 'N8N_WEBHOOK_INDOOR', (raw: unknown) => normalizeIndoor(raw as { current?: number; rooms?: Room[] } | { current?: number; rooms?: Room[] }[] | null));

    if (!process.env.N8N_WEBHOOK_INDOOR) {
        console.warn('[data] HOMEY_IP/HOMEY_TOKEN and N8N_WEBHOOK_INDOOR not configured');
        return null;
    }

    return webhookFetcher();
}

async function fetchSource<T>(key: keyof Cache, fetchFn: () => Promise<T | null>): Promise<T | null> {
    if (isCacheValid(key)) {
        return cache[key].data as T | null;
    }

    if (pendingFetches[key]) {
        return pendingFetches[key] as Promise<T | null>;
    }

    const fetchPromise = (async (): Promise<T | null> => {
        const data = await fetchFn();
        const now = Date.now();

        if (data !== null) {
            cache[key] = {
                data: data as never,
                timestamp: now
            };
            await persistCache();
        } else {
            // Keep existing cached data so stale-but-valid data is still served.
            // Only advance the timestamp so we retry after ERROR_RETRY_MS instead
            // of hammering the API on every request.
            cache[key] = {
                data: cache[key].data as never,
                timestamp: Math.max(1, now - CACHE_TTL_MS[key] + ERROR_RETRY_MS)
            };
        }

        delete pendingFetches[key];
        return cache[key].data as T | null;
    })();

    pendingFetches[key] = fetchPromise;
    return fetchPromise;
}

async function fetchAllData(): Promise<AllData> {
    const [weather, calendar, lunch, indoor] = await Promise.all([
        fetchSource('weather', fetchWeather),
        fetchSource('calendar', fetchCalendar),
        fetchSource('lunch', fetchLunch),
        fetchSource('indoor', fetchIndoor)
    ]);

    return {
        weather,
        calendar,
        lunch,
        indoor,
        timestamp: new Date().toISOString()
    };
}

async function fetchAllDataFresh(): Promise<AllData> {
    cache.weather.timestamp = 0;
    cache.calendar.timestamp = 0;
    cache.lunch.timestamp = 0;
    cache.indoor.timestamp = 0;
    return fetchAllData();
}

async function fetchWeatherFresh(): Promise<WeatherData | null> {
    cache.weather.timestamp = 0;
    return fetchSource('weather', fetchWeather);
}

async function persistCache(): Promise<void> {
    try {
        await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    } catch {
        // Non-fatal — in-memory cache is still valid
    }
}

async function restoreCache(): Promise<void> {
    try {
        const raw = await fs.readFile(CACHE_FILE, 'utf-8');
        const saved: Cache = JSON.parse(raw);

        const weatherEntry = saved.weather;
        if (isValidCacheEntry(weatherEntry)) {
            const age = Date.now() - weatherEntry.timestamp;
            if (weatherEntry.data !== null && age < CACHE_TTL_MS.weather) {
                cache.weather = weatherEntry;
            }
        }

        const calendarEntry = saved.calendar;
        if (isValidCacheEntry(calendarEntry)) {
            const age = Date.now() - calendarEntry.timestamp;
            if (calendarEntry.data !== null && age < CACHE_TTL_MS.calendar) {
                cache.calendar = calendarEntry;
            }
        }

        const lunchEntry = saved.lunch;
        if (isValidCacheEntry(lunchEntry)) {
            const age = Date.now() - lunchEntry.timestamp;
            if (lunchEntry.data !== null && age < CACHE_TTL_MS.lunch) {
                cache.lunch = lunchEntry;
            }
        }

        const indoorEntry = saved.indoor;
        if (isValidCacheEntry(indoorEntry)) {
            const age = Date.now() - indoorEntry.timestamp;
            if (indoorEntry.data !== null && age < CACHE_TTL_MS.indoor) {
                cache.indoor = indoorEntry;
            }
        }

        console.log('[data] Cache restored from disk.');
    } catch {
        // File missing or corrupt — start with empty cache
    }
}

function isValidCacheEntry<T>(entry: unknown): entry is CacheEntry<T> {
    return (
        typeof entry === 'object' &&
        entry !== null &&
        'data' in entry &&
        'timestamp' in entry &&
        typeof (entry as CacheEntry<T>).timestamp === 'number'
    );
}

export { fetchAllData, fetchAllDataFresh, fetchWeatherFresh, persistCache, restoreCache };
export type { WeatherData, IndoorData, CalendarData, AllData, ForecastDay, Room, LunchItem };
