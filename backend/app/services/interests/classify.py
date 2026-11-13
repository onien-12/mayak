"""CLI: `uv run python -m app.services.interests.classify [--limit N] [--rules-only]` (SPEC §23.2).

Tags everything new or edited by the rules, then asks the LLM about up to `--limit` objects that
it has not classified yet (tourism places, upcoming events, areas), in batches of 15 within the
daily request cap. Without an OpenRouter key, with `INTERESTS_LLM_ENABLED=false` or with
`--rules-only` only the rules run.
"""

import argparse
import asyncio

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.services.interests import tagging
from app.services.interests.classifier import (
    BatchOutcome,
    ClassifierLoop,
    InterestClassifier,
    OpenRouterClassifierClient,
)

DEFAULT_LIMIT = 150
MAX_FAILURES = 2


async def _classify(database: Database, limit: int) -> None:
    settings = get_settings()
    client = OpenRouterClassifierClient(settings.openrouter_api_key, settings.interests_llm_model)
    classifier = InterestClassifier(
        client, database.session_factory, daily_cap=settings.interests_llm_daily_request_cap
    )
    sent = answered = failures = 0
    try:
        while sent < limit:
            result = await classifier.run_batch(limit=limit - sent)
            if result.outcome is BatchOutcome.NOTHING:
                print("Неразмеченных объектов не осталось.")
                break
            if result.outcome is BatchOutcome.CAPPED:
                print("Суточный лимит запросов исчерпан.")
                break
            sent += result.sent
            if result.outcome is BatchOutcome.FAILED:
                failures += 1
                print(f"Запрос на {result.sent} объектов: модель не дала пригодного ответа.")
                if failures >= MAX_FAILURES:
                    break
                continue
            answered += result.answered
            for title, topics in result.tags or []:
                print(f"  {title} → {', '.join(topics) or '—'}")
            await asyncio.sleep(ClassifierLoop.SPACING_S)
    finally:
        await client.aclose()
    print(f"LLM: отправлено {sent}, размечено {answered}.")


async def _main(limit: int, rules_only: bool) -> None:
    settings = get_settings()
    database = Database(settings.database_url)
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            tagged = await tagging.tag_stale(session, utcnow())
            await session.commit()
        print(f"Правила: размечено объектов {tagged}.")
        if rules_only or not settings.interests_llm_active:
            if not rules_only:
                print("LLM выключена: нет OPENROUTER_API_KEY или INTERESTS_LLM_ENABLED=false.")
            return
        await _classify(database, limit)
    finally:
        await database.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Темы интересов для мест, событий и локаций.")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="сколько объектов отдать LLM")
    parser.add_argument("--rules-only", action="store_true", help="только правила, без LLM")
    arguments = parser.parse_args()
    asyncio.run(_main(max(arguments.limit, 0), arguments.rules_only))


if __name__ == "__main__":
    main()
