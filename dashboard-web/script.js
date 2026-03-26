const MONTHS_SV = ['JANUARI','FEBRUARI','MARS','APRIL','MAJ','JUNI','JULI','AUGUSTI','SEPTEMBER','OKTOBER','NOVEMBER','DECEMBER'];
const DAYS_SV = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];

const prevTemps = { ute: null, inne: null };

function getTrend(current, previous) {
    if (previous === null) return '';
    const diff = current - previous;
    if (diff > 0.5) return '↑';
    if (diff < -0.5) return '↓';
    return '→';
}

function renderRoomChart(rooms) {
    const container = document.getElementById('room-chart');
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function formatTime(datetimeStr) {
    const date = new Date(datetimeStr);
    if (isNaN(date.getTime())) return '';
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function updateDate() {
    const now = new Date();
    document.getElementById('date-year').textContent = now.getFullYear();
    document.getElementById('date-day').textContent = now.getDate();
    document.getElementById('date-month').textContent = MONTHS_SV[now.getMonth()];
}

function updateTemperature(weather, indoor) {
    // Utomhus
    if (weather) {
        const current = weather.outdoor?.current ?? weather.temperature;
        if (current !== undefined) {
            const rounded = Math.round(current);
            const trend = getTrend(rounded, prevTemps.ute);
            prevTemps.ute = rounded;
            document.getElementById('ute-temp-val').textContent = rounded;
            document.getElementById('ute-trend').textContent = trend;
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

    // Inomhus
    if (indoor) {
        const current = indoor.current;
        if (current !== undefined) {
            const rounded = Math.round(current);
            const trend = getTrend(rounded, prevTemps.inne);
            prevTemps.inne = rounded;
            document.getElementById('inne-temp-val').textContent = rounded;
            document.getElementById('inne-trend').textContent = trend;
        }
        renderRoomChart(indoor.rooms || []);
    }
}

function updateSchoolLunch(data) {
    const container = document.getElementById('lunch-content');

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

    const todayDate = now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    const todayDateCap = todayDate.charAt(0).toUpperCase() + todayDate.slice(1);

    const menu = data.find(m => {
        const datum = (m.datum || '').toLowerCase();
        return datum.includes(todayDateCap.toLowerCase());
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

function renderCalendarEvents(events, containerId) {
    const container = document.getElementById(containerId);

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

function updateCalendar(data) {
    if (!data || !data.events) {
        renderCalendarEvents([], 'cal-today');
        renderCalendarEvents([], 'cal-tomorrow');
        return;
    }

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayEvents = data.events.filter(e => {
        const d = new Date(e.datetime || e.date || '');
        return isSameDay(d, today);
    });

    const tomorrowEvents = data.events.filter(e => {
        const d = new Date(e.datetime || e.date || '');
        return isSameDay(d, tomorrow);
    });

    renderCalendarEvents(todayEvents, 'cal-today');
    renderCalendarEvents(tomorrowEvents, 'cal-tomorrow');
}

function generateMockData() {
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

function markDataLoaded() {
    document.body.dataset.loaded = 'true';
}

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) {
            console.warn('[ui] API request failed, using mock data');
            generateMockData();
            markDataLoaded();
            return;
        }
        const data = await response.json();

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
fetchData();

setInterval(() => {
    updateDate();
    fetchData();
}, 5 * 60 * 1000);
