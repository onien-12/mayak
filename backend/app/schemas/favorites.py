from app.schemas.common import ApiModel
from app.schemas.place import PlaceCard
from app.schemas.route import RouteCard


class FavoritesOut(ApiModel):
    places: list[PlaceCard]
    routes: list[RouteCard]
