"""Checks every sound against what its row says: decodes each MP3 with ffmpeg and reports its length, loudness
(EBU R128 integrated, by ffmpeg) and peak, and whether the pitches heard are the row's notes.

    python3 check.py            (needs ffmpeg and numpy; reads notes.jsonl, written by build.ts)

Pitches: a note played on its own (in turn) is found as the strongest peak of the spectrum of the 0.3 s after it is
struck, refined by fitting a parabola, then taken down to the fundamental (the strongest peak may be the second
partial); it must be within 10 cents of the row's note. Played together, every note of the row must stand out as
a spectral peak within 10 cents of where it should be, and no strong peak may be left that is not a partial of one
of the row's notes.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
RATE = 44100


def decode(f):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(f), '-f', 's16le', '-ac', '1', '-ar', str(RATE), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float64) / 32768


def lufs(f):
    err = subprocess.run(['ffmpeg', '-nostats', '-i', str(f), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    summary = err[err.rfind('Summary:'):]
    i = float(summary.split('I:')[1].split('LUFS')[0])
    peak = float(summary.split('Peak:')[1].split('dBFS')[0])
    return i, peak


def spectrum(x, n=1 << 16):
    w = x * np.hanning(len(x))
    s = np.abs(np.fft.rfft(w, n))
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


def main():
    rows = [json.loads(l) for l in open(HERE / 'notes.jsonl')]
    bad, lengths, louds, peaks, worst = [], [], [], [], 0.0
    for r in rows:
        f = HERE.parent / 'media' / f"{r['id']}.mp3"
        x = decode(f)
        lengths.append(len(x) / RATE)
        i, p = lufs(f)
        louds.append(i); peaks.append(p)
        hz = r['hz']
        if r['played'] == 'together':
            s, df = spectrum(x[int(0.05 * RATE):int(0.55 * RATE)])
            top = s.max()
            for h in set(hz):
                got, a = peak_at(s, df, h)
                c = cents(got, h)
                worst = max(worst, abs(c))
                if abs(c) > 10 or a < 0.05 * top:
                    bad.append(f"{r['id']}: {h} Hz heard at {got:.1f} ({c:+.1f} cents, {a / top:.2f} of the top)")
            # every strong peak is a partial of one of the notes
            k = np.argsort(s)[::-1]
            for b in k[:400]:
                if s[b] < 0.1 * top or b < 5:
                    continue
                fb = b * df
                if not any(abs(cents(fb, h * max(1, round(fb / h)))) < 30 for h in hz):
                    bad.append(f"{r['id']}: an unexplained peak at {fb:.1f} Hz")
                    break
        else:
            step = 0.8 if len(hz) == 2 else 0.6
            for j, h in enumerate(hz):
                a0 = int((j * step + 0.03) * RATE)
                s, df = spectrum(x[a0:a0 + int(0.3 * RATE)])
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
                worst = max(worst, abs(c))
                if abs(c) > 10 or below > 0.2 * a:
                    bad.append(f"{r['id']}: note {j + 1} should be {h} Hz, heard {f0:.1f} ({c:+.1f} cents)")
    L = np.array(lengths); I = np.array(louds); P = np.array(peaks)
    size = sum((HERE.parent / 'media' / f"{r['id']}.mp3").stat().st_size for r in rows)
    print(f'{len(rows)} sounds, {size / 1e6:.1f} MB, {size / len(rows) / 1e3:.0f} kB each on average')
    print(f'length {L.min():.2f}-{L.max():.2f} s; loudness {I.min():.1f} to {I.max():.1f} LUFS (median {np.median(I):.1f}); true peak at most {P.max():.1f} dBFS')
    print(f'pitches: worst {worst:.1f} cents from the row\'s notes')
    for b in bad:
        print('  ' + b)
    print('all good' if not bad else f'{len(bad)} problems')
    sys.exit(1 if bad else 0)


main()
