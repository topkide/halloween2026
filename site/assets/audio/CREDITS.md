# Combat audio

Gunshot recordings: **The Free Firearm Sound Library**, created and recorded by
Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney.

- Source: https://opengameart.org/content/the-free-firearm-sound-library
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Original pistol: `Prepared SFX Library/1911/A_42P.wav` (1911, near distance).
- Original shotgun: `Prepared SFX Library/Nova/O_21P.wav` (Benelli Nova, near distance).

Edits for this prototype: isolate the muzzle report, mono downmix, 44.1 kHz / 16-bit
PCM, remove rumble, shape dynamics and fade the tail. The shotgun adds a fixed low
body and a quiet reflection. `ghost-hit.wav` is a short, filtered and saturated
texture derived from the pistol transient, with a brief fixed-frequency body.

The shipped files contain only the edited short clips, not the full source library.
