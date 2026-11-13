"""Quests (SPEC §27): chains of riddles whose stages stay secret until a player passes them.

`lookup` answers "is this route a quest" for the rest of the application, `authoring` keeps the
author's side (cards, the editor, publication and screening), `play` runs the game itself and
`views` turns both into responses — the only place that decides what a player may see.
"""
