import { useSearchParams } from 'react-router';

export type CatalogView = 'routes' | 'quests';

const VIEW_PARAM = 'view';

/** Which half of «Маршруты» is open; kept in the URL so «назад» from a quest returns here. */
export function useCatalogView(): [CatalogView, (view: CatalogView) => void] {
  const [params, setParams] = useSearchParams();
  const view: CatalogView = params.get(VIEW_PARAM) === 'quests' ? 'quests' : 'routes';
  const setView = (next: CatalogView) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'quests') updated.set(VIEW_PARAM, 'quests');
        else updated.delete(VIEW_PARAM);
        return updated;
      },
      { replace: true },
    );
  return [view, setView];
}
