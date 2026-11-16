/**
 * Builds the "Intervals and chords" dataset: ../columns.json, ../rows.jsonl, ../sounds-alike.npy and ../media/*.mp3.
 *
 *   cd build && npm install && npx tsx build.ts
 *
 * Every sound is synthesised here, so there is nothing to license: a piano-like tone made of 16 partials (a little
 * stretched, as a piano's strings are), each partial its own pair of slightly detuned "strings" that die away faster
 * the higher it is, struck with a short attack and damped at the end. Equal temperament, A4 = 440 Hz.
 * Encoded as 44.1 kHz mono MP3 at 80 kbit/s (plays in Safari on an iPhone, and everywhere else).
 *
 * Rows: the 13 intervals from unison to octave, each played rising, falling (not the unison: the same as rising)
 * and together; and 9 chords, each played rising (one note after another, from the lowest) and together; each from
 * the four starting notes in START. Building it again gives the same files byte for byte (no randomness).
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, '..');
const RATE = 44100;
const KBPS = 80;

// --- what there is to hear ------------------------------------------------------------------------------------

interface Thing {
	id: string;
	name: string;
	kind: string[];
	/** semitones above the lowest note */
	notes: number[];
	/** the chord formula: scale degrees above the root */
	formula: string[];
}

/** perfect consonances, imperfect consonances and dissonances, as common-practice theory groups them (the fourth
 * is counted a perfect consonance, as in most ear-training and theory books; in two-part counterpoint above the
 * bass it is treated as a dissonance) */
const INTERVALS: [string, string, string, string][] = [
	// id, name, group, degree above the lower note
	['unison', 'unison', 'perfect consonance', '1'],
	['m2', 'minor second', 'dissonance', '♭2'],
	['M2', 'major second', 'dissonance', '2'],
	['m3', 'minor third', 'imperfect consonance', '♭3'],
	['M3', 'major third', 'imperfect consonance', '3'],
	['P4', 'perfect fourth', 'perfect consonance', '4'],
	['TT', 'tritone', 'dissonance', '♭5'],
	['P5', 'perfect fifth', 'perfect consonance', '5'],
	['m6', 'minor sixth', 'imperfect consonance', '♭6'],
	['M6', 'major sixth', 'imperfect consonance', '6'],
	['m7', 'minor seventh', 'dissonance', '♭7'],
	['M7', 'major seventh', 'dissonance', '7'],
	['P8', 'octave', 'perfect consonance', '8']
];
const CHORDS: [string, string, string, string, number[], string[]][] = [
	// id, name, group, leaf in the tree, notes, formula
	['maj', 'major triad', 'triad', 'major', [0, 4, 7], ['1', '3', '5']],
	['min', 'minor triad', 'triad', 'minor', [0, 3, 7], ['1', '♭3', '5']],
	['dim', 'diminished triad', 'triad', 'diminished', [0, 3, 6], ['1', '♭3', '♭5']],
	['aug', 'augmented triad', 'triad', 'augmented', [0, 4, 8], ['1', '3', '♯5']],
	['dom7', 'dominant seventh chord', 'seventh chord', 'dominant seventh', [0, 4, 7, 10], ['1', '3', '5', '♭7']],
	['maj7', 'major seventh chord', 'seventh chord', 'major seventh', [0, 4, 7, 11], ['1', '3', '5', '7']],
	['min7', 'minor seventh chord', 'seventh chord', 'minor seventh', [0, 3, 7, 10], ['1', '♭3', '5', '♭7']],
	['m7b5', 'half-diminished chord', 'seventh chord', 'half-diminished seventh', [0, 3, 6, 10], ['1', '♭3', '♭5', '♭7']],
	['dim7', 'diminished seventh chord', 'seventh chord', 'diminished seventh', [0, 3, 6, 9], ['1', '♭3', '♭5', '𝄫7']]
];

const things: Thing[] = [
	...INTERVALS.map(([id, name, group, deg], n) => ({ id, name, kind: ['interval', group, name], notes: n ? [0, n] : [0, 0], formula: n ? ['1', deg] : ['1'] })),
	...CHORDS.map(([id, name, group, leaf, notes, formula]) => ({ id, name, kind: ['chord', group, leaf], notes, formula }))
];

