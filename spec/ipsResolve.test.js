jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

jest.mock('../lib/dialog/confirm', () => ({
    confirmDialog: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classifyInputs, signatureOf, programsFor, programNamesFor,
    sourceMachine, withSourceMachine } = require('../lib/ipsResolve');
const { confirmDialog } = require('../lib/dialog/confirm');
const View = require('../lib/sinumerik').default;

describe('classifyInputs', () => {
    const parsed = {
        read: ['/p/OP10.MPF', '/p/ZAGOT.MPF', '/p/SUB1.SPF'],
        toolPaths: ['/tools/ROMB.MPF'],
    };

    test('the source itself comes first, as the source', () => {
        const inputs = classifyInputs('/p/OP10.MPF', parsed, []);
        expect(inputs[0]).toEqual({path: '/p/OP10.MPF', kind: 'source'});
        // and is not repeated from the read list
        expect(inputs.filter(i => i.path === '/p/OP10.MPF').length).toBe(1);
    });

    test('a shape of the source is read from disk, a subroutine from the buffer', () => {
        // The hash has to be of what the parse actually read: `readShapeLines`
        // ignores the buffer, `readProgramLines` prefers it.
        const inputs = classifyInputs('/p/OP10.MPF', parsed, ['ZAGOT']);
        const kind = (p) => inputs.find(i => i.path === p).kind;
        expect(kind('/p/ZAGOT.MPF')).toBe('disk');
        expect(kind('/p/SUB1.SPF')).toBe('program');
    });

    test('tool files are disk, like every shape file', () => {
        const inputs = classifyInputs('/p/OP10.MPF', parsed, []);
        expect(inputs.find(i => i.path === '/tools/ROMB.MPF').kind).toBe('disk');
    });

    test('shape names are matched without case or extension', () => {
        const inputs = classifyInputs('/p/OP10.MPF', parsed, ['zagot']);
        expect(inputs.find(i => i.path === '/p/ZAGOT.MPF').kind).toBe('disk');
    });

    test('nothing read is still one input', () => {
        expect(classifyInputs('/p/OP10.MPF', {}, []))
            .toEqual([{path: '/p/OP10.MPF', kind: 'source'}]);
    });

    test('a path listed twice is one input', () => {
        const inputs = classifyInputs('/p/OP10.MPF',
            {read: ['/p/SUB1.SPF', '/p/SUB1.SPF'], toolPaths: ['/p/SUB1.SPF']}, []);
        expect(inputs.length).toBe(2);
    });
});


// The cache key of stage 4. A checksum rather than a timestamp: the text being
// edited is a buffer, which has no mtime; and a folder sync can preserve mtime
// while changing content, which would leave a silently wrong blank.
describe('signatureOf', () => {
    let dir;
    const context = {text: {text: 'G0 X0\nM30'}, refSig: 'null', machineSig: 'm1', chainKey: ''};

    const setEditors = (editors) => {
        global.atom = {workspace: {getTextEditors: () => editors}};
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ips-sig-'));
        setEditors([]);
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    const write = (name, text) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, text);
        return file;
    };

    test('the same inputs give the same signature', async () => {
        const sub = write('SUB1.SPF', 'G1 X10\nM17');
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}, {path: sub, kind: 'program'}];
        expect(await signatureOf(inputs, context)).toBe(await signatureOf(inputs, context));
    });

    test('the source text is what changes the signature, not its path', async () => {
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}];
        const before = await signatureOf(inputs, context);
        const after = await signatureOf(inputs, {...context, text: {text: 'G0 X1\nM30'}});
        expect(after).not.toBe(before);
    });

    test('a changed file read by the source changes it', async () => {
        const sub = write('SUB1.SPF', 'G1 X10\nM17');
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}, {path: sub, kind: 'program'}];
        const before = await signatureOf(inputs, context);
        fs.writeFileSync(sub, 'G1 X20\nM17');
        expect(await signatureOf(inputs, context)).not.toBe(before);
    });

    test('the machine, the reference and the chain below each change it', async () => {
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}];
        const base = await signatureOf(inputs, context);
        // The machine lives in machine-data.json, which no file hash would see;
        // the reference is read out of memory, because an unsaved offset leaves
        // the text untouched; the chain key is what makes one number check
        // every link.
        expect(await signatureOf(inputs, {...context, machineSig: 'm2'})).not.toBe(base);
        expect(await signatureOf(inputs, {...context, refSig: '{"name":"OP5"}'})).not.toBe(base);
        expect(await signatureOf(inputs, {...context, chainKey: 'abc'})).not.toBe(base);
    });

    test('a `program` input is hashed from the open buffer', async () => {
        const sub = write('SUB1.SPF', 'G1 X10\nM17');
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}, {path: sub, kind: 'program'}];
        const fromDisk = await signatureOf(inputs, context);

        setEditors([{getPath: () => sub, getText: () => 'G1 X999\nM17'}]);
        expect(await signatureOf(inputs, context)).not.toBe(fromDisk);
    });

    test('a `disk` input ignores the buffer', async () => {
        const shape = write('ZAGOT.MPF', 'G1 X10\nM17');
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}, {path: shape, kind: 'disk'}];
        const fromDisk = await signatureOf(inputs, context);

        setEditors([{getPath: () => shape, getText: () => 'G1 X999\nM17'}]);
        expect(await signatureOf(inputs, context)).toBe(fromDisk);
    });

    test('a file that has gone never matches', async () => {
        const inputs = [{path: '/p/OP10.MPF', kind: 'source'}, {path: path.join(dir, 'GONE.MPF'), kind: 'disk'}];
        expect(await signatureOf(inputs, context)).not.toBe(await signatureOf(inputs, context));
    });
});


