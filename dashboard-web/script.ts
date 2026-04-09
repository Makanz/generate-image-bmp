// ── Locale constants ─────────────────────────────────────────────────────────

const MONTHS_LOWER = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];
const MONTHS_UPPER = MONTHS_LOWER.map(m => m.toUpperCase());
const MONTHS_CAP   = MONTHS_LOWER.map(m => m.charAt(0).toUpperCase() + m.slice(1));

const DAYS_LOWER = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const DAYS_CAP   = DAYS_LOWER.map(d => d.charAt(0).toUpperCase() + d.slice(1));

// ── Types ─────────────────────────────────────────────────────────────────────

interface Room {
    name: string;
    temp: number;
}

interface ForecastDay {
    max: number;
}

interface OutdoorWeather {
    current: number;
    forecast: ForecastDay[];
}

interface WeatherData {
    outdoor: OutdoorWeather;
    temperature?: number;
}

interface IndoorData {
    current: number;
    rooms: Room[];
}

interface CalendarEvent {
    datetime?: string;
    date?: string;
    summary?: string;
    title?: string;
}

interface CalendarData {
    events: CalendarEvent[];
}

interface LunchItem {
    datum: string;
    meny: string[];
}

interface AllDataResponse {
    weather: WeatherData | null;
    indoor: IndoorData | null;
    lunch: LunchItem[] | null;
    calendar: CalendarData | null;
    timestamp: string;
}

interface DateStrings {
    day: number;
    monthLower: string;
    monthUpper: string;
    monthCap: string;
    dayOfWeek: number;
    dayLower: string;
    dayCap: string;
}

// ── State ─────────────────────────────────────────────────────────────────────

const prevTemps: Record<string, number | null> = { ute: null, inne: null };

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTrend(current: number, previous: number | null): string {
    if (previous === null) return '';
    const diff = current - previous;
    if (diff > 0.5) return '↑';
    if (diff < -0.5) return '↓';
    return '→';
}

function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const str = String(dateStr).trim();

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/);
    if (isoMatch) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = isoMatch;
        return new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        );
    }

    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
}

function isSameDay(a: Date | null, b: Date | null): boolean {
    if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return false;
    return a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth()
        && a.getDate()     === b.getDate();
}

