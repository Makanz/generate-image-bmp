import axios from 'axios';
import { fetchIndoorTemperatures } from './homey';
import { HTTP_TIMEOUT_MS } from '../utils/constants';
import { handleApiError } from '../utils/errors';

const CACHE_TTL_MS: Record<string, number> = {
    weather:  parseInt(process.env.WEATHER_REFRESH_MINUTES  || '15', 10) * 60 * 1000,
    calendar: parseInt(process.env.CALENDAR_REFRESH_MINUTES || '15', 10) * 60 * 1000,
    lunch:    parseInt(process.env.LUNCH_REFRESH_HOURS      || '24', 10) * 60 * 60 * 1000,
    indoor:   parseInt(process.env.INDOOR_REFRESH_MINUTES   || '15', 10) * 60 * 1000,
};

const ERROR_RETRY_MS = parseInt(process.env.ERROR_RETRY_MINUTES || '2', 10) * 60 * 1000;

interface ForecastDay {
    temp: number;
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

    const forecast = maxTemps.slice(1, 4).map((max, i) => ({
        temp: (max + (minTemps[i + 1] ?? max)) / 2,
        max,
        min: minTemps[i + 1] ?? null,
        precipitation_probability: (daily.precipitation_probability_max || [])[i + 1] ?? null,
        weather_code: (daily.weather_code || [])[i + 1] ?? null
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

const fetchWeather = createWebhookFetcher<WeatherData>('Weather', 'N8N_WEBHOOK_WEATHER', (raw: unknown) => normalizeWeather(raw as WeatherRaw | WeatherRaw[] | null));
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

        cache[key] = {
            data: data as never,
            timestamp: data !== null ? now : Math.max(1, now - CACHE_TTL_MS[key] + ERROR_RETRY_MS)
        };

        delete pendingFetches[key];
        return data;
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

export { fetchAllData, fetchAllDataFresh, fetchWeatherFresh };
export type { WeatherData, IndoorData, CalendarData, AllData, ForecastDay, Room, LunchItem };
