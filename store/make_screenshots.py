"""Turns the raw simulator/emulator captures in store/screenshots/raw/ into upload-ready sets.

  App Store, "iPhone with Dynamic Island (medium display)" — the required set: 1206×2622, which is
  exactly what the iPhone 17 Pro simulator captures, so they are only flattened (no alpha allowed).
  App Store, "iPhone with Dynamic Island (large display)" (6.9"): 1320×2868 — the same captures have
  that aspect ratio within 0.1 %, so they are scaled with Lanczos and trimmed by a pixel.
  Google Play phone: the emulator's 1080×2400 is 2.22:1 and Play caps the long side at 2× the short
  one, so the frame is widened to 1200×2400 with the page's own background colour at the sides
  (cropping would cut either the header or the tab bar).
  Google Play 7" / 10" tablet: captured on the same emulator with `adb shell wm size` + `wm density`
  set to a 9:16 tablet screen (1080×1920 @ 280 dpi ≈ 620 dp wide, 1440×2560 @ 280 dpi ≈ 820 dp),
  so they are already the required 9:16 and are only re-encoded. The app keeps its phone-width
  column on tablets; the screenshots show that honestly.

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

def as_is(src: pathlib.Path, dst: pathlib.Path):
    im = Image.open(src).convert("RGB")
    assert im.width * 16 == im.height * 9, f"{src.name} is not 9:16"
    im.save(dst, optimize=True)

def ios_medium(src: pathlib.Path, dst: pathlib.Path):
    im = Image.open(src).convert("RGB")
    assert im.size == (1206, 2622), f"{src.name} is {im.size}, expected an iPhone 17 Pro capture"
    im.save(dst, optimize=True)

TARGETS = {  # raw file prefix -> [(output folder, converter)]
    "ios": [("app-store-6.3", ios_medium), ("app-store-6.9", ios)],
    "android": [("google-play-phone", android)],
    "tablet7": [("google-play-tablet-7", as_is)],
    "tablet10": [("google-play-tablet-10", as_is)],
}

made = []
for src in sorted(RAW.glob("*.png")):
    platform, lang, rest = src.stem.split("-", 2)
    for name, convert in TARGETS[platform]:
        folder = ROOT / name / lang
        folder.mkdir(parents=True, exist_ok=True)
        dst = folder / f"{rest}.png"
        convert(src, dst)
        made.append(dst)

for p in made:
    w, h = Image.open(p).size
    print(f"{p.relative_to(ROOT)}  {w}x{h}")
