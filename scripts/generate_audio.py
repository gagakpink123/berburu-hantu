import json
import math
import os
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import wave

SAMPLE_RATE = 44100
OUT_ROOT = os.path.join(os.getcwd(), "public", "assets", "audio")
TTS_WORK_DIR = "/tmp/tts"


def write_wav_and_mp3(
    rel_path: str,
    samples: list[float],
    fx_filter: str | None = None,
    loop_crossfade_sec: float = 0.0,
):
    out_path = os.path.join(OUT_ROOT, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Seamless equal-power loop crossfade for background music tracks
    if loop_crossfade_sec > 0.0:
        xfade_n = int(loop_crossfade_sec * SAMPLE_RATE)
        if len(samples) > xfade_n * 2:
            body_n = len(samples) - xfade_n
            looped = samples[:body_n]
            for i in range(xfade_n):
                t = i / max(1, xfade_n)
                fade_in = math.sin(t * math.pi * 0.5)
                fade_out = math.cos(t * math.pi * 0.5)
                looped[i] = looped[i] * fade_in + samples[body_n + i] * fade_out
            samples = looped

    peak = max((abs(s) for s in samples), default=1.0)
    scale = 0.90 / peak if peak > 1e-4 else 1.0
    pcm = bytearray()
    for s in samples:
        v = max(-1.0, min(1.0, s * scale))
        pcm.extend(struct.pack("<h", int(v * 32767)))

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        wav_path = tf.name
    try:
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(bytes(pcm))

        chain = []
        if fx_filter:
            chain.append(fx_filter)
        if "ghosts/" in rel_path:
            chain.append("acompressor=threshold=-16dB:ratio=3:attack=5:release=60:makeup=3dB,alimiter=limit=0.92")
        elif "music/" in rel_path:
            chain.append("highpass=f=28,acompressor=threshold=-15dB:ratio=2.8:attack=12:release=180:makeup=2.5dB,alimiter=limit=0.90")

        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path]
        if chain:
            cmd.extend(["-af", ",".join(chain)])
        cmd.extend(["-codec:a", "libmp3lame", "-b:a", "128k", out_path])
        subprocess.run(cmd, check=True)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def make_buf(duration_sec: float) -> list[float]:
    return [0.0] * int(SAMPLE_RATE * duration_sec)


def add_tone(
    buf: list[float],
    start: float,
    dur: float,
    freq_start: float,
    freq_end: float | None = None,
    amp: float = 0.5,
    harmonics: list[tuple[float, float]] | None = None,
    vib_hz: float = 0.0,
    vib_depth: float = 0.0,
    attack: float = 0.01,
    decay: float = 0.15,
    exp_sweep: bool = False,
):
    if freq_end is None:
        freq_end = freq_start
    if harmonics is None:
        harmonics = [(1.0, 1.0)]
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    n = max(1, i1 - i0)
    phase = 0.0
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        frac = (idx - i0) / n
        if exp_sweep and freq_start > 1 and freq_end > 1:
            f = freq_start * ((freq_end / freq_start) ** frac)
        else:
            f = freq_start + (freq_end - freq_start) * frac
        if vib_hz > 0.0:
            f += math.sin(2.0 * math.pi * vib_hz * t) * vib_depth
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        if t < attack:
            env = t / max(1e-4, attack)
        else:
            rem = dur - t
            if rem < decay:
                env = max(0.0, rem / max(1e-4, decay))
            else:
                env = math.exp(-(t - attack) * (1.1 / max(0.15, dur)))
        val = 0.0
        for mult, weight in harmonics:
            val += math.sin(phase * mult) * weight
        buf[idx] += val * amp * env


def add_filtered_noise(
    buf: list[float],
    start: float,
    dur: float,
    amp: float = 0.3,
    lowpass: float = 0.2,
    highpass: float = 0.0,
    attack: float = 0.02,
    decay: float = 0.2,
    mod_hz: float = 0.0,
):
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    lp = 0.0
    hp = 0.0
    prev = 0.0
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        env = 1.0
        if t < attack:
            env = t / max(1e-4, attack)
        elif dur - t < decay:
            env = max(0.0, (dur - t) / max(1e-4, decay))
        raw = random.uniform(-1.0, 1.0)
        lp = lp + lowpass * (raw - lp)
        sig = lp
        if highpass > 0.0:
            hp = highpass * (hp + sig - prev)
            prev = sig
            sig = hp
        if mod_hz > 0.0:
            sig *= 0.55 + 0.45 * math.sin(2.0 * math.pi * mod_hz * t)
        buf[idx] += sig * amp * env


def add_drum_hit(
    buf: list[float],
    start: float,
    f0: float = 115.0,
    f1: float = 36.0,
    dur: float = 0.42,
    amp: float = 0.7,
):
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    phase = 0.0
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        f = f1 + (f0 - f1) * math.exp(-t * 18.0)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        env = math.exp(-t * (5.8 / max(0.1, dur)))
        punch = math.sin(phase) + 0.35 * math.sin(phase * 2.0) * math.exp(-t * 25.0)
        buf[idx] += punch * amp * env


# --- Authentic Physical-Modeling Javanese Gamelan & Horror Ensemble ---

def add_saron_note(buf: list[float], start: float, freq: float, dur: float, amp: float = 0.40):
    """Javanese bronze Saron/Demung bar with wooden mallet knock & inharmonic partials."""
    partials = [(1.0, 1.0), (2.01, 0.38), (2.76, 0.25), (4.12, 0.12), (5.40, 0.06)]
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        env = min(1.0, t / 0.004) * math.exp(-t * (2.6 / max(0.25, dur)))
        # Subtle mallet knock transient in first 12ms
        mallet = math.sin(2.0 * math.pi * 680.0 * t) * math.exp(-t * 190.0) * 0.28
        ombak = 1.0 + 0.14 * math.sin(2.0 * math.pi * 5.2 * t)
        val = 0.0
        for mult, w in partials:
            val += math.sin(2.0 * math.pi * freq * mult * t) * w * math.exp(-t * mult * 0.62)
        buf[idx] += (val * ombak + mallet) * amp * env


def add_gender_note(buf: list[float], start: float, freq: float, dur: float, amp: float = 0.32):
    """Javanese Gender Barung: paired pengumbang/pengisep bars producing haunting ombak shimmer."""
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    f_low = freq
    f_high = freq + 5.8  # classic Javanese ombak beating (~5.8 Hz)
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        env = min(1.0, t / 0.012) * math.exp(-t * (1.75 / max(0.4, dur)))
        tone = (
            math.sin(2.0 * math.pi * f_low * t)
            + math.sin(2.0 * math.pi * f_high * t)
            + 0.32 * math.sin(2.0 * math.pi * f_low * 2.0 * t) * math.exp(-t * 2.2)
        ) * 0.5
        buf[idx] += tone * amp * env


