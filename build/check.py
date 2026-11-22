"""Checks every sound against what its row says: decodes each MP3 with ffmpeg and checks

  its format    stereo, 44.1 kHz
  its length    as build.ts plays it: together 1.9 s; in turn, the last note struck (two notes 0.8 s apart, three or
                four 0.6 s apart) and 1.5 s more; within 0.05 s (an MP3 may carry a few ms of padding)
  its level     loudness (EBU R128 integrated, by ffmpeg) within 1 LU of -20 LUFS; true peak at most -1 dBTP
  its pitches   a note played on its own (in turn) is found as the strongest peak of the spectrum of the 0.3 s from
                0.1 s after it is struck (when the note before has faded), refined by fitting a parabola, then taken
                down to the fundamental (the strongest peak may be a higher partial); it must be within 10 cents of the
                row's note, with nothing strong an octave below. Played together, every note of the row must stand out
                as a spectral peak within 10 cents of where it should be, and no strong peak may be left that is not a
                partial of one of the row's notes (a piano's partials are a little sharp of whole multiples, more so
                the higher they are, so a partial is looked for allowing for that).

    python3 check.py            (needs ffmpeg and numpy; reads notes.jsonl, written by build.ts)

The spectra are of the two channels each, added (the piano's two microphones do not add up to mono cleanly). The
notes are compared with equal temperament, A4 = 440 Hz; the piano is tuned a little stretched (the app corrects each
sample onto the piano's own tuning curve, flat in the bass and sharp in the treble), so a few cents off is expected.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
RATE = 44100


TARGET, TOLERANCE, TRUE_PEAK = -20.0, 1.0, -1.0


def decode(f):
    """the two channels, as they are in the file (anything but stereo 44.1 kHz is a problem)"""
    info = subprocess.run(['ffprobe', '-v', 'quiet', '-select_streams', 'a:0', '-show_entries', 'stream=channels,sample_rate', '-of', 'csv=p=0', str(f)], capture_output=True, text=True, check=True).stdout.strip()
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(f), '-f', 's16le', '-ac', '2', '-ar', str(RATE), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float64).reshape(-1, 2).T / 32768, info


def lufs(f):
    err = subprocess.run(['ffmpeg', '-nostats', '-i', str(f), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    summary = err[err.rfind('Summary:'):]
    i = float(summary.split('I:')[1].split('LUFS')[0])
    peak = float(summary.split('Peak:')[1].split('dBFS')[0])
    return i, peak


def spectrum(x, n=1 << 16):
    """the magnitude spectra of the two channels, added"""
    w = x * np.hanning(x.shape[1])
    s = np.abs(np.fft.rfft(w, n)).sum(axis=0)
    return s, RATE / n


def peak_at(s, df, f, cents=40):
    """the strongest bin within `cents` of f, refined: its frequency and height"""
    lo, hi = int(f * 2 ** (-cents / 1200) / df), int(f * 2 ** (cents / 1200) / df) + 1
    k = lo + int(np.argmax(s[lo:hi]))
    a, b, c = np.log(s[k - 1:k + 2] + 1e-12)
    d = 0.5 * (a - c) / (a - 2 * b + c)
    return (k + d) * df, s[k]


def cents(a, b):
    return 1200 * np.log2(a / b)


def partial_of(fb, h):
    """whether fb is a partial of a note at h: near some k·h, allowing a piano's stretch (up to B = 0.001, k·h·√(1+Bk²))"""
    k = max(1, round(fb / h))
    for k in (k - 1, k, k + 1):
        if k >= 1 and -30 < cents(fb, k * h) < 30 + cents(np.sqrt(1 + 0.001 * k * k), 1):
            return True
    return False


def main():
    rows = [json.loads(l) for l in open(HERE / 'notes.jsonl')]
    bad, lengths, louds, peaks, offs = [], [], [], [], []
    for r in rows:
        f = HERE.parent / 'media' / f"{r['id']}.mp3"
        x, info = decode(f)
        if info != '44100,2':
            bad.append(f"{r['id']}: {info} (sample rate, channels), not stereo 44.1 kHz")
        hz = r['hz']
        step = 0.8 if len(hz) == 2 else 0.6
        want = 1.9 if r['played'] == 'together' else (len(hz) - 1) * step + 1.5
        L = x.shape[1] / RATE
        lengths.append(L)
        if abs(L - want) > 0.05:
            bad.append(f"{r['id']}: {L:.3f} s long, not {want:.2f}")
        i, p = lufs(f)
        louds.append(i); peaks.append(p)
        if abs(i - TARGET) > TOLERANCE:
            bad.append(f"{r['id']}: loudness {i:.1f} LUFS, not within {TOLERANCE} of {TARGET}")
        if p > TRUE_PEAK:
            bad.append(f"{r['id']}: true peak {p:.1f} dBTP, above {TRUE_PEAK}")
        if r['played'] == 'together':
            s, df = spectrum(x[:, int(0.05 * RATE):int(0.55 * RATE)])
            top = s.max()
            for h in set(hz):
                got, a = peak_at(s, df, h)
                c = cents(got, h)
                offs.append(c)
                if abs(c) > 10 or a < 0.05 * top:
                    bad.append(f"{r['id']}: {h} Hz heard at {got:.1f} ({c:+.1f} cents, {a / top:.2f} of the top)")
            # every strong peak is a partial of one of the notes
            k = np.argsort(s)[::-1]
            for b in k[:400]:
                if s[b] < 0.1 * top or b < 5:
                    continue
                fb = b * df
                if not any(partial_of(fb, h) for h in hz):
                    bad.append(f"{r['id']}: an unexplained peak at {fb:.1f} Hz ({s[b] / top:.2f} of the top)")
                    break
        else:
            for j, h in enumerate(hz):
                a0 = int((j * step + 0.1) * RATE)
                s, df = spectrum(x[:, a0:a0 + int(0.3 * RATE)])
                kmax = int(np.argmax(s[5:])) + 5
                fpk = kmax * df
                n = max(1, round(fpk / h))
                got, _ = peak_at(s, df, fpk)
                got /= n
                # the fundamental itself, near where the strongest peak says it is
                f0, a = peak_at(s, df, got)
                # and not an octave below: nothing strong at half of it
                _, below = peak_at(s, df, f0 / 2)
                c = cents(f0, h)
                offs.append(c)
                if abs(c) > 10 or below > 0.2 * a:
                    bad.append(f"{r['id']}: note {j + 1} should be {h} Hz, heard {f0:.1f} ({c:+.1f} cents, {below / a:.2f} an octave below)")
    L = np.array(lengths); I = np.array(louds); P = np.array(peaks); O = np.array(offs)
    size = sum((HERE.parent / 'media' / f"{r['id']}.mp3").stat().st_size for r in rows)
    print(f'{len(rows)} sounds, {size / 1e6:.1f} MB, {size / len(rows) / 1e3:.0f} kB each on average')
    print(f'length {L.min():.2f}-{L.max():.2f} s; loudness {I.min():.1f} to {I.max():.1f} LUFS (median {np.median(I):.1f}); true peak at most {P.max():.1f} dBTP')
    print(f'pitches: {len(O)} notes heard, {O.min():+.1f} to {O.max():+.1f} cents from equal temperament (median {np.median(O):+.1f}); worst {np.abs(O).max():.1f}')
    for b in bad:
        print('  ' + b)
    print('all good' if not bad else f'{len(bad)} problems')
    sys.exit(1 if bad else 0)


main()
