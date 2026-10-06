'use babel'

// Pure parsing of sectioned shape files (equipment / tools).
//
// This module deliberately touches neither `View` nor `parseData`: splitting a
// file into sections and reading its variables block is the part that can be
// unit-tested, and keeping it separate is what makes that possible. The half
// that does touch global state — the isolated mini-parse of each section's
// G-code — lives in `interpretator.js::runShapeFileParse` and calls in here.
//
// File shape (see docs/tools-plan.md):
//
//   ;NAME:TURN35 COLOR:#3b7dd8        ← name + colour of section 0
//   ;---VARIABLES                      ← optional, numeric tool data
//   ; T103 R0.4                        ← shorthand for $TC_DP2 / $TC_DP6
//   ; $TC_DP10=80
//   ;---SECTION COLOR:#d8a13b ROLE:cut
//   G0 X.. Z..
//   G1 ..
//   ;---SECTION COLOR:#888888 ROLE:body
//   ...
//
// Equipment files use the same format without ROLE: or ;---VARIABLES.

export const DEFAULT_SECTION_COLOR = '#3b7dd8'

// A section without an explicit ROLE: counts as a collider, not as a cutting
// edge. Getting this backwards would turn a missing role into "nothing
// collided" — a false all-clear in a feature whose whole point is catching
// crashes. A false collision, by contrast, is visible and fixable.
export const DEFAULT_SECTION_ROLE = 'body'

const MARKER_RE    = /^;---/
const SECTION_RE   = /^;---SECTION\b/i
const VARIABLES_RE = /^;---VARIABLES\b/i
const NAME_RE      = /^;NAME:(\S+)/i
const COLOR_RE     = /COLOR:(#[0-9a-fA-F]{3,8})/i
const ROLE_RE      = /ROLE:(cut|body|ignore)\b/i

// `; $TC_DP6=0.4` → key `$TC_DP6`, value `0.4`. The value keeps everything
// after the first `=` so a future string-valued field survives.
const ASSIGN_RE = /^([^=\s]+)\s*=\s*(.*)$/

// `; T103 R0.4` — the same spelling the program-side comment uses
// (primitives.js:1063 matches /;T10\d/ and /R\d.?\d*/). Here it stands alone:
// a tool file has no `T=..` line for it to annotate.
const SHORTHAND_RE = /^T(10\d)\b/i
const SHORTHAND_R_RE = /\bR(\d+(?:\.\d+)?)/i

// Normalise a line before inspecting it. Shape files are read from disk, so
// on Windows every line carries a trailing CR from `\n`-splitting (CLAUDE.md:
// read → parse boundary) — `trim()` removes it along with the surrounding
// whitespace, which is why no separate `\r` strip is needed here. The place
// where CR could still survive is a value captured by a trailing `(.*)$`, so
// ASSIGN_RE's value is trimmed on its own below.
//
// Geometry lines are deliberately *not* cleaned: they are pushed raw into the
// section body, exactly as the existing blank/contour extraction feeds raw
// split lines to `parseRows` (interpretator.js:449, :484). Parity with that
// path matters more than tidiness here.
const clean = line => String(line ?? '').trim()

// Strip the leading comment semicolon from a line inside ;---VARIABLES.
const uncomment = line => line.replace(/^;+\s*/, '')

// Read one variable from a cleaned, uncommented line.
// Returns [{key, value}] — the shorthand yields two entries, a plain
// assignment one, an unrecognised line none.
function readVariableLine(text) {
    const shorthand = text.match(SHORTHAND_RE)
    if (shorthand) {
        const out = [{key: '$TC_DP2', value: shorthand[1].slice(-1)}]
        const radius = text.match(SHORTHAND_R_RE)
        if (radius) out.push({key: '$TC_DP6', value: radius[1]})
        return out
    }

    const assign = text.match(ASSIGN_RE)
    if (assign) return [{key: assign[1], value: assign[2].trim()}]

    return []
}

// Parse the body of a ;---VARIABLES section.
//
// Values are kept as strings and converted lazily by the consumer
// (`numericVariable`): the set of $TC_DP* fields is not known in advance, so
// there is no whitelist, and a non-numeric value must not break loading a file
// whose geometry is perfectly good.
export function parseVariablesBlock(lines) {
    const variables = {}
    const warnings = []

    lines.forEach((raw, idx) => {
        const text = uncomment(clean(raw))
        if (!text) return

        const entries = readVariableLine(text)
        if (!entries.length) {
            warnings.push({kind: 'badVariableLine', row: idx, text})
            return
        }

        entries.forEach(({key, value}) => {
            if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] !== value) {
                // A file contradicting itself is an authoring mistake, not a
                // feature. Report it, and let the later line win — the same
                // "last one wins" rule that governs the markers in a program.
                warnings.push({kind: 'variableConflict', key, was: variables[key], now: value, row: idx})
            }
            variables[key] = value
        })
    })

    return {variables, warnings}
}

