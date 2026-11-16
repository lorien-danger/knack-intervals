# Intervals and chords

Learning to hear musical intervals and chords: 224 short sounds, each one thing to recognise by ear. The 13
intervals from unison to octave are each played rising, falling and together. The 9 common chords (four triads and
five seventh chords) are each played rising, one note after another, and together. Every one of these is played from
four starting notes. A dataset for [Knack](https://github.com/lorien-danger/knack): add it by this repo's link.

| column | type | what it is |
|---|---|---|
| sound | audio (`media/*.mp3`) | the sound, 1.8–3.2 s; plays when shown |
| name | plain | *minor third*, *perfect fifth*, *dominant seventh chord*... The title of a row. Every row of one interval or chord has the same name, whatever the starting note or the way it is played, so in Knack they are one answer |
| semitones | number | the size of an interval in semitones, 0–12. Intervals only: chords have none |
| kind | tree | *interval › perfect consonance › perfect fifth*, *interval › dissonance › tritone*, *chord › triad › minor*, *chord › seventh chord › half-diminished seventh* |
| formula | parts | the notes above the root as scale degrees: a minor triad is 1, ♭3, 5; a major sixth is 1, 6 |
| played | plain | *in turn, rising*, *in turn, falling* or *together* |
| starting note | plain | the first note played (when played together, the lowest): A3, C4, E♭4 or F♯4 |
| notes played | ranking | the notes in the order they are played, e.g. E♭4 › C4 (when played together, from the lowest) |
| sounds alike | embedding (`sounds-alike.npy`) | how alike two things sound (below) |

Suggested decks:

- **Name what you hear:** sound and name.
- **What kind is it?:** sound and kind. You answer by going down the tree, so you can learn consonant or
  dissonant, and triad or seventh chord, before the names.
- **What notes are in it?:** sound and formula.

*semitones* is not in a suggested deck: chords have no value for it, and Knack still asks a chord's sound with the
semitones shown as "–".

## The music

The names and the formulas are standard music theory. Some choices had to be made:

- **Consonances and dissonances.** The *kind* tree groups intervals in the usual common-practice way:
  - perfect consonances: unison, fourth, fifth, octave;
  - imperfect consonances: thirds and sixths;
  - dissonances: seconds, sevenths and the tritone.

  The fourth is counted as a perfect consonance, as most ear-training and theory books do. In two-part counterpoint
  above the bass it is treated as a dissonance.
- **The tritone** is written ♭5 in its formula (a diminished fifth), the same as in the diminished chords. It could
  equally be ♯4.
- **The diminished seventh chord** is 1, ♭3, ♭5, ♭♭7. Its top note is a double-flat seventh, which sounds the same as
  a 6. It is written ♭♭ because the single double-flat sign (𝄫) is missing from most phone fonts.
- **Naming the starting notes.** They are named with ♭ and ♯ as in E♭4 and F♯4, with middle C as C4. Other notes are
  named C, C♯, D, E♭, E, F, F♯, G, A♭, A, B♭, B: these names say what is heard, not how a score would spell it.

## The sounds

There are no recordings. Every sound is synthesised by `build/build.ts`, so there is nothing to license:

- **The tone** is piano-like. Each note is 16 partials, slightly stretched the way a piano string's are
  (inharmonicity B = 0.00025). Each partial is a pair of "strings" 0.7 cents apart, which beat slowly.
  - The partials are struck with a 4 ms attack.
  - Their loudness falls with height, with a dip near the 8th partial, as from a hammer striking an eighth of the
    way along the string.
  - Each dies away in two stages, a prompt sound and a lingering aftersound. Higher partials and higher notes die
    faster.
  - Each note is damped over 0.12 s at the end.
- **Tuning:** equal temperament, A4 = 440 Hz.
- **Timing:**
  - In turn: two notes 0.8 s apart, or three or four 0.6 s apart. Each note is damped as the next is struck, and the
    last rings for 1.2 s.
  - Together: all the notes ring for 1.6 s.
  - Falling intervals start on the starting note and go down.
  - The unison is played twice in a row and together, but not falling, which would be the same as rising.
- **Loudness:** each sound is brought to the same level (RMS −18 dBFS). The first few milliseconds of a chord, where
  all its notes are struck at once, are turned down smoothly so that nothing peaks above −3 dBFS.
- **Format:** 44.1 kHz mono MP3 at 80 kbit/s, 21 kB on average, 4.8 MB in all. MP3 plays in Safari on an iPhone
  and in every other browser. The files are in `media/` and the rows point at them as `media/<id>.mp3`, so Knack
  serves them from wherever the dataset is (jsDelivr, for this repo's link).

`build/check.py` decodes every MP3 with ffmpeg and checks it against its row:

- its length;
- its loudness (EBU R128) and true peak;
- its pitches. Each note played in turn must be within 10 cents of the row's note, with no strong peak an octave
  below. Played together, each of the row's notes must stand out in the spectrum within 10 cents of where it should
  be, and no strong peak may be left that is not a partial of one of them.

The last run gave:

    224 sounds, 4.8 MB, 21 kB each on average
    length 1.78-3.19 s; loudness -19.3 to -18.2 LUFS (median -18.9); true peak at most -1.3 dBFS
    pitches: worst 0.5 cents from the row's notes
    all good

## Sounds alike

`sounds-alike.npy` is an embedding that Knack uses to tell which things are near each other. It is made from the
notes, not from listening tests or from a trained model.

**How it is made.** For each interval or chord (computed with C4 as its lowest note) it puts together:

- **the distances between every pair of its notes,** as bumps on a grid of half semitones from 0 to 12, blurred by
  0.6 of a semitone. So a minor third is near a major third, and a fourth is near the tritone and the fifth.
- **the same for each note's distance above the lowest.** This tells a major triad (4, 7 above the root) from a
  minor triad (3, 7), which have the same pairs of distances.
- **how rough it sounds when played together.** This is Sethares' sensory dissonance, after Plomp and Levelt: the
  sum, over every pair of partials of two different notes of this tone, of the smaller amplitude times
  e^(−3.5·s·Δf) − e^(−5.75·s·Δf), where s = 0.24 / (0.0207·f_low + 18.96). It is scaled so the roughest is 4.
  This puts the smooth intervals (octave, fifth, fourth, unison) near each other and apart from the rough ones.
- **how many notes it has,** less 2, times 2. This keeps intervals and chords apart.

The vectors are centred, and scaled so that the median row is 1 from the centre. One interval or chord has one
vector, however it is played and from whichever note: it describes what the thing is, which is what gets mixed up.

**What it is not.** The weights (the 0.6 blur, the 4 for roughness, the 2 for the number of notes) are my
choices. I picked them by looking at each one's nearest neighbours: an interval's nearest are intervals, the octave is next to the unison and the fifth, and the thirds are next to each other. They are not fitted to how people actually confuse these sounds.

The nearest three, for each:

    unison                     minor second, octave, perfect fifth
    minor second               major second, unison, minor third
    major second               minor third, minor second, unison
    minor third                major third, major second, minor triad
    major third                minor third, perfect fourth, augmented triad
    perfect fourth             tritone, major third, octave
    tritone                    perfect fourth, perfect fifth, octave
    perfect fifth              minor sixth, tritone, octave
    minor sixth                major sixth, perfect fifth, octave
    major sixth                minor seventh, minor sixth, octave
    minor seventh              major seventh, major sixth, octave
    major seventh              octave, minor seventh, unison
    octave                     major seventh, unison, minor seventh
    major triad                minor triad, augmented triad, diminished triad
    minor triad                major triad, diminished triad, augmented triad
    diminished triad           minor triad, major triad, augmented triad
    augmented triad            major triad, minor triad, diminished triad
    dominant seventh chord     minor seventh chord, half-diminished chord, major seventh chord
    major seventh chord        dominant seventh chord, minor seventh chord, half-diminished chord
    minor seventh chord        dominant seventh chord, half-diminished chord, major seventh chord
    half-diminished chord      minor seventh chord, dominant seventh chord, diminished seventh chord
    diminished seventh chord   half-diminished chord, dominant seventh chord, minor seventh chord


## Building it

    cd build && npm install
    npx tsx build.ts       # about two minutes; writes columns.json, rows.jsonl, sounds-alike.npy, media/ and build/notes.jsonl
    python3 check.py       # needs ffmpeg and numpy

The build has no randomness, so building it again gives the same files. `build/notes.jsonl` lists each row's notes
and their frequencies; the checker reads it.

## Licence

Everything here was made by the build script, from no outside data: the sounds, the rows and the embedding. It is
all dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The
MP3 encoder used by the build, [lamejs](https://github.com/zhuker/lamejs) (`@breezystack/lamejs`), is LGPL. It is
not part of the dataset.