// Which programs the source may call. The list has to be the SOURCE's own —
// built from its folder and its machine's folders — and never inherited from
// whatever file happened to be open before: that was the bug where a chain of
// three resolved only after its middle program had been visited once, because
// only then had something put the machine's folder on the list.
describe('programsFor', () => {
    let own;
    let machineDir;

    beforeEach(() => {
        own = fs.mkdtempSync(path.join(os.tmpdir(), 'ips-own-'));
        machineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ips-machine-'));
        View.sinumerikView.machineData = {subroutines: {LATHE: [machineDir]}};
    });

    afterEach(() => {
        [own, machineDir].forEach(dir => fs.rmSync(dir, {recursive: true, force: true}));
        delete View.sinumerikView.machineData;
    });

    const write = (dir, name) => fs.writeFileSync(path.join(dir, name), 'M30');

    test('the machine folders are searched as well as the program folder', () => {
        write(own, 'TURN_2.MPF');
        write(machineDir, 'ZAGOT.MPF');
        return programsFor(path.join(own, 'TURN_3.MPF'), 'LATHE').then(found => {
            expect(found.map(e => e.name).sort()).toEqual(['TURN_2', 'ZAGOT']);
        });
    });

    test('the program folder comes first, so it wins a lookup by name', () => {
        // `progParser` takes the first match; this has to mean the same here.
        write(own, 'ZAGOT.MPF');
        write(machineDir, 'ZAGOT.MPF');
        return programsFor(path.join(own, 'TURN_3.MPF'), 'LATHE').then(found => {
            expect(found.length).toBe(2);
            expect(found[0].path.startsWith(own)).toBe(true);
        });
    });

    test('only MPF and SPF are programs', () => {
        write(own, 'TURN_2.MPF');
        write(own, 'SUB.SPF');
        write(own, 'NOTES.TXT');
        write(own, 'GLOBALS.DEF');
        return programsFor(path.join(own, 'TURN_3.MPF'), 'LATHE').then(found => {
            expect(found.map(e => e.name).sort()).toEqual(['SUB', 'TURN_2']);
        });
    });

    test('an unreachable machine folder is no folder, not a failure', () => {
        write(own, 'TURN_2.MPF');
        View.sinumerikView.machineData.subroutines.LATHE = ['/no/such/folder'];
        return programsFor(path.join(own, 'TURN_3.MPF'), 'LATHE').then(found => {
            expect(found.map(e => e.name)).toEqual(['TURN_2']);
        });
    });

    test('a machine with no folders configured still searches the program folder', () => {
        write(own, 'TURN_2.MPF');
        return programsFor(path.join(own, 'TURN_3.MPF'), 'UNKNOWN').then(found => {
            expect(found.map(e => e.name)).toEqual(['TURN_2']);
        });
    });

    // What is SUGGESTED is not what is resolved. The machine folders hold the
    // cycles — hundreds of them — and a list of cycles answers none of the
    // three questions these fields ask.
    test('the suggestions come from the program folder only', () => {
        write(own, 'TURN_2.MPF');
        write(own, 'ZAGOT.MPF');
        write(machineDir, 'CYCLE95.SPF');
        write(machineDir, 'CYCLE82.SPF');

        return programNamesFor(path.join(own, 'TURN_3.MPF')).then(names => {
            expect(names).toEqual(['TURN_2', 'ZAGOT']);
        });
    });

    // The default is the strict one, which is what the IPS mode of the Blank
    // field wants: a program cannot borrow stock from itself.
    test('the program itself is not suggested as its own stock source', () => {
        write(own, 'TURN_3.MPF');
        write(own, 'ZAGOT.MPF');

        return programNamesFor(path.join(own, 'TURN_3.MPF')).then(names => {
            expect(names).toEqual(['ZAGOT']);
        });
    });

    // And the relaxed one, for a blank or a contour. A shape is read from disk
    // while the trajectory is read from the buffer, so a file that names itself
    // draws the edits in hand over the version last saved — the one case where
    // the field's own program is the answer wanted.
    test('the program itself is suggested when the field can take it', () => {
        write(own, 'TURN_3.MPF');
        write(own, 'ZAGOT.MPF');

        return programNamesFor(path.join(own, 'TURN_3.MPF'), true).then(names => {
            expect(names).toEqual(['TURN_3', 'ZAGOT']);
        });
    });
});

