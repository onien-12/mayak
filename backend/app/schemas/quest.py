"""Quests (SPEC §27). Players get only what the stage they are on allows; authors and moderators get
everything through `QuestEditor`."""

from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    Field,
    SerializationInfo,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

from app.domain import quests as rules
from app.domain.enums import RouteStatus, RouteVisibility
from app.domain.quests import QuestCondition, QuestZone
from app.schemas.common import ApiModel, Latitude, Longitude, LongText, OwnedText, Title
from app.schemas.place import PhotoOut, ScreeningHold
from app.schemas.user import UserBrief

StageTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
StartTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
Riddle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=2000)]
Question = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Hint = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Reward = Annotated[str, StringConstraints(strip_whitespace=True, max_length=3000)]
Answer = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
TeamName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]


class StageInput(ApiModel):
    """One stage as the author writes it. Messages are for the editor, in plain words."""

    id: int | None = None
    """An existing stage of this quest being edited (keeps the progress of runs in it)."""
    title: StageTitle
    lat: Latitude
    lng: Longitude
    place_id: int | None = None
    riddle: Riddle
    photo_id: int | None = None
    condition: QuestCondition = QuestCondition.ARRIVAL
    check_arrival: bool = False
    radius_m: int = Field(
        default=rules.ARRIVAL_RADIUS_M, ge=rules.MIN_ARRIVAL_RADIUS_M, le=rules.MAX_ARRIVAL_RADIUS_M
    )
    question: Question = ""
    answers: Annotated[list[Answer], Field(max_length=rules.MAX_ANSWERS)] = Field(default_factory=list)
    hint: Hint = ""
    reward: Reward = ""
    zone: QuestZone = QuestZone.RIDDLE
    zone_radius_m: int | None = Field(default=None, ge=rules.MIN_ZONE_RADIUS_M, le=rules.MAX_ZONE_RADIUS_M)

    @model_validator(mode="after")
    def _condition_is_complete(self) -> Self:
        answers = [answer for answer in self.answers if rules.normalize_answer(answer)]
        match self.condition:
            case QuestCondition.ARRIVAL:
                self.question, self.answers, self.check_arrival = "", [], True
            case QuestCondition.CODE:
                if len(answers) != 1:
                    raise ValueError("Укажите код, который игрок получит на месте")
                self.question, self.answers = "", answers
            case QuestCondition.ANSWER:
                if not self.question:
                    raise ValueError("Напишите вопрос, на который игрок ответит на месте")
                if not answers:
                    raise ValueError("Добавьте хотя бы один правильный ответ")
                self.answers = answers
        if self.zone is QuestZone.CIRCLE and self.zone_radius_m is None:
            self.zone_radius_m = rules.ZONE_RADIUS_M
        if self.zone is QuestZone.RIDDLE:
            self.zone_radius_m = None
        return self


QuestStages = Annotated[list[StageInput], Field(min_length=rules.MIN_STAGES, max_length=rules.MAX_STAGES)]
Duration = Annotated[int, Field(ge=rules.MIN_DURATION_MIN, le=rules.MAX_DURATION_MIN)]


class QuestInput(ApiModel):
    title: Title
    description: LongText = ""
    start_title: StartTitle
    start_lat: Latitude
    start_lng: Longitude
    duration_min: Duration
    cover_photo_id: int | None = None
    visibility: RouteVisibility = RouteVisibility.PRIVATE
    """A quest is saved for its author first (to be tried as a player), then published."""
    stages: QuestStages


class QuestUpdate(ApiModel):
    title: Title | None = None
    description: LongText | None = None
    start_title: StartTitle | None = None
    start_lat: Latitude | None = None
    start_lng: Longitude | None = None
    duration_min: Duration | None = None
    cover_photo_id: int | None = None
    visibility: RouteVisibility | None = None
    stages: QuestStages | None = None


class QuestStart(OwnedText):
    """Where the quest starts: the only point of a quest anyone may see."""

    title: str
    lat: float
    lng: float

    @field_serializer("title")
    def _title(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class QuestCard(OwnedText):
    """Never anything about a stage beyond how many there are."""

    id: int
    title: str
    description: str
    status: RouteStatus
    visibility: RouteVisibility
    cover_url: str | None
    stages_count: int
    duration_min: int
    rating_avg: float | None
    rating_count: int
    finished_count: int
    """Players who finished it (test runs aside)."""
    start: QuestStart
    author: UserBrief
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id, self.start)
        return self

    @field_serializer("title", "description")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class QuestRunBrief(ApiModel):
    """The viewer's run in progress."""

    id: int
    is_team: bool
    team_name: str | None
    is_test: bool
    stage_number: int
    stages_total: int


