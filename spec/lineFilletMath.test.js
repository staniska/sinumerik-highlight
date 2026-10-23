const { lineFilletCandidates, lineChamferCandidates } = require('../lib/contourEdit/lineFilletMath');

const seg = (x1, y1, x2, y2) => ({ start: [x1, y1], end: [x2, y2] });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = a => Math.hypot(a[0], a[1]);
const unit = a => { const l = len(a); return [a[0] / l, a[1] / l]; };
const dirOf = l => unit(sub(l.end, l.start));

// Distance from a point to the infinite line carrying the segment.
const distToLine = (l, p) => Math.abs(cross(dirOf(l), sub(p, l.start)));

// Signed distance, positive to the left of the segment's direction of travel.
const signedDistToLine = (l, p) => cross(dirOf(l), sub(p, l.start));

// On the segment itself, not merely on the line through it.
const onSegment = (l, p) => {
    if (distToLine(l, p) > 1e-6) return false;
    const t = dot(dirOf(l), sub(p, l.start));
    return t >= -1e-6 && t <= len(sub(l.end, l.start)) + 1e-6;
};

const positiveAngle = a => { let x = a % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x; };
const angleOf = a => Math.atan2(a[1], a[0]);
const sweepFrom = (from, to, ccw) => positiveAngle(ccw ? to - from : from - to);

// Two segments crossing at the origin, so every sector is bounded by both of
// them and all four solutions are real. The geometry of a single fillet is
// checked on these; how many survive is the next block's business.
const cross1 = seg(-20, 0, 20, 0);
const cross2 = seg(-14, -14, 14, 14);

