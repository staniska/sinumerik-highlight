import {
    threadRevolutions,
    threadMarks,
    dottedMarks,
    marksInSlice,
    resolveThreadPitch,
    MAX_MARKS_PER_BLOCK,
} from '../lib/threadMarks'

describe('threadRevolutions', () => {
    test('a constant pitch is the travel over the pitch', () => {
        const run = threadRevolutions(100, 2)
        expect(run.turns).toBeCloseTo(50, 10)
        expect(run.endPitch).toBe(2)
    })

    test('a progressive pitch agrees with the documented F = |ke2 - ka2| / (2 IG)', () => {
        // Built the other way round: 20 revolutions from 1.5 at 0.02 mm/rev^2
        // travel 1.5*20 + 0.02*20^2/2 = 34 and end on 1.9.
        const travel = 34
        const run = threadRevolutions(travel, 1.5, 0.02)
        expect(run.turns).toBeCloseTo(20, 10)
        expect(run.endPitch).toBeCloseTo(1.9, 10)

        const documented = Math.abs(run.endPitch ** 2 - 1.5 ** 2) / (2 * travel)
        expect(documented).toBeCloseTo(0.02, 10)
    })

    test('a degressive pitch takes the first crossing, before the pitch turns round', () => {
        const run = threadRevolutions(100, 2, -0.01)
        expect(run.turns).toBeCloseTo(58.5786437627, 8)
        expect(run.endPitch).toBeCloseTo(2 - 0.01 * run.turns, 10)
        expect(run.endPitch).toBeGreaterThan(0)
    })

    test('the travel a shrinking pitch cannot reach is one named error', () => {
        // s(n) peaks at ka/|F| = 200 revolutions with 2^2 / (2*0.01) = 200 mm.
        const run = threadRevolutions(250, 2, -0.01)
        expect(run.error).toBe('unreachable')
        expect(run.reachable).toBeCloseTo(200, 10)
    })

    test('the travel exactly at the peak is still reachable', () => {
        const run = threadRevolutions(200, 2, -0.01)
        expect(run.error).toBeUndefined()
        expect(run.turns).toBeCloseTo(200, 6)
    })

    test('a pitch of zero or less is refused, and so is a block that does not move', () => {
        expect(threadRevolutions(100, 0).error).toBe('pitch')
        expect(threadRevolutions(100, -2).error).toBe('pitch')
        expect(threadRevolutions(0, 2).error).toBe('travel')
    })
})

describe('threadMarks', () => {
    test('with nothing carried in, the block starts on a mark', () => {
        const {marks, phaseOut} = threadMarks({travel: 10, pitch: 2})
        expect(marks.length).toBe(6)
        marks.forEach((m, i) => expect(m * 10).toBeCloseTo(i * 2, 10))
        expect(phaseOut).toBeCloseTo(0, 10)
    })

    test('the phase carries across blocks: marks land where one long block would put them', () => {
        const whole = threadMarks({travel: 100, pitch: 2})
        const wholeAt = whole.marks.map(m => m * 100)

        const first = threadMarks({travel: 31, pitch: 2})
        const second = threadMarks({travel: 69, pitch: 2, phaseIn: first.phaseOut})

        const chained = first.marks.map(m => m * 31)
            .concat(second.marks.map(m => 31 + m * 69))

        expect(first.phaseOut).toBeCloseTo(0.5, 10)
        expect(chained.length).toBe(wholeAt.length)
        chained.forEach((at, i) => expect(at).toBeCloseTo(wholeAt[i], 8))
    })

    test('the phase carries when the leading axis changes with it', () => {
        // A cylinder in Z, then a run-out whose pitch is written for X. The
        // revolution is the invariant, not the axis.
        const run = threadMarks({travel: 31, pitch: 2})
        const out = threadMarks({travel: 5, pitch: 2, phaseIn: run.phaseOut})
        expect(out.marks[0] * 5).toBeCloseTo(1, 10)
    })

    test('SF sets the phase, so the first mark comes early by SF/360 of a pitch', () => {
        const {marks} = threadMarks({travel: 10, pitch: 2, phaseIn: 90 / 360})
        expect(marks[0] * 10).toBeCloseTo(1.5, 10)
        expect(marks[1] * 10).toBeCloseTo(3.5, 10)
    })

    test('a progressive pitch spaces the marks out as it goes', () => {
        const {marks} = threadMarks({travel: 34, pitch: 1.5, pitchChange: 0.02})
        const at = marks.map(m => m * 34)
        expect(at[0]).toBeCloseTo(0, 10)
        expect(at[1] - at[0]).toBeCloseTo(1.51, 10)
        expect(at[at.length - 1] - at[at.length - 2]).toBeLessThan(1.9)
        expect(at[at.length - 1] - at[at.length - 2]).toBeGreaterThan(1.8)
    })

    test('no mark falls outside the block', () => {
        const {marks} = threadMarks({travel: 7.3, pitch: 0.8, phaseIn: 0.37})
        marks.forEach(m => {
            expect(m).toBeGreaterThanOrEqual(0)
            expect(m).toBeLessThanOrEqual(1)
        })
    })

    test('a block shorter than one revolution carries its phase on and draws nothing', () => {
        const {marks, phaseOut} = threadMarks({travel: 1, pitch: 2, phaseIn: 0.1})
        expect(marks).toEqual([])
        expect(phaseOut).toBeCloseTo(0.6, 10)
    })

    test('too many marks is refused with the count, and nothing is generated', () => {
        const out = threadMarks({travel: 300, pitch: 0.01})
        expect(out.error).toBe('tooMany')
        expect(out.count).toBeGreaterThan(MAX_MARKS_PER_BLOCK)
        expect(out.marks).toBeUndefined()
    })

    test('the error from the revolutions is passed through untouched', () => {
        expect(threadMarks({travel: 250, pitch: 2, pitchChange: -0.01}).error).toBe('unreachable')
    })
})

