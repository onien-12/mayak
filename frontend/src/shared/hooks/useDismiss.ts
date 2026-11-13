import { useEffect, useEffectEvent } from 'react';

import { markPressHandled } from '../lib/pressGuard';

/** Calls `onDismiss` on Escape or a pointer press outside of all `elements`. */
export function useDismiss(
  active: boolean,
  elements: readonly (HTMLElement | null)[],
  onDismiss: () => void,
): void {
  const isInside = useEffectEvent((target: Node) =>
    elements.some((element) => element?.contains(target)),
  );
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: PointerEvent) => {
      if (isInside(event.target as Node)) return;
      markPressHandled();
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}
