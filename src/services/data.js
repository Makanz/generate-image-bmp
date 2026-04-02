const axios = require('axios');
const { fetchIndoorTemperatures } = require('./homey');

const CACHE_TTL_MS = {
    weather:  parseInt(process.env.WEATHER_REFRESH_MINUTES  || '15', 10) * 60 * 1000,
    calendar: parseInt(process.env.CALENDAR_REFRESH_MINUTES || '15', 10) * 60 * 1000,
    lunch:    parseInt(process.env.LUNCH_REFRESH_HOURS      || '24', 10) * 60 * 60 * 1000,
    indoor:   parseInt(process.env.INDOOR_REFRESH_MINUTES   || '15', 10) * 60 * 1000,
};

// How long to wait before retrying a failed (null) fetch
const ERROR_RETRY_MS = parseInt(process.env.ERROR_RETRY_MINUTES || '2', 10) * 60 * 1000;

let cache = {
    weather: { data: null, timestamp: 0 },
    calendar: { data: null, timestamp: 0 },
    lunch: { data: null, timestamp: 0 },
    indoor: { data: null, timestamp: 0 }
};

function isCacheValid(source) {
    return Date.now() - cache[source].timestamp < CACHE_TTL_MS[source];
}

function normalizeWeather(raw) {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    const current = entry.current?.temperature_2m ?? null;
    const daily = entry.daily || {};
    const maxTemps = daily.temperature_2m_max || [];
    const minTemps = daily.temperature_2m_min || [];

    // Skip index 0 (today), use the next 3 days as forecast
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

async function fetchWeather() {
    const url = process.env.N8N_WEBHOOK_WEATHER;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_WEATHER not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return normalizeWeather(response.data);
    } catch (err) {
        console.error('[data] Weather fetch failed:', err.message);
        return null;
    }
}

async function fetchCalendar() {
    const url = process.env.N8N_WEBHOOK_CALENDAR;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_CALENDAR not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    } catch (err) {
        console.error('[data] Calendar fetch failed:', err.message);
        return null;
    }
}

async function fetchLunch() {
    const url = process.env.N8N_WEBHOOK_LUNCH;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_LUNCH not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    } catch (err) {
        console.error('[data] Lunch fetch failed:', err.message);
        return null;
    }
}

function normalizeIndoor(raw) {
    const entry = Array.isArray(raw) ? raw[0] : raw;
    if (!entry) return null;

    const rooms = (entry.rooms || []).filter(r => r.temp !== null && r.temp !== undefined);
    if (rooms.length === 0) return null;

    const avg = rooms.reduce((sum, r) => sum + r.temp, 0) / rooms.length;

    return {
        current: entry.current ?? Math.round(avg * 10) / 10,
        rooms
    };
}

async function fetchIndoor() {
    // Try Homey direct API first (requires HOMEY_IP + HOMEY_TOKEN, Homey Pro 2023+)
    if (process.env.HOMEY_IP && process.env.HOMEY_TOKEN) {
        return fetchIndoorTemperatures();
    }

    // Fallback: n8n webhook (recommended for older Homey models)
    // Expected JSON format from the webhook:
    // {
    //   "current": 21.5,
    //   "rooms": [
    //     { "name": "Kök", "temp": 22.1 },
    //     { "name": "Vardagsrum", "temp": 21.0 }
    //   ]
    // }
    const url = process.env.N8N_WEBHOOK_INDOOR;
    if (!url) {
        console.warn('[data] HOMEY_IP/HOMEY_TOKEN and N8N_WEBHOOK_INDOOR not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return normalizeIndoor(response.data);
    } catch (err) {
        console.error('[data] Indoor fetch failed:', err.message);
        return null;
    }
}

async function fetchAllData() {
    const now = Date.now();
    const results = {
        weather: null,
        calendar: null,
        lunch: null,
        indoor: null,
        timestamp: new Date().toISOString()
    };

    if (!isCacheValid('weather')) {
        results.weather = await fetchWeather();
        cache.weather = { data: results.weather, timestamp: results.weather !== null ? now : now - CACHE_TTL_MS.weather + ERROR_RETRY_MS };
    } else {
        results.weather = cache.weather.data;
    }

    if (!isCacheValid('calendar')) {
        results.calendar = await fetchCalendar();
        cache.calendar = { data: results.calendar, timestamp: results.calendar !== null ? now : now - CACHE_TTL_MS.calendar + ERROR_RETRY_MS };
    } else {
        results.calendar = cache.calendar.data;
    }

    if (!isCacheValid('lunch')) {
        results.lunch = await fetchLunch();
        cache.lunch = { data: results.lunch, timestamp: results.lunch !== null ? now : now - CACHE_TTL_MS.lunch + ERROR_RETRY_MS };
    } else {
        results.lunch = cache.lunch.data;
    }

    if (!isCacheValid('indoor')) {
        results.indoor = await fetchIndoor();
        cache.indoor = { data: results.indoor, timestamp: results.indoor !== null ? now : now - CACHE_TTL_MS.indoor + ERROR_RETRY_MS };
    } else {
        results.indoor = cache.indoor.data;
    }

    return results;
}

async function fetchAllDataFresh() {
    cache.weather = { data: null, timestamp: 0 };
    cache.calendar = { data: null, timestamp: 0 };
    cache.lunch = { data: null, timestamp: 0 };
    cache.indoor = { data: null, timestamp: 0 };
    return fetchAllData();
}

async function fetchWeatherFresh() {
    cache.weather = { data: null, timestamp: 0 };
    const weather = await fetchWeather();
    const now = Date.now();
    cache.weather = {
        data: weather,
        timestamp: weather !== null ? now : now - CACHE_TTL_MS.weather + ERROR_RETRY_MS
    };
    return weather;
}

module.exports = { fetchAllData, fetchAllDataFresh, fetchWeatherFresh };
