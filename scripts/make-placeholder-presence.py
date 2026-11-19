"""Create the two placeholder performances and their matching cue tracks."""
import json
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public" / "videos"
WIDTH, HEIGHT, FPS = 320, 180, 12

PERFORMANCES = {
    1: (456, [
        (12, "enter", .20), (18.5, "move", .32), (45, "still", .32),
        (92, "leave", None), (150, "pass", .50),
        (185, "enter", .78), (204, "move", .68), (235, "still", .68),
        (278, "leave", None), (334, "pass", .48),
        (374, "enter", .22), (391, "still", .22), (427, "leave", None),
    ]),
    2: (306, [
        (8, "pass", .54), (27, "enter", .76), (50, "move", .67),
        (64, "still", .67), (109, "leave", None), (143, "pass", .48),
        (178, "enter", .21), (207, "move", .31), (231, "still", .31),
        (262, "leave", None),
    ]),
}


def smooth(fraction):
    p = min(1, max(0, fraction))
    return p * p * (3 - 2 * p)


def pose(track, time):
    x, opacity = .5, 0
    for t, event, target in track:
        if t > time:
            break
        since = time - t
        if event == "enter":
            edge = -.20 if target < .5 else 1.2
            x, opacity = edge + (target - edge) * smooth(since / 3), 1
        elif event == "move":
            x += (target - x) * smooth(since / 2)
        elif event == "still":
            x = target
        elif event == "leave":
            edge = -.20 if x < .5 else 1.2
            x += (edge - x) * smooth(since / 3)
            opacity *= 1 - smooth(since / 3)
        elif event == "pass" and since < 4:
            x = target - .65 + 1.3 * smooth(since / 4)
            opacity = .9
    return x, opacity


def make_clip(clip, duration, track):
    path = OUT / f"presence_{clip}"
    path.with_suffix(".cues.json").write_text(json.dumps([
        {"t": t, "event": event, **({"x": x} if x is not None else {})}
        for t, event, x in track
    ], indent=2) + "\n")
    room = Image.new("L", (WIDTH, HEIGHT), 16)
    draw = ImageDraw.Draw(room)
    draw.rectangle((30, 14, 290, 166), fill=26)
    draw.line((0, 150, WIDTH, 150), fill=20, width=2)
    room = room.filter(ImageFilter.GaussianBlur(4))
    with subprocess.Popen([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pixel_format", "gray", "-video_size", f"{WIDTH}x{HEIGHT}",
        "-framerate", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
        "-preset", "fast", "-crf", "24", "-pix_fmt", "yuv420p",
        "-g", str(FPS * 2), "-movflags", "+faststart", str(path.with_suffix(".mp4")),
    ], stdin=subprocess.PIPE) as encoder:
        for frame in range(duration * FPS):
            time = frame / FPS
            x, opacity = pose(track, time)
            image = room.copy()
            if opacity:
                center = x * WIDTH
                head = 46 + math.sin(time * .8) * 1.4
                tone = int(26 + 100 * opacity)
                shape = ImageDraw.Draw(image)
                shape.ellipse((center - 13, head - 16, center + 13, head + 16), fill=tone)
                shape.rounded_rectangle((center - 27, head + 16, center + 27, HEIGHT + 30), radius=21, fill=tone)
                image = image.filter(ImageFilter.GaussianBlur(5))
            encoder.stdin.write(image.tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError(f"Could not encode clip {clip}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for number, (seconds, cues) in PERFORMANCES.items():
        make_clip(number, seconds, cues)