describe('lineFilletCandidates: the fillet itself', () => {
    it('returns four fillets where both segments span the corner', () => {
        const { candidates } = lineFilletCandidates({
            l1: seg(-10, 0, 10, 0),
            l2: seg(0, -10, 0, 10),
            radius: 5,
        });
        expect(candidates).toHaveLength(4);
        const centers = candidates.map(c => c.center.map(v => Math.round(v)));
        expect(centers).toEqual(expect.arrayContaining([[5, 5], [5, -5], [-5, 5], [-5, -5]]));
    });

    it('touches both lines at the stated points', () => {
        const radius = 4;
        const { candidates } = lineFilletCandidates({ l1: cross1, l2: cross2, radius });
        candidates.forEach(c => {
            // Tangency itself, not the formula that produced it: the centre is
            // one radius from each line, and each contact is on its line and a
            // radius away from the centre.
            expect(distToLine(cross1, c.center)).toBeCloseTo(radius, 9);
            expect(distToLine(cross2, c.center)).toBeCloseTo(radius, 9);
            expect(distToLine(cross1, c.t1)).toBeCloseTo(0, 9);
            expect(distToLine(cross2, c.t2)).toBeCloseTo(0, 9);
            expect(len(sub(c.t1, c.center))).toBeCloseTo(radius, 9);
            expect(len(sub(c.t2, c.center))).toBeCloseTo(radius, 9);
        });
    });

    it('meets each line tangentially rather than crossing it', () => {
        const { candidates } = lineFilletCandidates({ l1: cross1, l2: cross2, radius: 4 });
        candidates.forEach(c => {
            // A radius at the contact is perpendicular to the line, which is
            // the same as saying the arc travels along it there. This is what
            // catches a sign flipped somewhere in the offsets.
            expect(dot(sub(c.t1, c.center), dirOf(cross1))).toBeCloseTo(0, 9);
            expect(dot(sub(c.t2, c.center), dirOf(cross2))).toBeCloseTo(0, 9);
        });
    });

    it('puts both contacts the same distance from the vertex', () => {
        // Tangent lengths from an external point are equal — which is why one
        // radius is either in reach of both segments or of neither.
        const { candidates } = lineFilletCandidates({ l1: cross1, l2: cross2, radius: 4 });
        candidates.forEach(c => {
            expect(len(sub(c.t1, c.vertex))).toBeCloseTo(c.tangentLength, 9);
            expect(len(sub(c.t2, c.vertex))).toBeCloseTo(c.tangentLength, 9);
        });
    });

    it('returns the minor arc, with the middle point halfway along it', () => {
        const radius = 4;
        const { candidates } = lineFilletCandidates({ l1: cross1, l2: cross2, radius });
        candidates.forEach(c => {
            expect(c.sweep).toBeGreaterThan(0);
            expect(c.sweep).toBeLessThan(Math.PI);
            expect(len(sub(c.middle, c.center))).toBeCloseTo(radius, 9);
            const fromStart = sweepFrom(
                angleOf(sub(c.t1, c.center)),
                angleOf(sub(c.middle, c.center)),
                c.ccw
            );
            expect(fromStart).toBeCloseTo(c.sweep / 2, 9);
        });
    });

    it('bulges towards the corner it rounds', () => {
        // Quarter fillet in the first quadrant of two axes: the arc has to pass
        // between the origin and its centre, not on the far side of it.
        const { candidates } = lineFilletCandidates({
            l1: seg(-10, 0, 10, 0),
            l2: seg(0, -10, 0, 10),
            radius: 5,
        });
        const firstQuadrant = candidates.find(c => c.center[0] > 0 && c.center[1] > 0);
        expect(firstQuadrant.sweep).toBeCloseTo(Math.PI / 2, 9);
        expect(len(firstQuadrant.middle)).toBeLessThan(len(firstQuadrant.center));
    });

    it('splits the plane into two sweeps that add up to a half turn', () => {
        // The four centres sit on the two bisectors: two of them round the
        // acute sector and two the obtuse one, and a fillet turns by what is
        // left of a half turn after the sector's own angle. Picking the wrong
        // crossing of the offset lines shows up here and nowhere else.
        const { candidates } = lineFilletCandidates({
            l1: seg(-10, 0, 10, 0),
            l2: seg(-10 * Math.cos(Math.PI / 6), -10 * Math.sin(Math.PI / 6),
                    10 * Math.cos(Math.PI / 6), 10 * Math.sin(Math.PI / 6)),
            radius: 1,
        });
        const sweeps = candidates.map(c => c.sweep).sort((a, b) => a - b);
        expect(sweeps[0]).toBeCloseTo(Math.PI / 6, 9);
        expect(sweeps[3]).toBeCloseTo(Math.PI - Math.PI / 6, 9);
        expect(sweeps[0] + sweeps[3]).toBeCloseTo(Math.PI, 9);
    });

    it('places each candidate on the side its signs say', () => {
        const radius = 4;
        const { candidates } = lineFilletCandidates({ l1: cross1, l2: cross2, radius });
        expect(candidates.map(c => [c.s1, c.s2])).toEqual([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
        candidates.forEach(c => {
            expect(signedDistToLine(cross1, c.center)).toBeCloseTo(c.s1 * radius, 9);
            expect(signedDistToLine(cross2, c.center)).toBeCloseTo(c.s2 * radius, 9);
        });
    });

    it('does not depend on which way the lines were drawn', () => {
        const forward = lineFilletCandidates({ l1: cross1, l2: cross2, radius: 4 });
        const reversed = lineFilletCandidates({
            l1: cross1,
            l2: seg(cross2.end[0], cross2.end[1], cross2.start[0], cross2.start[1]),
            radius: 4,
        });
        const key = c => c.center.map(v => v.toFixed(9)).join();
        expect(reversed.candidates.map(key).sort()).toEqual(forward.candidates.map(key).sort());
    });
});

// Only a fillet that touches the segments the user drew is of any use, so the
// count follows from which half-lines out of the vertex those segments occupy —
// not from whether they meet.
describe('lineFilletCandidates: how many survive on the segments', () => {
    // Both stop 10 mm short of the vertex at the origin and run out at 30.
    const gap1 = seg(-30, 0, -10, 0);
    const gap2 = seg(0, 10, 0, 30);

    it('leaves one fillet when both segments stop short of the vertex', () => {
        const { candidates } = lineFilletCandidates({ l1: gap1, l2: gap2, radius: 15 });
        expect(candidates).toHaveLength(1);
        expect(onSegment(gap1, candidates[0].t1)).toBe(true);
        expect(onSegment(gap2, candidates[0].t2)).toBe(true);
        // The one sector both segments bound.
        expect(candidates[0].center[0]).toBeCloseTo(-15, 9);
        expect(candidates[0].center[1]).toBeCloseTo(15, 9);
    });

    it('says a radius is too small when the contacts fall inside the gap', () => {
        expect(lineFilletCandidates({ l1: gap1, l2: gap2, radius: 5 }))
            .toEqual({ error: 'radius-too-small' });
    });

    it('says a radius is too large when the contacts run past the far ends', () => {
        expect(lineFilletCandidates({ l1: gap1, l2: gap2, radius: 40 }))
            .toEqual({ error: 'radius-too-large' });
    });

    it('leaves one fillet when the segments meet at their endpoints', () => {
        const { candidates } = lineFilletCandidates({
            l1: seg(-20, 0, 0, 0),
            l2: seg(0, 0, 0, 20),
            radius: 5,
        });
        expect(candidates).toHaveLength(1);
        expect(candidates[0].center.map(v => Math.round(v))).toEqual([-5, 5]);
    });

    it('leaves two fillets when an endpoint lies within the other segment', () => {
        const { candidates } = lineFilletCandidates({
            l1: seg(-10, 0, 10, 0),
            l2: seg(0, 0, 0, 20),
            radius: 5,
        });
        expect(candidates).toHaveLength(2);
        expect(candidates.map(c => c.center.map(v => Math.round(v))).sort())
            .toEqual([[-5, 5], [5, 5]]);
    });

    it('leaves two fillets for disjoint segments whose vertex is inside one of them', () => {
        // The count follows the half-lines, not the meeting: these two never
        // touch, yet the vertex lies within the first segment, which therefore
        // offers both of its sides.
        const { candidates } = lineFilletCandidates({
            l1: seg(-10, 0, 10, 0),
            l2: seg(0, 5, 0, 20),
            radius: 7,
        });
        expect(candidates).toHaveLength(2);
        expect(candidates.map(c => c.center.map(v => Math.round(v))).sort())
            .toEqual([[-7, 7], [7, 7]]);
    });

    it('refuses when no radius could reach both segments', () => {
        // Along the first line the segment covers 25..45 mm out from the
        // vertex; along the second, 60..80 mm. The contacts are always
        // equidistant from the vertex, so no radius lands on both — and "too
        // small" would be a lie even though a larger one does move towards the
        // second segment.
        const far1 = seg(-30, 0, -10, 0);
        const at = d => [15 + d / Math.SQRT2, d / Math.SQRT2];
        const far2 = { start: at(60), end: at(80) };
        expect(lineFilletCandidates({ l1: far1, l2: far2, radius: 12 }))
            .toEqual({ error: 'radius-does-not-fit' });
        expect(lineFilletCandidates({ l1: far1, l2: far2, radius: 30 }))
            .toEqual({ error: 'radius-does-not-fit' });
    });

    it('still finds the one radius that reaches two far-apart segments', () => {
        // Same shape, with the second segment moved into reach: 35..64 mm
        // against the first's 25..45, so a tangent length in 35..45 fits and
        // nothing is over-rejected. The sector these two half-lines bound is
        // the obtuse one (135°), where the tangent length is only 0.41 of the
        // radius — hence a radius of 90 for a contact 37 mm out.
        const far1 = seg(-30, 0, -10, 0);
        const at = d => [15 + d / Math.SQRT2, d / Math.SQRT2];
        const far2 = { start: at(35.4), end: at(63.6) };
        const { candidates } = lineFilletCandidates({ l1: far1, l2: far2, radius: 90 });
        expect(candidates).toHaveLength(1);
        expect(candidates[0].tangentLength).toBeGreaterThan(35.4);
        expect(candidates[0].tangentLength).toBeLessThan(45);
    });

    it('accepts a contact that lands exactly on an endpoint', () => {
        // Radius chosen so the tangent length is exactly the 20 mm the first
        // segment reaches: the fillet ends where the segment does.
        const { candidates } = lineFilletCandidates({
            l1: seg(-20, 0, 0, 0),
            l2: seg(0, 0, 0, 30),
            radius: 20,
        });
        expect(candidates).toHaveLength(1);
        expect(candidates[0].t1.map(v => Math.round(v))).toEqual([-20, 0]);
    });
});

describe('lineFilletCandidates: refusals', () => {
    it('refuses parallel lines, however far apart', () => {
        expect(lineFilletCandidates({
            l1: seg(0, 0, 10, 0),
            l2: seg(0, 20, 10, 20),
            radius: 5,
        })).toEqual({ error: 'lines-parallel' });
    });

    it('refuses lines running the same way in reverse', () => {
        expect(lineFilletCandidates({
            l1: seg(0, 0, 10, 0),
            l2: seg(10, 4, 0, 4),
            radius: 1,
        })).toEqual({ error: 'lines-parallel' });
    });

    it('refuses a line of no length and a radius that is not positive', () => {
        expect(lineFilletCandidates({ l1: seg(5, 5, 5, 5), l2: cross2, radius: 2 }))
            .toEqual({ error: 'line-degenerate' });
        expect(lineFilletCandidates({ l1: cross1, l2: cross2, radius: 0 }))
            .toEqual({ error: 'radius-not-positive' });
        expect(lineFilletCandidates({ l1: cross1, l2: cross2, radius: -3 }))
            .toEqual({ error: 'radius-not-positive' });
    });
});

describe('lineChamferCandidates', () => {
    it('lays the legs off the corner along each line', () => {
        const l1 = seg(-10, 0, 10, 0);
        const l2 = seg(0, -10, 0, 10);
        const { candidates } = lineChamferCandidates({ l1, l2, size: 4 });
        expect(candidates).toHaveLength(4);
        candidates.forEach(c => {
            expect(c.vertex[0]).toBeCloseTo(0, 9);
            expect(c.vertex[1]).toBeCloseTo(0, 9);
            expect(len(sub(c.start, c.vertex))).toBeCloseTo(4, 9);
            expect(len(sub(c.end, c.vertex))).toBeCloseTo(4, 9);
            // CHR is the trim along each edge, so on a right-angled corner the
            // cut itself comes out size·√2 — the sanity check CHF is converted
            // against in element-insert.js.
            expect(len(sub(c.end, c.start))).toBeCloseTo(4 * Math.SQRT2, 9);
            expect(onSegment(l1, c.start)).toBe(true);
            expect(onSegment(l2, c.end)).toBe(true);
        });
    });

    it('keeps the leg directions it reports', () => {
        const l1 = seg(-10, 0, 10, 0);
        const l2 = seg(0, -10, 0, 10);
        const { candidates } = lineChamferCandidates({ l1, l2, size: 3 });
        candidates.forEach(c => {
            expect(dot(sub(c.start, c.vertex), dirOf(l1))).toBeCloseTo(c.e1 * 3, 9);
            expect(dot(sub(c.end, c.vertex), dirOf(l2))).toBeCloseTo(c.e2 * 3, 9);
        });
    });

    it('counts the same way the fillets do', () => {
        const gap = lineChamferCandidates({
            l1: seg(-30, 0, -10, 0),
            l2: seg(0, 10, 0, 30),
            size: 15,
        });
        expect(gap.candidates).toHaveLength(1);

        const meeting = lineChamferCandidates({
            l1: seg(-20, 0, 0, 0),
            l2: seg(0, 0, 0, 20),
            size: 5,
        });
        expect(meeting.candidates).toHaveLength(1);

        const tee = lineChamferCandidates({
            l1: seg(-10, 0, 10, 0),
            l2: seg(0, 0, 0, 20),
            size: 5,
        });
        expect(tee.candidates).toHaveLength(2);
    });

    it('says which way a size that does not reach the segments was wrong', () => {
        const gap1 = seg(-30, 0, -10, 0);
        const gap2 = seg(0, 10, 0, 30);
        // The legs are the size itself here, so the window is the 10..30 mm the
        // segments cover.
        expect(lineChamferCandidates({ l1: gap1, l2: gap2, size: 5 }))
            .toEqual({ error: 'size-too-small' });
        expect(lineChamferCandidates({ l1: gap1, l2: gap2, size: 40 }))
            .toEqual({ error: 'size-too-large' });
    });

    it('refuses parallel lines, a degenerate line and a size that is not positive', () => {
        expect(lineChamferCandidates({
            l1: seg(0, 0, 10, 0),
            l2: seg(0, 7, 10, 7),
            size: 2,
        })).toEqual({ error: 'lines-parallel' });
        expect(lineChamferCandidates({ l1: seg(1, 1, 1, 1), l2: seg(0, 0, 0, 10), size: 2 }))
            .toEqual({ error: 'line-degenerate' });
        expect(lineChamferCandidates({ l1: seg(0, 0, 10, 0), l2: seg(0, 0, 0, 10), size: 0 }))
            .toEqual({ error: 'size-not-positive' });
    });
});
