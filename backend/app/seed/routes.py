"""Author routes and collections of the seed.

Paths of the `roads` routes were computed once with the routing provider (OpenStreetMap data)
and are stored in `route_paths.json` (see `fetch_route_paths.py`); changing their stops falls back
to straight segments until the file is regenerated.
"""

from app.domain.enums import PathMode, RouteDifficulty, RouteKind, RouteVisibility, StopKind
from app.seed.specs import SeedCollection, SeedReview, SeedRoute, SeedStop


def _via(lat: float, lng: float) -> SeedStop:
    """Invisible shaping point of a trail."""
    return SeedStop(kind=StopKind.VIA, lat=lat, lng=lng)


ROUTES: tuple[SeedRoute, ...] = (
    SeedRoute(
        key="center_classic",
        title="Классика центра за два часа",
        description=(
            "Маршрут для первого знакомства с городом: от конечной точки Транссиба через главную площадь и дворы "
            "Миллионки к закату на Амурском заливе. Весь путь идёт под горку."
        ),
        kind=RouteKind.WALK,
        author="anya",
        age_days=60,
        difficulty=RouteDifficulty.EASY,
        tips="Выходите за два с половиной часа до заката — тогда финиш на набережной совпадёт с самым красивым светом. Удобная обувь обязательна: во дворах Миллионки брусчатка и железные лестницы.",
        tags=("центр", "первый раз в городе", "закат"),
        stops=(
            SeedStop(
                "vokzal",
                "Начинаем у столба «9288 км» на перроне.",
                15,
                landmark="Столб стоит напротив паровоза-памятника, выход на перрон через пешеходный мост.",
            ),
            SeedStop(
                "morskoy_vokzal",
                "Поднимитесь на галерею посмотреть на порт.",
                10,
                StopKind.VIEWPOINT,
                landmark="Крытый переход начинается прямо от железнодорожного вокзала.",
            ),
            SeedStop(
                "ploshad_bortsov",
                "В пятницу и субботу загляните на ярмарку.",
                15,
                landmark="Ориентир — монумент со знаменосцем в центре площади.",
            ),
            SeedStop(
                "arseniev_museum",
                "Если есть время — полтора часа на музей, если нет — хотя бы фойе.",
                20,
                landmark="Угловое здание с башенкой на перекрёстке Светланской и Алеутской.",
            ),
            SeedStop(
                "ulitsa_fokina",
                "Спускаемся по Арбату к морю, по пути берём пянсе.",
                15,
                landmark="Пешеходная улица начинается у фонтана, идите вниз, к заливу.",
            ),
            SeedStop(
                "millionka",
                "Сворачиваем в арки: дворы проходные.",
                25,
                landmark="Арка с коваными воротами по правой стороне, за ней — двор с галереями.",
            ),
            SeedStop(
                "sportivnaya_nab",
                "Финиш на набережной — лучше всего попасть сюда к закату.",
                30,
                StopKind.VIEWPOINT,
                landmark="Идите на колесо обозрения — оно видно с любого конца Арбата.",
            ),
        ),
        reviews=(
            SeedReview(
                "kostya",
                5,
                "Прошёл с друзьями из Новосибирска — все в восторге. Логичный и нетрудный маршрут.",
                20,
            ),
            SeedReview("lena", 5, "С коляской проходится целиком, кроме дворов Миллионки.", 34),
            SeedReview("igor", 4, "Хорошо, но музей лучше оставить на отдельный день.", 41),
        ),
        saved_by="kostya lena sveta dima igor pasha",
    ),
    SeedRoute(
        key="sea_facade",
        title="Морской фасад: от подлодки до Золотого моста",
        description=(
            "Экскурсия по парадной стороне Владивостока: корабельная набережная, триумфальная арка, подъём на "
            "фуникулёре к главной панораме и спуск к воде под самый мост."
        ),
        kind=RouteKind.EXCURSION,
        author="oleg",
        age_days=120,
        difficulty=RouteDifficulty.MEDIUM,
        tips="На подъём можно сесть в фуникулёр — он ходит до восьми вечера. Спуск к набережной Цесаревича идёт по лестницам: в гололёд выбирайте дорогу вдоль Светланской.",
        tags=("экскурсия", "история", "мост"),
        stops=(
            SeedStop(
                "s56",
                "Начинаем с музея в подводной лодке — к открытию очереди нет.",
                40,
                landmark="Лодка стоит на постаменте у Вечного огня, вход со стороны кормы.",
            ),
            SeedStop(
                "admiralsky_skver",
                "Короткая остановка у фонтана и якорей.",
                10,
                StopKind.REST,
                landmark="Поднимитесь по лестнице справа от мемориала.",
            ),
            SeedStop(
                "arka_tsesarevicha",
                "Проходим под аркой и загадываем желание.",
                10,
                StopKind.LANDMARK,
                landmark="Арку с шатровой крышей видно из сквера.",
            ),
            SeedStop(
                "funicular",
                "Поднимаемся в вагончике: полторы минуты и весь Золотой Рог под нами.",
                10,
                StopKind.TRANSPORT,
                landmark="Нижняя станция — жёлтый павильон на Пушкинской.",
            ),
            SeedStop(
                "orlinoe_gnezdo",
                "Главная панорама города.",
                25,
                StopKind.VIEWPOINT,
                landmark="От верхней станции направо, через подземный переход к памятнику Кириллу и Мефодию.",
            ),
            SeedStop(
                "nab_tsesarevicha",
                "Спускаемся к воде: мост отсюда виден снизу.",
                30,
                StopKind.VIEWPOINT,
                landmark="Ориентир — пилон моста: набережная начинается у его подножия.",
            ),
        ),
        reviews=(
            SeedReview("anya", 5, "Идеальная экскурсия для гостей. Подъём на фуникулёре — изюминка.", 15),
            SeedReview("vera", 5, "Олег знает город как никто. Маршрут выверен по минутам.", 62),
            SeedReview("sveta", 4, "Отлично, но спуск к набережной по лестницам крутоват.", 88),
        ),
        saved_by="anya vera kostya lena sveta igor dima",
    ),
    SeedRoute(
        key="russky_forts",
        title="Батареи и форты острова Русский",
        description=(
            "Автомобильный маршрут по укреплениям Владивостокской крепости на острове: от батареи под Русским мостом "
            "до башен Ворошиловской батареи, с остановкой в кампусе и океанариуме."
        ),
        kind=RouteKind.CAR,
        author="vera",
        age_days=90,
        difficulty=RouteDifficulty.EASY,
        tips="Заправьтесь в городе: на острове заправок мало. Музей Ворошиловской батареи закрыт в понедельник и вторник, океанариум — в понедельник.",
        tags=("русский", "крепость", "на машине"),
        stops=(
            SeedStop(
                "novosiltsev_battery",
                "Первая остановка сразу за мостом. Возьмите фонарик.",
                30,
                landmark="Съезд направо сразу после моста, парковка у шлагбаума.",
            ),
            SeedStop(
                "fort_pospelova",
                "Последние триста метров лучше пройти пешком.",
                40,
                landmark="Грунтовка уходит влево от асфальта у бетонного указателя.",
            ),
            SeedStop(
                "dvfu_campus",
                "Прогулка по набережной и обед в кампусе.",
                60,
                StopKind.FOOD,
                lat=43.029499,
                lng=131.889251,
                landmark="Машину оставьте у дороги вдоль кампуса — до набережной бухты Аякс отсюда пять минут пешком.",
            ),
            SeedStop(
                "oceanarium",
                "Билеты купите заранее на конкретное время.",
                180,
                landmark="Здание-раковину видно с дороги, парковка бесплатная.",
            ),
            SeedStop(
                "voroshilov_battery",
                "Музей закрывается в пять — не опоздайте.",
                60,
                landmark="После посёлка следуйте указателям «Ворошиловская батарея».",
            ),
        ),
        reviews=(
            SeedReview("oleg", 5, "Грамотная последовательность: без лишних километров.", 30),
            SeedReview("kostya", 4, "За один день тяжеловато, мы разбили на два.", 55),
        ),
        saved_by="oleg anya kostya lena",
    ),
    SeedRoute(
        key="egersheld_sunset",
        title="Эгершельд: к Токаревскому маяку на закате",
        description=(
            "Велопрогулка вдоль всего полуострова Шкота: от вокзала мимо порта и тихих дворов к маяку на краю земли. "
            "Рассчитывайте время так, чтобы быть на косе за полчаса до заката."
        ),
        kind=RouteKind.BIKE,
        author="kostya",
        age_days=45,
        difficulty=RouteDifficulty.MEDIUM,
        tips="Обратно — в гору и уже в темноте: проверьте фонари и возьмите ветровку. Велосипед оставляйте у парковки перед косой, по гальке на нём не проехать.",
        tags=("эгершельд", "велосипед", "маяк", "закат"),
        stops=(
            SeedStop(
                "vokzal",
                "Старт от вокзала.",
                5,
                StopKind.TRANSPORT,
                landmark="Велопарковка слева от главного входа.",
            ),
            SeedStop(
                "library_5",
                "Здесь можно набрать воды и передохнуть.",
                10,
                StopKind.WATER,
                landmark="Вход в библиотеку со двора.",
            ),
            SeedStop("basketball_egersheld", "Дальше дорога идёт вниз, к морю.", 5),
            SeedStop(
                "tokarevsky_mayak",
                "К маяку — пешком по косе, велосипед оставьте у парковки.",
                45,
                StopKind.VIEWPOINT,
                landmark="В отлив к башне ведёт галечная коса; в прилив смотрите с берега.",
            ),
        ),
        reviews=(
            SeedReview("roma", 5, "Мой любимый вечерний маршрут. На обратном пути включайте фонари.", 10),
        ),
        saved_by="anya oleg sveta",
    ),
    SeedRoute(
        key="tobizina_trail",
        title="Тропа на мыс Тобизина",
        description=(
            "Трекинг на самую эффектную точку острова Русский. От Ворошиловской батареи лесные тропы и грунтовки "
            "ведут к южному берегу, дальше тропа идёт над обрывами и по узкому скальному гребню выходит на самый "
            "мыс. Около семи километров в одну сторону."
        ),
        kind=RouteKind.HIKE,
        author="oleg",
        age_days=75,
        difficulty=RouteDifficulty.HARD,
        tips=(
            "Возьмите не меньше полутора литров воды на человека, треккинговую обувь и ветровку. Связь на мысе ловит "
            "с перебоями — скачайте трек в GPX заранее. Через километр от старта тропа пересекает асфальтовую "
            "дорогу. В туман, дождь и сильный ветер на гребень не выходите."
        ),
        tags=("русский", "поход", "скалы", "трекинг"),
        stops=(
            SeedStop(
                "voroshilov_battery",
                "Оставляем машину на парковке музея.",
                15,
                StopKind.TRANSPORT,
                landmark="От парковки идите по подъездной дороге на восток — через двести метров путь сворачивает на юг, в лес.",
            ),
            SeedStop(
                kind=StopKind.WATER,
                title="Последняя вода",
                lat=42.981962,
                lng=131.891389,
                note="Дальше источников нет до самого мыса — наберите воду здесь.",
                landmark="Киоск у кассы музея, работает в часы работы батареи.",
                stay_min=5,
            ),
            SeedStop(
                kind=StopKind.REST,
                title="Привал на развилке",
                lat=42.971776,
                lng=131.884697,
                note="Треть пути позади. Ровное место в лесу, удобно перекусить перед выходом к морю.",
                landmark=(
                    "Лесная тропа выходит на грунтовку: поверните по ней направо, а через сотню метров, где "
                    "грунтовка уходит влево, идите прямо по тропе."
                ),
                stay_min=15,
            ),
            SeedStop(
                kind=StopKind.VIEWPOINT,
                title="Первый вид на море",
                lat=42.966726,
                lng=131.873333,
                note="Тропа выходит к берегу: впервые открываются море и скалы южного побережья.",
                landmark="Почти четыре километра от старта — тропа подходит к обрыву и дальше идёт вдоль берега.",
                stay_min=10,
            ),
            SeedStop(
                kind=StopKind.DANGER,
                title="Начало гребня",
                lat=42.948924,
                lng=131.874846,
                note="Мыс сужается до полусотни метров, с обеих сторон обрывы. Идите по одному и не подходите к краю: грунт осыпается.",
                landmark="Грунтовка заканчивается, дальше — каменистая тропа по гребню.",
            ),
            SeedStop(
                "mys_tobizina",
                "Конец мыса: скалы уходят в воду отвесной стеной.",
                40,
                StopKind.VIEWPOINT,
                landmark="Тропа заканчивается на скалах у самой оконечности мыса.",
            ),
        ),
        reviews=(
            SeedReview("kostya", 5, "Трудно, но оно того стоит. Обратно идите той же тропой.", 29),
            SeedReview("sveta", 5, "Лучший поход в черте города.", 70),
        ),
        saved_by="vera kostya sveta anya",
    ),
    SeedRoute(
        key="tobizina_cove",
        title="Пляж бухты Карпинского у тропы на Тобизина",
        description=(
            "Короткое ответвление от тропы на мыс Тобизина: спуститься к бухте Карпинского и пройти весь пляж до его "
            "южного края. Линию автор нарисовал по точкам вдоль верхнего края пляжа."
        ),
        kind=RouteKind.HIKE,
        author="sveta",
        age_days=40,
        difficulty=RouteDifficulty.EASY,
        path_mode=PathMode.DIRECT,
        tips="В шторм и при сильном накате по пляжу не ходите. Обратно — тем же путём к грунтовке и на тропу.",
        tags=("русский", "море", "пляж"),
        stops=(
            SeedStop(
                kind=StopKind.POI,
                title="Конец грунтовки над бухтой",
                lat=42.967424,
                lng=131.883122,
                note="Отсюда к воде ведёт короткий спуск.",
                landmark="Сюда выводит грунтовка, что уходит влево на развилке тропы к мысу Тобизина.",
            ),
            _via(42.966145, 131.8832),
            _via(42.966461, 131.883939),
            _via(42.966669, 131.884958),
            _via(42.966666, 131.885402),
            SeedStop(
                kind=StopKind.REST,
                title="Середина пляжа",
                lat=42.966607,
                lng=131.886,
                note="Галька, плавник и вид на всю бухту — удобное место для привала.",
                stay_min=20,
            ),
            _via(42.966305, 131.886895),
            _via(42.966264, 131.887273),
            _via(42.965922, 131.888093),
            _via(42.96523, 131.889123),
            _via(42.964723, 131.889444),
            _via(42.964171, 131.889463),
            SeedStop(
                kind=StopKind.VIEWPOINT,
                title="Южный край пляжа",
                lat=42.963117,
                lng=131.8887,
                note="Здесь пляж заканчивается — отсюда видна вся бухта.",
                stay_min=15,
            ),
        ),
        reviews=(
            SeedReview(
                "kostya", 5, "Свернули сюда на обратном пути с мыса — отличное место для привала.", 12
            ),
        ),
        saved_by="kostya roma",
    ),
    SeedRoute(
        key="saturday_plan",
        title="Суббота с родителями: центр без спешки",
        description="Личный план на выходные: показать родителям дворы, выпить кофе и дойти до моря.",
        kind=RouteKind.WALK,
        author="anya",
        age_days=2,
        visibility=RouteVisibility.PRIVATE,
        difficulty=RouteDifficulty.EASY,
        tips="Папе нельзя долго ходить по лестницам — в Миллионке идём только нижними дворами.",
        tags=("личное",),
        stops=(
            SeedStop(
                title="Встречаемся у фонтана",
                lat=43.11785,
                lng=131.88135,
                note="Договорились на 11:00.",
                landmark="Фонтан в верхней части Арбата, у скамеек.",
                stay_min=10,
            ),
            SeedStop("millionka", "Показать двор с галереями.", 20),
            SeedStop("gum_dvor", "Кофе и эклеры.", 40, StopKind.FOOD),
            SeedStop("pyanse", "Купить пянсе на пробу.", 10, StopKind.FOOD),
            SeedStop("sportivnaya_nab", "Дойти до воды и покормить чаек.", 30, StopKind.REST),
        ),
    ),
    SeedRoute(
        key="churkin_views",
        title="Чуркин: театр и видовая на два моста",
        description="Короткая прогулка от Приморской сцены к вершине сопки Бурачка.",
        kind=RouteKind.WALK,
        author="tim",
        age_days=1,
        difficulty=RouteDifficulty.MEDIUM,
        stops=(
            SeedStop("mariinsky", "Начинаем от театра.", 10),
            SeedStop("baby_room_kalina", "В торговом центре можно выпить кофе.", 15, StopKind.FOOD),
            SeedStop("sopka_burachka", "Подъём по тропе занимает минут двадцать.", 30, StopKind.VIEWPOINT),
        ),
    ),
)

