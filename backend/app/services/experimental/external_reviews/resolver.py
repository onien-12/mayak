"""Which catalogue entry is our object: the matcher's rules first, the judge when they abstain.

Shared by every provider. Without a judge (no OpenRouter key, or switched off) this is exactly
the rule-based matcher. The verdict's `method` goes into the stored match evidence, so a cached
answer always says how it was reached.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass

from app.services.experimental.external_reviews import judge, matcher
from app.services.experimental.external_reviews.judge import CompletionClient
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.parser import Organization

EXPLICIT_ID = "explicit_id"
EXPLICIT_ID_REJECTED = "explicit_id_rejected"
"""The bound ID was missing from the answer or too far from our pin."""
LLM_CHOICE = "llm_choice"
LLM_NONE = "llm_none"
"""The judge was available and settled on nobody (or there was nobody within the bound)."""
UNCONFIRMED = "unconfirmed"
"""The rules abstained and no judge decided: none configured, or it gave no usable answer."""

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Verdict:
    organization: Organization | None
    method: str


class Resolver:
    def __init__(self, judge_client: CompletionClient | None = None) -> None:
        self._judge = judge_client

    @property
    def judges(self) -> bool:
        """Whether an abstention of the rules can still be settled by the judge."""
        return self._judge is not None

    def by_rules(self, subject: Subject, results: Sequence[Organization]) -> Verdict | None:
        found = matcher.match(subject, results)
        return None if found is None else Verdict(found, matcher.method(subject, found))

    async def by_judgement(self, subject: Subject, results: Sequence[Organization]) -> Verdict:
        """The judge's pick among the entries within the sanity bound; never raises."""
        if self._judge is None:
            return Verdict(None, UNCONFIRMED)
        candidates = matcher.judgeable(subject, results)
        if not candidates:
            return Verdict(None, LLM_NONE)
        decision = await judge.decide(self._judge, subject, candidates)
        if decision is None:
            return Verdict(None, UNCONFIRMED)
        if decision.index is None:
            return Verdict(None, LLM_NONE)
        chosen = candidates[decision.index]
        if not matcher.may_accept_judgement(subject, chosen):
            logger.info("Identity judge chose the parent of «%s»; rejected", subject.title)
            return Verdict(None, LLM_NONE)
        logger.info("Identity judge: «%s» is «%s» (%s)", subject.title, chosen.title, decision.reason)
        return Verdict(chosen, LLM_CHOICE)

    async def resolve(self, subject: Subject, results: Sequence[Organization]) -> Verdict:
        return self.by_rules(subject, results) or await self.by_judgement(subject, results)