/** the starting notes (MIDI numbers): four of the twelve pitch classes, a minor third apart, in a comfortable range */
const START: [string, number][] = [['A3', 57], ['C4', 60], ['E♭4', 63], ['F♯4', 66]];
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

type Played = 'rising' | 'falling' | 'together';

// --- the tone ---------------------------------------------------------------------------------------------------

const PARTIALS = 16;
const B = 0.00025; // inharmonicity: partial k is at k f sqrt(1 + B k²), as on a piano string
const DETUNE = 0.7; // cents between the two strings of a partial, for a slow, warm beating

/** how loud each partial is struck: falling with k, with a dip near the 8th (a hammer striking 1/8 of the way along) */
const strike = (k: number) => (0.25 + 0.75 * Math.abs(Math.sin((Math.PI * k) / 8.5))) / k ** 1.15;

/** add one note to `out`: struck at `t0` (s), damped at `t1` */
function note(out: Float64Array, midi: number, t0: number, t1: number) {
	const f = hz(midi);
	// lower notes ring longer, as on a piano
	const T1 = 1.5 * (261.6 / f) ** 0.35;
	const start = Math.round(t0 * RATE), stop = Math.round(t1 * RATE), release = Math.round(0.12 * RATE);
	const attack = Math.round(0.004 * RATE);
	for (let k = 1; k <= PARTIALS; k++) {
		const fk = k * f * Math.sqrt(1 + B * k * k);
		if (fk > 9000) break;
		const a = strike(k);
		// two-stage decay: a prompt sound that dies quickly and a quieter aftersound that lingers
		const T = T1 / (1 + 0.45 * (k - 1)), Tlong = 3.5 * T;
		const phase = (k * 2.399) % (2 * Math.PI); // fixed, so the build is the same every time
		for (const s of [-1, 1]) {
			const w = (2 * Math.PI * fk * 2 ** ((s * DETUNE) / 2 / 1200)) / RATE;
			for (let n = start; n < Math.min(out.length, stop + release); n++) {
				const i = n - start, t = i / RATE;
				let env = 0.75 * Math.exp(-t / T) + 0.25 * Math.exp(-t / Tlong);
				if (i < attack) env *= 0.5 - 0.5 * Math.cos((Math.PI * i) / attack);
				if (n >= stop) env *= 0.5 + 0.5 * Math.cos((Math.PI * (n - stop)) / release);
				out[n] += 0.5 * a * env * Math.sin(w * i + phase);
			}
		}
	}
}

/** the notes of a sound in the order played, and when each is struck and damped */
function score(t: Thing, start: number, played: Played) {
	const up = t.notes.map((n) => start + n);
	if (played === 'together') return { notes: up.map((m) => ({ m, t0: 0, t1: 1.6 })), length: 1.75 };
	// in turn: each note damped as the next is struck; two notes at a slower pace than four
	const ms = played === 'falling' ? t.notes.map((n) => start - n) : up;
	const step = ms.length === 2 ? 0.8 : 0.6;
	const last = (ms.length - 1) * step;
	return { notes: ms.map((m, i) => ({ m, t0: i * step, t1: i === ms.length - 1 ? last + 1.2 : (i + 1) * step - 0.02 })), length: last + 1.35 };
}

/** to one loudness: RMS to -18 dBFS; then the few milliseconds where all of a chord's notes are struck at once,
 * which would peak above -3 dBFS (an MP3 overshoots its source a little), are turned down just there: the gain
 * needed at each sample, the least of it within 5 ms either side, averaged over 5 ms either side (so it changes
 * smoothly and never lets a peak through) */
