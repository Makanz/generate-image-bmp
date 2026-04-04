import axios from 'axios';
import { fetchIndoorTemperatures } from './homey';

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

interface AllData {
    weather: WeatherData | null;
    calendar: CalendarData | null;
    lunch: unknown[] | null;
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
    lunch: CacheEntry<unknown[]>;
    indoor: CacheEntry<IndoorData>;
}

let cache: Cache = {
    weather: { data: null, timestamp: 0 },
    calendar: { data: null, timestamp: 0 },
    lunch: { data: null, timestamp: 0 },
    indoor: { data: null, timestamp: 0 }
};

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

async function fetchWeather(): Promise<WeatherData | null> {
    const url = process.env.N8N_WEBHOOK_WEATHER;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_WEATHER not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return normalizeWeather(response.data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[data] Weather fetch failed:', message);
        return null;
    }
}

async function fetchCalendar(): Promise<CalendarData | null> {
    const url = process.env.N8N_WEBHOOK_CALENDAR;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_CALENDAR not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[data] Calendar fetch failed:', message);
        return null;
    }
}

async function fetchLunch(): Promise<unknown[] | null> {
    const url = process.env.N8N_WEBHOOK_LUNCH;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_LUNCH not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[data] Lunch fetch failed:', message);
        return null;
    }
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

async function fetchIndoor(): Promise<IndoorData | null> {
    if (process.env.HOMEY_IP && process.env.HOMEY_TOKEN) {
        return fetchIndoorTemperatures();
    }

    const url = process.env.N8N_WEBHOOK_INDOOR;
    if (!url) {
        console.warn('[data] HOMEY_IP/HOMEY_TOKEN and N8N_WEBHOOK_INDOOR not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return normalizeIndoor(response.data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[data] Indoor fetch failed:', message);
        return null;
    }
}

async function fetchSource<T>(key: keyof Cache, fetchFn: () => Promise<T | null>): Promise<T | null> {
    if (isCacheValid(key)) {
        return cache[key].data as T | null;
    }

    const now = Date.now();
    const data = await fetchFn();

    cache[key] = {
        data: data as never,
        timestamp: data !== null ? now : Math.max(1, now - CACHE_TTL_MS[key] + ERROR_RETRY_MS)
    };

    return data;
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
    cache.weather = { data: null, timestamp: 0 };
    cache.calendar = { data: null, timestamp: 0 };
    cache.lunch = { data: null, timestamp: 0 };
    cache.indoor = { data: null, timestamp: 0 };
    return fetchAllData();
}

async function fetchWeatherFresh(): Promise<WeatherData | null> {
    cache.weather = { data: null, timestamp: 0 };
    const weather = await fetchWeather();
    const now = Date.now();
    cache.weather = {
        data: weather,
        timestamp: weather !== null ? now : Math.max(1, now - CACHE_TTL_MS.weather + ERROR_RETRY_MS)
    };
    return weather;
}

export { fetchAllData, fetchAllDataFresh, fetchWeatherFresh };
export type { WeatherData, IndoorData, CalendarData, AllData, ForecastDay, Room };
