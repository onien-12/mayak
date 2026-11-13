import type { RatingSource } from '@/shared/api';

interface SourceLook {
  /** «Яндекс Карты» — the name next to the mark. */
  name: string;
  /** «Яндекс Карт» — after «из»: «Отзыв из Яндекс Карт», «Загрузить ещё из 2ГИС». */
  from: string;
  /** The monogram inside the mark (the «Маяк» mark is the lighthouse). */
  letter: string;
  className: string;
}

/** How each rating source is named and marked across the reviews UI. */
export const SOURCE_LOOKS: Record<RatingSource, SourceLook> = {
  mayak: { name: 'Маяк', from: 'Маяка', letter: '', className: '' },
  yandex: {
    name: 'Яндекс Карты',
    from: 'Яндекс Карт',
    letter: 'Я',
    className: 'bg-[#FC3F1D] text-white',
  },
  '2gis': { name: '2ГИС', from: '2ГИС', letter: '2', className: 'bg-[#19AA1E] text-white' },
  google: {
    name: 'Google Maps',
    from: 'Google Maps',
    letter: 'G',
    className: 'bg-surface text-[#4285F4] ring-1 ring-line ring-inset',
  },
};

/** «Яндекс Карты». */
export const sourceName = (source: RatingSource) => SOURCE_LOOKS[source].name;
/** «Яндекс Карт» — the form after «из». */
export const sourceFrom = (source: RatingSource) => SOURCE_LOOKS[source].from;