// A source that declares no machine may use the machine of the program being
// drawn, asked once per source. Both halves are exported for this: the decision,
// and the loan that keeps a borrowed machine out of `programmData` for good.
//
// The answer is module state that lives for the session, so each test asks about
// a source of its own rather than resetting the module — which is also how the
// real thing is used: one answer per file, for as long as Pulsar is open.
describe('borrowing the drawn program\'s machine', () => {
    const LATHE1 = {machineName: 'LATHE1', machineType: 'Lathe', units: 'metric'};
    const MILL = {machineName: 'MILL', machineType: 'Mill', units: 'inch'};
    const asked = () => ({ask: true, rootMachine: LATHE1});

    beforeEach(() => {
        confirmDialog.mockReset();
        confirmDialog.mockReturnValue(true);
    });

    test('a source with a machine of its own is not asked about', () => {
        expect(sourceMachine('/p/declared.MPF', {machine: MILL}, asked())).toBe(MILL);
        expect(confirmDialog).not.toHaveBeenCalled();
    });

    test('accepted once, then used without asking again', () => {
        const store = {};

        expect(sourceMachine('/p/accepted.MPF', store, asked())).toBe(LATHE1);
        expect(sourceMachine('/p/accepted.MPF', store, asked())).toBe(LATHE1);
        expect(confirmDialog).toHaveBeenCalledTimes(1);
    });

    // The machine it offers is named, with the two things that make a borrowed
    // one the wrong one.
    test('the offer names the machine, its type and its units', () => {
        sourceMachine('/p/named.MPF', {}, asked());

        const text = confirmDialog.mock.calls[0][0];
        expect(text).toContain('named.MPF');
        expect(text).toContain('LATHE1');
        expect(text).toContain('Lathe');
        expect(text).toContain('metric');
    });

    test('a refusal is remembered too, so a redraw does not ask again', () => {
        confirmDialog.mockReturnValue(false);

        expect(sourceMachine('/p/refused.MPF', {}, asked())).toBeNull();
        expect(sourceMachine('/p/refused.MPF', {}, asked())).toBeNull();
        expect(confirmDialog).toHaveBeenCalledTimes(1);
    });

    test('the answer is per source, not one for all of them', () => {
        sourceMachine('/p/each-A.MPF', {}, asked());
        sourceMachine('/p/each-B.MPF', {}, asked());

        expect(confirmDialog).toHaveBeenCalledTimes(2);
    });

    // The pre-pass runs before every parse, so the path a keystroke takes must
    // not raise a dialog. Unanswered, the source stays without a machine.
    test('nothing is asked when asking is not allowed', () => {
        expect(sourceMachine('/p/quiet.MPF', {}, {ask: false, rootMachine: LATHE1})).toBeNull();
        expect(confirmDialog).not.toHaveBeenCalled();
    });

    // There is nothing to offer, so there is nothing to ask.
    test('no machine on the program being drawn, no offer', () => {
        expect(sourceMachine('/p/noroot.MPF', {}, {ask: true, rootMachine: null})).toBeNull();
        expect(sourceMachine('/p/noroot.MPF', {}, {ask: true, rootMachine: {}})).toBeNull();
        expect(confirmDialog).not.toHaveBeenCalled();
    });

    // The answer means "use whatever the drawn program has", so the machine is
    // read again every time: switching the drawn program to another machine
    // carries through, and the cache signature changes with it.
    test('the answer is remembered, the machine it meant is not', () => {
        const store = {};

        expect(sourceMachine('/p/switch.MPF', store, asked())).toBe(LATHE1);
        expect(sourceMachine('/p/switch.MPF', store, {ask: false, rootMachine: MILL})).toBe(MILL);
        expect(confirmDialog).toHaveBeenCalledTimes(1);
    });
});

