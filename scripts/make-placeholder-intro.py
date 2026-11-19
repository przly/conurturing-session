#!/usr/bin/env python3
"""
Placeholder for the Weather test intro clip (public/videos/intro.mp4).

A ~2-minute split screen: left "Your room in Amsterdam", right "Your
family's home". Each side has a blurred silhouette and a plant that reacts
to the person on the OTHER side, with captions explaining it. Replace the
output with the real clip when it exists (same path, same name).

Needs Python 3 with Pillow, and ffmpeg on the PATH:
    python3 scripts/make-placeholder-intro.py
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "videos" / "intro.mp4"
W, H = 960, 540
FPS = 24
DURATION = 120  # seconds

FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"
BG_LEFT = (18, 19, 24)
BG_RIGHT = (20, 18, 22)
FLOOR = (30, 31, 37)
TEXT = (235, 235, 240)
MUTED = (150, 152, 160)
STEM = (70, 120, 60)
PETAL = (255, 140, 60)

# ─── Storyboard ───────────────────────────────────────────────
# Person x position (0–1 within their half) over time; None = not there.
# A plant reacts to the person in the OTHER room.
YOU = [(0, None), (13, None), (13.01, -0.15), (17, 0.38), (30, 0.45), (36, 0.62), (44, 0.6), (49, 1.15), (49.01, None),
       (74, None), (74.01, -0.15), (78, 0.3), (94, 0.36), (99, 1.15), (99.01, None)]
FAMILY = [(0, None), (56, None), (56.01, 1.15), (60, 0.62), (74, 0.56), (88, 0.6), (95, -0.15), (95.01, None)]

CAPTIONS = [
    (1, 7, "Two rooms, two plants. The plants are linked."),
    (7, 12.5, "Left: your room in Amsterdam.   Right: your family's home."),
    (13, 21, "When you walk into your room…"),
    (21, 33, "…your family's plant wakes up and glows."),
    (33, 44, "As long as you are there, it stays awake."),
    (45, 55, "When you leave, its glow slowly fades."),
    (56, 63, "It works both ways."),
    (63, 74, "When your family is at home, your plant wakes up."),
    (77, 92, "When you are both home, both plants glow."),
    (100, 118, "In this study you will see your plant. The shadow behind it is your family at home."),
]

# How quickly a plant wakes (s) and fades after the person leaves (s).
WAKE_SEC = 3.0
FADE_SEC = 12.0
REST = 0.22


def person_x(track, t):
    """Linear interpolation between keyframes; None when nobody is there."""
    prev = track[0]
    for key in track[1:]:
        if t < key[0]:
            if prev[1] is None or key[1] is None:
                return prev[1]
            f = (t - prev[0]) / (key[0] - prev[0])
            return prev[1] + (key[1] - prev[1]) * f
        prev = key
    return prev[1]


def present(track, t):
    x = person_x(track, t)
    return x is not None and 0.0 <= x <= 1.0


def plant_levels(track):
    """Per-frame glow level 0–1 for the plant that watches `track` (eased wake and fade)."""
    levels, level = [], REST
    for i in range(DURATION * FPS):
        t = i / FPS
        target = 1.0 if present(track, t) else REST
        rate = 1.0 / WAKE_SEC if target > level else 1.0 / FADE_SEC
        step = rate / FPS
        level = min(target, level + step) if target > level else max(target, level - step)
        levels.append(level)
    return levels


def silhouette():
    """A soft, featureless shape: head + shoulders + body, heavily blurred."""
    img = Image.new("RGBA", (220, 380), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = (78, 82, 92, 255)
    d.ellipse((84, 22, 136, 84), fill=c)  # head
    d.rectangle((101, 80, 119, 104), fill=c)  # neck
    d.rounded_rectangle((42, 100, 178, 350), radius=55, fill=c)  # shoulders and body
    return img.filter(ImageFilter.GaussianBlur(9))


def draw_plant(frame, cx, base_y, level, t, phase):
    d = ImageDraw.Draw(frame)
    breathe = math.sin(t * 2 * math.pi * 0.22 + phase) * 2 * level
    top = base_y - 150 - breathe
    d.line((cx, base_y, cx, top), fill=STEM, width=5)
    lift = 18 * level
    d.ellipse((cx - 52, base_y - 75 - lift, cx - 2, base_y - 55 - lift), fill=STEM)
    d.ellipse((cx + 2, base_y - 108 - lift, cx + 48, base_y - 90 - lift), fill=STEM)
    d.rounded_rectangle((cx - 45, base_y, cx + 45, base_y + 14), radius=5, fill=(42, 43, 50))

    # Glowing flower: bigger, brighter and more open as the level rises.
    size = 200
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    r = 14 + 22 * level
    alpha = int(60 + 195 * level)
    g.ellipse((size / 2 - r * 1.9, size / 2 - r * 1.9, size / 2 + r * 1.9, size / 2 + r * 1.9), fill=PETAL + (int(alpha * 0.55),))
    glow = glow.filter(ImageFilter.GaussianBlur(10 + 18 * level))
    g = ImageDraw.Draw(glow)
    for k in range(6):
        a = k / 6 * 2 * math.pi + t * 0.05
        open_r = r * (0.45 + 0.55 * level)
        px, py = size / 2 + math.cos(a) * open_r * 0.8, size / 2 + math.sin(a) * open_r * 0.8
        g.ellipse((px - r * 0.55, py - r * 0.55, px + r * 0.55, py + r * 0.55), fill=PETAL + (alpha,))
    g.ellipse((size / 2 - 7, size / 2 - 7, size / 2 + 7, size / 2 + 7), fill=(90, 130, 70, 255))
    frame.alpha_composite(glow, (int(cx - size / 2), int(top - size / 2)))


def main():
    font = ImageFont.truetype(FONT_PATH, 26, index=0)
    small = ImageFont.truetype(FONT_PATH, 18, index=0)
    tag = ImageFont.truetype(FONT_PATH, 14, index=0)
    sil = silhouette()
    left_plant = plant_levels(FAMILY)  # your plant reacts to your family
    right_plant = plant_levels(YOU)  # their plant reacts to you
    half = W // 2
    floor_y = 400

    OUT.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         str(OUT)],
        stdin=subprocess.PIPE,
    )
    for i in range(DURATION * FPS):
        t = i / FPS
        frame = Image.new("RGBA", (W, H), BG_LEFT + (255,))
        d = ImageDraw.Draw(frame)
        d.rectangle((half, 0, W, H), fill=BG_RIGHT)
        d.rectangle((0, floor_y, W, H), fill=FLOOR)
        d.line((half, 0, half, floor_y), fill=(60, 62, 70), width=2)
        d.text((half / 2, 34), "Your room in Amsterdam", font=small, fill=MUTED, anchor="mm")
        d.text((half + half / 2, 34), "Your family's home", font=small, fill=MUTED, anchor="mm")

        # People first (behind the plants), each clipped to their own room.
        for track, x0 in ((YOU, 0), (FAMILY, half)):
            x = person_x(track, t)
            if x is None:
                continue
            room = Image.new("RGBA", (half, H), (0, 0, 0, 0))
            room.alpha_composite(sil, (int(x * half - sil.width / 2), floor_y - sil.height + 30))
            frame.alpha_composite(room, (x0, 0))

        draw_plant(frame, half * 0.72, floor_y + 10, left_plant[i], t, 0.0)
        draw_plant(frame, half + half * 0.28, floor_y + 10, right_plant[i], t, 1.3)

        d = ImageDraw.Draw(frame)
        for start, end, text in CAPTIONS:
            if start <= t < end:
                fade = min(1.0, (t - start) / 0.5, (end - t) / 0.5)
                c = tuple(int(v * fade) for v in TEXT)
                d.text((W / 2, 478), text, font=font, fill=c, anchor="mm")
        d.text((W - 12, H - 12), "PLACEHOLDER", font=tag, fill=(110, 112, 120), anchor="rs")

        ffmpeg.stdin.write(frame.convert("RGB").tobytes())
        if i % (FPS * 10) == 0:
            print(f"  {int(t)} s", file=sys.stderr)
    ffmpeg.stdin.close()
    ffmpeg.wait()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
