import {
  CalendarPlus,
  CalendarSearch,
  History,
  LocateFixed,
  SearchX,
  Users,
  Wallet,
} from 'lucide-react';

import { Button, EmptyState } from '@/shared/ui';

import { countActiveFilters, useEventsFilters } from './filtersStore';
import { periodPhrase } from './period';
import { startCreateEvent } from './startCreateEvent';

/** Empty afisha — explains which filter emptied it and offers the most useful next step. */
export function EventsEmpty({ activeSearch }: { activeSearch: string }) {
  const filters = useEventsFilters();
  const period = periodPhrase(filters);

  if (activeSearch) {
    return (
      <EmptyState
        icon={SearchX}
        title="Ничего не нашлось"
        description={`По запросу «${activeSearch}» событий нет. Попробуйте другое слово.`}
        action={
          <Button variant="secondary" size="sm" onClick={() => filters.setSearch('')}>
            Очистить поиск
          </Button>
        }
      />
    );
  }
  if (filters.past) {
    return (
      <EmptyState
        icon={History}
        title="Прошедших событий нет"
        description="Здесь появятся события, которые уже закончились."
        action={
          <Button variant="secondary" size="sm" onClick={filters.togglePast}>
            К ближайшим событиям
          </Button>
        }
      />
    );
  }
  if (filters.radiusKm !== null) {
    return (
      <EmptyState
        icon={LocateFixed}
        title={`В радиусе ${filters.radiusKm} км событий нет`}
        description="Увеличьте радиус в фильтрах или посмотрите события по всему городу."
        action={
          <Button variant="secondary" size="sm" onClick={() => filters.setRadius(null)}>
            Весь город
          </Button>
        }
      />
    );
  }
  if (filters.kind === 'meetups') {
    return (
      <EmptyState
        icon={Users}
        title={period ? `Встреч ${period} нет` : 'Встреч пока нет'}
        description="Позовите соседей поиграть, погулять или навести порядок во дворе — это пара минут."
        action={
          period ? (
            <Button variant="secondary" size="sm" onClick={() => filters.setTime('any')}>
              Встречи на все даты
            </Button>
          ) : (
            <Button size="sm" icon={Users} onClick={() => startCreateEvent(true)}>
              Собрать встречу
            </Button>
          )
        }
      />
    );
  }
  if (filters.free) {
    return (
      <EmptyState
        icon={Wallet}
        title="Бесплатных событий не нашлось"
        description="Платные и события с неизвестной ценой скрыты фильтром «Бесплатные»."
        action={
          <Button variant="secondary" size="sm" onClick={filters.toggleFree}>
            Показать все
          </Button>
        }
      />
    );
  }
  if (period && filters.time !== 'month') {
    return (
      <EmptyState
        icon={CalendarSearch}
        title={`Событий ${period} нет`}
        description="Посмотрите, что будет в ближайший месяц, или добавьте своё событие."
        action={
          <Button variant="secondary" size="sm" onClick={() => filters.setTime('month')}>
            Показать месяц
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={CalendarPlus}
      title="Событий не нашлось"
      description="Ослабьте фильтры или станьте первым, кто расскажет о событии."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {countActiveFilters(filters) > 0 && (
            <Button variant="secondary" size="sm" onClick={filters.reset}>
              Сбросить фильтры
            </Button>
          )}
          <Button size="sm" icon={CalendarPlus} onClick={() => startCreateEvent(false)}>
            Создать событие
          </Button>
        </div>
      }
    />
  );
}
