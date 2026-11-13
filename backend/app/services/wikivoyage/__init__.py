"""Wikivoyage («Викигид») as a source of described sights and local places (SPEC §21).

The Russian travel guide is read only at development time (`python -m app.wikivoyage_import
--fetch`): its `{{listing}}` templates are reduced to a compact snapshot committed under
`app/seed/` and imported offline. Listings that describe a place we already have enrich it;
the others become `preliminary` places of the system author «Викигид». Texts are CC BY-SA and
are always shown with the credit «Текст: Викигид, CC BY-SA».
"""
