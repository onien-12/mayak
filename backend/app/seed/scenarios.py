"""Moderation and lifecycle stories played on top of the seeded places.

Each step calls the same service functions as the HTTP API, with a historical `now`, so the
resulting cases, logs, history entries, reputation events and notifications are real.
"""

from datetime import timedelta

from app.domain.enums import (
    AiCategory,
    AiTarget,
    AiVerdict,
    ComplaintReason,
    HistoryKind,
    IssueStage,
    ModerationAction,
)
from app.models import AiReview
from app.schemas.moderation import ResolveIn
from app.schemas.place import EventUpdate, OfficialInfoIn
from app.seed.context import SeedContext
from app.seed.specs import SeedEvent, SeedPlace
from app.services import complaints, events, history, issues, moderation, moderation_cases

PLACES: tuple[SeedPlace, ...] = (
    SeedPlace(
        key="rest_tim_bench",
        category="rest_place",
        title="Скамейки под навесом у остановки «Фуникулёр»",
        lat=43.11802,
        lng=131.90180,
        author="tim",
        age_days=15,
        address="ул. Всеволода Сибирцева",
        description="Две широкие скамейки под прозрачным навесом. Удобно переждать дождь после видовой площадки.",
        attributes={"free": True, "accessible": True, "shelter": True},
        tags=("вид",),
        present="lena",
        last_vote_days_ago=10,
    ),
    SeedPlace(
        key="water_novichok",
        category="drinking_water",
        title="Кулер с водой в Морском вокзале",
        lat=43.11125,
        lng=131.88300,
        author="novichok",
        age_days=0.5,
        address="ул. Нижнепортовая, 1, зал ожидания",
        description="В зале ожидания на втором этаже стоит кулер с холодной и горячей водой, стаканчики рядом.",
        attributes={"free": True},
    ),
    SeedPlace(
        key="spam_tours",
        category="unusual",
        title="ДЕШЁВЫЕ ТУРЫ В ХУНЬЧУНЬ!!!!!!! ЗВОНИТЕ",
        lat=43.11560,
        lng=131.88400,
        author="promo_vl",
        age_days=8,
        description="САМЫЕ НИЗКИЕ ЦЕНЫ НА ШОП-ТУРЫ В КИТАЙ!!! ВЫЕЗД КАЖДЫЙ ДЕНЬ, ЗАПИСЬ ТУТ: https://clck.ru/tury-vl",
    ),
    SeedPlace(
        key="shower_patrokl",
        category="shower",
        title="Бесплатный душ на пляже Патрокл",
        lat=43.07190,
        lng=131.94600,
        author="dima",
        age_days=40,
        address="бухта Патрокл, у спасательной вышки",
        description="Летний душ с пресной водой рядом с раздевалками. Работает в купальный сезон.",
        attributes={"free": True, "hours": "июнь–сентябрь", "condition": "ok"},
        tags=("пляж", "бесплатно"),
        present="pasha",
        last_vote_days_ago=30,
    ),
    SeedPlace(
        key="ev_tim_meetup",
        category="entertainment",
        title="Встреча для тех, кто недавно переехал",
        lat=43.12550,
        lng=131.89200,
        author="tim",
        age_days=0.8,
        address="Покровский парк, у главного входа",
        description="Знакомимся, гуляем и делимся находками в городе. Чат встречи: https://bit.ly/vl-newcomers",
        attributes={"organizer": "Тимур Снеговой"},
        tags=("встреча", "знакомства"),
        event=SeedEvent(
            starts_in_hours=5 * 24,
            duration_hours=2,
            capacity=20,
            is_meetup=True,
            contact="Телеграм: @tim_snow",
        ),
    ),
)

_REGATTA_CANCELLED_DAYS_AGO = 1.0


async def _decide(
    ctx: SeedContext, place_key: str, action: ModerationAction, reason: str, days_ago: float
) -> None:
    place = ctx.places[place_key]
    case = await moderation_cases.find_open_case(ctx.session, AiTarget.PLACE, place.id)
    if case is None:
        raise LookupError(f"seed place {place_key!r} has no open moderation case")
    payload = ResolveIn(action=action, reason=reason)
    await moderation.decide(ctx.session, case, ctx.users["marina"], payload, ctx.ago(days_ago))


