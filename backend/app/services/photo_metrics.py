"""Measurements of an uploaded picture for the cover choice (SPEC §25). Pillow only.

Everything is measured on a small copy, so it costs a few milliseconds per photo and never
depends on the original size. The numbers are deliberately rough: they separate a sharp daylight
photo from a dark blur or a screenshot, nothing finer.
"""

from pathlib import Path

from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError

from app.domain.cover import Picture

PROBE_SIDE_PX = 256
_LAPLACIAN = ImageFilter.Kernel((3, 3), (0, 1, 0, 1, -4, 1, 0, 1, 0), scale=1, offset=128)
SHARP_EDGE_STDDEV = 22.0
"""Spread of the Laplacian from which a picture counts as fully sharp."""
FULL_CONTRAST_STDDEV = 60.0
FULL_SATURATION = 90.0
DARK, DIM, BRIGHT, BURNT = 25.0, 70.0, 190.0, 245.0
PALETTE = 16
FLAT_FROM, FLAT_FULL = 0.45, 0.85
"""Share of the picture taken by its two commonest colours: a photo stays under the first."""


def _clamp(value: float) -> float:
    return min(max(value, 0.0), 1.0)


def _exposure(mean: float) -> float:
    """1 for ordinary daylight, falling to 0 for a black or a burnt-out frame."""
    if mean < DIM:
        return _clamp((mean - DARK) / (DIM - DARK))
    if mean > BRIGHT:
        return _clamp((BURNT - mean) / (BURNT - BRIGHT))
    return 1.0


def measure(image: Image.Image) -> Picture:
    probe = image.convert("RGB")
    probe.thumbnail((PROBE_SIDE_PX, PROBE_SIDE_PX))
    grey = probe.convert("L")
    light = ImageStat.Stat(grey)
    edges = ImageStat.Stat(grey.filter(_LAPLACIAN))
    saturation = ImageStat.Stat(probe.convert("HSV").getchannel("S"))
    colours = sorted((count for count, _ in probe.quantize(PALETTE).getcolors(PALETTE) or []), reverse=True)
    flat_share = sum(colours[:2]) / max(sum(colours), 1)
    return Picture(
        sharpness=_clamp(edges.stddev[0] / SHARP_EDGE_STDDEV),
        exposure=_exposure(light.mean[0]),
        contrast=_clamp(light.stddev[0] / FULL_CONTRAST_STDDEV),
        colour=_clamp(saturation.mean[0] / FULL_SATURATION),
        photo=1.0 - _clamp((flat_share - FLAT_FROM) / (FLAT_FULL - FLAT_FROM)),
    )


def measure_file(path: Path) -> Picture | None:
    """None when the file is missing or is not a readable image."""
    try:
        with Image.open(path) as image:
            return measure(image)
    except (OSError, UnidentifiedImageError, ValueError):
        return None
