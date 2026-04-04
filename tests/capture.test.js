const { generateImage, getChanges } = require('../capture.js');

describe('capture.js - mergeRegions', () => {
    const { mergeRegions } = require('../capture.js');

    test('returns empty array for empty input', () => {
        expect(mergeRegions([], 10)).toEqual([]);
    });

    test('returns single region unchanged', () => {
        const regions = [{ x: 0, y: 0, width: 10, height: 10 }];
        expect(mergeRegions(regions, 10)).toEqual(regions);
    });

    test('merges overlapping regions', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 5, y: 5, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
        expect(merged[0].x).toBe(0);
        expect(merged[0].y).toBe(0);
        expect(merged[0].width).toBe(15);
        expect(merged[0].height).toBe(15);
    });

    test('does not merge non-overlapping regions', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 100, y: 100, width: 10, height: 10 }
        ];
        expect(mergeRegions(regions, 10)).toHaveLength(2);
    });

    test('merges regions within distance threshold', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 15, y: 15, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
    });

    test('merges multiple overlapping regions into one', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 8, y: 0, width: 10, height: 10 },
            { x: 16, y: 0, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 10);
        expect(merged).toHaveLength(1);
        expect(merged[0].x).toBe(0);
        expect(merged[0].width).toBe(26);
    });

    test('handles large distance threshold', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 100, y: 100, width: 10, height: 10 }
        ];
        const merged = mergeRegions(regions, 200);
        expect(merged).toHaveLength(1);
    });
});