async def _complain(
    ctx: SeedContext, place_key: str, reporter: str, reason: ComplaintReason, comment: str, days_ago: float
) -> None:
    await complaints.file_complaint(
        ctx.session, ctx.users[reporter], ctx.places[place_key], reason, comment, ctx.ago(days_ago)
    )


async def _premoderation(ctx: SeedContext) -> None:
    await _decide(
        ctx, "rest_tim_bench", ModerationAction.APPROVE, "Точка существует, описание понятное. Спасибо!", 14
    )
    await _decide(
        ctx,
        "spam_tours",
        ModerationAction.REJECT,
        "Реклама коммерческих услуг не является объектом городской среды.",
        7.9,
    )


async def _complaints_and_appeal(ctx: SeedContext) -> None:
    await _complain(
        ctx, "shower_patrokl", "sveta", ComplaintReason.INACCURATE, "Душ платный, 100 рублей.", 24
    )
    await _complain(
        ctx, "shower_patrokl", "vera", ComplaintReason.OUTDATED, "Кабинку демонтировали в сентябре.", 23
    )
    await _complain(
        ctx, "shower_patrokl", "lena", ComplaintReason.INACCURATE, "На месте только раздевалки.", 22
    )
    await _decide(
        ctx, "shower_patrokl", ModerationAction.HIDE, "Душ демонтирован, информация неактуальна.", 20
    )
    await moderation.open_appeal(
        ctx.session,
        ctx.places["shower_patrokl"],
        "Душ сезонный: его снимают на зиму и возвращают в июне. Прошу вернуть точку с пометкой о сезонности.",
        ctx.ago(19),
    )

    await _complain(
        ctx, "elevator_underpass", "anya", ComplaintReason.OUTDATED, "Подъёмник не работает больше недели.", 6
    )
    await _complain(
        ctx,
        "elevator_underpass",
        "kostya",
        ComplaintReason.INACCURATE,
        "Кнопка вызова срезана, дежурного нет.",
        5,
    )
    await _complain(
        ctx, "elevator_underpass", "dima", ComplaintReason.OUTDATED, "Платформа обмотана лентой.", 4
    )


async def _official_info(ctx: SeedContext) -> None:
    marina = ctx.users["marina"]
    steps: tuple[tuple[str, float, OfficialInfoIn], ...] = (
        (
            "is_wall_krygina",
            15,
            OfficialInfoIn(
                stage=IssueStage.FORWARDED,
                official_note="Обращение передано в управление дорог и благоустройства. Назначено обследование стены.",
                appeal_number="№ 14-5873/26",
                responsible_org="Управление дорог и благоустройства",
            ),
        ),
        (
            "is_dump_okatovaya",
            10,
            OfficialInfoIn(
                stage=IssueStage.FORWARDED,
                official_note="Обращение направлено в районную администрацию, вывоз мусора включён в график.",
                appeal_number="№ 31-1207/26",
                responsible_org="Администрация Первомайского района",
            ),
        ),
        (
            "is_power_neibuta",
            8.5,
            OfficialInfoIn(
                stage=IssueStage.IN_PROGRESS,
                official_note="Повреждён кабель 6 кВ. Аварийная бригада работает на месте.",
                responsible_org="Электрические сети",
                expected_fix_at=ctx.ago(8.1),
            ),
        ),
        (
            "is_power_neibuta",
            8.0,
            OfficialInfoIn(
                stage=IssueStage.RESOLVED, official_note="Электроснабжение восстановлено в полном объёме."
            ),
        ),
        (
            "is_traffic_light",
            1,
            OfficialInfoIn(
                stage=IssueStage.IN_PROGRESS,
                official_note="Заказан новый контроллер. До ремонта на перекрёстке дежурит регулировщик в часы пик.",
                responsible_org="Служба содержания городских территорий",
                expected_fix_at=ctx.now + timedelta(days=1),
            ),
        ),
        (
            "is_water_outage",
            0.3,
            OfficialInfoIn(
                stage=IssueStage.IN_PROGRESS,
                official_note="Аварийная бригада устраняет порыв. Подвоз воды организован по адресу: ул. Черёмуховая, 7.",
                responsible_org="Водоканал",
                expected_fix_at=ctx.now + timedelta(hours=9),
            ),
        ),
    )
    for place_key, days_ago, payload in steps:
        await issues.apply_official_info(
            ctx.session, marina, ctx.places[place_key], payload, ctx.ago(days_ago)
        )