// Look a variable up ignoring any index: `$TC_DP6[1]` and `$TC_DP6` are the
// same field while D-numbers are out of scope. mathParser.js:53 already
// discards the index on the expression side, so this mirrors it.
// When multiple cutting edges arrive, only this function changes — the file
// format does not, because keys are opaque strings.
export function lookupVariable(variables, key) {
    if (!variables) return undefined
    if (variables[key] !== undefined) return variables[key]

    const bare = key.replace(/\[.*\]$/, '')
    if (variables[bare] !== undefined) return variables[bare]

    const hit = Object.keys(variables).find(k => k.replace(/\[.*\]$/, '') === bare)
    return hit === undefined ? undefined : variables[hit]
}

// Numeric view of a variable, or `undefined` when absent or not a number.
// Conversion happens here, at the point of use, never at load time.
export function numericVariable(variables, key) {
    const raw = lookupVariable(variables, key)
    if (raw === undefined || raw === '') return undefined
    const num = parseFloat(raw)
    return Number.isFinite(num) ? num : undefined
}

// Split a sectioned shape file into its parts.
//
// Returns { name, variables, sections, warnings }, where each section is
// { color, role, body, startRow } and `body` holds that section's raw G-code
// lines (untouched, so the mini-parse sees exactly what the author wrote).
//
// The split runs on the shared `;---` prefix rather than on `;---SECTION`
// alone: that is what lets a ;---VARIABLES block — or any section type added
// later — be routed away from the geometry instead of landing in it. A file
// written today with variables must not turn into a stray contour edge
// tomorrow.
export function splitShapeFile(lines) {
    const rows = Array.isArray(lines) ? lines : []
    const warnings = []
    const sections = []
    const variableRows = []

    let name = null
    let headerColor = null

    // Everything before the first `;---` marker belongs to section 0, whose
    // colour comes from the ;NAME: line.
    let current = {color: null, role: null, body: [], startRow: 0, kind: 'section'}

    const flush = () => {
        if (current.kind === 'variables') {
            variableRows.push(...current.body)
            return
        }
        if (current.kind !== 'section') return          // unknown marker: body dropped
        if (!current.body.some(line => clean(line) !== '')) return   // no geometry
        sections.push({
            color: current.color ?? headerColor ?? DEFAULT_SECTION_COLOR,
            role: current.role ?? DEFAULT_SECTION_ROLE,
            body: current.body,
            startRow: current.startRow,
        })
    }

    rows.forEach((raw, idx) => {
        const text = clean(raw)

        if (idx === 0 || (name === null && NAME_RE.test(text))) {
            const named = text.match(NAME_RE)
            if (named) {
                name = named[1]
                headerColor = (text.match(COLOR_RE) || [])[1] ?? null
                return
            }
        }

        if (!MARKER_RE.test(text)) {
            current.body.push(raw)
            return
        }

        flush()

        if (SECTION_RE.test(text)) {
            current = {
                color: (text.match(COLOR_RE) || [])[1] ?? null,
                role: ((text.match(ROLE_RE) || [])[1] ?? '').toLowerCase() || null,
                body: [],
                startRow: idx + 1,
                kind: 'section',
            }
            return
        }

        if (VARIABLES_RE.test(text)) {
            current = {body: [], startRow: idx + 1, kind: 'variables'}
            return
        }

        // Unknown `;---` separator: skip its body rather than treat it as
        // geometry, and say so. This is the forward-compatibility hinge — a
        // newer file must degrade to "section ignored", never to a corrupt
        // outline.
        warnings.push({kind: 'unknownSection', row: idx, text})
        current = {body: [], startRow: idx + 1, kind: 'unknown'}
    })

    flush()

    const parsed = parseVariablesBlock(variableRows)
    warnings.push(...parsed.warnings)

    return {name, variables: parsed.variables, sections, warnings}
}

// Human-readable form of the warnings, for a single message to the user.
export function describeShapeFileWarnings(warnings, fileLabel) {
    if (!warnings || !warnings.length) return ''

    const where = fileLabel ? `${fileLabel}: ` : ''
    return where + warnings.map(w => {
        if (w.kind === 'unknownSection')  return `unknown section "${w.text}" ignored`
        if (w.kind === 'badVariableLine') return `cannot read variable line "${w.text}"`
        if (w.kind === 'variableConflict') return `${w.key} declared twice (${w.was}, then ${w.now}); the later value is used`
        return `${w.kind}`
    }).join('; ')
}