def add_gong_ageng(buf: list[float], start: float, freq: float = 48.0, dur: float = 5.2, amp: float = 0.65):
    """Deep ominous Gong Ageng / Kempul with low-frequency ombak bloom."""
    partials = [(1.0, 1.0), (1.503, 0.55), (2.01, 0.38), (2.97, 0.20), (3.85, 0.10)]
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        env = min(1.0, t / 0.055) * math.exp(-t * 0.58)
        ombak = 1.0 + 0.36 * math.sin(2.0 * math.pi * 1.75 * t)
        val = sum(math.sin(2.0 * math.pi * freq * m * t) * w * math.exp(-t * m * 0.22) for m, w in partials)
        buf[idx] += val * amp * env * ombak


def add_rebab_phrase(
    buf: list[float],
    start: float,
    dur: float,
    freq_a: float,
    freq_b: float,
    amp: float = 0.24,
    vib_hz: float = 5.1,
):
    """Haunting Javanese bowed Rebab with expressive greget slide and minor-second eeriness."""
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    n = max(1, i1 - i0)
    phase = 0.0
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        frac = (idx - i0) / n
        # Smooth expressive embat glide
        glide = 0.5 - 0.5 * math.cos(min(1.0, frac * 1.35) * math.pi)
        base_f = freq_a + (freq_b - freq_a) * glide
        vib = math.sin(2.0 * math.pi * vib_hz * t) * (base_f * 0.016) * min(1.0, t / 0.35)
        phase += 2.0 * math.pi * (base_f + vib) / SAMPLE_RATE
        env = min(1.0, t / 0.32) * min(1.0, max(0.0, (dur - t) / 0.38))
        bow = 0.0
        for k in range(1, 8):
            bow += (math.sin(phase * k) / k) * (0.82 ** k)
        bow += random.uniform(-1.0, 1.0) * 0.045
        buf[idx] += bow * amp * env


def add_suling_sigh(buf: list[float], start: float, dur: float, freq_a: float, freq_b: float, amp: float = 0.20):
    """Breathy nocturnal Javanese bamboo Suling flute cry."""
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    n = max(1, i1 - i0)
    phase = 0.0
    bp = 0.0
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        frac = (idx - i0) / n
        f = freq_a + (freq_b - freq_a) * (frac ** 1.4) + math.sin(2.0 * math.pi * 6.0 * t) * (freq_a * 0.012)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        env = min(1.0, t / 0.22) * min(1.0, max(0.0, (dur - t) / 0.35))
        flute = math.sin(phase) + 0.24 * math.sin(phase * 2.0) + 0.07 * math.sin(phase * 3.0)
        # Airy bamboo breath
        bp = bp + 0.18 * (random.uniform(-1.0, 1.0) - bp)
        buf[idx] += (flute * 0.72 + bp * 0.22) * amp * env


def add_kendang_dug(buf: list[float], start: float, amp: float = 0.50):
    """Deep Javanese Kendang bass skin thump ('dug')."""
    add_drum_hit(buf, start, f0=125.0, f1=48.0, dur=0.34, amp=amp)


def add_kendang_tak(buf: list[float], start: float, amp: float = 0.36):
    """Crisp Javanese Ketipung/Kendang muted rim slap ('tak')."""
    add_drum_hit(buf, start, f0=420.0, f1=185.0, dur=0.09, amp=amp)
    add_filtered_noise(buf, start, 0.045, amp=amp * 0.45, lowpass=0.62, highpass=0.25, attack=0.002, decay=0.03)


def add_bowed_cymbal_swell(buf: list[float], start: float, dur: float, amp: float = 0.18):
    """Eerie horror bowed bronze/kecer swell for sudden tension."""
    i0 = max(0, int(start * SAMPLE_RATE))
    i1 = min(len(buf), int((start + dur) * SAMPLE_RATE))
    freqs = [415.3, 587.3, 830.6, 1174.7, 1760.0]
    for idx in range(i0, i1):
        t = (idx - i0) / SAMPLE_RATE
        env = (t / max(0.1, dur)) ** 1.8 * min(1.0, max(0.0, (dur - t) / 0.25))
        sig = sum(math.sin(2.0 * math.pi * f * t + math.sin(t * 3.1) * 0.6) for f in freqs) / len(freqs)
        buf[idx] += sig * amp * env


