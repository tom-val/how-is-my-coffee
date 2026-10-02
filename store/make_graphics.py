"""Builds the Google Play graphics into store/graphics/.

1. `node app/scripts/gen-store-assets.mjs` renders the 512 icon and the textless feature background.
2. Pillow sets the wordmark and tagline in the app's own fonts (Fraunces / DM Sans from node_modules).
Run: python3 store/make_graphics.py
"""
import pathlib, subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "store" / "graphics"
FONTS = ROOT / "app" / "node_modules" / "@expo-google-fonts"
CREAM = (243, 233, 222)

subprocess.run(["node", "scripts/gen-store-assets.mjs"], cwd=ROOT / "app", check=True)

bg = OUT / ".feature-background.png"
img = Image.open(bg).convert("RGB")
draw = ImageDraw.Draw(img)
title = ImageFont.truetype(str(FONTS / "fraunces/700Bold/Fraunces_700Bold.ttf"), 96)
tagline = ImageFont.truetype(str(FONTS / "dm-sans/500Medium/DMSans_500Medium.ttf"), 34)

left = 470
t_box = draw.textbbox((0, 0), "Kavutė", font=title)
g_box = draw.textbbox((0, 0), "How is my coffee?", font=tagline)
gap = 22
block = (t_box[3] - t_box[1]) + gap + (g_box[3] - g_box[1])
top = (img.height - block) // 2
draw.text((left - t_box[0], top - t_box[1]), "Kavutė", font=title, fill=CREAM)
draw.text((left + 4 - g_box[0], top + (t_box[3] - t_box[1]) + gap - g_box[1]), "How is my coffee?", font=tagline, fill=CREAM)
img.save(OUT / "play-feature-1024x500.png")
bg.unlink()
print("store/graphics: play-icon-512.png, play-feature-1024x500.png")
