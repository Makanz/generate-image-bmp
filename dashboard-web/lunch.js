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

    const todayDay = now.getDate();
    const todayMonth = now.getMonth();

    const monthNameLower = MONTHS_SV[todayMonth].toLowerCase();
    const monthNameUpper = MONTHS_SV[todayMonth];
    const monthNameCapitalized = monthNameLower.charAt(0).toUpperCase() + monthNameLower.slice(1);

    const dayNameLower = DAYS_SV[dayOfWeek];
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
