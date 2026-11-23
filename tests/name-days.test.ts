/**
 * Namnsdagar: tabellen är statisk (Svenska Akademiens namnlängd ändras sällan),
 * så testerna verifierar uppslag, datumformatering och skiften mellan dygn,
 * månader och år — inte hämtning.
 */

const { getNameDay, getNameDayInfo, NAME_DAYS } = require('../src/name-days');

describe('getNameDay', () => {
    test('slår upp dagens namn med lokala datumdelar', () => {
        expect(getNameDay(new Date(2026, 10, 23))).toEqual(['Klemens']);
    });

    test('returnerar flera namn när dagen har flera', () => {
        expect(getNameDay(new Date(2026, 0, 6))).toEqual(['Kasper', 'Melker', 'Baltsar']);
    });

    test('returnerar tom lista för dagar utan namnsdag', () => {
        expect(getNameDay(new Date(2026, 11, 25))).toEqual([]);
        expect(getNameDay(new Date(2028, 1, 29))).toEqual([]);
    });

    test('tabellen har en post per namnsdagsdag', () => {
        expect(Object.keys(NAME_DAYS)).toHaveLength(359);
    });

    test('alla datum i tabellen är giltiga MM-DD-nycklar', () => {
        const invalid = Object.keys(NAME_DAYS).filter(key => !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(key));
        expect(invalid).toEqual([]);
    });
});

describe('getNameDayInfo', () => {
    test('ger dagens och morgondagens namn', () => {
        expect(getNameDayInfo(new Date(2026, 10, 23))).toEqual({
            today: ['Klemens'],
            tomorrow: ['Gudrun', 'Rune']
        });
    });

    test('rullar över månadsskiften', () => {
        expect(getNameDayInfo(new Date(2026, 10, 30))).toEqual({
            today: ['Andreas', 'Anders'],
            tomorrow: ['Oskar', 'Ossian']
        });
    });

    test('rullar över årsskiften', () => {
        expect(getNameDayInfo(new Date(2026, 11, 31))).toEqual({
            today: ['Sylvester'],
            tomorrow: []
        });
    });

    test('hanterar skottdagen', () => {
        expect(getNameDayInfo(new Date(2028, 1, 28))).toEqual({
            today: ['Maria', 'Maja'],
            tomorrow: []
        });
    });
});
