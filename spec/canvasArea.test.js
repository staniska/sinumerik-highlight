jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            contourEditData: {
                editContour: [],
                points: {rounded: [], roundedObj: {}, intersection: []},
            }
        }
    }
}));

jest.mock('../lib/contourEdit/canvas', () => ({
    getFrame: jest.fn(() => ({x: 'X', y: 'Y'})),
    isNumber: (...args) => args.every(v => Number.isFinite(v)),
    updateArcProperties: jest.fn(),
}));

jest.mock('../lib/contourEdit/contourEditMain', () => ({
    getDistance: (p1, p2) => Math.sqrt((p1.X - p2.X) ** 2 + (p1.Y - p2.Y) ** 2),
}));

jest.mock('../lib/contourEdit/intersections', () => ({
    checkPointBelongsArc: jest.fn(() => true),
    getEquationOfLine: jest.requireActual('../lib/contourEdit/intersections').getEquationOfLine,
}));

const View = require('../lib/sinumerik').default
const {generateRoundedPoints, countRayCrossings} = require('../lib/contourEdit/tools/canvasArea')

// ─── helpers ─────────────────────────────────────────────────────────────────

const line = (x1, y1, x2, y2, id) => ({
    id,
    type: 'line',
    start: {X: x1, Y: y1},
    end: {X: x2, Y: y2},
})

const arc = (sx, sy, ex, ey, cx, cy, r, ccw, id) => ({
    id,
    type: 'arc',
    start: {X: sx, Y: sy},
    end: {X: ex, Y: ey},
    center: {X: cx, Y: cy},
    radius: r,
    startAng: Math.atan2(sy - cy, sx - cx),
    endAng: Math.atan2(ey - cy, ex - cx),
    ccw,
})

const setContour = (elements) => {
    View.sinumerikView.contourEditData.editContour = elements
}

// ─── generateRoundedPoints ────────────────────────────────────────────────────

describe('generateRoundedPoints', () => {
    test('rectangle 10×5: each edge has approx length+1 points along its primary axis', () => {
        setContour([
            line(0, 0, 10, 0, 1),  // bottom: 11 points (x=0..10)
            line(10, 0, 10, 5, 2), // right: 6 points (y=0..5)
            line(10, 5, 0, 5, 3),  // top: 11 points (x=0..10)
            line(0, 5, 0, 0, 4),   // left: 6 points (y=0..5)
        ])

        const points = generateRoundedPoints()

        // Each horizontal edge gives ceil(max-x) - floor(min-x) + 1 points
        const bottomPoints = points.filter(p => p.parentId === 1)
        const rightPoints = points.filter(p => p.parentId === 2)

        expect(bottomPoints.length).toBe(11) // x=0,1,...,10
        expect(rightPoints.length).toBe(6)   // y=0,1,...,5
    })

    test('endpoints are marked as endPoint=true', () => {
        setContour([line(0, 0, 5, 0, 1)])
        const points = generateRoundedPoints()
        const endpoints = points.filter(p => p.endPoint)
        expect(endpoints.some(p => p.coords.X === 0)).toBe(true)
        expect(endpoints.some(p => p.coords.X === 5)).toBe(true)
    })

    test('diagonal line: uses y-parameterisation when |slope| > 1', () => {
        // steep diagonal: from (0,0) to (2,10) — slope 5, |a/b|>1 so iterate over y
        setContour([line(0, 0, 2, 10, 1)])
        const points = generateRoundedPoints()
        // y iterates 0..10 → 11 points
        expect(points.length).toBe(11)
        points.forEach(p => {
            expect(Number.isInteger(p.coords.Y)).toBe(true)
        })
    })

    test('vertical line: generates points along y axis', () => {
        setContour([line(5, 0, 5, 8, 1)])
        const points = generateRoundedPoints()
        expect(points.length).toBe(9) // y=0..8
        points.forEach(p => expect(p.coords.X).toBe(5))
    })

    test('empty contour → 0 points', () => {
        setContour([])
        expect(generateRoundedPoints()).toHaveLength(0)
    })
})

// ─── countRayCrossings ────────────────────────────────────────────────────────