def generate_music():
    """
    Free algorithmic Javanese Traditional Horror Music Generator:
    Synthesizes 6 distinct seamless-looping dark Javanese Gamelan horror tracks
    using Pelog Bem, Slendro Miring, Gong Ageng, Gender Barung, Saron, Rebab,
    Suling, Kendang Jawa, and horror sub-drones.
    """
    # Pelog Bem (dark semitone/tritone horror tension): C, Db, Eb, G, Ab, C5, Db5, Eb5
    pelog_dark = [261.63, 277.18, 311.13, 392.00, 415.30, 523.25, 554.37, 622.25]
    # Slendro Miring (haunted village tuning): A3, B3, D4, E4, F#4/G4, A4, Bb4, D5
    slendro_miring = [220.00, 246.94, 293.66, 329.63, 369.99, 440.00, 466.16, 587.33]
    # Pelog Barang minor horror: D4, Eb4, F4, A4, Bb4, D5, Eb5
    pelog_barang = [293.66, 311.13, 349.23, 440.00, 466.16, 587.33, 622.25]

    tracks = [
        {
            "path": "music/main-menu.mp3",
            "scale": pelog_dark,
            "dur": 16.0,
            "xfade": 2.0,
            "step": 0.6667,  # ~90 BPM slow eerie pulse
            "gong_hz": 49.0,
            "drone_hz": 65.41,
            "pattern": [0, 1, 4, 3, 1, 0, 2, 1, 4, 5, 4, 1],
            "intensity": 0.35,
            "boss": False,
        },
        {
            "path": "music/level-1.mp3",
            "scale": pelog_dark,
            "dur": 16.0,
            "xfade": 2.0,
            "step": 0.50,  # 120 BPM creeping graveyard
            "gong_hz": 55.0,
            "drone_hz": 65.41,
            "pattern": [0, 1, 2, 1, 3, 4, 1, 0, 2, 4, 5, 4, 3, 1, 0, 1],
            "intensity": 0.50,
            "boss": False,
        },
        {
            "path": "music/level-2.mp3",
            "scale": slendro_miring,
            "dur": 16.0,
            "xfade": 2.0,
            "step": 0.4444,  # ~135 BPM misty haunted forest
            "gong_hz": 51.9,
            "drone_hz": 55.00,
            "pattern": [0, 2, 1, 4, 3, 1, 6, 5, 4, 2, 1, 0, 3, 4, 6, 3],
            "intensity": 0.62,
            "boss": False,
        },
        {
            "path": "music/level-3.mp3",
            "scale": pelog_barang,
            "dur": 16.0,
            "xfade": 2.0,
            "step": 0.375,  # 160 BPM tense haunted village ritual
            "gong_hz": 46.2,
            "drone_hz": 73.42,
            "pattern": [0, 1, 3, 4, 1, 0, 2, 4, 5, 4, 3, 1, 0, 4, 3, 1],
            "intensity": 0.75,
            "boss": False,
        },
        {
            "path": "music/level-4.mp3",
            "scale": pelog_dark,
            "dur": 16.0,
            "xfade": 2.0,
            "step": 0.3333,  # 180 BPM urgent forbidden banyan forest
            "gong_hz": 43.65,
            "drone_hz": 65.41,
            "pattern": [0, 1, 4, 1, 5, 6, 4, 1, 0, 3, 4, 1, 6, 5, 4, 1],
            "intensity": 0.88,
            "boss": False,
        },
        {
            "path": "music/level-5-boss.mp3",
            "scale": pelog_dark,
            "dur": 16.0,
            "xfade": 2.0,
            "step": 0.25,  # 240 BPM fast Srepegan/Lancaran boss battle horror!
            "gong_hz": 41.20,
            "drone_hz": 65.41,
            "pattern": [0, 1, 0, 4, 1, 5, 4, 1, 0, 3, 4, 6, 5, 4, 1, 0],
            "intensity": 1.0,
            "boss": True,
        },
    ]

    random.seed(777)
    for cfg in tracks:
        total_dur = cfg["dur"] + cfg["xfade"]
        buf = make_buf(total_dur)
        scale = cfg["scale"]
        step = cfg["step"]
        gong_hz = cfg["gong_hz"]
        drone_hz = cfg["drone_hz"]
        pattern = cfg["pattern"]
        intensity = cfg["intensity"]
        is_boss = cfg["boss"]

        # 1. Deep nocturnal horror sub-bass + dissonant tritone/fifth drone
        add_tone(
            buf, 0.0, total_dur, gong_hz, gong_hz,
            amp=0.20, harmonics=[(1, 1.0), (2, 0.40), (3, 0.16)], attack=0.35, decay=0.5,
        )
        add_tone(
            buf, 0.0, total_dur, drone_hz, drone_hz * 1.004,
            amp=0.14, harmonics=[(1, 1.0), (1.414, 0.42), (2.0, 0.22)], vib_hz=0.35, vib_depth=0.9, attack=0.4, decay=0.5,
        )
        # Subtle eerie graveyard night wind bed
        add_filtered_noise(buf, 0.0, total_dur, amp=0.075, lowpass=0.048, attack=0.4, decay=0.4, mod_hz=0.19)

        # 2. Expressive weeping Rebab & ghostly Suling calls across the loop
        t_r = 0.6
        phrase_idx = 0
        while t_r < total_dur - 3.0:
            n1 = scale[phrase_idx % 5]
            n2 = scale[(phrase_idx + 1) % 5]
            add_rebab_phrase(buf, t_r, 3.2, n1, n2 * 0.99, amp=0.22 + 0.06 * intensity)
            if phrase_idx % 2 == 0 and t_r + 1.8 < total_dur - 2.4:
                add_suling_sigh(buf, t_r + 1.4, 2.3, scale[4] * 1.0, scale[1] * 1.0, amp=0.17)
            if intensity >= 0.60 and phrase_idx % 2 == 1 and t_r + 2.6 < total_dur - 1.5:
                add_bowed_cymbal_swell(buf, t_r + 0.8, 2.2, amp=0.16 * intensity)
            t_r += 3.8
            phrase_idx += 1

        # 3. Gamelan colotomic cycle (Gong Ageng, Kempul, Gender Barung, Saron, Kendang)
        t = 0.0
        beat = 0
        while t < total_dur - 0.35:
            note = scale[pattern[beat % len(pattern)] % len(scale)]

            # Gong Ageng every 16 beats, Kempul on beat 8 / 12
            if beat % 16 == 0:
                add_gong_ageng(buf, t, gong_hz, min(5.0, total_dur - t), amp=0.62)
            elif beat % 8 == 0:
                add_gong_ageng(buf, t, gong_hz * 1.5, min(3.2, total_dur - t), amp=0.44)

            # Gender Barung shimmering ombak undercurrent
            if beat % 2 == 0:
                add_gender_note(buf, t, note * 0.5, min(2.4, total_dur - t), amp=0.26)

            # Saron melody (interlocking imbal on higher levels / boss)
            add_saron_note(buf, t, note, min(1.1, total_dur - t), amp=0.26 + 0.08 * intensity)
            if (intensity >= 0.70 and beat % 2 == 1) or is_boss:
                imbal_note = scale[(pattern[(beat + 2) % len(pattern)]) % len(scale)]
                add_saron_note(buf, t + step * 0.5, imbal_note * 1.0, min(0.75, total_dur - t), amp=0.20)

            # Authentic Kendang Jawa rhythm (escalating tension from Level 1 to Level 5)
            if beat % 4 == 0:
                add_kendang_dug(buf, t, amp=0.34 + 0.22 * intensity)
            if beat % 4 == 2:
                add_kendang_tak(buf, t, amp=0.22 + 0.16 * intensity)
            if intensity >= 0.55 and beat % 4 == 3:
                add_kendang_tak(buf, t + step * 0.5, amp=0.24 * intensity)
            if is_boss and beat % 2 == 1:
                add_kendang_dug(buf, t + step * 0.5, amp=0.32)

            t += step
            beat += 1

        write_wav_and_mp3(
            cfg["path"],
            buf,
            fx_filter="aecho=0.8:0.86:68|145:0.32|0.18",
            loop_crossfade_sec=cfg["xfade"],
        )