class QuestResultOut(OwnedText):
    rank: int
    name: str
    """Team name, or the player's display name."""
    is_team: bool
    members_count: int
    result_s: int
    """Time from the start to the last stage plus the hint penalty."""
    hints: int
    finished_at: datetime
    is_mine: bool

    @field_serializer("name")
    def _name(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class QuestDetail(QuestCard):
    can_edit: bool
    my_run: QuestRunBrief | None
    my_result: QuestResultOut | None
    """The viewer's best ranked result."""
    has_finished: bool
    """The viewer finished it at least once (test runs aside): may rate it."""
    my_rating: int | None
    screening_hold: ScreeningHold | None
    """Only for the author and moderators, while the quest waits for a moderator (SPEC §24.1)."""


class LatLngOut(ApiModel):
    lat: float
    lng: float


class StageOut(OwnedText):
    """A stage as its author and moderators see it."""

    id: int
    position: int
    title: str
    lat: float
    lng: float
    place_id: int | None
    riddle: str
    photo: PhotoOut | None
    condition: QuestCondition
    check_arrival: bool
    radius_m: int
    question: str
    answers: list[str]
    hint: str
    reward: str
    zone: QuestZone
    zone_radius_m: int | None
    zone_center: LatLngOut | None
    """The centre players see: moved off the point (SPEC §27)."""


class QuestEditor(QuestDetail):
    cover_photo: PhotoOut | None
    stages: list[StageOut]

    @model_validator(mode="after")
    def _own_stages(self) -> Self:
        self._own(self.author.id, self.stages)
        return self


class SearchZone(ApiModel):
    lat: float
    lng: float
    radius_m: int


class RunMember(ApiModel):
    user: UserBrief
    is_captain: bool
    is_lead: bool


class PassedStage(OwnedText):
    position: int
    title: str
    lat: float
    lng: float
    reward: str
    passed_at: datetime | None
    passed_by: UserBrief | None
    hint_used: bool

    @field_serializer("title", "reward")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class CurrentStage(OwnedText):
    """The stage the run is on: never its place, code, answers or story."""

    position: int
    condition: QuestCondition
    check_arrival: bool
    riddle: str | None
    """None for a team member who is not holding this riddle."""
    photo: PhotoOut | None
    riddle_holder: UserBrief | None
    """Team runs: who holds the riddle of this stage."""
    question: str | None
    has_hint: bool
    hint: str | None
    """Set once the hint was taken."""
    zone: SearchZone | None
    tries_left: int
    locked_until: datetime | None

    @field_serializer("riddle", "question", "hint")
    def _texts(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class QuestRunOut(ApiModel):
    id: int
    quest_id: int
    quest_title: str
    start: QuestStart
    is_team: bool
    team_name: str | None
    join_code: str | None
    is_test: bool
    captain_id: int
    members: list[RunMember]
    stages_total: int
    stage_number: int
    """1-based number of the current stage; `stages_total + 1` once finished."""
    finished: bool
    abandoned: bool
    started_at: datetime
    finished_at: datetime | None
    hints_taken: int
    penalty_min: int
    result_s: int | None
    passed: list[PassedStage]
    current: CurrentStage | None
    can_confirm_on_site: bool
    """A test run: the arrival check can be confirmed by a button."""
    ranked: bool


class RunStartIn(ApiModel):
    team: bool = False
    team_name: TeamName | None = None
    test: bool = False

    @model_validator(mode="after")
    def _team_has_name(self) -> Self:
        if self.team and not self.team_name:
            raise ValueError("Придумайте название команды")
        if self.test and self.team:
            raise ValueError("Тестовое прохождение — только в одиночку")
        return self


class JoinIn(ApiModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=12)]


class LeadIn(ApiModel):
    user_id: int


class StageRef(ApiModel):
    stage: int = Field(ge=1)
    """Position of the stage the player is answering: a stale screen after a teammate passed it
    is told so instead of being counted as a wrong try."""


class CheckIn(StageRef):
    lat: Latitude | None = None
    lng: Longitude | None = None
    accuracy: float | None = Field(default=None, ge=0)
    answer: Answer | None = None
    on_site: bool = False
    """Test runs only: the author confirms the arrival by a button."""

    @field_validator("answer")
    @classmethod
    def _answer(cls, value: str | None) -> str | None:
        return value or None


class CheckOut(ApiModel):
    passed: bool
    message: str
    run: QuestRunOut