describe('countRayCrossings', () => {
    const x = 'X', y = 'Y'

    // Rectangle (0,0)→(10,0)→(10,10)→(0,10)→(0,0)
    const rect = [
        line(0, 0, 10, 0, 1),
        line(10, 0, 10, 10, 2),
        line(10, 10, 0, 10, 3),
        line(0, 10, 0, 0, 4),
    ]

    test('point inside rectangle → odd crossings', () => {
        // cursor at (5, 5): ray goes right, crosses the right edge at x=10 → 1 crossing
        const count = countRayCrossings({X: 5, Y: 5}, rect, x, y)
        expect(count % 2).toBe(1)
    })

    test('point outside rectangle (right of it) → even crossings', () => {
        // cursor at (15, 5): ray goes right, no edges to the right → 0 crossings
        const count = countRayCrossings({X: 15, Y: 5}, rect, x, y)
        expect(count % 2).toBe(0)
    })

    test('point outside rectangle (left of it) → even crossings', () => {
        // cursor at (-5, 5): ray goes right, crosses left edge (x=0) and right edge (x=10) → 2 crossings
        const count = countRayCrossings({X: -5, Y: 5}, rect, x, y)
        expect(count % 2).toBe(0)
    })

    test('point outside rectangle (above it) → even crossings', () => {
        // cursor at (5, 15): ray at y=15, no horizontal edge at y=15 → 0 crossings
        const count = countRayCrossings({X: 5, Y: 15}, rect, x, y)
        expect(count % 2).toBe(0)
    })

    test('concave shape: point in concavity → even crossings (outside)', () => {
        // Arrow shape: outer rect minus inner notch
        // Simple L-shape: (0,0)→(10,0)→(10,5)→(5,5)→(5,10)→(0,10)→(0,0)
        const lShape = [
            line(0, 0, 10, 0, 1),
            line(10, 0, 10, 5, 2),
            line(10, 5, 5, 5, 3),
            line(5, 5, 5, 10, 4),
            line(5, 10, 0, 10, 5),
            line(0, 10, 0, 0, 6),
        ]
        // Point at (7, 7): inside the notch (outside the L-shape)
        // Ray from (7,7) rightward at y=7: no right edges at y=7 → 0 crossings (outside ✓)
        const count = countRayCrossings({X: 7, Y: 7}, lShape, x, y)
        expect(count % 2).toBe(0)
        // Point at (3, 7): inside the L-shape vertical arm
        // Ray from (3,7) rightward at y=7: crosses left of notch vertical (x=5) → 1 crossing (inside ✓)
        const count2 = countRayCrossings({X: 3, Y: 7}, lShape, x, y)
        expect(count2 % 2).toBe(1)
    })

    test('tail segment sticking into rectangle does not affect inside/outside parity', () => {
        // Rectangle with a dangling tail inside: tail goes from (5,3) to (5,8) — both endpoints free
        // The caller (burnForest) is responsible for filtering out tails before calling countRayCrossings,
        // so this test verifies that passing only the rect (without tail) gives correct result.
        const rectWithTail = [
            line(0, 0, 10, 0, 1),
            line(10, 0, 10, 10, 2),
            line(10, 10, 0, 10, 3),
            line(0, 10, 0, 0, 4),
            line(5, 3, 5, 8, 5),   // tail — both endpoints disconnected
        ]
        // Without tail (as burnForest filters): cursor inside → odd
        const countClean = countRayCrossings({X: 2, Y: 5}, rect, x, y)
        expect(countClean % 2).toBe(1)

        // With tail included the parity might be wrong — demonstrates why burnForest filters by burnedIds
        // tail at x=5 does NOT cross ray from (2,5) since it's a vertical line (getEquationOfLine b=0,
        // handled by vertical branch) — but it does cross at x=5 for any y in [3,8].
        // Verify that the vertical tail IS counted when not filtered:
        const countWithTail = countRayCrossings({X: 2, Y: 5}, rectWithTail, x, y)
        // Tail (x=5) crosses the ray at y=5 which is in [3,8], so it adds 1 crossing → parity flips
        expect(countWithTail % 2).toBe(0) // wrong answer — demonstrates the bug burnForest now avoids
    })

    test('arc contour: checkPointBelongsArc called for arc intersections', () => {
        const {checkPointBelongsArc} = require('../lib/contourEdit/intersections')
        checkPointBelongsArc.mockReturnValue(true)

        // Circle arc center (0,0) r=10, full arc from (10,0) to (-10,0)
        const circleArc = arc(10, 0, -10, 0, 0, 0, 10, false, 1)
        // cursor at (0, 0): ray at y=0 crosses circle at x=10 and x=-10
        // only x=10 > 0 → checkPointBelongsArc called for (10,0), returns true → 1 crossing
        const count = countRayCrossings({X: 0, Y: 0}, [circleArc], x, y)
        expect(checkPointBelongsArc).toHaveBeenCalled()
        expect(count % 2).toBe(1)
    })
})