function normalise(x: Float64Array) {
	let s = 0;
	for (const v of x) s += v * v;
	const g = 10 ** (-18 / 20) / Math.sqrt(s / x.length);
	for (let i = 0; i < x.length; i++) x[i] *= g;
	const ceiling = 10 ** (-3 / 20), W = Math.round(0.005 * RATE), n = x.length;
	const need = Float64Array.from(x, (v) => Math.min(1, ceiling / Math.max(1e-9, Math.abs(v))));
	const least = new Float64Array(n);
	for (let i = 0; i < n; i++) { let m = 1; for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) m = Math.min(m, need[j]); least[i] = m; }
	for (let i = 0; i < n; i++) {
		let a = 0, c = 0;
		for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { a += least[j]; c++; }
		x[i] *= a / c;
	}
}

function mp3(x: Float64Array): Buffer {
	const pcm = Int16Array.from(x, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
	const enc = new Mp3Encoder(1, RATE, KBPS), parts: Int8Array[] = [];
	for (let i = 0; i < pcm.length; i += 1152) parts.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
	parts.push(enc.flush());
	return Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
}

// --- how alike things sound (the embedding) ---------------------------------------------------------------------

/** Sethares' sensory dissonance (roughness) of two pure tones, after Plomp and Levelt */
function rough(f1: number, f2: number, a1: number, a2: number) {
	if (f2 < f1) [f1, f2] = [f2, f1];
	const s = 0.24 / (0.0207 * f1 + 18.96), d = f2 - f1;
	return Math.min(a1, a2) * (Math.exp(-3.5 * s * d) - Math.exp(-5.75 * s * d));
}

/** the roughness between the notes of a chord of this tone (between partials of different notes only) */
function roughness(midis: number[]) {
	let r = 0;
	for (let i = 0; i < midis.length; i++) for (let j = i + 1; j < midis.length; j++) {
		for (let k = 1; k <= PARTIALS; k++) for (let l = 1; l <= PARTIALS; l++) {
			const fk = k * hz(midis[i]) * Math.sqrt(1 + B * k * k), fl = l * hz(midis[j]) * Math.sqrt(1 + B * l * l);
			if (fk < 9000 && fl < 9000) r += rough(fk, fl, strike(k), strike(l));
		}
	}
	return r;
}

/** a bump at each distance, blurred by 0.6 of a semitone, on a grid of half semitones from 0 to 12 */
function blurred(ds: number[]) {
	const v: number[] = [];
	for (let x = 0; x <= 12; x += 0.5) v.push(ds.reduce((s, d) => s + Math.exp(-((x - d) ** 2) / (2 * 0.6 ** 2)), 0) / ds.length);
	return v;
}

/**
 * How a thing sounds, as numbers: which distances there are between its notes (every pair), which notes there are
 * above the lowest, both blurred so that neighbours in size are near; how rough it is when played together; and how
 * many notes it has. Played rising, falling or together, from any starting note, a thing has one vector (computed
 * on C4): this is about what it is, which is what gets mixed up, not about how it was played.
 */
function soundsAlike(t: Thing, roughMax: number) {
	const pairs: number[] = [];
	for (let i = 0; i < t.notes.length; i++) for (let j = i + 1; j < t.notes.length; j++) pairs.push(t.notes[j] - t.notes[i]);
	const above = t.notes.slice(1);
	return [...blurred(pairs), ...blurred(above), 2 * (roughness(t.notes.map((n) => 60 + n)) / roughMax), 0.5 * (t.notes.length - 2)];
}

function npy(rows: number[][]) {
	const dim = rows[0].length;
	let header = `{'descr': '<f4', 'fortran_order': False, 'shape': (${rows.length}, ${dim}), }`;
	header = header.padEnd(Math.ceil((header.length + 11) / 64) * 64 - 11, ' ') + '\n';
	const h = Buffer.alloc(10);
	h.write('\x93NUMPY', 0, 'latin1'); h[6] = 1; h[7] = 0; h.writeUInt16LE(header.length, 8);
	const data = Buffer.alloc(rows.length * dim * 4);
	rows.flat().forEach((v, i) => data.writeFloatLE(v, 4 * i));
	return Buffer.concat([h, Buffer.from(header, 'latin1'), data]);
}

// --- the dataset ------------------------------------------------------------------------------------------------

const media = join(OUT, 'media');
await rm(media, { recursive: true, force: true });
await mkdir(media, { recursive: true });

const rows: Record<string, unknown>[] = [];
const roughMax = Math.max(...things.map((t) => roughness(t.notes.map((n) => 60 + n))));
const alike = new Map(things.map((t) => [t.id, soundsAlike(t, roughMax)]));
const vectors: number[][] = [];

for (const t of things) {
	const chord = t.notes.length > 2;
	const ways: Played[] = chord ? ['rising', 'together'] : t.id === 'unison' ? ['rising', 'together'] : ['rising', 'falling', 'together'];
	for (const played of ways) for (const [start, midi] of START) {
		const id = `${t.id}-${played}-${start.replace('♭', 'b').replace('♯', 's').toLowerCase()}`;
		const sc = score(t, midi, played);
		const x = new Float64Array(Math.round(sc.length * RATE));
		for (const n of sc.notes) note(x, n.m, n.t0, n.t1);
		normalise(x);
		await writeFile(join(media, `${id}.mp3`), mp3(x));
		rows.push({
			id,
			sound: `media/${id}.mp3`,
			name: t.name,
			semitones: chord ? undefined : t.notes[1],
			kind: t.kind,
			formula: t.formula,
			played: played === 'together' ? 'together' : `in turn, ${played}`,
			'starting note': start,
			// the notes as played, in order (in turn) or from the lowest (together), and their frequencies: for checking
			notes: sc.notes.map((n) => noteName(n.m)),
			_hz: sc.notes.map((n) => Math.round(hz(n.m) * 100) / 100)
		});
		vectors.push(alike.get(t.id)!);
	}
}

// the embedding, centred and scaled so that a typical row is about 1 from the centre (as in the other datasets)
const dim = vectors[0].length, mean = Array.from({ length: dim }, (_, k) => vectors.reduce((s, v) => s + v[k], 0) / vectors.length);
const centred = vectors.map((v) => v.map((x, k) => x - mean[k]));
const typical = centred.map((v) => Math.hypot(...v)).sort((a, b) => a - b)[Math.floor(centred.length / 2)];
await writeFile(join(OUT, 'sounds-alike.npy'), npy(centred.map((v) => v.map((x) => x / typical))));

// the frequencies are kept for checking (check.py), not in the dataset
await writeFile(join(HERE, 'notes.jsonl'), rows.map((r) => JSON.stringify({ id: r.id, played: r.played, notes: r.notes, hz: r._hz })).join('\n') + '\n');
await writeFile(join(OUT, 'rows.jsonl'), rows.map(({ _hz, ...r }) => JSON.stringify(r)).join('\n') + '\n');

const columns = {
	name: 'Intervals and chords',
	item: 'sound',
	items: 'sounds',
	title: 'name',
	practices: [
		{ name: 'Name what you hear', columns: ['sound', 'name'] },
		{ name: 'How many semitones?', columns: ['sound', 'semitones'] },
		{ name: 'What notes are in it?', columns: ['sound', 'formula'] }
	],
	columns: [
		{ name: 'sound', type: 'plain', media: 'audio', label: 'Sound' },
		{ name: 'name', type: 'plain', label: 'Name' },
		{ name: 'semitones', type: 'number', label: 'Semitones', unit: 'semitones' },
		{ name: 'kind', type: 'tree', label: 'What it is' },
		{ name: 'formula', type: 'parts', label: 'Notes above the root' },
		{ name: 'played', type: 'plain', label: 'Played', order: ['in turn, rising', 'in turn, falling', 'together'] },
		{ name: 'starting note', type: 'plain', label: 'Starting note', order: START.map(([n]) => n) },
		{ name: 'notes', type: 'ranking', label: 'Notes played' },
		{ name: 'sounds alike', type: 'embedding', file: 'sounds-alike.npy', of: 'name', model: 'interval content and roughness (build/build.ts)' }
	]
};
await writeFile(join(OUT, 'columns.json'), JSON.stringify(columns, null, 1) + '\n');

const files = await readdir(media);
console.log(`${rows.length} rows, ${files.length} sounds, embedding ${vectors.length}×${dim}`);
