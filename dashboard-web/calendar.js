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

function filterEventsByDate(events, targetDate) {
    return events
        .filter(e => {
            const d = parseDate(e.datetime || e.date || '');
            return isSameDay(d, targetDate);
        })
        .sort((a, b) => {
            const da = parseDate(a.datetime || a.date || '');
            const db = parseDate(b.datetime || b.date || '');
            return da - db;
        });
}

function updateCalendar(data) {
    if (Array.isArray(data) && data.length > 0 && data[0].events) {
        data = data[0];
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

    const todayEvents = filterEventsByDate(data.events, today);
    const tomorrowEvents = filterEventsByDate(data.events, tomorrow);

    renderCalendarEvents(todayEvents, 'cal-today');
    renderCalendarEvents(tomorrowEvents, 'cal-tomorrow');
}