COLLECTIONS: tuple[SeedCollection, ...] = (
    SeedCollection(
        title="Куда сводить гостей за один день",
        description="Проверенный набор: панорама, история, дворы и ужин с хинкали.",
        owner="anya",
        places=("orlinoe_gnezdo", "funicular", "s56", "millionka", "tokarevsky_mayak", "supra"),
        age_days=50,
    ),
    SeedCollection(
        title="Владивостокская крепость",
        description="Батареи и форты, по которым можно понять, как защищали город.",
        owner="vera",
        places=("bezymyannaya_battery", "novosiltsev_battery", "fort_pospelova", "voroshilov_battery"),
        age_days=110,
    ),
    SeedCollection(
        title="С коляской по центру",
        description="Пандусы, пеленальные столики и ровные дорожки — проверено лично.",
        owner="lena",
        places=(
            "toilet_sport_nab",
            "toilet_ussuri",
            "baby_room_kalina",
            "ramp_arseniev",
            "pokrovsky_park",
            "sportivnaya_nab",
        ),
        age_days=70,
    ),
    SeedCollection(
        title="Где покидать мяч",
        description="Баскетбольные и футбольные площадки с нормальным покрытием.",
        owner="igor",
        places=("basketball_dynamo", "streetball_center", "basketball_dvfu", "football_postysheva"),
        age_days=35,
    ),
    SeedCollection(
        title="Мои закаты",
        description="Личный список мест, куда я хожу провожать солнце.",
        owner="anya",
        places=("tokarevsky_mayak", "kungasny", "sopka_burachka", "buhta_patrokl"),
        age_days=25,
        is_public=False,
    ),
)
