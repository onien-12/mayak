from io import BytesIO

import pytest
from PIL import Image, ImageChops, ImageDraw, ImageFilter

from app.domain import cover
from app.domain.cover import Candidate
from app.services import photo_metrics


def test_shape_prefers_what_crops_to_a_square_and_a_strip() -> None:
    assert cover.shape_score(1600, 1067) == 1.0  # 3:2
    assert cover.shape_score(1600, 900) == 1.0  # 16:9
    assert cover.shape_score(1000, 1000) == cover.SQUARE_SCORE
    assert cover.shape_score(700, 1000) == cover.PORTRAIT_SCORE  # a poster
    assert cover.shape_score(600, 1000) == cover.PORTRAIT_SCORE
    assert cover.shape_score(3000, 1000) == pytest.approx(cover.PANORAMA_SCORE)
    assert cover.PANORAMA_SCORE < cover.shape_score(2200, 1000) < 1.0
    assert cover.shape_score(0, 100) == 0.0


def test_size_counts_up_to_what_the_widest_slot_needs() -> None:
    assert cover.size_score(1600, 1200) == 1.0
    assert cover.size_score(900, 600) == 1.0
    assert 0 < cover.size_score(500, 380) < 1
    assert cover.size_score(200, 150) == 0.0


def test_the_best_cover_is_a_large_landscape_photo() -> None:
    poster = Candidate(1000, 1400, own=True)
    tiny = Candidate(240, 160, own=True)
    landscape = Candidate(1600, 1067, own=True)
    assert cover.best([poster, tiny, landscape]) == 2
    # Equals: the earlier one.
    assert cover.best([Candidate(1600, 1067, own=True), Candidate(1500, 1000, own=True)]) == 0
    assert cover.best([]) is None


def test_residents_photos_come_before_archive_ones() -> None:
    archive = Candidate(1600, 1067, own=False)
    # A usable resident's photo keeps the archive off the cover even when it is a worse shape…
    assert cover.best([Candidate(1000, 1400, own=True), archive]) == 0
    # …and the best of the residents' photos is taken.
    assert cover.best([Candidate(1000, 1400, own=True), archive, Candidate(1200, 800, own=True)]) == 2
    # A thumbnail-sized upload is not a cover: the archive photo stays.
    assert cover.best([Candidate(64, 48, own=True), archive]) == 1
    assert cover.best([Candidate(64, 48, own=True)]) == 0


def test_a_measured_picture_can_outweigh_the_shape() -> None:
    blurred_dark = cover.Picture(sharpness=0.1, exposure=0.1, contrast=0.2, colour=0.2, photo=1.0)
    crisp = cover.Picture(sharpness=1.0, exposure=1.0, contrast=0.8, colour=0.7, photo=1.0)
    landscape_but_bad = Candidate(1600, 1067, own=True, picture=blurred_dark)
    square_and_good = Candidate(1200, 1200, own=True, picture=crisp)
    assert cover.best([landscape_but_bad, square_and_good]) == 1


def _scene() -> Image.Image:
    """A photo-like picture: a graded sky, a meadow, a row of houses, a sun and sensor noise."""
    width, height = 640, 420
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        sky = (90 + y // 4, 150 + y // 6, 225 - y // 8)
        draw.line((0, y, width, y), fill=sky if y < 260 else (50 + y // 8, 110 + y // 10, 60))
    for index in range(40):
        x = 16 * index
        draw.rectangle((x, 180 + (index * 37) % 60, x + 9, 262), fill=(150 + index * 2, 90, 60 + index * 3))
    draw.ellipse((500, 40, 570, 110), fill=(250, 220, 110))
    noise = Image.effect_noise((width, height), 28).convert("RGB")
    return ImageChops.add(image, noise, scale=1.0, offset=-128)


def test_measurements_tell_a_photo_from_a_blur_a_dark_frame_and_a_screenshot() -> None:
    sharp = photo_metrics.measure(_scene())
    blurred = photo_metrics.measure(_scene().filter(ImageFilter.GaussianBlur(8)))
    dark = photo_metrics.measure(_scene().point(lambda value: value // 8))
    screenshot = Image.new("RGB", (640, 420), "white")
    ImageDraw.Draw(screenshot).rectangle((40, 60, 400, 90), fill="black")
    flat = photo_metrics.measure(screenshot)

    assert sharp.sharpness > blurred.sharpness * 2
    assert sharp.exposure == 1.0
    assert dark.exposure < 0.3
    assert sharp.photo > 0.8
    assert flat.photo < 0.2
    assert cover.picture_score(sharp) > max(
        cover.picture_score(blurred), cover.picture_score(dark), cover.picture_score(flat)
    )


def test_an_unreadable_file_has_no_measurements(tmp_path_factory: pytest.TempPathFactory) -> None:
    folder = tmp_path_factory.mktemp("cover")
    broken = folder / "broken.jpg"
    broken.write_bytes(b"not an image")
    assert photo_metrics.measure_file(broken) is None
    assert photo_metrics.measure_file(folder / "missing.jpg") is None
    good = folder / "good.jpg"
    buffer = BytesIO()
    _scene().save(buffer, format="JPEG")
    good.write_bytes(buffer.getvalue())
    assert photo_metrics.measure_file(good) is not None
