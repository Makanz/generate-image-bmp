// ── Matsedelns datumlogik ─────────────────────────────────────────────────────
//
// Skolans lunchmeny kommer som en post per skoldag med svenskt datum,
// t.ex. "Måndag 5 Oktober". Den här modulen är DOM-fri och delas av
// frontend (dashboard-web/script.ts) och backend (src/services/data.ts) —
// en enda källa för hur en meny-post matchas mot ett datum.
//
// Viktigt: matchning sker på *exakt* dag i månaden + månad. Att matcha på
// veckodagsnamn (som återkommer varje vecka) visar förra veckans rätt.

export interface LunchItem {
    datum: string;
    meny: string[];
}

export interface DateStrings {
    day: number;
    monthLower: string;
    monthUpper: string;
    monthCap: string;
    dayOfWeek: number;
    dayLower: string;
    dayCap: string;
}

export const MONTHS_LOWER = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];
export const MONTHS_UPPER = MONTHS_LOWER.map(m => m.toUpperCase());
export const MONTHS_CAP   = MONTHS_LOWER.map(m => m.charAt(0).toUpperCase() + m.slice(1));

export const DAYS_LOWER = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
export const DAYS_CAP   = DAYS_LOWER.map(d => d.charAt(0).toUpperCase() + d.slice(1));

/** Returns Swedish locale strings for a given date, used for date rendering. */
export function getDateStrings(date: Date): DateStrings {
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

/**
 * Parses a school-menu date string such as "Måndag 5 Oktober" or
 * "torsdag 1 oktober" into day-of-month + month index (0-11).
 * Returns null when the string carries no usable date (e.g. only a weekday).
 */
export function parseLunchDate(datum: string): { day: number; month: number } | null {
    const str = (datum || '').toLowerCase();
    const dayMatch = str.match(/\b(\d{1,2})\b/);
    if (!dayMatch) return null;

    const day = parseInt(dayMatch[1], 10);
    if (day < 1 || day > 31) return null;

    const month = MONTHS_LOWER.findIndex(m => str.includes(m));
    if (month < 0) return null;

    return { day, month };
}

/**
 * Finds the menu entry for the given date. Matches on day-of-month AND month,
 * so an entry from a previous week is never served as today's food.
 * Returns undefined when the menu has no entry for that date.
 */
export function findTodaysMenu(data: LunchItem[], date: Date): LunchItem | undefined {
    if (!Array.isArray(data) || data.length === 0) return undefined;

    const day   = date.getDate();
    const month = date.getMonth();

    return data.find(m => {
        const parsed = parseLunchDate(m.datum);
        return parsed !== null && parsed.day === day && parsed.month === month;
    });
}

/**
 * True when the menu payload covers the given date. Weekends count as covered
 * (there is no school lunch then) so a Friday payload stays cached over the
 * weekend instead of being refetched forever.
 */
export function lunchCoversDate(data: LunchItem[] | null, date: Date): boolean {
    if (!data || !Array.isArray(data) || data.length === 0) return false;

    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return true;

    return findTodaysMenu(data, date) !== undefined;
}

/** Convenience wrapper: does the payload cover today? */
export function lunchCoversToday(data: LunchItem[] | null, now: Date = new Date()): boolean {
    return lunchCoversDate(data, now);
}