def _ensure_msedge_tts() -> bool:
    pkg_dir = os.path.join(TTS_WORK_DIR, "node_modules", "msedge-tts")
    if os.path.isdir(pkg_dir):
        return True
    if not shutil.which("node") or not shutil.which("npm"):
        return False
    os.makedirs(TTS_WORK_DIR, exist_ok=True)
    pkg_json = os.path.join(TTS_WORK_DIR, "package.json")
    if not os.path.exists(pkg_json):
        subprocess.run(["npm", "init", "-y"], cwd=TTS_WORK_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    res = subprocess.run(["npm", "install", "--silent", "msedge-tts"], cwd=TTS_WORK_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return res.returncode == 0 and os.path.isdir(pkg_dir)


def synth_indonesian_tts_batch(jobs: list[dict]) -> bool:
    """
    Synthesize crisp Indonesian neural speech clips via msedge-tts (id-ID-ArdiNeural / id-ID-GadisNeural),
    sculpt each segment's pitch/character with ffmpeg rubberband + articulation EQ, stitch multi-part
    speech+laugh clips cleanly, and finish with echoing atmosphere + dynamic normalization.
    """
    if not jobs:
        return True

    raw_dir = tempfile.mkdtemp(prefix="ghost_tts_")
    try:
        edge_ok = _ensure_msedge_tts()

        flat_segments: list[dict] = []
        for j_idx, job in enumerate(jobs):
            segs = job.get("segments") or [job]
            for s_idx, seg in enumerate(segs):
                raw_mp3 = os.path.join(raw_dir, f"raw_{j_idx}_{s_idx}.mp3")
                proc_wav = os.path.join(raw_dir, f"proc_{j_idx}_{s_idx}.wav")
                flat_segments.append({
                    "job_idx": j_idx,
                    "seg_idx": s_idx,
                    "voice": seg["voice"],
                    "text": seg["text"],
                    "pitch": seg.get("pitch", "+0Hz"),
                    "rate": seg.get("rate", "+0%"),
                    "fx_filter": seg.get("fx_filter", "highpass=f=120"),
                    "out": raw_mp3,
                    "proc_wav": proc_wav,
                })

        if edge_ok:
            runner = os.path.join(raw_dir, "run_tts.cjs")
            with open(runner, "w", encoding="utf-8") as rf:
                rf.write(
                    "const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');\n"
                    "const fs = require('fs');\n"
                    "const jobs = " + json.dumps([
                        {
                            "voice": s["voice"],
                            "text": s["text"],
                            "pitch": s["pitch"],
                            "rate": s["rate"],
                            "out": s["out"],
                        }
                        for s in flat_segments
                    ]) + ";\n"
                    "(async () => {\n"
                    "  for (const job of jobs) {\n"
                    "    const tts = new MsEdgeTTS();\n"
                    "    await tts.setMetadata(job.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);\n"
                    "    const { audioStream } = tts.toStream(job.text, { pitch: job.pitch, rate: job.rate });\n"
                    "    const chunks = [];\n"
                    "    await new Promise((resolve, reject) => {\n"
                    "      audioStream.on('data', (c) => chunks.push(c));\n"
                    "      audioStream.on('end', resolve);\n"
                    "      audioStream.on('error', reject);\n"
                    "    });\n"
                    "    fs.writeFileSync(job.out, Buffer.concat(chunks));\n"
                    "  }\n"
                    "  process.exit(0);\n"
                    "})().catch((err) => { console.error(err); process.exit(1); });\n"
                )
            node_path = os.path.join(TTS_WORK_DIR, "node_modules")
            env = {**os.environ, "NODE_PATH": node_path}
            res = subprocess.run(["node", runner], env=env, timeout=90, check=False)
            if res.returncode != 0:
                edge_ok = False

        for seg in flat_segments:
            raw_mp3 = seg["out"]
            if not edge_ok or not os.path.exists(raw_mp3) or os.path.getsize(raw_mp3) < 512:
                q = urllib.parse.quote(seg["text"])
                url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl=id&client=tw-ob&q={q}"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    with open(raw_mp3, "wb") as out_f:
                        out_f.write(resp.read())

            seg_filter = (
                "silenceremove=start_periods=1:start_threshold=-45dB,"
                "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                "silenceremove=stop_periods=-1:stop_duration=0.22:stop_threshold=-42dB,"
                + seg["fx_filter"]
            )
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", raw_mp3,
                    "-af", seg_filter,
                    "-ar", str(SAMPLE_RATE),
                    "-ac", "1",
                    seg["proc_wav"],
                ],
                check=True,
            )

        for j_idx, job in enumerate(jobs):
            segs = [s for s in flat_segments if s["job_idx"] == j_idx]
            out_path = os.path.join(OUT_ROOT, job["rel_path"])
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            outer_fx = job.get("outer_fx", "aecho=0.8:0.75:55|115:0.20|0.10")
            master_filter = (
                f"dynaudnorm=f=75:g=11:p=0.90:m=10,"
                f"apad=pad_dur=0.18,{outer_fx},"
                f"acompressor=threshold=-16dB:ratio=3.5:attack=4:release=55:makeup=4dB,"
                f"alimiter=limit=0.91,"
                f"silenceremove=start_periods=1:start_threshold=-50dB"
            )

            if len(segs) == 1:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-i", segs[0]["proc_wav"],
                        "-af", master_filter,
                        "-ar", str(SAMPLE_RATE),
                        "-ac", "1",
                        "-codec:a", "libmp3lame",
                        "-b:a", "128k",
                        out_path,
                    ],
                    check=True,
                )
            else:
                gap_sec = float(job.get("gap_sec", 0.12))
                gap_wav = os.path.join(raw_dir, f"gap_{j_idx}.wav")
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-f", "lavfi", "-i", f"anullsrc=r={SAMPLE_RATE}:cl=mono",
                        "-t", f"{gap_sec:.3f}",
                        gap_wav,
                    ],
                    check=True,
                )
                concat_txt = os.path.join(raw_dir, f"concat_{j_idx}.txt")
                with open(concat_txt, "w", encoding="utf-8") as cf:
                    for idx_s, s in enumerate(segs):
                        cf.write(f"file '{s['proc_wav']}'\n")
                        if idx_s < len(segs) - 1:
                            cf.write(f"file '{gap_wav}'\n")
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-f", "concat", "-safe", "0", "-i", concat_txt,
                        "-af", master_filter,
                        "-ar", str(SAMPLE_RATE),
                        "-ac", "1",
                        "-codec:a", "libmp3lame",
                        "-b:a", "128k",
                        out_path,
                    ],
                    check=True,
                )
        return True
    except Exception as exc:
        print(f"WARN: Neural TTS synthesis failed ({exc}).")
        return False
    finally:
        shutil.rmtree(raw_dir, ignore_errors=True)