describe('dottedMarks', () => {
    test('the end of the block is always a point', () => {
        const run = threadMarks({travel: 7, pitch: 2})
        expect(run.marks[run.marks.length - 1] * 7).toBeCloseTo(6, 10)
        expect(dottedMarks(run)).toEqual(run.marks.concat(1))
    })

    test('a crest landing on the end is not doubled', () => {
        const run = threadMarks({travel: 6, pitch: 2})
        expect(dottedMarks(run)).toEqual(run.marks)
        expect(dottedMarks(run)[dottedMarks(run).length - 1]).toBe(1)
    })

    test('a block with no crest at all still ends with a point', () => {
        expect(dottedMarks(threadMarks({travel: 1, pitch: 2, phaseIn: 0.1}))).toEqual([1])
    })
})

describe('resolveThreadPitch', () => {
    const G18 = ['K', 'I']

    test('a cylinder in Z takes K', () => {
        const out = resolveThreadPitch({
            vectors: {K: 2}, travels: {X: 0, Z: -30}, planeVectors: G18,
        })
        expect(out).toEqual({name: 'K', axis: 'Z', pitch: 2, travel: 30})
    })

    test('a face thread takes I, and the travel read is the radial one', () => {
        const out = resolveThreadPitch({
            vectors: {I: 1.5}, travels: {X: 12, Z: 0}, planeVectors: G18,
        })
        expect(out.axis).toBe('X')
        expect(out.travel).toBe(12)
    })

    test('the pitch must belong to the plane', () => {
        const out = resolveThreadPitch({
            vectors: {J: 2}, travels: {Y: 30}, planeVectors: G18,
        })
        expect(out.error).toBe('offPlane')
    })

    test('two pitch vectors in one block are refused', () => {
        const out = resolveThreadPitch({
            vectors: {K: 2, I: 1}, travels: {X: 10, Z: -30}, planeVectors: G18,
        })
        expect(out.error).toBe('manyPitch')
    })

    test('no pitch vector at all is refused', () => {
        expect(resolveThreadPitch({travels: {Z: -30}, planeVectors: G18}).error).toBe('noPitch')
    })

    test('the pitch must be given for the axis that travels furthest', () => {
        const out = resolveThreadPitch({
            vectors: {K: 2}, travels: {X: 30, Z: -10}, planeVectors: G18,
        })
        expect(out.error).toBe('shortAxis')
        expect(out.axis).toBe('Z')
        expect(out.longest).toBe(30)
    })

    test('a 45 degree taper accepts either vector, last bit included', () => {
        const travels = {X: 20, Z: -20 * (1 + Number.EPSILON)}
        expect(resolveThreadPitch({vectors: {K: 2}, travels, planeVectors: G18}).axis).toBe('Z')
        expect(resolveThreadPitch({vectors: {I: 2}, travels, planeVectors: G18}).axis).toBe('X')
    })

    test('a one axis block only accepts that axis own vector', () => {
        const out = resolveThreadPitch({
            vectors: {I: 2}, travels: {X: 0, Z: -30}, planeVectors: G18,
        })
        expect(out.error).toBe('axisStill')
    })

    test('a pitch of zero is refused here too', () => {
        const out = resolveThreadPitch({
            vectors: {K: 0}, travels: {Z: -30}, planeVectors: G18,
        })
        expect(out.error).toBe('pitch')
    })

    test('a block that does not move at all is refused', () => {
        const out = resolveThreadPitch({
            vectors: {K: 2}, travels: {X: 0, Z: 0}, planeVectors: G18,
        })
        expect(out.error).toBe('noTravel')
    })
})

describe('marksInSlice', () => {
    const marks = [0, 0.25, 0.5, 0.75, 1]

    test('the whole block is every mark, unchanged', () => {
        expect(marksInSlice(marks, 0, 1)).toEqual(marks)
    })

    test('a piece reports its own fractions', () => {
        expect(marksInSlice(marks, 0.5, 1)).toEqual([0.5, 1])
    })

    test('a mark on a seam is drawn once, by the piece that ends there', () => {
        const pieces = [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]
        const drawn = pieces.flatMap(([from, to]) =>
            marksInSlice(marks, from, to).map(m => from + m * (to - from)))
        expect(drawn.length).toBe(marks.length)
        drawn.forEach((at, i) => expect(at).toBeCloseTo(marks[i], 10))
    })

    test('a piece with no mark in it draws nothing', () => {
        expect(marksInSlice(marks, 0.3, 0.45)).toEqual([])
    })

    test('an empty or backwards slice draws nothing', () => {
        expect(marksInSlice(marks, 0.5, 0.5)).toEqual([])
        expect(marksInSlice(marks, 0.8, 0.2)).toEqual([])
        expect(marksInSlice(undefined, 0, 1)).toEqual([])
    })

    test('the end point only belongs to the last piece', () => {
        const dotted = dottedMarks(threadMarks({travel: 7, pitch: 2}))
        expect(marksInSlice(dotted, 0, 0.5).includes(1)).toBe(false)
        expect(marksInSlice(dotted, 0.5, 1)).toContain(1)
    })
})
