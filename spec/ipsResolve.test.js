jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classifyInputs, signatureOf, programsFor } = require('../lib/ipsResolve');
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
});
