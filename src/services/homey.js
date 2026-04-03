const axios = require('axios');

let cachedLocalToken = null;

async function loginLocal(ip, username, password) {
    if (cachedLocalToken) return cachedLocalToken;

    const response = await axios.post(
        `http://${ip}/api/manager/users/login`,
        { username, password },
        { timeout: 10000 }
    );

    cachedLocalToken = response.data.token;
    return cachedLocalToken;
}

async function getClient() {
    const ip = process.env.HOMEY_IP;
    if (!ip) return null;

    // Option 1: Static token (Homey Pro 2023+)
    if (process.env.HOMEY_TOKEN) {
        return axios.create({
            baseURL: `http://${ip}/api`,
            headers: { Authorization: `Bearer ${process.env.HOMEY_TOKEN}` },
            timeout: 10000
        });
    }

    // Option 2: Local login with username/password (older Homey)
    const username = process.env.HOMEY_USERNAME;
    const password = process.env.HOMEY_PASSWORD;
    if (username && password) {
        const token = await loginLocal(ip, username, password);
        return axios.create({
            baseURL: `http://${ip}/api`,
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
        });
    }

    return null;
}

async function fetchIndoorTemperatures() {
    let client;
    try {
        client = await getClient();
    } catch (err) {
        console.error('[homey] Auth failed:', err.message);
        cachedLocalToken = null;
        return null;
    }

    if (!client) {
        console.warn('[homey] No Homey credentials configured');
        return null;
    }

    let devices;
    try {
        const response = await client.get('/manager/devices/device/');
        devices = Object.values(response.data);
    } catch (err) {
        console.error('[homey] Failed to fetch devices:', err.message);
        cachedLocalToken = null;
        return null;
    }

    const tempDevices = devices.filter(d =>
        d.capabilities && d.capabilities.includes('measure_temperature')
    );

    if (tempDevices.length === 0) {
        console.warn('[homey] No temperature devices found');
        return null;
    }

    const rooms = tempDevices
        .map(d => ({
            name: d.zoneName || d.name,
            temp: d.capabilitiesObj?.measure_temperature?.value ?? null
        }))
        .filter(r => r.temp !== null)
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

    if (rooms.length === 0) {
        console.warn('[homey] No temperature readings available');
        return null;
    }

    const avgTemp = rooms.reduce((sum, r) => sum + r.temp, 0) / rooms.length;

    return {
        current: Math.round(avgTemp * 10) / 10,
        rooms
    };
}

module.exports = { fetchIndoorTemperatures };
