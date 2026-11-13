"""Why an item is held, in two voices (SPEC §24.1).

Moderators read the stored hold reasons: the model's verdict with its confidence, the hidden
usefulness of a place, a hint at the author's hidden standing. The author is told that the item
did not pass and why, but none of those numbers or hints: each stored line is turned into a
plain one here. The stored lines come from the formats below and from `ai_moderation.describe`;
a test keeps the two in step, and a line this module does not recognise reads as a plain
«Нужна ручная проверка модератора».
"""

import re

from app.domain.ai_moderation import CATEGORY_LABELS, HOLD_CONFIDENCE, VERDICT_LABELS
from app.domain.enums import AiTarget, AiVerdict

GIBBERISH = "Похоже на случайный набор букв: {label}"
"""Found by the heuristics; the author sees it as it is."""
UNCHECKED_TEXT = "Текст не проверен: модель недоступна, а автор — новичок или с низкой внутренней оценкой"
UNCHECKED_PHOTO = (
    "Фото {index} не проверено: модель недоступна, а автор — новичок или с низкой внутренней оценкой"
)
MANUAL_CHECK = "Нужна ручная проверка модератора"
"""What the author reads for a hold that only the author's standing caused, or an unknown line."""
TOO_LITTLE = "слишком мало сведений о месте"
"""Low usefulness of a place, without the number."""
UNSURE = "нужна ручная проверка модератора"
"""A photo the model could not call fine, without naming anything."""
UNNAMED_VIOLATION = "возможное нарушение правил"

TEXT_SUBJECT = "Текст"
_SUBJECT = rf"(?P<subject>{TEXT_SUBJECT}|Фото \d+)"
_VERDICT_BY_LABEL = {label: verdict for verdict, label in VERDICT_LABELS.items()}
_VERDICTS = "|".join(re.escape(label) for label in VERDICT_LABELS.values())
_MODEL_LINE = re.compile(
    rf"^{_SUBJECT}: (?P<verdict>{_VERDICTS})(?: \((?P<categories>[^)]*)\))?, "
    r"уверенность (?P<confidence>\d+(?:\.\d+)?)(?P<useless>, польза \d+ из \d+)?$"
)
_GIBBERISH_LINE = re.compile("^" + re.escape(GIBBERISH).replace(re.escape("{label}"), r".+") + "$")
_UNCHECKED_LINES = (
    re.compile("^" + re.escape(UNCHECKED_TEXT) + "$"),
    re.compile("^" + re.escape(UNCHECKED_PHOTO).replace(re.escape("{index}"), r"\d+") + "$"),
)
_KNOWN_CATEGORIES = frozenset(CATEGORY_LABELS.values())

NOTICE_TITLE_LIMIT = 160
_OWNER_TITLE_LIMIT = 80
_NOTICE_SUBJECTS: dict[AiTarget, tuple[str, str, str]] = {
    AiTarget.PLACE: ("Публикация", "Публикация", "прошла"),
    AiTarget.ROUTE: ("Маршрут", "Маршрут", "прошёл"),
    AiTarget.PHOTO: ("Фото к", "Фото", "прошло"),
    AiTarget.COMMENT: ("Комментарий к", "Комментарий", "прошёл"),
    AiTarget.REVIEW: ("Отзыв к", "Отзыв", "прошёл"),
    AiTarget.NOTE: ("Заметка", "Заметка на карте", "прошла"),
    AiTarget.LOST_ITEM: ("Объявление", "Объявление в «Потеряшках»", "прошло"),
    AiTarget.LOST_RESPONSE: ("Отклик к", "Отклик", "прошёл"),
}
"""`(prefix before the title, subject without a title, verb ending)` per kind of item."""
_PRONOUNS: dict[AiTarget, str] = {AiTarget.PLACE: "её", AiTarget.NOTE: "её"}
_EDITABLE = (AiTarget.PLACE, AiTarget.ROUTE)


def _model_line(match: re.Match[str], *, rates_usefulness: bool) -> str:
    subject = match["subject"]
    verdict = _VERDICT_BY_LABEL[match["verdict"]]
    # Doubt below the hold threshold holds only an author with low standing.
    standing_only = (
        subject == TEXT_SUBJECT
        and verdict is AiVerdict.SUSPICIOUS
        and float(match["confidence"]) < HOLD_CONFIDENCE
    )
    parts: list[str] = []
    if match["categories"] and verdict is not AiVerdict.OK and not standing_only:
        parts += [label for label in match["categories"].split(", ") if label in _KNOWN_CATEGORIES]
    if match["useless"] and rates_usefulness:
        parts.append(TOO_LITTLE)
    if parts:
        return f"{subject}: {', '.join(parts)}"
    if standing_only:
        return MANUAL_CHECK
    return f"{subject}: {UNSURE if verdict is AiVerdict.OK else UNNAMED_VIOLATION}"


def author_line(reason: str, *, rates_usefulness: bool) -> str | None:
    """The author's version of one stored reason; None for a line in no known format."""
    if _GIBBERISH_LINE.match(reason):
        return reason
    if any(pattern.match(reason) for pattern in _UNCHECKED_LINES):
        return MANUAL_CHECK
    match = _MODEL_LINE.match(reason)
    return _model_line(match, rates_usefulness=rates_usefulness) if match else None


def for_author(reasons: list[str], target_type: AiTarget) -> list[str]:
    """What the author of a held item reads: what was found and where, never how sure the
    model was, the usefulness number or anything about the author's standing."""
    rates_usefulness = target_type is AiTarget.PLACE
    lines = [author_line(reason, rates_usefulness=rates_usefulness) or MANUAL_CHECK for reason in reasons]
    return list(dict.fromkeys(lines)) or [MANUAL_CHECK]


def _shorten(text: str, limit: int) -> str:
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


def notice_title(target_type: AiTarget, owner_title: str | None, *, prefix: str | None = None) -> str:
    """«Комментарий к «Сквер» не прошёл автоматическую проверку»: the item and what it is about.
    `prefix` names the item when the kind's usual word does not fit («Квест» for a quest)."""
    usual, bare, verb = _NOTICE_SUBJECTS[target_type]
    subject = f"{prefix or usual} «{_shorten(owner_title, _OWNER_TITLE_LIMIT)}»" if owner_title else bare
    return _shorten(f"{subject} не {verb} автоматическую проверку", NOTICE_TITLE_LIMIT)


def notice_body(target_type: AiTarget, reasons: list[str]) -> str:
    """The author-facing reasons, who sees the item meanwhile and what happens next."""
    pronoun = _PRONOUNS.get(target_type, "его")
    body = (
        f"Что нашла проверка: {'; '.join(for_author(reasons, target_type))}. "
        f"Пока {pronoun} видите только вы — модератор посмотрит и решит."
    )
    if target_type in _EDITABLE:
        body += f" Можно исправить {pronoun} — модератор увидит новую версию."
    return body
