const MONTHS_SV = ['JANUARI','FEBRUARI','MARS','APRIL','MAJ','JUNI','JULI','AUGUSTI','SEPTEMBER','OKTOBER','NOVEMBER','DECEMBER'];
const DAYS_SV = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
const TREND_THRESHOLD = 0.5;

function getTrend(current, previous) {
    if (previous === null) return '';
    const diff = current - previous;
    if (diff > TREND_THRESHOLD) return '↑';
    if (diff < -TREND_THRESHOLD) return '↓';
    return '→';
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const str = String(dateStr).trim();

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/);
    if (isoMatch) {
        const [, year, month, day, hour = 0, minute = 0, second = 0] = isoMatch;
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

function isSameDay(a, b) {
    if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return false;

    const aDate = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const bDate = new Date(b.getFullYear(), b.getMonth(), b.getDate());

    return aDate.getTime() === bDate.getTime();
}

function formatTime(datetimeStr) {
    const date = parseDate(datetimeStr);
    if (!date) return '';
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
