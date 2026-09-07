# Music and sound for Commish Bowl

Drop a file in this folder with the right name and it plays. Leave it out and
the game keeps using its built-in synthesised version. Nothing breaks either
way, and you can add one file at a time.

Commit the files and deploy as usual — there is no build step and no code to
change.

## The filenames

Use `.mp3` (what music generators export) or `.wav`. Nothing else is looked
for. Lower case, exactly these names:

| File | When it plays | Loops? | Target length |
|---|---|---|---|
| `kickoff.mp3` | Once, when you snap the kickoff | no | 4–6 s |
| `drive.mp3` | From the first snap until the drive ends | **yes** | 10–20 s |
| `touchdown.mp3` | Once, on a score | no | 2–4 s |
| `move-up.mp3` | When the runner cuts upfield | no | **under 150 ms** |
| `move-down.mp3` | When the runner cuts downfield | no | **under 150 ms** |

Anything you do not provide falls back to the synth. `drive.mp3` on its own is
a perfectly good first step.

## Making `drive.mp3` loop cleanly

This is the only one where the file itself has to be right.

- **No intro, no outro, no fade in or out.** A fade at either end is a hole in
  the loop, once per pass.
- **A whole number of bars.** At 150 BPM, four bars is 6.4 seconds and eight
  bars is 12.8. Anything that is not a whole number of bars will drift against
  itself.
- **No trailing silence.** Generators like to leave a beat of room at the end.
  Trim it, or the loop gains a gap.

A note on how long it is actually heard. A single down is over fast — the
median is 1.2 seconds and the longest measured was 1.6 — so the music
deliberately runs across the whole drive rather than stopping at each whistle.
A drive is roughly a dozen plays, so a 10–20 second loop will go round several
times and wants to bear repeating. A kickoff return is about 5 seconds, which
is what `kickoff.mp3` is sized for.

The player decodes the file and loops it over an explicit sample range rather
than using an `<audio>` element, which means MP3 encoder padding is not a
problem. Everything else — a fade, a stray half-bar, silence at the end — is
still baked into the audio and cannot be fixed at playback time.

If a track will not sit right, send it over and it can be trimmed to a
sample-exact loop point.

## The movement blips

Keep these very short. They fire when the runner changes direction, not on
every frame, and they are throttled — but a 400 ms sound on a 150 ms event
overlaps itself and turns to mud. Think one blip, not one note.

## Volume

Do not normalise these to full scale. Everything is mixed under a hard cap in
`lib/sfx.ts`, and music sits at half of it so a tackle can cut through. A file
mastered loud will not be louder, it will just clip earlier.

## Licensing

If you generate these, check the generator's terms cover **commercial** use —
this site takes money, and most free tiers do not. Keep a record of what
licence each file was produced under.

## Where the code is

- `src/lib/audiokit.ts` — loads, caches and plays files; falls back silently
- `src/lib/chiptune.ts` — the synthesised music used when a file is absent
- `src/lib/sfx.ts` — the effects, the on/off switch, and the volume cap

Nothing is fetched until a visitor turns sound on, and each file is fetched at
most once.
