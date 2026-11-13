import { createContext, use } from 'react';

interface PanelSection {
  /** True while the place card or the editor is shown on top of the section. */
  covered: boolean;
}

export const PanelSectionContext = createContext<PanelSection>({ covered: false });

/** Lets a panel section know whether it is currently covered by the place card / editor. */
export function usePanelSection(): PanelSection {
  return use(PanelSectionContext);
}