def generate_ghosts():
    random.seed(101)

    # 1. TUYUL: high-pitch chipmunk mouse squeak + two Indonesian phrases
    b = make_buf(1.2)
    for i, (f0, f1) in enumerate([(1750, 2450), (2100, 2780), (1850, 2550), (2250, 2950), (1950, 2600)]):
        add_tone(b, i * 0.21, 0.11, f0, f1, amp=0.45, harmonics=[(1, 1), (2, 0.4)], vib_hz=32, vib_depth=90, attack=0.006, decay=0.03)
    write_wav_and_mp3("ghosts/tuyul/laugh.mp3", b, fx_filter="aecho=0.8:0.75:35:0.25")

    tts_jobs = [
        {
            # Tuyul phrase 1: "Minta uangnya, minta uangnya Kakak." (chipmunk high pitch)
            "rel_path": "ghosts/tuyul/voice.mp3",
            "voice": "id-ID-GadisNeural",
            "text": "Minta uangnya, minta uangnya Kakak.",
            "pitch": "+36Hz",
            "rate": "+6%",
            "fx_filter": "rubberband=pitch=1.30:formant=preserved,highpass=f=185,equalizer=f=2850:t=q:w=1.1:g=4.5",
            "outer_fx": "aecho=0.8:0.75:46|94:0.18|0.09",
        },
        {
            # Tuyul phrase 2: "Yeye gak kena!" (cheeky chipmunk taunt)
            "rel_path": "ghosts/tuyul/taunt.mp3",
            "voice": "id-ID-GadisNeural",
            "text": "Ye ye, gak kena!",
            "pitch": "+42Hz",
            "rate": "+8%",
            "fx_filter": "rubberband=pitch=1.34:formant=preserved,highpass=f=195,equalizer=f=2900:t=q:w=1.1:g=4.5",
            "outer_fx": "aecho=0.8:0.75:42|88:0.18|0.09",
        },
        {
            # Pocong: "Tolong!!! Lepasin tali pocong aku!" (suara melengking / piercing shrill plea)
            "rel_path": "ghosts/pocong/voice.mp3",
            "voice": "id-ID-ArdiNeural",
            "text": "Tolong! Lepasin tali pocong aku!",
            "pitch": "+42Hz",
            "rate": "+4%",
            "fx_filter": "rubberband=pitch=1.32:formant=preserved,highpass=f=175,equalizer=f=2750:t=q:w=1.0:g=5.5",
            "outer_fx": "aecho=0.8:0.78:60|125:0.22|0.11",
        },
        {
            # Kuntilanak: "Nikahin Kunti! Nikahin Kunti Bang!" (nada wanita melengking) + tawa cekikikan
            "rel_path": "ghosts/kuntilanak/voice.mp3",
            "gap_sec": 0.10,
            "outer_fx": "aecho=0.8:0.80:72|148:0.24|0.12",
            "segments": [
                {
                    "voice": "id-ID-GadisNeural",
                    "text": "Nikahin Kunti! Nikahin Kunti Bang!",
                    "pitch": "+30Hz",
                    "rate": "-1%",
                    "fx_filter": "rubberband=pitch=1.22:formant=preserved,highpass=f=175,equalizer=f=2850:t=q:w=1.1:g=5.0",
                },
                {
                    "voice": "id-ID-GadisNeural",
                    "text": "Hihihihi, hihihihihi!",
                    "pitch": "+44Hz",
                    "rate": "+10%",
                    "fx_filter": "rubberband=pitch=1.26:formant=preserved,highpass=f=195,equalizer=f=2950:t=q:w=1.1:g=4.5",
                },
            ],
        },
        {
            # Kuntilanak standalone cackle
            "rel_path": "ghosts/kuntilanak/laugh.mp3",
            "voice": "id-ID-GadisNeural",
            "text": "Hihihihi, hihihihihi!",
            "pitch": "+44Hz",
            "rate": "+10%",
            "fx_filter": "rubberband=pitch=1.26:formant=preserved,highpass=f=195,equalizer=f=2950:t=q:w=1.1:g=4.5",
            "outer_fx": "aecho=0.8:0.80:72|148:0.24|0.12",
        },
        {
            # Genderuwo: "Genderuwo come back!" dengan vocal serak (raspy gravelly throat grit)
            "rel_path": "ghosts/genderuwo/voice.mp3",
            "voice": "id-ID-ArdiNeural",
            "text": "Genderuwo come back!",
            "pitch": "-22Hz",
            "rate": "-8%",
            "fx_filter": (
                "rubberband=pitch=0.78:formant=preserved,"
                "highpass=f=70,"
                "tremolo=f=34:d=0.40,"
                "asoftclip=type=tanh:threshold=0.58,"
                "equalizer=f=145:t=q:w=1.0:g=4.0,"
                "equalizer=f=2500:t=q:w=1.1:g=5.0"
            ),
            "outer_fx": "aecho=0.8:0.80:65|135:0.22|0.11",
        },
        {
            # Buto Ijo: "Kecil-kecilan dulu, ya!" (bariton rendah dan berat) + tawa menggelegar
            "rel_path": "ghosts/buto-ijo/voice.mp3",
            "gap_sec": 0.12,
            "outer_fx": "aecho=0.8:0.82:80|165:0.26|0.12",
            "segments": [
                {
                    "voice": "id-ID-ArdiNeural",
                    "text": "Kecil-kecilan dulu, ya!",
                    "pitch": "-24Hz",
                    "rate": "-6%",
                    "fx_filter": "rubberband=pitch=0.78:formant=preserved,highpass=f=60,equalizer=f=115:t=q:w=1.0:g=4.5,equalizer=f=2800:t=q:w=1.1:g=5.5",
                },
                {
                    "voice": "id-ID-ArdiNeural",
                    "text": "Ha ha ha ha ha!",
                    "pitch": "-28Hz",
                    "rate": "-8%",
                    "fx_filter": "rubberband=pitch=0.74:formant=preserved,highpass=f=58,equalizer=f=110:t=q:w=1.0:g=4.5,equalizer=f=2500:t=q:w=1.1:g=4.5",
                },
            ],
        },
        {
            # Buto Ijo standalone booming roar laugh
            "rel_path": "ghosts/buto-ijo/roar.mp3",
            "voice": "id-ID-ArdiNeural",
            "text": "Ha ha ha ha ha!",
            "pitch": "-28Hz",
            "rate": "-8%",
            "fx_filter": "rubberband=pitch=0.74:formant=preserved,highpass=f=58,equalizer=f=110:t=q:w=1.0:g=4.5,equalizer=f=2500:t=q:w=1.1:g=4.5",
            "outer_fx": "aecho=0.8:0.82:80|165:0.26|0.12",
        },
    ]
    synth_indonesian_tts_batch(tts_jobs)

    # Tuyul SFX
    b = make_buf(0.65)
    add_tone(b, 0.0, 0.18, 1650, 2400, amp=0.45, harmonics=[(1, 1), (2, 0.3)], attack=0.005, decay=0.05)
    add_tone(b, 0.22, 0.22, 1850, 2700, amp=0.4, harmonics=[(1, 1)], attack=0.005, decay=0.06)
    add_filtered_noise(b, 0.0, 0.35, amp=0.25, lowpass=0.4, attack=0.01, decay=0.2)
    write_wav_and_mp3("ghosts/tuyul/appear.mp3", b)

    b = make_buf(0.55)
    for i in range(5):
        add_drum_hit(b, i * 0.095, 360, 190, 0.07, amp=0.38)
        if i % 2 == 0:
            add_tone(b, i * 0.095, 0.06, 2100, 2500, amp=0.22, attack=0.004, decay=0.02)
    write_wav_and_mp3("ghosts/tuyul/move.mp3", b)

    b = make_buf(0.5)
    add_tone(b, 0.0, 0.38, 2400, 1150, amp=0.55, harmonics=[(1, 1), (2, 0.4)], vib_hz=35, vib_depth=90, attack=0.005, decay=0.14)
    write_wav_and_mp3("ghosts/tuyul/hit.mp3", b)

    b = make_buf(0.85)
    add_tone(b, 0.0, 0.65, 2200, 420, amp=0.55, harmonics=[(1, 1), (2, 0.35)], vib_hz=20, vib_depth=60, attack=0.008, decay=0.22)
    add_filtered_noise(b, 0.1, 0.65, amp=0.3, lowpass=0.28, attack=0.04, decay=0.4)
    write_wav_and_mp3("ghosts/tuyul/defeat.mp3", b, fx_filter="aecho=0.8:0.8:45:0.28")

    # Pocong SFX
    b = make_buf(0.85)
    add_filtered_noise(b, 0.0, 0.72, amp=0.5, lowpass=0.32, highpass=0.45, attack=0.04, decay=0.35)
    add_drum_hit(b, 0.06, 150, 48, 0.28, amp=0.55)
    write_wav_and_mp3("ghosts/pocong/appear.mp3", b, fx_filter="aecho=0.8:0.85:65:0.32")

    b = make_buf(0.6)
    add_drum_hit(b, 0.0, 175, 52, 0.26, amp=0.65)
    add_tone(b, 0.04, 0.24, 150, 260, amp=0.25, harmonics=[(1, 1)], attack=0.01, decay=0.12)
    add_filtered_noise(b, 0.02, 0.35, amp=0.32, lowpass=0.35, highpass=0.4, attack=0.02, decay=0.18)
    write_wav_and_mp3("ghosts/pocong/jump.mp3", b)

    b = make_buf(1.2)
    add_tone(b, 0.05, 1.0, 138, 126, amp=0.48, harmonics=[(1, 1), (2, 0.45), (3, 0.22)], vib_hz=4.5, vib_depth=5, attack=0.1, decay=0.38)
    write_wav_and_mp3("ghosts/pocong/groan.mp3", b, fx_filter="aecho=0.8:0.85:85:0.35")

    b = make_buf(0.55)
    add_drum_hit(b, 0.0, 220, 68, 0.28, amp=0.55)
    add_tone(b, 0.02, 0.34, 180, 120, amp=0.45, harmonics=[(1, 1), (2, 0.4)], attack=0.01, decay=0.16)
    write_wav_and_mp3("ghosts/pocong/hit.mp3", b)

    b = make_buf(1.0)
    add_drum_hit(b, 0.08, 150, 38, 0.4, amp=0.68)
    add_tone(b, 0.0, 0.72, 210, 82, amp=0.38, harmonics=[(1, 1), (2, 0.3)], attack=0.02, decay=0.32)
    add_filtered_noise(b, 0.2, 0.68, amp=0.35, lowpass=0.22, attack=0.05, decay=0.4)
    write_wav_and_mp3("ghosts/pocong/defeat.mp3", b, fx_filter="aecho=0.8:0.8:75:0.32")

    # Kuntilanak SFX
    b = make_buf(1.3)
    add_tone(b, 0.0, 1.15, 760, 1340, amp=0.55, harmonics=[(1, 1), (2, 0.4), (3, 0.2)], vib_hz=11, vib_depth=42, attack=0.04, decay=0.4)
    add_filtered_noise(b, 0.0, 1.15, amp=0.22, lowpass=0.38, highpass=0.35, attack=0.1, decay=0.45)
    write_wav_and_mp3("ghosts/kuntilanak/scream.mp3", b, fx_filter="aecho=0.8:0.9:110|210:0.45|0.28")

    b = make_buf(1.0)
    add_filtered_noise(b, 0.0, 0.9, amp=0.35, lowpass=0.25, highpass=0.28, attack=0.15, decay=0.45)
    add_saron_note(b, 0.05, 587.3, 0.85, amp=0.32)
    write_wav_and_mp3("ghosts/kuntilanak/appear.mp3", b, fx_filter="aecho=0.8:0.85:95:0.38")

    b = make_buf(0.8)
    add_filtered_noise(b, 0.0, 0.75, amp=0.36, lowpass=0.28, highpass=0.22, attack=0.1, decay=0.32, mod_hz=3.8)
    write_wav_and_mp3("ghosts/kuntilanak/move.mp3", b)

    b = make_buf(0.6)
    add_tone(b, 0.0, 0.48, 860, 1280, amp=0.48, harmonics=[(1, 1), (2, 0.4)], vib_hz=20, vib_depth=35, attack=0.01, decay=0.22)
    write_wav_and_mp3("ghosts/kuntilanak/hit.mp3", b, fx_filter="aecho=0.8:0.8:70:0.3")

    b = make_buf(1.2)
    add_tone(b, 0.0, 0.95, 1020, 340, amp=0.44, harmonics=[(1, 1), (2, 0.35)], vib_hz=12, vib_depth=28, attack=0.02, decay=0.48)
    add_filtered_noise(b, 0.1, 0.95, amp=0.35, lowpass=0.3, attack=0.1, decay=0.55)
    write_wav_and_mp3("ghosts/kuntilanak/defeat.mp3", b, fx_filter="aecho=0.8:0.88:95:0.42")

    # Genderuwo SFX
    b = make_buf(1.4)
    add_tone(b, 0.0, 1.3, 74, 58, amp=0.65, harmonics=[(1, 1), (2, 0.85), (3, 0.65), (4, 0.45), (5, 0.3)], vib_hz=30, vib_depth=16, attack=0.08, decay=0.42)
    add_filtered_noise(b, 0.05, 1.2, amp=0.36, lowpass=0.22, highpass=0.12, attack=0.08, decay=0.42, mod_hz=28)
    write_wav_and_mp3("ghosts/genderuwo/growl.mp3", b, fx_filter="aecho=0.8:0.85:75:0.32")

    b = make_buf(1.45)
    add_tone(b, 0.0, 1.35, 118, 62, amp=0.72, harmonics=[(1, 1), (2, 0.85), (3, 0.65), (4, 0.45), (5, 0.35)], vib_hz=34, vib_depth=22, attack=0.04, decay=0.45)
    add_filtered_noise(b, 0.0, 1.25, amp=0.42, lowpass=0.26, attack=0.04, decay=0.45, mod_hz=24)
    write_wav_and_mp3("ghosts/genderuwo/roar.mp3", b, fx_filter="aecho=0.8:0.88:85:0.38")

    b = make_buf(0.65)
    add_filtered_noise(b, 0.0, 0.28, amp=0.35, lowpass=0.45, highpass=0.2, attack=0.02, decay=0.15)
    add_drum_hit(b, 0.25, 920, 420, 0.06, amp=0.55)
    add_drum_hit(b, 0.36, 780, 350, 0.05, amp=0.42)
    write_wav_and_mp3("ghosts/genderuwo/pebble.mp3", b)

    b = make_buf(1.0)
    add_drum_hit(b, 0.0, 100, 32, 0.45, amp=0.72)
    add_filtered_noise(b, 0.0, 0.85, amp=0.38, lowpass=0.25, attack=0.04, decay=0.42)
    add_tone(b, 0.08, 0.78, 84, 62, amp=0.52, harmonics=[(1, 1), (2, 0.75), (3, 0.5)], vib_hz=28, vib_depth=14)
    write_wav_and_mp3("ghosts/genderuwo/appear.mp3", b, fx_filter="aecho=0.8:0.85:70:0.3")

    b = make_buf(0.95)
    add_drum_hit(b, 0.0, 92, 30, 0.38, amp=0.78)
    add_drum_hit(b, 0.44, 86, 28, 0.38, amp=0.75)
    write_wav_and_mp3("ghosts/genderuwo/footsteps.mp3", b)

    b = make_buf(0.6)
    add_tone(b, 0.0, 0.48, 125, 76, amp=0.6, harmonics=[(1, 1), (2, 0.7), (3, 0.45)], vib_hz=30, vib_depth=16, attack=0.01, decay=0.22)
    add_drum_hit(b, 0.0, 145, 48, 0.22, amp=0.48)
    write_wav_and_mp3("ghosts/genderuwo/hit.mp3", b)

    b = make_buf(1.3)
    add_tone(b, 0.0, 0.95, 115, 42, amp=0.58, harmonics=[(1, 1), (2, 0.65), (3, 0.35)], vib_hz=22, vib_depth=12, attack=0.02, decay=0.45)
    add_drum_hit(b, 0.32, 92, 26, 0.55, amp=0.78)
    write_wav_and_mp3("ghosts/genderuwo/defeat.mp3", b, fx_filter="aecho=0.8:0.85:85:0.34")

    # Buto Ijo SFX
    b = make_buf(1.7)
    add_gong_ageng(b, 0.0, 46.0, 1.65, amp=0.7)
    add_drum_hit(b, 0.05, 82, 24, 0.65, amp=0.82)
    add_tone(b, 0.2, 1.25, 76, 52, amp=0.6, harmonics=[(1, 1), (2, 0.75), (3, 0.5)], vib_hz=20, vib_depth=12)
    write_wav_and_mp3("ghosts/buto-ijo/appear.mp3", b, fx_filter="aecho=0.8:0.9:100:0.42")

    b = make_buf(1.1)
    add_drum_hit(b, 0.0, 78, 24, 0.45, amp=0.82)
    add_drum_hit(b, 0.48, 74, 23, 0.45, amp=0.80)
    write_wav_and_mp3("ghosts/buto-ijo/footsteps.mp3", b)

    b = make_buf(0.65)
    add_drum_hit(b, 0.0, 160, 44, 0.25, amp=0.62)
    add_tone(b, 0.02, 0.52, 108, 66, amp=0.6, harmonics=[(1, 1), (2, 0.7), (3, 0.45)], vib_hz=28, vib_depth=16)
    write_wav_and_mp3("ghosts/buto-ijo/hit.mp3", b)

    b = make_buf(1.4)
    add_tone(b, 0.0, 1.3, 72, 118, amp=0.7, harmonics=[(1, 1), (2, 0.8), (3, 0.6), (4, 0.4)], vib_hz=32, vib_depth=18, attack=0.05, decay=0.45)
    add_drum_hit(b, 0.0, 88, 28, 0.45, amp=0.68)
    write_wav_and_mp3("ghosts/buto-ijo/rage.mp3", b, fx_filter="aecho=0.8:0.88:95:0.4")

    b = make_buf(2.0)
    add_gong_ageng(b, 0.0, 44.0, 1.9, amp=0.72)
    add_tone(b, 0.0, 1.4, 124, 34, amp=0.65, harmonics=[(1, 1), (2, 0.7), (3, 0.4)], vib_hz=18, vib_depth=12, decay=0.65)
    add_filtered_noise(b, 0.15, 1.5, amp=0.48, lowpass=0.25, attack=0.05, decay=0.75)
    write_wav_and_mp3("ghosts/buto-ijo/defeat.mp3", b, fx_filter="aecho=0.8:0.9:115:0.46")


