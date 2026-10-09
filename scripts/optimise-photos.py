"""
Turns the full-size photos in photos/ into web-sized WebP files in
src/assets/img/homes/, named by what's in them.

    python3 scripts/optimise-photos.py

Each photo is written at two sizes for srcset, NAME-1600.webp and
NAME-800.webp, the number being the long edge in pixels. The originals stay
in photos/, which is git-ignored because they're tens of megabytes; the WebP
files are what gets committed and served.

To add a photo, drop it in photos/, add a line to PHOTOS and rerun.
"""
from pathlib import Path
from PIL import Image, ImageOps

SRC = Path('photos')
OUT = Path('src/assets/img/homes')

# Source file -> name used on the site. All from Pexels (free to use).
PHOTOS = {
    'pexels-artbovich-7031593.jpg': 'house-lawn',
    'pexels-cottonbro-5157282.jpg': 'share-house-lounge',
    'pexels-cottonbro-6873734.jpg': 'record-player',
    'pexels-expect-best-79873-323776.jpg': 'facade-glass',
    'pexels-expect-best-79873-323780.jpg': 'facade-apartments',
    'pexels-ivan-s-8962201.jpg': 'moving-in-door',
    'pexels-ivan-s-8962278.jpg': 'moving-in-boxes',
    'pexels-mart-production-7328508.jpg': 'fireplace',
    'pexels-mart-production-8885182.jpg': 'neon-lounge',
    'pexels-rdne-8293696.jpg': 'boxes-hallway',
    'pexels-rdne-8293704.jpg': 'home-sweet-home',
    'pexels-samet-korkmaz-267675092-14898901.jpg': 'dome-view',
    'pexels-shkrabaanthony-6759172.jpg': 'brick-kitchen',
}

SIZES = (1600, 800)

# Square portraits cut from a photo, as fractions of its width and height:
# (left, top, size as a fraction of width). Written at 800px.
PORTRAITS = {
    # Darren Whitlock: the man in the flat cap, in the dome.
    'darren': ('pexels-samet-korkmaz-267675092-14898901.jpg', 0.535, 0.415, 0.27),
}

OUT.mkdir(parents=True, exist_ok=True)
for source, name in PHOTOS.items():
    with Image.open(SRC / source) as im:
        # Honour camera rotation before resizing, then drop the metadata.
        im = (ImageOps.exif_transpose(im) or im).convert('RGB')
        for w in SIZES:
            copy = im.copy()
            copy.thumbnail((w, w), Image.Resampling.LANCZOS)
            path = OUT / f'{name}-{w}.webp'
            copy.save(path, 'WEBP', quality=78, method=6)
            print(f'{path}  {copy.width}x{copy.height}  {path.stat().st_size // 1024}KB')

for name, (source, left, top, size) in PORTRAITS.items():
    with Image.open(SRC / source) as im:
        im = (ImageOps.exif_transpose(im) or im).convert('RGB')
        side = round(im.width * size)
        x, y = round(im.width * left), round(im.height * top)
        face = im.crop((x, y, x + side, y + side)).resize((800, 800), Image.Resampling.LANCZOS)
        path = OUT / f'{name}-portrait.webp'
        face.save(path, 'WEBP', quality=82, method=6)
        print(f'{path}  800x800  {path.stat().st_size // 1024}KB')