describe('the machine loan', () => {
    const LATHE1 = {machineName: 'LATHE1'};

    // `programmData` is shared with the editor's own view of that file, so a key
    // the source never had must not be left behind: opening op10 would then show
    // a machine it never declared, and its own trace would run on it.
    test('a key the source did not have is gone again afterwards', async () => {
        const store = {blank: {name: 'BLANK'}};

        await withSourceMachine(store, LATHE1, async () => {
            expect(store.machine).toBe(LATHE1);
        });

        expect('machine' in store).toBe(false);
        expect(store.blank).toEqual({name: 'BLANK'});
    });

    test('a machine the source did have comes back', async () => {
        const own = {machineName: 'MILL'};
        const store = {machine: own};

        await withSourceMachine(store, LATHE1, async () => {
            expect(store.machine).toBe(LATHE1);
        });

        expect(store.machine).toBe(own);
    });

    // A failure deeper in the resolve throws out of here, and a machine left
    // behind by it would be the permanent contamination this exists to avoid.
    test('a throw does not leave the machine behind', async () => {
        const store = {};

        await expect(withSourceMachine(store, LATHE1, async () => {
            throw new Error('tool file unreadable');
        })).rejects.toThrow('tool file unreadable');

        expect('machine' in store).toBe(false);
    });

    test('the source\'s own machine is no loan at all', async () => {
        const store = {machine: LATHE1};

        await withSourceMachine(store, LATHE1, async () => {});

        expect(store.machine).toBe(LATHE1);
    });

    test('what the body returns is what comes back', async () => {
        expect(await withSourceMachine({}, LATHE1, async () => 'answer')).toBe('answer');
    });
});
