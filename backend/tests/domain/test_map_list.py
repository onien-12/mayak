"""The «Карта» list (SPEC §17, §18): background objects and the order."""

from app.domain import map_list as rules
from app.domain.enums import ExternalSourceId, Layer


def test_bare_background_objects() -> None:
    def bare(
        *,
        source: ExternalSourceId | None = ExternalSourceId.OSM,
        confirmed: bool = False,
        title: str = "Скамейка у моря",
        layer: Layer = Layer.INFRASTRUCTURE,
        pictured: bool = False,
    ) -> bool:
        return rules.is_bare_background(
            source=source,
            confirmed=confirmed,
            title=title,
            category_name="Детская площадка",
            layer=layer,
            pictured=pictured,
        )

    assert bare(title="Детская площадка")
    assert bare(layer=Layer.TOURISM)
    assert not bare()
    assert not bare(layer=Layer.TOURISM, pictured=True)
    assert not bare(title="Детская площадка", confirmed=True)
    assert not bare(title="Детская площадка", source=None)
    assert not bare(title="Детская площадка", source=ExternalSourceId.WIKIVOYAGE)


def test_in_view_first_then_residents_then_nearest() -> None:
    entries = [
        ("far, ours, in view", True, True, 900.0),
        ("near, imported, in view", True, False, 10.0),
        ("near, ours, elsewhere", False, True, 50.0),
        ("nearest, ours, in view", True, True, 100.0),
    ]
    ordered = sorted(
        entries,
        key=lambda entry: rules.order_key(
            in_view=entry[1], community=entry[2], distance_m=entry[3], place_id=0
        ),
    )
    assert [entry[0] for entry in ordered] == [
        "nearest, ours, in view",
        "far, ours, in view",
        "near, imported, in view",
        "near, ours, elsewhere",
    ]
