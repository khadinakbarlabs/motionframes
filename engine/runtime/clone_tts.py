# MotionFrames voice clone: speaks every line in the voice of a short sample, with Chatterbox (Resemble AI, MIT).
# Runs inside MotionFrames' own venv (~/.cache/motionframes/clone). The model loads once for all lines.
# Usage: python clone_tts.py job.json
#   job = {"ref": "/abs/sample.wav", "exaggeration": 0.5, "lines": [{"id": "L1", "text": "...", "out": "/abs/vo-L1.wav"}]}
#   With no lines it only loads (and on first run downloads) the model.
# Prints one JSON object per line on stdout: {"event": "load"|"line"|"done", ...}.
import json
import os
import sys
import time


def emit(**kw):
    print(json.dumps(kw), flush=True)


def pick_device(torch):
    want = os.environ.get("MOTIONFRAMES_CLONE_DEVICE")
    if want:
        return want
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main():
    job = json.load(open(sys.argv[1]))
    import torch
    import torchaudio
    from chatterbox.tts import ChatterboxTTS

    device = pick_device(torch)
    t = time.time()
    model = ChatterboxTTS.from_pretrained(device=device)
    emit(event="load", device=device, seconds=round(time.time() - t, 1))

    for line in job.get("lines", []):
        t = time.time()
        wav = model.generate(line["text"], audio_prompt_path=job["ref"], exaggeration=float(job.get("exaggeration", 0.5)))
        os.makedirs(os.path.dirname(line["out"]), exist_ok=True)
        torchaudio.save(line["out"], wav.cpu(), model.sr)
        emit(event="line", id=line["id"], seconds=round(time.time() - t, 1), audio=round(wav.shape[-1] / model.sr, 2))
    emit(event="done")


if __name__ == "__main__":
    main()
