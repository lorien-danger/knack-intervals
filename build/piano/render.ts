/**
 * How the piano plays notes: the one statement of it, for the app (piano.ts, in the browser) and for making a
 * dataset's sound files from the same piano (scripts/piano.ts), so that the two sound alike.
 *
 * The piano is the Salamander Grand Piano V3 (a Yamaha C5 recorded by Alexander Holm, CC-BY 3.0), one strength of it
 * (v10 of 16, mezzo-forte), sampled every minor third from A0 to C8 (scripts/piano-samples.ts made samples/ from it,
 * and says how). A key is played from the sample nearest it, faster or slower (at most a semitone either way), with
 * that sample's tuning corrected; each note rings as recorded (2 to 4.5 s, faded out at the end) unless the same key
 * is struck again or the sound is stopped, when it fades out over STOP. Notes played together are each at 1/√n, so
 * that a chord is as loud as a note; in turn, one starts every GAP.
 */
import samples from './samples.json';

export interface Sample { key: number; file: string; cents: number }
export const SAMPLES: Sample[] = samples;

/** the sample a key is played from: the nearest (with samples every three keys, never more than one away inside A0 to
 * C8; outside it, the end one) */
export function sampleFor(key: number): Sample {
	let best = SAMPLES[0];
	for (const s of SAMPLES) if (Math.abs(s.key - key) < Math.abs(best.key - key)) best = s;
	return best;
}

/** how fast the sample is played for a key: its interval from the sample's own key, less the sample's own error */
export const rateFor = (key: number, s = sampleFor(key)) => 2 ** ((key - s.key) / 12 - s.cents / 1200);

/** each note's gain when n sound together: equal power, so a chord is as loud as one note */
export const gainFor = (n: number) => 1 / Math.sqrt(Math.max(1, n));

/** in turn: one note every GAP seconds, low to high */
export const GAP = 0.42;
/** a note cut short fades over this long, so that it never clicks */
export const STOP = 0.08;
/** the samples are cut 2 ms before the hammer strikes: a note is started this far in, after the decoder's own delay */
export const LEAD = 0.002;
/** a note comes in over this long (the hammer strikes LEAD after it starts), so that its first sample never clicks */
export const RISE = 0.0015;
/** the whole is played at this gain (the samples are at about -20 LUFS, peaks near -10 dBFS; played, a note is about
 * -18 LUFS, and the loudest chord or top note peaks at about -1.5 dBFS) */
export const MASTER = 1.3;

/**
 * Where a decoded sample starts sounding, in samples: MP3 decoders put a few milliseconds of silence before it (how
 * much differs between browsers), so it is found, not assumed: the first sample a twentieth as loud as the loudest,
 * less LEAD (as the samples were cut).
 */
export function startOf(channels: Float32Array[], rate: number): number {
	let top = 0;
	for (const ch of channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > top) top = v; }
	for (let i = 0; i < channels[0].length; i++) for (const ch of channels) if (Math.abs(ch[i]) > top / 20) return Math.max(0, i - Math.round(LEAD * rate));
	return 0;
}

/** when each of some keys starts, in seconds from the first: together, or in turn from the lowest */
export function timesOf(keys: number[], inTurn = false): { key: number; at: number; gain: number }[] {
	const ks = [...new Set(keys)].sort((a, b) => a - b);
	return ks.map((key, k) => ({ key, at: inTurn ? k * GAP : 0, gain: inTurn ? 1 : gainFor(ks.length) }));
}
