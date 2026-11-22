# Intervals and chords

Learning to hear musical intervals and chords: 224 short sounds, each one thing to recognise by ear. The 13
intervals from unison to octave are each played rising, falling and together. The 9 common chords (four triads and
five seventh chords) are each played rising, one note after another, and together. Every one of these is played from
four starting notes. Every sound is played on the same recorded piano as Knack's keyboard, and the notes of each are
shown on that keyboard. A dataset for [Knack](https://github.com/lorien-danger/knack): add it by this repo's link.

| column | type | what it is |
|---|---|---|
| sound | audio (`media/*.mp3`) | the sound, 1.9–3.3 s, played on a piano (below); plays when shown |
| name | plain | *minor third*, *perfect fifth*, *dominant seventh chord*... The title of a row. Every row of one interval or chord has the same name, whatever the starting note or the way it is played, so in Knack they are one answer |
| semitones | number | the size of an interval in semitones, 0–12. Intervals only: chords have none |
| kind | tree | *interval › perfect consonance › perfect fifth*, *interval › dissonance › tritone*, *chord › triad › minor*, *chord › seventh chord › half-diminished seventh* |
| formula | parts | the notes above the root as scale degrees: a minor triad is 1, ♭3, 5; a major sixth is 1, 6 |
| played | plain | *in turn, rising*, *in turn, falling* or *together* |
| starting note | plain | the first note played (when played together, the lowest): A3, C4, E♭4 or F♯4 |
| keys (`notes`) | notes, octave matters | the keys played, lit on a piano keyboard from A2 to F♯5, and heard on Knack's piano; answered by playing them. Written in the order played, e.g. E♭4 C4 (together, from the lowest), but as keys that order is not part of the value: an interval rising, falling or together is the same keys (*played* tells them apart) |
| sounds alike | embedding (`sounds-alike.npy`) | how alike two things sound (below) |

Suggested decks:

- **Name what you hear:** sound and name.
- **What kind is it?:** sound and kind. You answer by going down the tree, so you can learn consonant or
  dissonant, and triad or seventh chord, before the names.
- **What notes are in it?:** sound and formula.
- **Play what you hear:** sound and keys, with the starting note always shown. You hear it and play it on the
  keyboard, starting from the note you are given; or you see the keys and choose the sound.
- **Name the keys:** keys and name, with the starting note always shown. You see the keys lit (and hear them
  together) and name what they make; or you are given a name and a starting note, and play it.

The starting note is shown in both because without it, playing what you hear means knowing a note's pitch by ear
alone (absolute pitch), which almost nobody can learn; with it, it is what ear training asks: find the other notes
from one you know. It is a guide, not part of the question: Knack counts as right every row that has what the
question shows. So in *Name the keys*, any minor third this dataset has is right for "minor third" (from C4, C4 E♭4
rising or A3 C4 falling; from another starting note too), and where a few keyboards are offered it asks for all that
match. Played on the keyboard, a minor third from a note no row starts on (D4 F4) is no row's keys and is marked
wrong: the starting note is there to steer you to one that is.

**Why the octave matters.** These are sounds at particular pitches, and the keys are the ones heard: a minor third
from C4 is C4 and E♭4, and C5 E♭5 would be a different sound. With `"octave": false` any C and E♭ would be right, which
is the same answer to *Name the keys* but would let *Play what you hear* be answered in the wrong place. The keyboard
then runs from the lowest key any row needs (A2, an octave below A3, falling) to the highest (F♯5): three octaves, so
on a phone held upright the white keys are about 17 px wide; turned sideways they are wider.

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

Every sound is played on **Knack's own piano**, so that what is heard here is what is heard when the keys are tapped
in the app: the same recordings, played by the same rules. Those are the app's (`src/lib/piano/` in
[Knack](https://github.com/lorien-danger/knack), from its `keyboard` branch, commit a592633):

- **The piano** is the [Salamander Grand Piano V3](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html), a
  Yamaha C5 recorded by Alexander Holm, one strength of it (mezzo-forte). The app keeps thirty of its notes, every
  minor third from A0 to C8, trimmed, retuned, levelled and encoded as stereo MP3. This dataset needs twelve of them
  (A2 to F♯5), copied unchanged into `build/piano/samples/`.
- **How a key is played:** from the nearest of those notes, faster or slower by at most a semitone, with that
  recording's own tuning error corrected (`build/piano/render.ts`, copied unchanged from the app, and
  `build/piano/play.ts`, adapted from the app's `scripts/piano.ts`). Each note rings as recorded; notes struck
  together are each at 1/√n.
- **Tuning:** the piano's own, stretched slightly as a tuner does (flat in the bass, sharp in the treble), with A4 =
  440 Hz. The notes here are from 4 cents flat to 3 cents sharp of equal temperament.
- **Timing** is this dataset's, not the app's (the app plays notes in turn only rising, every 0.42 s):
  - In turn: two notes 0.8 s apart, or three or four 0.6 s apart. Each note is let go as the next is struck, fading
    over 0.08 s as the app fades a key struck again, and the last rings for 1.2 s.
  - Together: all the notes ring for 1.6 s.
  - Every sound then fades out over 0.3 s.
  - Falling intervals start on the starting note and go down.
  - The unison is played twice in a row and together, but not falling, which would be the same as rising.
- **Loudness:** each sound is brought to the same loudness, −20 LUFS (EBU R128). That is about the app's own level:
  each is between 1.4 dB quieter and 6.4 dB louder than the app plays the same notes. In 37 sounds played together,
  the few milliseconds where all the hammers strike at once would peak above −2 dBFS; just there they are turned down
  smoothly (by 0.9 dB in the median of those, 4 dB at most), as the app's own limiter does.
- **Format:** 44.1 kHz stereo MP3, VBR (LAME −V4, as the app's script makes them), 28 kB on average, 6.3 MB in
  all. Stereo because the piano was recorded with two microphones that do not add up to mono cleanly. MP3 plays in
  Safari on an iPhone and in every other browser. The files are in `media/` and the rows point at them as
  `media/<id>.mp3`, so Knack serves them from wherever the dataset is (jsDelivr, for this repo's link).

`build/check.py` decodes every MP3 with ffmpeg and checks it against its row:

- that it is stereo, 44.1 kHz;
- its length, within 0.05 s of what the timing above makes it;
- its loudness (EBU R128), within 1 LU of −20 LUFS, and its true peak, at most −1 dBTP;
- its pitches. Each note played in turn must be within 10 cents of the row's note, with no strong peak an octave
  below. Played together, each of the row's notes must stand out in the spectrum within 10 cents of where it should
  be, and no strong peak may be left that is not a partial of one of them (allowing for a piano's partials being a
  little sharp of whole multiples).

Shifting every other row's notes by a semitone, and every fourth by a quarter of a semitone, it flags all 168 of
those rows and none of the other 56.

The last run gave:

    224 sounds, 6.3 MB, 28 kB each on average
    length 1.90-3.30 s; loudness -20.2 to -19.9 LUFS (median -20.0); true peak at most -1.9 dBTP
    pitches: 556 notes heard, -4.0 to +2.9 cents from equal temperament (median +0.8); worst 4.0
    all good

**What has not been judged.** Nobody has listened to these. What the analysis shows: each file is the app's own
rendering of those notes at a set level (rendered by the app's `scripts/piano.ts` and compared, what is left over is
33–35 dB below the sound: the MP3's coding noise); the pitches are right; the level is even; the joins between notes
and the end fade are smooth in a spectrogram. Whether it sounds good is down to the Salamander and the app: the
samples have almost nothing above 7 kHz (the MP3 encoder dropped what it judged too quiet to hear), and one strength
of each note is used, so every note is struck alike.

## Sounds alike

`sounds-alike.npy` is an embedding that Knack uses to tell which things are near each other. It is made from the
notes, not from listening tests or from a trained model.

**How it is made.** For each interval or chord (computed with C4 as its lowest note) it puts together:

- **the distances between every pair of its notes,** as bumps on a grid of half semitones from 0 to 12, blurred by
  0.6 of a semitone. So a minor third is near a major third, and a fourth is near the tritone and the fifth.
- **the same for each note's distance above the lowest.** This tells a major triad (4, 7 above the root) from a
  minor triad (3, 7), which have the same pairs of distances.
- **how rough it sounds when played together.** This is Sethares' sensory dissonance, after Plomp and Levelt: the
  sum, over every pair of partials of two different notes of a model piano tone (16 partials, slightly stretched,
  B = 0.00025, falling in loudness with height, with a dip near the 8th; not the recordings), of the smaller amplitude times
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
    npx tsx build.ts       # about a minute; needs ffmpeg with libmp3lame
                           # writes columns.json, rows.jsonl, sounds-alike.npy, media/ and build/notes.jsonl
    python3 check.py       # needs ffmpeg and numpy

The build has no randomness, so building it again gives the same files byte for byte (checked), as long as ffmpeg
decodes the samples and LAME (3.100 here, with ffmpeg 8.0) encodes them the same way; another version of either may
give slightly different MP3s that sound the same. `build/notes.jsonl` lists each row's notes and their frequencies; the
checker reads it.

If the app's piano changes (other samples, other rules), copy its `src/lib/piano/render.ts`, `samples.json` and the
samples from A2 to F♯5 into `build/piano/`, and build again.

## Licence

**The piano recordings** in `build/piano/samples/`, and the sounds in `media/` made from them, are from the
[Salamander Grand Piano V3](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) by Alexander Holm, licensed
[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/): use them freely, crediting him. They were changed (trimmed,
retuned, levelled and re-encoded) by Knack, and the sounds here are those recordings played as intervals and chords
(`build/piano/samples/LICENSE.md`).

**Everything else this repo makes** (the rows, the columns, the embedding, the scripts, and what the build adds to
the recordings) is dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). `build/piano/render.ts` and `build/piano/play.ts` are
from Knack, by the same owner.
