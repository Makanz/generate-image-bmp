const MONTHS_SV = ['JANUARI','FEBRUARI','MARS','APRIL','MAJ','JUNI','JULI','AUGUSTI','SEPTEMBER','OKTOBER','NOVEMBER','DECEMBER'];
const DAYS_SV = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];

interface Room {
    name: string;
    temp: number;
}

interface ForecastDay {
    temp: number;
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

const prevTemps: Record<string, number | null> = { ute: null, inne: null };

function getTrend(current: number, previous: number | null): string {
    if (previous === null) return '';
    const diff = current - previous;
    if (diff > 0.5) return '↑';
    if (diff < -0.5) return '↓';
    return '→';
}

function renderRoomChart(rooms: Room[]): void {
    const container = document.getElementById('room-chart');
    if (!container) return;
    if (!rooms || rooms.length === 0) {
        container.innerHTML = '';
        return;
    }

    const rows = rooms.map(room => {
        const val = Math.round(room.temp);
        const label = room.name.toUpperCase();
        return `<div class="room-row"><span class="room-name">${escapeHtml(label)}</span><span class="room-temp">${val}°</span></div>`;
    });

    container.innerHTML = rows.join('');
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    
    const aDate = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const bDate = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    
    return aDate.getTime() === bDate.getTime();
}

function formatTime(datetimeStr: string): string {
    const date = parseDate(datetimeStr);
    if (!date) return '';
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function updateDate(): void {
    const now = new Date();
    const yearEl = document.getElementById('date-year');
    const dayEl = document.getElementById('date-day');
    const monthEl = document.getElementById('date-month');
    if (yearEl) yearEl.textContent = String(now.getFullYear());
    if (dayEl) dayEl.textContent = String(now.getDate());
    if (monthEl) monthEl.textContent = MONTHS_SV[now.getMonth()];
}

function updateTemperature(weather: WeatherData | null, indoor: IndoorData | null): void {
    if (weather) {
        const current = weather.outdoor?.current ?? weather.temperature;
        if (current !== undefined) {
            const rounded = Math.round(current);
            const trend = getTrend(rounded, prevTemps.ute);
            prevTemps.ute = rounded;
            const uteTempEl = document.getElementById('ute-temp-val');
            const uteTrendEl = document.getElementById('ute-trend');
            if (uteTempEl) uteTempEl.textContent = String(rounded);
            if (uteTrendEl) uteTrendEl.textContent = trend;
        }
        const forecast = weather.outdoor?.forecast || [];
        for (let i = 0; i < 3; i++) {
            const el = document.getElementById(`forecast-${i}`);
            if (el) {
                el.textContent = forecast[i] !== undefined
                    ? Math.round(forecast[i].temp ?? forecast[i]) + '°'
                    : '--°';
            }
        }
    }

    if (indoor) {
        const current = indoor.current;
        if (current !== undefined) {
            const rounded = Math.round(current);
            const trend = getTrend(rounded, prevTemps.inne);
            prevTemps.inne = rounded;
            const inneTempEl = document.getElementById('inne-temp-val');
            const inneTrendEl = document.getElementById('inne-trend');
            if (inneTempEl) inneTempEl.textContent = String(rounded);
            if (inneTrendEl) inneTrendEl.textContent = trend;
        }
        renderRoomChart(indoor.rooms || []);
    }
}

function updateSchoolLunch(data: LunchItem[] | null): void {
    const container = document.getElementById('lunch-content');
    if (!container) return;

    if (!data || !Array.isArray(data) || data.length === 0) {
        container.innerHTML = '<p class="no-data">Ingen lunchdata</p>';
        return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        container.innerHTML = '<p class="no-data">Ingen lunch idag</p>';
        return;
    }

    const todayDay = now.getDate();
    const todayMonth = now.getMonth();
    
    const monthNames = [
        'januari', 'februari', 'mars', 'april', 'maj', 'juni',
        'juli', 'augusti', 'september', 'oktober', 'november', 'december'
    ];
    
    const monthNameLower = monthNames[todayMonth];
    const monthNameUpper = monthNameLower.toUpperCase();
    const monthNameCapitalized = monthNameLower.charAt(0).toUpperCase() + monthNameLower.slice(1);
    
    const dayNames = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
    const dayNameLower = dayNames[dayOfWeek];
    const dayNameCapitalized = dayNameLower.charAt(0).toUpperCase() + dayNameLower.slice(1);

    const menu = data.find(m => {
        const datum = (m.datum || '').toLowerCase();
        
        const containsDay = new RegExp(`\\b${todayDay}\\b`).test(datum);
        const containsMonth = datum.includes(monthNameLower) || 
                             datum.includes(monthNameCapitalized) || 
                             datum.includes(monthNameUpper);
        
        const containsWeekday = datum.includes(dayNameLower) || 
                               datum.includes(dayNameCapitalized);
        
        return (containsDay && containsMonth) || containsWeekday;
    }) || data[0];

    if (!menu) {
        container.innerHTML = '<p class="no-data">Ingen lunch idag</p>';
        return;
    }

    const dayLabel = menu.datum ? `<div class="lunch-day-name">${escapeHtml(menu.datum)}</div>` : '';
    const mealsHtml = (menu.meny || [])
        .map(meal => `<div class="lunch-meal">${escapeHtml(meal)}</div>`)
        .join('');

    container.innerHTML = dayLabel + (mealsHtml || '<p class="no-data">Ingen lunch idag</p>');
}

function renderCalendarEvents(events: CalendarEvent[], containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<p class="no-data">Inga händelser</p>';
        return;
    }

    const html = events.map(event => {
        const time = formatTime(event.datetime || event.date || '');
        const title = escapeHtml(event.summary || event.title || '');
        const timeHtml = time
            ? `<span class="cal-time">${time}</span>`
            : `<span class="cal-time"></span>`;
        return `<div class="cal-event">${timeHtml}<span class="cal-title">${title}</span></div>`;
    }).join('');

    container.innerHTML = html;
}

function updateCalendar(data: CalendarData | null): void {
    if (Array.isArray(data) && data.length > 0 && (data[0] as CalendarData).events) {
        data = data[0] as CalendarData;
    }
    if (!data || !data.events) {
        renderCalendarEvents([], 'cal-today');
        renderCalendarEvents([], 'cal-tomorrow');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sortByDate = (a: CalendarEvent, b: CalendarEvent): number => {
        const da = parseDate(a.datetime || a.date || '');
        const db = parseDate(b.datetime || b.date || '');
        return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
    };

    const todayEvents = data.events.filter(e => {
        const d = parseDate(e.datetime || e.date || '');
        return isSameDay(d, today);
    }).sort(sortByDate);

    const tomorrowEvents = data.events.filter(e => {
        const d = parseDate(e.datetime || e.date || '');
        return isSameDay(d, tomorrow);
    }).sort(sortByDate);

    renderCalendarEvents(todayEvents, 'cal-today');
    renderCalendarEvents(tomorrowEvents, 'cal-tomorrow');
}

function generateMockData(): void {
    updateTemperature(
        {
            outdoor: {
                current: 9,
                forecast: [{ temp: 12 }, { temp: 8 }, { temp: 6 }]
            }
        },
        {
            current: 20,
            rooms: [
                { name: 'KÖK', temp: 21 },
                { name: 'V-RUM', temp: 22 },
                { name: 'S-RUM', temp: 20 }
            ]
        }
    );

    updateSchoolLunch([
        {
            datum: 'Måndag 23 Mars',
            meny: ['Klimatsmartvecka: Chilipanna med ris', 'Falafelbiff med ris', 'Salladsbuffe']
        },
        {
            datum: 'Tisdag 24 Mars',
            meny: ['Västkustfisk med potatismos', 'Blomkålssoppa', 'Salladsbuffe']
        }
    ]);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    updateCalendar({
        events: [
            { datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0).toISOString(), summary: 'Soptömning' },
            { datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString(), summary: 'Falukorv & mos' },
            { datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 30).toISOString(), summary: 'Makerspace' },
            { datetime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 7, 0).toISOString(), summary: 'Lämna bilen' },
            { datetime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 17, 0).toISOString(), summary: 'Kvällsmat' }
        ]
    });
}

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
