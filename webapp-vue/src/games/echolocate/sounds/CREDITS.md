# Sample credits

**Both files are placeholders.** Clemens has not chosen recordings yet. They are synthesised with
ffmpeg (libmp3lame), so there is nothing to credit — CC0, made for this repo. Replace them with real
recordings (CC0, CC BY or CC BY-NC; licence checked at the source, not the aggregator's label)
before merge, and replace this table with the usual one: file, recording, author, licence.

| Files       | Recording                                        | Author         | License                                                       |
| ----------- | ------------------------------------------------ | -------------- | ------------------------------------------------------------- |
| `brook.mp3` | placeholder: band-passed pink noise, 2.0 s, mono | generated here | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `cow.mp3`   | placeholder: vibrato low tone, 1.4 s, mono       | generated here | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

**Commands** (run from this directory):

```bash
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anoisesrc=color=pink:duration=2:sample_rate=44100:amplitude=0.5" -af "bandpass=f=1800:width_type=h:w=2400,tremolo=f=7:d=0.4,afade=t=in:d=0.05,afade=t=out:st=1.9:d=0.1" -ac 1 -codec:a libmp3lame -b:a 96k brook.mp3
```

```bash
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "aevalsrc='0.4*sin(2*PI*(110+8*sin(2*PI*5*t))*t)+0.2*sin(4*PI*(110+8*sin(2*PI*5*t))*t)':d=1.4:s=44100" -af "lowpass=f=900,afade=t=in:d=0.15,afade=t=out:st=1.1:d=0.3" -ac 1 -codec:a libmp3lame -b:a 96k cow.mp3
```

Used by: Peilung's noise sources — Bach (`brook.mp3`) and Kuh (`cow.mp3`). Both are levelled to the
round's reference loudness in the browser, so the files' own volume does not matter.

Countdown is non-commercial, so CC BY-NC recordings are usable, with a visible credit.
