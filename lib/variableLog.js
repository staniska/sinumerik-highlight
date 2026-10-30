'use babel'

// The history of what the program's variables held, so a value can be shown at
// any position the user rewinds to.
//
// Why a history at all. A variable is edited in place, so by the time the
// animation runs every one of them holds its final value — the same problem the
// frame table solves for coordinates (frameTable.js), but with far more entries:
// a loop of a thousand iterations assigns a thousand times.
//
// Why a diff rather than a log of writes. Seven places write a value —
// defParser.js in eight lines, controlFlow.js in the FOR variable's `set` and
// `inc`, interpretator.js in the body assignment and in readDefFile — and
// instrumenting each is a reliable way to miss one. A missed write is silent:
// the panel shows a value one assignment out of date. So the writers only
// announce THAT something was assigned, and what changed is worked out in the
// one place every element passes through.
//
// Pure, and taking its state as arguments: its callers live in interpretator.js,
// which jest cannot import.

// The store shared by every program: .DEF files, R-parameters, FOR variables.
// A local — a DEF in the body of a program or subroutine — lives under that
// program's own name instead.
export const GLOBAL_SCOPE = '*'

// Note for the writers: every announcement is made through `?.add`. Bookkeeping
// for a readout must not be able to break a parse — a missing Set threw out of
// the middle of a DEF and left the variable half built, with its name and type
// set and no value, which is how this rule was learned.

// Record what changed since the last time, as of element `at`.
//
// `scopes` is the stores worth looking at, which is never all of them: a scope
// nobody executed since the last call cannot have changed.
//
// `names` narrows it further to the variables the writers said they touched,
// and that is what makes this affordable. Scanning every variable instead cost
// 1012 ms over 50 000 elements with fifty variables — 2.5 million comparisons
// to find the one that moved — and a program whose blocks assign in a loop pays
// that on every element. `null` means scan everything, which the first element
// of a parse does so that the state the DEF defaults left behind is recorded
// whole, whatever the writers did or did not announce.
// Written with plain loops and no closures on purpose. This runs for every
// element of a program whose blocks assign — in a loop, that is all of them —
// and with fifty variables the obvious `Object.keys(...).forEach(...)` cost
// 1180 ms over 50 000 elements, all of it in allocating a name array and a
// closure call per name rather than in the comparing.
export function noteVariableChanges(log, seen, scopes, at, names = null) {
    for (let i = 0; i < scopes.length; i++) {
        const scope = scopes[i].scope
        const variables = scopes[i].variables
        if (!variables || scope === undefined) continue

        let loggedScope = log[scope]
        if (!loggedScope) loggedScope = log[scope] = {}
        let seenScope = seen[scope]
        if (!seenScope) seenScope = seen[scope] = {}

        // A name the writers announced may live in either store — the body
        // assignment picks one by where it already exists — so each store is
        // offered every name and skips the ones it does not hold.
        for (const name of (names === null ? Object.keys(variables) : names)) {
            if (!(name in variables)) continue

            const holder = variables[name]
            const value = holder === undefined || holder === null ? undefined : holder.value
            // `Object.is`, so a NaN compares equal to itself: `===` would make a
            // variable that once held NaN change on every element for ever.
            if (name in seenScope && Object.is(seenScope[name], value)) continue
            seenScope[name] = value

            let entries = loggedScope[name]
            if (!entries) entries = loggedScope[name] = []
            const last = entries[entries.length - 1]
            // Several assignments between two elements are one change as far as
            // the position is concerned, and the last of them is what the
            // element sees.
            if (last !== undefined && last.at === at) last.value = value
            else entries.push({at, value})
        }
    }
}

// The last entry in force at `at`, or undefined when the variable did not exist
// yet. Binary search: a loop can leave thousands of entries on one name.
function entryAt(entries, at) {
    let low = 0
    let high = entries.length - 1
    let found

    while (low <= high) {
        const mid = (low + high) >> 1
        if (entries[mid].at <= at) {
            found = entries[mid]
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return found
}

// What the program could see at that position: the shared store, plus the
// locals of the program the position belongs to. A name absent from the result
// did not exist yet; a name present with `undefined` was declared without a
// value, which is a different thing and the panel says so.
export function variablesAt(log, scope, at) {
    const out = {}

    const collect = (scopeLog) => {
        if (!scopeLog) return
        Object.keys(scopeLog).forEach(name => {
            const entry = entryAt(scopeLog[name], at)
            if (entry) out[name] = entry.value
        })
    }

    collect(log?.[GLOBAL_SCOPE])
    // Second, so a local of the same name wins — which the control does too,
    // though in practice the parser never lets one be created.
    if (scope && scope !== GLOBAL_SCOPE) collect(log?.[scope])

    return out
}

// Alphabetical, and numeric inside a name so that R2 comes before R10 rather
// than after it. Case-insensitive, because a program may spell a name either
// way and the two must not sit apart in the list.
export function sortVariableNames(names) {
    return [...names].sort((a, b) =>
        a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}) ||
        (a < b ? -1 : a > b ? 1 : 0))
}
