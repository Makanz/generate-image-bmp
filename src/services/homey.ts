import axios, { AxiosInstance } from 'axios';
import { HTTP_TIMEOUT_MS, CAPABILITY_MEASURE_TEMPERATURE, LOCALE_SV } from '../utils/constants';
import { handleApiError } from '../utils/errors';

let cachedLocalToken: string | null = null;

async function loginLocal(ip: string, username: string, password: string): Promise<string> {
    if (cachedLocalToken) return cachedLocalToken;

    const response = await axios.post(
        `http://${ip}/api/manager/users/login`,
        { username, password },
        { timeout: HTTP_TIMEOUT_MS }
    );

    cachedLocalToken = response.data.token;
    return cachedLocalToken as string;
}

function createHomeyClient(ip: string, token: string): AxiosInstance {
    return axios.create({
        baseURL: `http://${ip}/api`,
        headers: { Authorization: `Bearer ${token}` },
        timeout: HTTP_TIMEOUT_MS
    });
}

async function getClient(): Promise<AxiosInstance | null> {
    const ip = process.env.HOMEY_IP;
    if (!ip) return null;

    if (process.env.HOMEY_TOKEN) {
        return createHomeyClient(ip, process.env.HOMEY_TOKEN);
    }

    const username = process.env.HOMEY_USERNAME;
    const password = process.env.HOMEY_PASSWORD;
    if (username && password) {
        const token = await loginLocal(ip, username, password);
        return createHomeyClient(ip, token);
    }

    return null;
}

interface Room {
    name: string;
    temp: number | null;
}

interface IndoorData {
    current: number;
    rooms: Room[];
}

interface Device {
    name?: string;
    zoneName?: string;
    capabilities?: string[];
    capabilitiesObj?: Record<string, { value?: number | null }>;
}

function calculateAverage(rooms: Room[]): number {
    return rooms.reduce((sum, r) => sum + (r.temp as number), 0) / rooms.length;
}

async function fetchIndoorTemperatures(): Promise<IndoorData | null> {
    let client: AxiosInstance | null;
    try {
        client = await getClient();
    } catch (err: unknown) {
        handleApiError('[homey] Auth failed', err);
        cachedLocalToken = null;
        return null;
    }

    if (!client) {
        console.warn('[homey] No Homey credentials configured');
        return null;
    }

    let devices: Device[];
    try {
        const response = await client.get<Record<string, Device>>('/manager/devices/device/');
        devices = Object.values(response.data);
    } catch (err: unknown) {
        handleApiError('[homey] Failed to fetch devices', err);
        cachedLocalToken = null;
        return null;
    }

    const tempDevices = devices.filter(d =>
        d.capabilities && d.capabilities.includes(CAPABILITY_MEASURE_TEMPERATURE)
    );

    if (tempDevices.length === 0) {
        console.warn('[homey] No temperature devices found');
        return null;
    }

    const rooms: Room[] = tempDevices
        .map(d => ({
            name: d.zoneName || d.name || 'Unknown',
            temp: d.capabilitiesObj?.measure_temperature?.value ?? null
        }))
        .filter(r => r.temp !== null)
        .sort((a, b) => a.name.localeCompare(b.name, LOCALE_SV));

    if (rooms.length === 0) {
        console.warn('[homey] No temperature readings available');
        return null;
    }

    const avgTemp = calculateAverage(rooms);

    return {
        current: Math.round(avgTemp * 10) / 10,
        rooms
    };
}

export { fetchIndoorTemperatures };
export type { Room, IndoorData };
