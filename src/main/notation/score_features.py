# Score features for readable sheet music, from a played performance:
# beats, bar lines, which hand plays each note, key and time signature.
# Uses PM2S (Liu et al., ISMIR 2022, MIT licence), vendored next to this file.
#   python score_features.py <in.json> <out.json> <models dir>
# in.json:  {"notes": [[pitch, onset s, duration s, velocity], ...]}
# out.json: {"beats": [...], "downbeats": [...], "hands": [0 left | 1 right, per input note], "fifths": n, "time": "4/4"}
import json
import os
import sys
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pm2s import CRNNJointPM2S  # noqa: E402
from pm2s.constants import keyName2Sharps  # noqa: E402

src, dst, models = sys.argv[1], sys.argv[2], sys.argv[3]
notes = json.load(open(src, encoding="utf-8"))["notes"]
order = sorted(range(len(notes)), key=lambda i: (notes[i][1], notes[i][0]))
seq = np.array([[notes[i][0], notes[i][1], max(0.02, notes[i][2]), notes[i][3]] for i in order], dtype=np.float32)

m = CRNNJointPM2S(
    model_path_beat=os.path.join(models, "RNNJointBeatModel.pth"),
    model_path_hand_part=os.path.join(models, "RNNHandPartModel.pth"),
    model_path_key_sig=os.path.join(models, "RNNKeySignatureModel.pth"),
    model_path_time_sig=os.path.join(models, "CNNTimeSignatureModel.pth"),
)
beats, downbeats, hand_parts, key_changes, time_sig = m.get_score_features(seq)

# one key for the whole piece: the one most notes are played in
counts = Counter()
for j, (onset, name) in enumerate(key_changes):
    end = key_changes[j + 1][0] if j + 1 < len(key_changes) else float("inf")
    counts[name] += int(((seq[:, 1] >= onset) & (seq[:, 1] < end)).sum())
key = counts.most_common(1)[0][0] if counts else "C"
fifths = int(keyName2Sharps.get(key, 0))
# six or seven sharps (F#, C#) read better as flats (Gb, Db), as piano music is usually written
if fifths >= 6:
    fifths -= 12
elif fifths < -6:
    fifths += 12

hands = [1] * len(notes)
for row, i in enumerate(order):
    hands[i] = 1 - int(hand_parts[row])  # PM2S: 0 = right hand

json.dump({
    "beats": [float(b) for b in beats],
    "downbeats": [float(b) for b in downbeats],
    "hands": hands,
    "fifths": fifths,
    "key": key,
    "time": time_sig,
}, open(dst, "w", encoding="utf-8"))
