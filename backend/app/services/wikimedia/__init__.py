"""Freely licensed photos and short descriptions from Wikimedia for tourism places and areas
(SPEC §19): Commons photos, Wikidata links between objects, images and articles, and the first
paragraph of the Russian Wikipedia article.

A dev-time job (`python -m app.wikimedia_enrich --fetch`) collects them with a few batched
requests into a seed snapshot; the app only hot-links Commons thumbnails and always shows the
credit. Nothing is downloaded or re-hosted, and every answer is untrusted: reduced to plain text
and checked before use.
"""
