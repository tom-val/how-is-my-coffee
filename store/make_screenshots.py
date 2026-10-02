"""Turns the raw simulator/emulator captures in store/screenshots/raw/ into upload-ready sets.

  App Store, 6.9" iPhone (required size): 1320×2868 — the iPhone 17 Pro captures (1206×2622) have
  the same aspect ratio within 0.1 %, so they are scaled with Lanczos and trimmed by a pixel.
  Google Play phone: the emulator's 1080×2400 is 2.22:1 and Play caps the long side at 2× the short
  one, so the frame is widened to 1200×2400 with the page's own background colour at the sides
  (cropping would cut either the header or the tab bar).

Run: python3 store/make_screenshots.py
"""
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent / "screenshots"
RAW = ROOT / "raw"

def ios(src: pathlib.Path, dst: pathlib.Path):
    im = Image.open(src).convert("RGB")
    w, h = 1320, round(im.height * 1320 / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    top = (h - 2868) // 2
    im.crop((0, top, 1320, top + 2868)).save(dst, optimize=True)

def android(src: pathlib.Path, dst: pathlib.Path):
    im = Image.open(src).convert("RGB")
    target_w = im.height // 2
    pad = (target_w - im.width) // 2
    fill = im.getpixel((2, im.height // 2))  # the screen's own background at the left edge
    out = Image.new("RGB", (target_w, im.height), fill)
    out.paste(im, (pad, 0))
    out.save(dst, optimize=True)

made = []
for src in sorted(RAW.glob("*.png")):
    platform, lang, rest = src.stem.split("-", 2)
    folder = ROOT / ("app-store-6.9" if platform == "ios" else "google-play-phone") / lang
    folder.mkdir(parents=True, exist_ok=True)
    dst = folder / f"{rest}.png"
    (ios if platform == "ios" else android)(src, dst)
    made.append(dst)

for p in made:
    w, h = Image.open(p).size
    print(f"{p.relative_to(ROOT)}  {w}x{h}")