function formatTime(datetimeStr: string): string {
    const date = parseDate(datetimeStr);
    if (!date) return '';
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

/** Returns locale strings for a given date, used by lunch matching. */
function getDateStrings(date: Date): DateStrings {
    const dayOfWeek = date.getDay();
    const month     = date.getMonth();
    return {
        day:        date.getDate(),
        monthLower: MONTHS_LOWER[month],
        monthUpper: MONTHS_UPPER[month],
        monthCap:   MONTHS_CAP[month],
        dayOfWeek,
        dayLower:   DAYS_LOWER[dayOfWeek],
        dayCap:     DAYS_CAP[dayOfWeek],
    };
}

/** Finds the lunch entry for today, falling back to the first item. */
function findTodaysMenu(data: LunchItem[], date: Date): LunchItem | undefined {
    const { day, monthLower, monthCap, monthUpper, dayLower, dayCap } = getDateStrings(date);

    return data.find(m => {
        const datum = (m.datum || '').toLowerCase();
        const containsDay      = new RegExp(`\\b${day}\\b`).test(datum);
        const containsMonth    = datum.includes(monthLower)
                              || datum.includes(monthCap.toLowerCase())
                              || datum.includes(monthUpper.toLowerCase());
        const containsWeekday  = datum.includes(dayLower)
                              || datum.includes(dayCap.toLowerCase());
        return (containsDay && containsMonth) || containsWeekday;
    }) ?? data[0];
}

/**
 * The calendar API may return either a CalendarData object or a single-element
 * array wrapping one. Normalise both shapes to CalendarData | null.
 */
function normalizeCalendarData(raw: CalendarData | CalendarData[] | null): CalendarData | null {
    if (!raw) return null;
    if (Array.isArray(raw)) {
        return raw.length > 0 && raw[0].events ? raw[0] : null;
    }
    return raw.events ? raw : null;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderRoomChart(rooms: Room[]): void {
    const container = document.getElementById('room-chart');
    if (!container) return;
    if (!rooms || rooms.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = rooms.map(room => {
        const val   = Math.round(room.temp);
        const label = room.name.toUpperCase();
        return `<div class="room-row"><span class="room-name">${escapeHtml(label)}</span><span class="room-temp">${val}°</span></div>`;
    }).join('');
}

function renderCalendarEvents(events: CalendarEvent[], containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<p class="no-data">Inga händelser</p>';
        return;
    }

    container.innerHTML = events.map(event => {
        const time    = formatTime(event.datetime || event.date || '');
        const title   = escapeHtml(event.summary || event.title || '');
        const timeHtml = time
            ? `<span class="cal-time">${time}</span>`
            : `<span class="cal-time"></span>`;
        return `<div class="cal-event">${timeHtml}<span class="cal-title">${title}</span></div>`;
    }).join('');
}

// ── Update functions ──────────────────────────────────────────────────────────

function updateDate(): void {
    const now     = new Date();
    const dayEl   = document.getElementById('date-day');
    const monthEl = document.getElementById('date-month');
    if (dayEl)   dayEl.textContent   = String(now.getDate());
    if (monthEl) monthEl.textContent = MONTHS_UPPER[now.getMonth()];
}

function updateOutdoorWeather(weather: WeatherData): void {
    const current = weather.outdoor?.current ?? weather.temperature;
    if (current !== undefined) {
        const rounded    = Math.round(current);
        const trend      = getTrend(rounded, prevTemps.ute);
        prevTemps.ute    = rounded;
        const uteTempEl  = document.getElementById('ute-temp-val');
        const uteTrendEl = document.getElementById('ute-trend');
        if (uteTempEl)  uteTempEl.textContent  = String(rounded);
        if (uteTrendEl) uteTrendEl.textContent = trend;
    }

    const forecast = weather.outdoor?.forecast ?? [];
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById(`forecast-${i}`);
        if (el) {
            el.textContent = forecast[i]?.max !== undefined
                ? Math.round(forecast[i].max) + '°'
                : '--°';
        }
    }
}

function updateIndoorTemperature(indoor: IndoorData): void {
    if (indoor.current !== undefined) {
        const rounded     = Math.round(indoor.current);
        const trend       = getTrend(rounded, prevTemps.inne);
        prevTemps.inne    = rounded;
        const inneTempEl  = document.getElementById('inne-temp-val');
        const inneTrendEl = document.getElementById('inne-trend');
        if (inneTempEl)  inneTempEl.textContent  = String(rounded);
        if (inneTrendEl) inneTrendEl.textContent = trend;
    }
    renderRoomChart(indoor.rooms ?? []);
}

function updateTemperature(weather: WeatherData | null, indoor: IndoorData | null): void {
    if (weather) updateOutdoorWeather(weather);
    if (indoor)  updateIndoorTemperature(indoor);
}

function updateSchoolLunch(data: LunchItem[] | null): void {
    const container = document.getElementById('lunch-content');
    if (!container) return;

    if (!data || !Array.isArray(data) || data.length === 0) {
        container.innerHTML = '<p class="no-data">Ingen lunchdata</p>';
        return;
    }

    const now       = new Date();
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        container.innerHTML = '<p class="no-data">Ingen lunch idag</p>';
        return;
    }

    const { dayCap } = getDateStrings(now);
    const menu = findTodaysMenu(data, now);

    if (!menu) {
        container.innerHTML = '<p class="no-data">Ingen lunch idag</p>';
        return;
    }

    const dayLabel = `<div class="lunch-day-name">${escapeHtml(dayCap)}</div>`;
    const mealsHtml = (menu.meny ?? [])
        .map(meal => `<div class="lunch-meal">${escapeHtml(meal)}</div>`)
        .join('');

    container.innerHTML = dayLabel + (mealsHtml || '<p class="no-data">Ingen lunch idag</p>');
}