def generate_weapon_env_ui():
    random.seed(202)
    b = make_buf(0.40)
    add_tone(b, 0.0, 0.26, 3200, 210, amp=0.62, harmonics=[(1, 1.0), (2, 0.42), (3, 0.20)], attack=0.002, decay=0.11, exp_sweep=True)
    add_tone(b, 0.0, 0.18, 1600, 140, amp=0.45, harmonics=[(1, 1.0), (1.5, 0.5)], attack=0.002, decay=0.08, exp_sweep=True)
    add_drum_hit(b, 0.0, 280, 65, 0.10, amp=0.42)
    add_filtered_noise(b, 0.0, 0.12, amp=0.25, lowpass=0.65, highpass=0.3, attack=0.002, decay=0.06)
    write_wav_and_mp3("weapon/shoot.mp3", b, fx_filter="aecho=0.8:0.75:32:0.25")

    b = make_buf(0.95)
    add_drum_hit(b, 0.0, 165, 24, 0.65, amp=0.88)
    add_gong_ageng(b, 0.0, 48.0, 0.85, amp=0.45)
    add_filtered_noise(b, 0.0, 0.72, amp=0.62, lowpass=0.28, attack=0.005, decay=0.55)
    for i, freq in enumerate([523.25, 659.25, 783.99, 1046.5, 1318.5]):
        add_tone(b, 0.03 + i * 0.03, 0.35, freq, freq * 1.15, amp=0.18, harmonics=[(1, 1), (2, 0.3)], attack=0.006, decay=0.18)
    write_wav_and_mp3("weapon/impact.mp3", b, fx_filter="aecho=0.8:0.88:65|135:0.42|0.24")

    b = make_buf(0.32)
    add_tone(b, 0.0, 0.18, 720, 260, amp=0.25, harmonics=[(1, 1)], attack=0.004, decay=0.1, exp_sweep=True)
    add_filtered_noise(b, 0.0, 0.24, amp=0.26, lowpass=0.25, highpass=0.35, attack=0.01, decay=0.14)
    write_wav_and_mp3("weapon/miss.mp3", b)

    b = make_buf(0.60)
    add_drum_hit(b, 0.02, 460, 240, 0.08, amp=0.42)
    add_tone(b, 0.14, 0.18, 420, 980, amp=0.35, harmonics=[(1, 1), (2, 0.3)], attack=0.01, decay=0.08)
    add_saron_note(b, 0.28, 880.0, 0.28, amp=0.32)
    write_wav_and_mp3("weapon/reload.mp3", b)

    b = make_buf(6.0)
    add_filtered_noise(b, 0.0, 6.0, amp=0.26, lowpass=0.055, attack=0.5, decay=0.5, mod_hz=0.25)
    add_rebab_phrase(b, 0.0, 6.0, 73.4, 72.0, amp=0.11)
    for t_c in [0.4, 1.8, 3.3, 4.8]:
        add_tone(b, t_c, 0.28, 3950, 4020, amp=0.016, vib_hz=24, vib_depth=75, attack=0.03, decay=0.09)
    write_wav_and_mp3("environment/night-ambience.mp3", b, fx_filter="volume=-5dB", loop_crossfade_sec=0.6)

    b = make_buf(4.5)
    add_filtered_noise(b, 0.0, 4.5, amp=0.40, lowpass=0.07, attack=0.6, decay=0.8, mod_hz=0.42)
    add_tone(b, 0.3, 3.6, 190, 165, amp=0.10, vib_hz=0.6, vib_depth=18, attack=0.8, decay=0.9)
    write_wav_and_mp3("environment/wind.mp3", b)

    b = make_buf(3.5)
    add_filtered_noise(b, 0.0, 3.5, amp=0.14, lowpass=0.04, attack=0.35, decay=0.35, mod_hz=0.25)
    for t_c in [0.22, 0.95, 1.78, 2.55]:
        add_tone(b, t_c, 0.26, 3950, 4010, amp=0.055, vib_hz=26, vib_depth=85, attack=0.025, decay=0.08)
    write_wav_and_mp3("environment/crickets.mp3", b, fx_filter="lowpass=f=4600,volume=-13dB", loop_crossfade_sec=0.35)

    # Preserve realistic field recordings for owl.mp3 & wolf.mp3 if already present
    if not os.path.exists(os.path.join(OUT_ROOT, "environment/owl.mp3")):
        b = make_buf(1.6)
        add_tone(b, 0.05, 0.24, 460, 430, amp=0.48, harmonics=[(1, 1), (2, 0.1)], attack=0.03, decay=0.08)
        add_tone(b, 0.42, 0.58, 440, 385, amp=0.50, harmonics=[(1, 1), (2, 0.1)], attack=0.04, decay=0.22)
        write_wav_and_mp3("environment/owl.mp3", b, fx_filter="aecho=0.8:0.88:110:0.42")

    b = make_buf(2.8)
    add_filtered_noise(b, 0.0, 2.6, amp=0.68, lowpass=0.075, attack=0.03, decay=1.6)
    add_drum_hit(b, 0.02, 115, 24, 0.9, amp=0.72)
    write_wav_and_mp3("environment/thunder.mp3", b, fx_filter="aecho=0.8:0.9:130|240:0.48|0.3")

    b = make_buf(1.4)
    add_filtered_noise(b, 0.0, 1.3, amp=0.35, lowpass=0.32, highpass=0.45, attack=0.08, decay=0.5, mod_hz=2.5)
    write_wav_and_mp3("environment/leaves.mp3", b)

    b = make_buf(3.2)
    add_gong_ageng(b, 0.0, 58.0, 3.0, amp=0.58)
    add_saron_note(b, 0.35, 392.0, 1.9, amp=0.38)
    add_saron_note(b, 1.05, 311.1, 1.8, amp=0.35)
    add_rebab_phrase(b, 0.1, 2.9, 146.8, 138.6, amp=0.14)
    write_wav_and_mp3("environment/spooky-gamelan.mp3", b, fx_filter="aecho=0.8:0.88:110:0.42")

    b = make_buf(0.20)
    add_drum_hit(b, 0.0, 620, 340, 0.07, amp=0.48)
    add_saron_note(b, 0.0, 880.0, 0.16, amp=0.28)
    write_wav_and_mp3("ui/click.mp3", b)

    b = make_buf(2.2)
    for i, f in enumerate([392.0, 440.0, 523.3, 587.3, 784.0]):
        add_saron_note(b, i * 0.14, f, 1.2, amp=0.45)
    add_gong_ageng(b, 0.56, 82.0, 1.6, amp=0.55)
    write_wav_and_mp3("ui/level-complete.mp3", b, fx_filter="aecho=0.8:0.85:85:0.35")

    b = make_buf(2.0)
    for i, f in enumerate([392.0, 349.2, 311.1, 261.6]):
        add_tone(b, i * 0.26, 0.34, f, f * 0.92, amp=0.42, harmonics=[(1, 1), (2, 0.35)], attack=0.02, decay=0.16)
    add_gong_ageng(b, 0.78, 50.0, 1.2, amp=0.60)
    write_wav_and_mp3("ui/game-over.mp3", b, fx_filter="aecho=0.8:0.88:95:0.38")

    b = make_buf(0.38)
    add_tone(b, 0.0, 0.14, 784, 1046, amp=0.45, harmonics=[(1, 1), (2, 0.3)], attack=0.005, decay=0.06)
    add_tone(b, 0.1, 0.24, 1046, 1318, amp=0.45, harmonics=[(1, 1), (2, 0.25)], attack=0.005, decay=0.1)
    write_wav_and_mp3("ui/score.mp3", b)

    b = make_buf(0.58)
    for i, f in enumerate([523.3, 659.3, 784.0, 1046.5]):
        add_saron_note(b, i * 0.07, f, 0.38, amp=0.38)
    write_wav_and_mp3("ui/combo.mp3", b)


if __name__ == "__main__":
    if "--ghosts-only" not in sys.argv:
        generate_music()
    generate_ghosts()
    if "--music-and-ghosts" not in sys.argv and "--ghosts-only" not in sys.argv:
        generate_weapon_env_ui()
    print("AUDIO_GENERATION_COMPLETE")
