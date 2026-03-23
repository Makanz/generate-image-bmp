const axios = require('axios');

const CACHE_TTL_MS = parseInt(process.env.REFRESH_INTERVAL_MINUTES || '15', 10) * 60 * 1000;

let cache = {
    weather: { data: null, timestamp: 0 },
    calendar: { data: null, timestamp: 0 },
    lunch: { data: null, timestamp: 0 },
    indoor: { data: null, timestamp: 0 }
};

function isCacheValid(source) {
    return Date.now() - cache[source].timestamp < CACHE_TTL_MS;
}

async function fetchWeather() {
    const url = process.env.N8N_WEBHOOK_WEATHER;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_WEATHER not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
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

async function fetchIndoor() {
    const url = process.env.N8N_WEBHOOK_INDOOR;
    if (!url) {
        console.warn('[data] N8N_WEBHOOK_INDOOR not configured');
        return null;
    }
    try {
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
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
        cache.weather = { data: results.weather, timestamp: now };
    } else {
        results.weather = cache.weather.data;
    }

    if (!isCacheValid('calendar')) {
        results.calendar = await fetchCalendar();
        cache.calendar = { data: results.calendar, timestamp: now };
    } else {
        results.calendar = cache.calendar.data;
    }

    if (!isCacheValid('lunch')) {
        results.lunch = await fetchLunch();
        cache.lunch = { data: results.lunch, timestamp: now };
    } else {
        results.lunch = cache.lunch.data;
    }

    if (!isCacheValid('indoor')) {
        results.indoor = await fetchIndoor();
        cache.indoor = { data: results.indoor, timestamp: now };
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

module.exports = { fetchAllData, fetchAllDataFresh };
