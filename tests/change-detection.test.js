const { mergeRegions } = require('../capture.ts');

describe('mergeRegions - union-find implementation', () => {
    test('returns empty array unchanged', () => {
        expect(mergeRegions([], 10)).toEqual([]);
    });

    test('returns single region unchanged', () => {
        const regions = [{ x: 10, y: 20, width: 50, height: 30 }];
        const result = mergeRegions(regions, 10);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    });

    test('merges two directly overlapping regions', () => {
        const regions = [
            { x: 0, y: 0, width: 20, height: 10 },
            { x: 10, y: 0, width: 20, height: 10 }
        ];
        const result = mergeRegions(regions, 0);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ x: 0, y: 0, width: 30, height: 10 });
    });

    test('merges two regions within distance threshold', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 25, y: 0, width: 10, height: 10 }
        ];
        // Gap between regions is 25 - 10 = 15, distance=20 so they should merge
        const result = mergeRegions(regions, 20);
        expect(result).toHaveLength(1);
        expect(result[0].x).toBe(0);
        expect(result[0].width).toBe(35);
    });

    test('keeps two regions separate when beyond distance threshold', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 100, y: 0, width: 10, height: 10 }
        ];
        const result = mergeRegions(regions, 5);
        expect(result).toHaveLength(2);
    });

    test('merges a chain of regions transitively', () => {
        // A overlaps B, B overlaps C, but A does not overlap C directly
        // All three should still merge into one via union-find transitivity
        const regions = [
            { x: 0,  y: 0, width: 15, height: 10 },
            { x: 10, y: 0, width: 15, height: 10 },
            { x: 20, y: 0, width: 15, height: 10 }
        ];
        const result = mergeRegions(regions, 0);
        expect(result).toHaveLength(1);
        expect(result[0].x).toBe(0);
        expect(result[0].width).toBe(35);
    });

    test('produces correct bounding box when merging non-uniform regions', () => {
        const regions = [
            { x: 10, y: 50, width: 20, height: 10 },
            { x: 100, y: 10, width: 30, height: 80 }
        ];
        // Vertical overlap: r1 y=[50,60], r2 y=[10,90] -> overlap, horizontal gap is 70 < distance=100
        const result = mergeRegions(regions, 100);
        expect(result).toHaveLength(1);
        expect(result[0].x).toBe(10);
        expect(result[0].y).toBe(10);
        expect(result[0].width).toBe(120);  // 130 - 10
        expect(result[0].height).toBe(80);  // 90 - 10
    });

    test('merges all regions into one when all are close together', () => {
        const regions = [
            { x: 0,   y: 0,   width: 5, height: 5 },
            { x: 10,  y: 0,   width: 5, height: 5 },
            { x: 20,  y: 0,   width: 5, height: 5 },
            { x: 30,  y: 0,   width: 5, height: 5 },
            { x: 40,  y: 0,   width: 5, height: 5 }
        ];
        const result = mergeRegions(regions, 10);
        expect(result).toHaveLength(1);
        expect(result[0].x).toBe(0);
        expect(result[0].width).toBe(45);
    });

    test('produces two groups when regions cluster into separate islands', () => {
        const regions = [
            { x: 0,   y: 0, width: 10, height: 10 },
            { x: 5,   y: 0, width: 10, height: 10 },
            { x: 500, y: 0, width: 10, height: 10 },
            { x: 505, y: 0, width: 10, height: 10 }
        ];
        const result = mergeRegions(regions, 10);
        expect(result).toHaveLength(2);
        const sorted = result.sort((a, b) => a.x - b.x);
        expect(sorted[0].x).toBe(0);
        expect(sorted[1].x).toBe(500);
    });

    test('handles large number of regions without incorrect merging', () => {
        // 100 small regions spaced 200px apart - none should merge
        const regions = [];
        for (let i = 0; i < 100; i++) {
            regions.push({ x: i * 200, y: 0, width: 10, height: 10 });
        }
        const result = mergeRegions(regions, 5);
        expect(result).toHaveLength(100);
    });

    test('zero distance: only merges overlapping regions', () => {
        const regions = [
            { x: 0, y: 0, width: 10, height: 10 },  // ends at x=10
            { x: 10, y: 0, width: 10, height: 10 }, // starts at x=10, touching
            { x: 21, y: 0, width: 10, height: 10 }  // starts at x=21, gap of 1
        ];
        const result = mergeRegions(regions, 0);
        // First two share edge (x=10), so overlap at zero distance
        expect(result).toHaveLength(2);
    });

    test('output regions have non-negative dimensions', () => {
        const regions = [
            { x: 5, y: 5, width: 1, height: 1 },
            { x: 6, y: 6, width: 1, height: 1 }
        ];
        const result = mergeRegions(regions, 5);
        for (const r of result) {
            expect(r.width).toBeGreaterThanOrEqual(0);
            expect(r.height).toBeGreaterThanOrEqual(0);
        }
    });

    test('merges vertically stacked regions', () => {
        const regions = [
            { x: 0, y: 0,  width: 10, height: 10 },
            { x: 0, y: 10, width: 10, height: 10 }
        ];
        const result = mergeRegions(regions, 0);
        expect(result).toHaveLength(1);
        expect(result[0].y).toBe(0);
        expect(result[0].height).toBe(20);
    });

    test('deterministic: same input always produces same output', () => {
        const regions = [
            { x: 0,  y: 0,  width: 50, height: 50 },
            { x: 40, y: 40, width: 50, height: 50 },
            { x: 200, y: 200, width: 30, height: 30 }
        ];
        const result1 = mergeRegions(regions, 10);
        const result2 = mergeRegions(regions, 10);
        expect(result1).toEqual(result2);
    });
});
