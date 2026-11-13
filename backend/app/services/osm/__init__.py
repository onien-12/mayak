"""OpenStreetMap as the base layer of objects and territories (SPEC §18).

Overpass is queried only at development time (`python -m app.osm_import --fetch`); the result is
reduced to a compact snapshot committed under `app/seed/` and imported offline. Everything that
comes from OSM is untrusted data: it is typed, trimmed to plain text and never executed.
Data © OpenStreetMap contributors, ODbL.
"""
