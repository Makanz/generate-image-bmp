import { findTodaysMenu, parseLunchDate, getDateStrings, type LunchItem } from '../src/lunch-menu';

const STALE_WEEK: LunchItem[] = [
    { datum: 'Måndag 28 September', meny: ['Köttbullar serveras med potatismos och lingonsylt'] },
    { datum: 'Tisdag 29 September', meny: ['Panerad torsk'] },
    { datum: 'Onsdag 30 September', meny: ['Kycklingwok'] },
    { datum: 'Torsdag 1 Oktober',    meny: ['Gulaschsoppa'] },
    { datum: 'Fredag 2 Oktober',     meny: ['Lasagnettegratäng'] },
];

const CURRENT_WEEK: LunchItem[] = [
    { datum: 'Måndag 5 Oktober',  meny: ['Stekt falukorv serveras med potatismos och ketchup'] },
    { datum: 'Tisdag 6 Oktober',  meny: ['Chilipanna med ris'] },
    { datum: 'Onsdag 7 Oktober',  meny: ['Pankopanerad fisk'] },
    { datum: 'Torsdag 8 Oktober', meny: ['Spaghetti med köttfärssås'] },
    { datum: 'Fredag 9 Oktober',  meny: ['Schnitzel'] },
];

const MONDAY_5_OCT_2026 = new Date(2026, 9, 5);   // Måndag 5 oktober 2026
const TUESDAY_6_OCT_2026 = new Date(2026, 9, 6);

describe('parseLunchDate', () => {
    it('parses a Swedish weekday date string', () => {
        expect(parseLunchDate('Måndag 5 Oktober')).toEqual({ day: 5, month: 9 });
        expect(parseLunchDate('torsdag 1 oktober')).toEqual({ day: 1, month: 9 });
    });

    it('handles single digit days and mixed case', () => {
        expect(parseLunchDate('FREDAG 9 oktober')).toEqual({ day: 9, month: 9 });
    });

    it('returns null when no date is present', () => {
        expect(parseLunchDate('')).toBeNull();
        expect(parseLunchDate('Måndag')).toBeNull();
        expect(parseLunchDate('Vecka 41')).toBeNull();
    });

    it('rejects impossible day numbers', () => {
        expect(parseLunchDate('Måndag 42 Oktober')).toBeNull();
    });
});

describe('findTodaysMenu', () => {
    it('returns the entry matching the exact day and month', () => {
        expect(findTodaysMenu(CURRENT_WEEK, MONDAY_5_OCT_2026)?.meny)
            .toEqual(['Stekt falukorv serveras med potatismos och ketchup']);
        expect(findTodaysMenu(CURRENT_WEEK, TUESDAY_6_OCT_2026)?.datum)
            .toBe('Tisdag 6 Oktober');
    });

    // Regression: the menu for a previous week used to be served as today's
    // food because matching fell back to the weekday name.
    it('does NOT return last week\'s Monday entry on a Monday', () => {
        expect(findTodaysMenu(STALE_WEEK, MONDAY_5_OCT_2026)).toBeUndefined();
    });

    it('does NOT fall back to the first array item', () => {
        expect(findTodaysMenu(STALE_WEEK, MONDAY_5_OCT_2026)).not.toEqual(STALE_WEEK[0]);
    });

    it('picks the current week when the payload holds both weeks', () => {
        const combined = [...STALE_WEEK, ...CURRENT_WEEK];
        const menu = findTodaysMenu(combined, MONDAY_5_OCT_2026);
        expect(menu?.datum).toBe('Måndag 5 Oktober');
        expect(menu?.meny[0]).toContain('Stekt falukorv');
    });

    it('distinguishes same weekday in different months', () => {
        const octoberAndNovember: LunchItem[] = [
            { datum: 'Måndag 2 November', meny: ['Novemberrätt'] },
            { datum: 'Måndag 5 Oktober',  meny: ['Oktoberrätt'] },
        ];
        expect(findTodaysMenu(octoberAndNovember, MONDAY_5_OCT_2026)?.meny)
            .toEqual(['Oktoberrätt']);
    });

    it('returns undefined for empty or malformed input', () => {
        expect(findTodaysMenu([], MONDAY_5_OCT_2026)).toBeUndefined();
        expect(findTodaysMenu(undefined as unknown as LunchItem[], MONDAY_5_OCT_2026)).toBeUndefined();
        expect(findTodaysMenu([{ datum: '', meny: ['X'] }], MONDAY_5_OCT_2026)).toBeUndefined();
    });
});

describe('getDateStrings', () => {
    it('returns Swedish locale strings for the given date', () => {
        const s = getDateStrings(MONDAY_5_OCT_2026);
        expect(s.day).toBe(5);
        expect(s.monthLower).toBe('oktober');
        expect(s.monthCap).toBe('Oktober');
        expect(s.dayCap).toBe('Måndag');
    });
});
