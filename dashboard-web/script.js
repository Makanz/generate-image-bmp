function updateTimestamp() {
    const now = new Date();
    const formatted = now.toLocaleString('sv-SE', {
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('timestamp').textContent = formatted;
}

function formatDateSwedish(dateStr) {
    const date = new Date(dateStr);
    const weekdays = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
    const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    return `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function isToday(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

function updateWeather(data) {
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const locationEl = document.getElementById('weather-location');
    const precipEl = document.getElementById('weather-precip');

    if (!data || data.error) {
        tempEl.textContent = '--°C';
        descEl.textContent = 'Ingen data';
        locationEl.textContent = '';
        precipEl.textContent = '';
        return;
    }

    if (data.temperature !== undefined) {
        tempEl.textContent = Math.round(data.temperature) + '°C';
    }
    if (data.description) {
        descEl.textContent = data.description;
    }
    if (data.location) {
        locationEl.textContent = data.location;
    }
    if (data.precipitation !== undefined) {
        precipEl.textContent = 'Nederbörd: ' + data.precipitation + '%';
    }
}

function updateLunch(data) {
    const container = document.getElementById('lunch-content');

    if (!data || data.error || !data.menus || data.menus.length === 0) {
        container.innerHTML = '<p class="no-data">Ingen lunchdata tillgänglig</p>';
        return;
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (!isWeekday) {
        container.innerHTML = '<p class="no-data">Ingen lunch idag</p>';
        return;
    }

    const html = data.menus.map(menu => {
        const meals = menu.meals || [];
        const mealsHtml = meals.map(meal => `<div class="lunch-meals">${escapeHtml(meal)}</div>`).join('');
        return `
            <div class="lunch-item">
                <div class="lunch-day">${escapeHtml(menu.day || '')}</div>
                ${mealsHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = html || '<p class="no-data">Ingen lunch idag</p>';
}

function updateCalendar(data) {
    const container = document.getElementById('calendar-content');

    if (!data || data.error || !data.events || data.events.length === 0) {
        container.innerHTML = '<p class="no-data">Inga kalenderhändelser</p>';
        return;
    }

    const html = data.events.slice(0, 7).map(event => {
        const todayClass = isToday(event.date) ? 'today' : '';
        return `
            <div class="calendar-item ${todayClass}">
                <span class="calendar-date">${formatDateSwedish(event.date)}</span>
                <span class="calendar-event">${escapeHtml(event.summary || event.title || '')}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateMockData() {
    updateWeather({
        temperature: 18 + Math.random() * 10,
        description: 'Delvis molnigt',
        location: 'Stockholm',
        precipitation: Math.floor(Math.random() * 50)
    });

    const today = new Date();
    const events = [];
    for (let i = 0; i < 5; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        events.push({
            date: date.toISOString().split('T')[0],
            summary: ['Möte', 'Handla', 'Träning', 'Lunch', 'Apotek'][Math.floor(Math.random() * 5)] + ' ' + (i + 1)
        });
    }
    updateCalendar({ events: events });

    updateLunch({
        menus: [{
            day: 'Idag',
            meals: ['Köttbullar med potatis', 'Vegetarisk pasta', 'Sallad']
        }]
    });
}

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) {
            console.warn('[ui] API request failed, using mock data');
            generateMockData();
            return;
        }
        const data = await response.json();

        updateWeather(data.weather);
        updateCalendar(data.calendar);
        updateLunch(data.lunch);
    } catch {
        console.warn('[ui] Failed to fetch data, using mock data');
        generateMockData();
    }
}

updateTimestamp();
fetchData();

setInterval(() => {
    updateTimestamp();
    fetchData();
}, 5 * 60 * 1000);
