# Fermatta's plugin host: loads a VST3 instrument (for example Kontakt with
# Noire) and renders notes to WAV. Talks to Fermatta in JSON lines over
# stdin / stdout; everything the plugin prints goes to stderr.
import json
import os
import sys
import time

import numpy as np
from mido import Message
from pedalboard import load_plugin

# keep stdout clean for replies: plugins sometimes print to it
_out = os.fdopen(os.dup(1), "w", encoding="utf-8")
os.dup2(2, 1)

plugin = None


def reply(**kw):
    _out.write(json.dumps(kw) + "\n")
    _out.flush()


def write_wav(path, audio, sr):
    """32-bit float stereo WAV; audio is (channels, frames)."""
    data = np.ascontiguousarray(audio.T.astype("<f4"))
    ch = audio.shape[0]
    with open(path, "wb") as f:
        f.write(b"RIFF" + (36 + data.nbytes).to_bytes(4, "little") + b"WAVE")
        f.write(b"fmt " + (16).to_bytes(4, "little") + (3).to_bytes(2, "little") + ch.to_bytes(2, "little"))
        f.write(sr.to_bytes(4, "little") + (sr * ch * 4).to_bytes(4, "little") + (ch * 4).to_bytes(2, "little") + (32).to_bytes(2, "little"))
        f.write(b"data" + data.nbytes.to_bytes(4, "little"))
        f.write(data.tobytes())


def to_messages(events, offset):
    # start clean: all sound off, all notes off, pedal up (Kontakt's own reset takes ~10 s, so it is skipped)
    out = [Message("control_change", control=c, value=0, time=0) for c in (120, 123, 64)]
    for t, kind, a, b in events:
        tt = max(0.0, t + offset)
        if kind == "on":
            out.append(Message("note_on", note=int(a), velocity=max(1, min(127, int(b))), time=tt))
        elif kind == "off":
            out.append(Message("note_off", note=int(a), velocity=0, time=tt))
        elif kind == "cc":
            out.append(Message("control_change", control=int(a), value=int(b), time=tt))
    return out


def probe(sr=48000):
    """Plays one note and returns its loudness: 0 means the instrument is not ready yet."""
    audio = plugin(to_messages([[0, "on", 60, 80], [0.6, "off", 60, 0]], 0.2), duration=1.4, sample_rate=sr, num_channels=2, reset=False)
    return float(np.abs(audio).max()) if audio.size else 0.0


def warm_up(limit):
    """Kontakt loads samples in the background: wait until a test note sounds."""
    t0 = time.time()
    peak = probe()
    while peak < 1e-4 and time.time() - t0 < limit:
        time.sleep(1.0)
        peak = probe()
    return peak


for line in sys.stdin:
    try:
        msg = json.loads(line)
    except ValueError:
        continue
    rid = msg.get("id")
    cmd = msg.get("cmd")
    try:
        if cmd == "load":
            plugin = load_plugin(msg["plugin"])
            if msg.get("state") and os.path.exists(msg["state"]):
                with open(msg["state"], "rb") as f:
                    plugin.raw_state = f.read()
            peak = warm_up(msg.get("wait", 90)) if msg.get("state") else 0.0
            reply(id=rid, ok=True, name=plugin.name, peak=peak)
        elif cmd == "editor":
            plugin.show_editor()
            with open(msg["state"], "wb") as f:
                f.write(plugin.raw_state)
            reply(id=rid, ok=True, peak=warm_up(30))
        elif cmd == "render":
            sr = int(msg.get("sr", 48000))
            pre = float(msg.get("preroll", 0.5))
            audio = plugin(to_messages(msg["events"], pre), duration=float(msg["duration"]) + pre, sample_rate=sr, num_channels=2, buffer_size=1024, reset=False)
            audio = audio[:, int(pre * sr):]
            write_wav(msg["out"], audio, sr)
            reply(id=rid, ok=True, peak=float(np.abs(audio).max()) if audio.size else 0.0, seconds=audio.shape[1] / sr)
        elif cmd == "quit":
            reply(id=rid, ok=True)
            break
        else:
            reply(id=rid, ok=False, error="unknown command " + str(cmd))
    except Exception as e:  # report every failure back to Fermatta
        reply(id=rid, ok=False, error=f"{type(e).__name__}: {e}")
