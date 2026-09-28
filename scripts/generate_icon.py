"""Render the My Day calendar icon at the sizes expected by Expo."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SIZE = 1024
SCALE = 3


def render_foreground() -> Image.Image:
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(coords):
        return tuple(int(value * SCALE) for value in coords)

    def width(value):
        return int(value * SCALE)

    # The whole mark stays inside Android's adaptive icon safe area.
    draw.rounded_rectangle(box((218, 184, 806, 838)), radius=width(112), fill="#382f51")
    draw.rounded_rectangle(box((205, 169, 793, 823)), radius=width(112), fill="#7050ae")
    draw.rounded_rectangle(box((205, 169, 793, 382)), radius=width(112), fill="#9b79d4")
    draw.rectangle(box((205, 278, 793, 382)), fill="#9b79d4")

    # Calendar binding and a few quiet date marks.
    for x in (348, 650):
        draw.rounded_rectangle(box((x - 29, 129, x + 29, 250)), radius=width(29), fill="#eae1ff")
    for x, y in ((334, 481), (484, 481), (634, 481), (334, 619)):
        draw.rounded_rectangle(box((x - 32, y - 32, x + 32, y + 32)), radius=width(17), fill="#bca9e8")

    # The tick remains legible at launcher-icon size.
    points = [(448, 636), (518, 706), (676, 538)]
    draw.line([box((x, y))[:2] for x, y in points], fill="#fff9ee", width=width(52), joint="curve")
    for x, y in (points[0], points[-1]):
        draw.ellipse(box((x - 26, y - 26, x + 26, y + 26)), fill="#fff9ee")

    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    foreground = render_foreground()
    adaptive = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    inset = 77
    adaptive.alpha_composite(foreground.resize((SIZE - inset * 2, SIZE - inset * 2), Image.Resampling.LANCZOS), (inset, inset))
    adaptive.save(ASSETS / "adaptive-icon.png")
    icon = Image.new("RGBA", (SIZE, SIZE), "#15141c")
    icon.alpha_composite(foreground)
    icon.convert("RGB").save(ASSETS / "icon.png")


if __name__ == "__main__":
    main()