function updateCalendar(data: CalendarData | null): void {
    const normalized = normalizeCalendarData(data);
    if (!normalized) {
        renderCalendarEvents([], 'cal-today');
        renderCalendarEvents([], 'cal-tomorrow');
        return;
    }

    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sortByDate = (a: CalendarEvent, b: CalendarEvent): number => {
        const da = parseDate(a.datetime || a.date || '');
        const db = parseDate(b.datetime || b.date || '');
        return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
    };

    const todayEvents    = normalized.events.filter(e => isSameDay(parseDate(e.datetime || e.date || ''), today)).sort(sortByDate);
    const tomorrowEvents = normalized.events.filter(e => isSameDay(parseDate(e.datetime || e.date || ''), tomorrow)).sort(sortByDate);

    renderCalendarEvents(todayEvents,    'cal-today');
    renderCalendarEvents(tomorrowEvents, 'cal-tomorrow');
}

// ── Mock data ─────────────────────────────────────────────────────────────────

function generateMockData(): void {
    updateTemperature(
        {
            outdoor: {
                current: 9,
                forecast: [{ max: 12 }, { max: 8 }, { max: 6 }],
            },
        },
        {
            current: 20,
            rooms: [
                { name: 'KÖK',   temp: 21 },
                { name: 'V-RUM', temp: 22 },
                { name: 'S-RUM', temp: 20 },
            ],
        }
    );

    const mockToday    = new Date();
    const mockTomorrow = new Date(mockToday);
    mockTomorrow.setDate(mockTomorrow.getDate() + 1);

    const todayStrings    = getDateStrings(mockToday);
    const tomorrowStrings = getDateStrings(mockTomorrow);

    const todayDatum    = `${todayStrings.dayCap} ${todayStrings.day} ${todayStrings.monthCap}`;
    const tomorrowDatum = `${tomorrowStrings.dayCap} ${tomorrowStrings.day} ${tomorrowStrings.monthCap}`;

    updateSchoolLunch([
        {
            datum: todayDatum,
            meny: ['Klimatsmartvecka: Chilipanna med ris', 'Falafelbiff med ris', 'Salladsbuffe'],
        },
        {
            datum: tomorrowDatum,
            meny: ['Västkustfisk med potatismos', 'Blomkålssoppa', 'Salladsbuffe'],
        },
    ]);

    const today    = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const d = (base: Date, h: number, m: number): string =>
        new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).toISOString();

    updateCalendar({
        events: [
            { datetime: d(today,    8,  0), summary: 'Soptömning'   },
            { datetime: d(today,   17,  0), summary: 'Falukorv & mos' },
            { datetime: d(today,   18, 30), summary: 'Makerspace'   },
            { datetime: d(tomorrow, 7,  0), summary: 'Lämna bilen'  },
            { datetime: d(tomorrow,17,  0), summary: 'Kvällsmat'    },
        ],
    });
}

// ── Initialisation ────────────────────────────────────────────────────────────

function markDataLoaded(): void {
    document.body.dataset.loaded = 'true';
}

async function fetchData(): Promise<void> {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) {
            console.warn('[ui] API request failed, using mock data');
            generateMockData();
            markDataLoaded();
            return;
        }

        const data: AllDataResponse = await response.json();

        if (!data.weather && !data.indoor && !data.lunch && !data.calendar) {
            generateMockData();
            markDataLoaded();
            return;
        }

        updateTemperature(data.weather, data.indoor);
        updateSchoolLunch(data.lunch);
        updateCalendar(data.calendar);
        markDataLoaded();
    } catch {
        console.warn('[ui] Failed to fetch data, using mock data');
        generateMockData();
        markDataLoaded();
    }
}

updateDate();
void fetchData();

setInterval(() => {
    updateDate();
    void fetchData();
}, 5 * 60 * 1000);