async def _cancel_regatta(ctx: SeedContext) -> None:
    place = ctx.places["ev_regatta"]
    cancelled_at = ctx.ago(_REGATTA_CANCELLED_DAYS_AGO)
    changed = await events.apply_update(ctx.session, place, EventUpdate(is_cancelled=True), cancelled_at)
    history.record(
        ctx.session,
        place,
        HistoryKind.EDITED,
        f"Изменено: {', '.join(changed)}. Причина — штормовое предупреждение.",
        now=cancelled_at,
        actor=ctx.users["admin"],
    )


AI_REVIEWS: tuple[tuple[AiTarget, str, AiVerdict, tuple[AiCategory, ...], float, str, float], ...] = (
    (
        AiTarget.PLACE,
        "spam_tours",
        AiVerdict.VIOLATION,
        (AiCategory.ADS, AiCategory.SPAM),
        0.97,
        "Реклама шоп-туров с призывом звонить и сокращённой ссылкой; к объектам городской среды не относится.",
        8,
    ),
    (
        AiTarget.PLACE,
        "ev_tim_meetup",
        AiVerdict.SUSPICIOUS,
        (AiCategory.SPAM,),
        0.55,
        "Описание встречи выглядит обычным, но содержит сокращённую ссылку на внешний чат — стоит проверить, куда она ведёт.",
        0.8,
    ),
    (
        AiTarget.PLACE,
        "water_novichok",
        AiVerdict.OK,
        (),
        0.93,
        "Обычное описание кулера с водой в зале ожидания, нарушений не видно.",
        0.5,
    ),
    (
        AiTarget.PLACE,
        "elevator_underpass",
        AiVerdict.OK,
        (),
        0.9,
        "Нейтральное описание подъёмника; о его неисправности говорят жалобы, а не текст публикации.",
        110,
    ),
    (
        AiTarget.ROUTE,
        "churkin_views",
        AiVerdict.OK,
        (),
        0.88,
        "Короткий прогулочный маршрут с понятными остановками, нарушений нет.",
        1,
    ),
)


async def add_ai_reviews(ctx: SeedContext) -> None:
    """Sample LLM opinions for the demo cases. The seed never calls the model itself."""
    for target_type, key, verdict, categories, confidence, summary, days_ago in AI_REVIEWS:
        target = ctx.routes[key] if target_type is AiTarget.ROUTE else ctx.places[key]
        ctx.session.add(
            AiReview(
                target_type=target_type,
                target_id=target.id,
                verdict=verdict,
                categories=[category.value for category in categories],
                confidence=confidence,
                summary=summary,
                model=ctx.settings.llm_moderation_model,
                created_at=ctx.ago(days_ago),
            )
        )
    await ctx.session.flush()
    for target_type, key, *_ in AI_REVIEWS:
        is_route = target_type is AiTarget.ROUTE
        target = ctx.routes[key] if is_route else ctx.places[key]
        case = await moderation_cases.find_open_case(
            ctx.session, AiTarget.ROUTE if is_route else AiTarget.PLACE, target.id
        )
        if case is not None:
            case_target = (
                moderation_cases.route_target(target) if is_route else moderation_cases.place_target(target)
            )
            await moderation_cases.refresh_case(ctx.session, case, case_target)


async def run(ctx: SeedContext) -> None:
    await _premoderation(ctx)
    await _complaints_and_appeal(ctx)
    await _official_info(ctx)
    await _cancel_regatta(ctx)
