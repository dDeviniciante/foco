from pathlib import Path
from PIL import Image, ImageDraw

SCALE = 4
SIZE = 512
CANVAS = SIZE * SCALE
out_dir = Path(__file__).resolve().parents[1] / "build"
out_dir.mkdir(parents=True, exist_ok=True)

image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

def box(values):
    return tuple(int(value * SCALE) for value in values)

draw.rounded_rectangle(box((28, 28, 484, 484)), radius=104 * SCALE, fill="#1c211e")
draw.ellipse(box((112, 112, 400, 400)), fill="#f7f3ea", outline="#d9d3c8", width=10 * SCALE)

center = (256 * SCALE, 256 * SCALE)
for x, y in ((256, 139), (373, 256), (256, 373), (139, 256)):
    radius = 9 * SCALE
    draw.ellipse((x * SCALE - radius, y * SCALE - radius, x * SCALE + radius, y * SCALE + radius), fill="#77766f")

draw.line((center[0], center[1], 202 * SCALE, 206 * SCALE), fill="#1c211e", width=22 * SCALE)
draw.line((center[0], center[1], 326 * SCALE, 179 * SCALE), fill="#4aaa72", width=22 * SCALE)
draw.ellipse(box((238, 238, 274, 274)), fill="#267a51")

image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
image.save(out_dir / "icon.png")
image.save(out_dir / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
