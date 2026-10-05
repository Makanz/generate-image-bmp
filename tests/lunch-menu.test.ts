import { lunchCoversDate, lunchCoversToday, type LunchItem } from '../src/lunch-menu';

const LAST_WEEK: LunchItem[] = [
    { datum: 'Måndag 28 September', meny: ['Köttbullar'] },
    { datum: 'Tisdag 29 September', meny: ['Torsk'] },
    { datum: 'Onsdag 30 September', meny: ['Kycklingwok'] },
    { datum: 'Torsdag 1 Oktober',    meny: ['Gulaschsoppa'] },
    { datum: 'Fredag 2 Oktober',     meny: ['Lasagnettegratäng'] },
];

const THIS_WEEK: LunchItem[] = [
    { datum: 'Måndag 5 Oktober',  meny: ['Stekt falukorv'] },
    { datum: 'Tisdag 6 Oktober',  meny: ['Chilipanna'] },
    { datum: 'Onsdag 7 Oktober',  meny: ['Pankopanerad fisk'] },
    { datum: 'Torsdag 8 Oktober', meny: ['Spaghetti'] },
    { datum: 'Fredag 9 Oktober',  meny: ['Schnitzel'] },
];

// Lovdag: skolan är stängd på måndagen, menyn har bara tis-fre.
const HOLIDAY_MONDAY: LunchItem[] = [
    { datum: 'Tisdag 6 Oktober',  meny: ['Chilipanna'] },
    { datum: 'Onsdag 7 Oktober',  meny: ['Pankopanerad fisk'] },
    { datum: 'Torsdag 8 Oktober', meny: ['Spaghetti'] },
    { datum: 'Fredag 9 Oktober',  meny: ['Schnitzel'] },
];

describe('lunchCoversDate (cache-färskhet)', () => {
    it('rejects a menu from the previous week on a school day', () => {
        // Regression: cachen ansågs färsk i 24 h, så måndagens hämtning i
        // containern gav förra veckans meny -> förra veckans rätt visades.
        expect(lunchCoversDate(LAST_WEEK, new Date(2026, 9, 5))).toBe(false);
    });

    it('accepts the current week', () => {
        expect(lunchCoversDate(THIS_WEEK, new Date(2026, 9, 5))).toBe(true);
        expect(lunchCoversDate(THIS_WEEK, new Date(2026, 9, 9))).toBe(true);
    });

    it('treats weekends as covered so a Friday payload stays cached', () => {
        expect(lunchCoversDate(LAST_WEEK, new Date(2026, 9, 3))).toBe(true);  // lördag
        expect(lunchCoversDate(LAST_WEEK, new Date(2026, 9, 4))).toBe(true);  // söndag
    });

    it('rejects null / empty payloads', () => {
        expect(lunchCoversDate(null, new Date(2026, 9, 5))).toBe(false);
        expect(lunchCoversDate([], new Date(2026, 9, 5))).toBe(false);
    });

    it('rejects the day after the menu week ends', () => {
        // Måndag 12 oktober täcks inte av vecka 5-9 oktober
        expect(lunchCoversDate(THIS_WEEK, new Date(2026, 9, 12))).toBe(false);
    });

    it('reports false on a holiday Monday that the menu skips', () => {
        // Cachen får då inte gälla, men datan är fortfarande den bästa vi har —
        // data.ts backar av med ERROR_RETRY_MS i stället för att hämta om på
        // varje anrop (se isInRetryBackoff).
        expect(lunchCoversDate(HOLIDAY_MONDAY, new Date(2026, 9, 5))).toBe(false);
    });
});

describe('lunchCoversToday', () => {
    it('uses the passed clock', () => {
        expect(lunchCoversToday(THIS_WEEK, new Date(2026, 9, 5))).toBe(true);
        expect(lunchCoversToday(LAST_WEEK, new Date(2026, 9, 5))).toBe(false);
    });
});
