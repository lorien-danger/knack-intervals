/**
 * Notes played on Knack's piano, to a sound file: the same samples (./samples, the Salamander Grand Piano, CC-BY 3.0)
 * and the same rules (./render.ts, copied unchanged from the app) as the keyboard in the app, so that a sound here is
 * what the learner hears when he plays those keys there.
 *
 * Adapted from the app's scripts/piano.ts (lorien-danger/knack, branch keyboard, a592633). What is the same: each key
 * is played from its nearest sample, retuned by rateFor, read with the same 16-tap windowed sinc, started LEAD before
 * the hammer with a RISE fade-in, at MASTER gain; a note cut short fades out linearly over STOP, as the app fades a key
 * struck again; a sound cut to a length fades out over its last 0.3 s; stereo
 * MP3, LAME -V4, 44.1 kHz. What this adds: when each note is struck and released, and its gain, are the caller's (the
 * app plays notes together, or in turn rising every 0.42 s; this dataset also plays them falling, and at its own pace),
 * and each sound's level: brought to one loudness, its loudest few milliseconds held under -2 dBFS (write), where the
 * app's script turns a whole sound down to -1 dBFS and the app holds the keyboard's peaks with a limiter.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { MASTER, RISE, STOP, rateFor, sampleFor, startOf, type Sample } from './render';

export const RATE = 44100;
const DIR = join(import.meta.dirname, 'samples');

const cache = new Map<number, { ch: Float32Array[]; start: number }>();
/** a sample, decoded as a browser decodes it (ffmpeg), and where it starts sounding */
function sample(s: Sample) {
	let got = cache.get(s.key);
	if (!got) {
		const r = spawnSync('ffmpeg', ['-v', 'error', '-i', join(DIR, s.file), '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
		if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
		const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4), n = x.length / 2;
		const ch = [new Float32Array(n), new Float32Array(n)];
		for (let i = 0; i < n; i++) { ch[0][i] = x[2 * i]; ch[1][i] = x[2 * i + 1]; }
		got = { ch, start: startOf(ch, RATE) };
		cache.set(s.key, got);
	}
	return got;
}

/** a sample read at a fractional position: windowed sinc, 16 taps (repitching by a semitone without aliasing) */
function at(x: Float32Array, t: number, cut: number) {
	const i = Math.floor(t), TAPS = 8;
	let s = 0;
	for (let k = -TAPS + 1; k <= TAPS; k++) {
		const j = i + k;
		if (j < 0 || j >= x.length) continue;
		const d = t - j, w = 0.5 + 0.5 * Math.cos((Math.PI * d) / TAPS);
		const sinc = d === 0 ? 1 : Math.sin(Math.PI * d * cut) / (Math.PI * d);
		s += x[j] * (d === 0 ? cut : sinc) * w;
	}
	return s;
}

/** one key struck: when (s), at what gain, and when it is let go (it fades over STOP from then), if before the end */
export interface Strike { key: number; at: number; gain: number; until?: number }

/** keys played, as two channels at RATE, `length` seconds long, the last 0.3 s faded out (MASTER applied) */
export function render(strikes: Strike[], length: number): Float32Array[] {
	const total = Math.round(length * RATE);
	const out = [new Float32Array(total), new Float32Array(total)];
	for (const n of strikes) {
		const s = sampleFor(n.key), d = sample(s), rate = rateFor(n.key, s);
		const from = Math.round(n.at * RATE), cut = Math.min(1, 1 / rate);
		const off = n.until == null ? Infinity : Math.round(n.until * RATE), stop = STOP * RATE;
		for (let c = 0; c < 2; c++) {
			const x = d.ch[c], y = out[c];
			for (let i = from; i < Math.min(total, off + stop); i++) {
				const t = d.start + (i - from) * rate;
				if (t >= x.length - 1) break;
				const rise = Math.min(1, (i - from) / (RISE * RATE));
				const fall = i < off ? 1 : 1 - (i - off) / stop;
				y[i] += at(x, t, cut) * n.gain * MASTER * rise * fall;
			}
		}
	}
	const fade = Math.min(total, Math.round(0.3 * RATE));
	for (let i = 0; i < fade; i++) { const g = 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / fade); out[0][total - fade + i] *= g; out[1][total - fade + i] *= g; }
	return out;
}

/**
 * The two channels scaled by `gain` and written as MP3. Where that would peak above CEILING (the few milliseconds where
 * a chord's notes are struck at once), it is turned down just there, as the app's limiter would: the gain needed at
 * each sample, the least of it within 5 ms either side, averaged over 5 ms either side, so that it changes smoothly and
 * no peak gets through. CEILING is -2 dBFS so that the MP3, which overshoots its source a little, stays under -1 dBTP.
 * No tags, so the file depends only on the sound and the LAME version. Returns how far it was turned down (dB, ≤ 0).
 */
export function write(file: string, ch: Float32Array[], gain = 1): number {
	const n = ch[0].length, W = Math.round(0.005 * RATE), CEILING = 10 ** (-2 / 20);
	const need = new Float64Array(n);
	for (let i = 0; i < n; i++) need[i] = Math.min(1, CEILING / Math.max(1e-9, Math.abs(ch[0][i] * gain), Math.abs(ch[1][i] * gain)));
	const least = new Float64Array(n);
	for (let i = 0; i < n; i++) { let m = 1; for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) if (need[j] < m) m = need[j]; least[i] = m; }
	const x = new Float32Array(n * 2);
	let sum = 0, cnt = 0, most = 1;
	for (let j = 0; j <= Math.min(n - 1, W); j++) { sum += least[j]; cnt++; }
	for (let i = 0; i < n; i++) {
		const g = (sum / cnt) * gain;
		most = Math.min(most, sum / cnt);
		x[2 * i] = ch[0][i] * g; x[2 * i + 1] = ch[1][i] * g;
		// slide the window [i - W, i + W] one on
		if (i + W + 1 < n) { sum += least[i + W + 1]; cnt++; }
		if (i - W >= 0) { sum -= least[i - W]; cnt--; }
	}
	const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-q:a', '4', '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0', '-fflags', '+bitexact', '-flags:a', '+bitexact', file], { input: Buffer.from(x.buffer) });
	if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
	return 20 * Math.log10(most);
}

/** loudness, as BS.1770 (K-weighted, gated) integrated over the whole: measured by ffmpeg's ebur128 on the float
 * channels, the same meter check.py reads from the MP3 */
export function loudness(ch: Float32Array[]): number {
	const x = new Float32Array(ch[0].length * 2);
	for (let i = 0; i < ch[0].length; i++) { x[2 * i] = ch[0][i]; x[2 * i + 1] = ch[1][i]; }
	const r = spawnSync('ffmpeg', ['-nostats', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', '-', '-af', 'ebur128', '-f', 'null', '-'], { input: Buffer.from(x.buffer), encoding: 'buffer' });
	const err = r.stderr.toString();
	const summary = err.slice(err.lastIndexOf('Summary:'));
	return Number(summary.split('I:')[1].split('LUFS')[0]);
}
