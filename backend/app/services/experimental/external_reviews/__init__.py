"""Yandex, 2GIS and Google reviews, ratings and photos next to our own (SPEC §20, §22).

Behind `EXTERNAL_REVIEWS_ENABLED`. Touch points with the rest of the backend: the router
registration in `app/api/v1/__init__.py`, and `ratings` — the cached sources' ratings that
`app/services/combined_ratings.py` blends into cards (never a request to a source). Tables:
`external_review_sources`, `external_reviews` (Yandex), `external_catalogue_sources`,
`external_catalogue_reviews`, `external_catalogue_cursors` (other providers and their paging),
`external_review_match_evidence`; tests in `tests/experimental/`, fixtures in
`tests/fixtures/yandex/` and `tests/fixtures/google/`. Frontend: SPEC §20.

The terms it runs on: on demand from a card (summary rows only read the cache), «Показать ещё»
or the warm-up CLI, with a 7-day cache; at most one request per 4 seconds and the configured daily
cap per provider; no circumvention of any protection — a captcha, a refused request or an
unreadable answer ends that one lookup, retried for that target after an hour; only rating, text
(≤ 600 characters), date and the link to the original are stored, never anything about the
reviewer; photos are only hot-linked. Identity: the matcher's rules, then an LLM's judgement
where they abstain (`resolver`), every decision recorded as evidence.
"""
