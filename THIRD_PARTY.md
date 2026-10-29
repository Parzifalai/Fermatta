# Third-party components

Fermatta's own code is MIT-licensed. It uses, bundles or downloads on demand:

## Bundled
| Component | License |
|---|---|
| [Electron](https://www.electronjs.org) | MIT |
| [ffmpeg](https://ffmpeg.org) via [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) — separate executable | GPL-3.0 (binary build) |
| [ONNX Runtime](https://onnxruntime.ai) (onnxruntime-node) | MIT |
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | BSD-3-Clause |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | MIT |
| [fflate](https://github.com/101arrowz/fflate) | MIT |
| Golos Text, Cormorant Garamond fonts (via Fontsource) | SIL Open Font License 1.1 |

## Downloaded when you choose them (not part of this repository)
| Component | Author | License |
|---|---|---|
| Accurate-Salamander / Moonlight-Salamander Grand Piano | Chisato Yamauchi, based on Salamander Grand Piano by Alexander Holm | CC BY 3.0 |
| Maestro Concert Grand Piano | Mats Helgesson | free, see the library |
| Splendid Grand Piano | AKAI samples | Public domain |
| Headroom Piano | Bengt Nilsson | CC BY 4.0 |
| Osiris Piano | Versilian Studios & Karoryfer Samples | CC0 |
| Piano transcription model `kong_note_pedal.onnx` | Q. Kong, B. Li, X. Song, Y. Wan, Y. Wang — “High-resolution Piano Transcription with Pedals by Regressing Onset and Offset Times” (2020); ONNX conversion by Vedat Ozkan | CC BY 4.0 |
| [Audiveris](https://github.com/Audiveris/audiveris) 5.11 (sheet music recognition), run as a separate program | Hervé Bitteur and contributors | AGPL-3.0 |

## Pedalboard
https://github.com/spotify/pedalboard — GPL-3.0. Downloaded on first use into the plugin host environment (not bundled); runs as a separate process.

## mido
https://github.com/mido/mido — MIT. Downloaded on first use with Pedalboard.
