import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { IconButton, SPRING, usePanelStore } from '@/shared/ui';

import { PANEL_GAP, PANEL_WIDTH, RAIL_WIDTH } from './layout';

const HIDDEN_X = -(PANEL_WIDTH + PANEL_GAP * 2);

/** Desktop container of the panel: a floating glass column that slides away when collapsed. */
export function SidePanel({ children }: { children: ReactNode }) {
  const collapsed = usePanelStore((state) => state.collapsed);
  const setCollapsed = usePanelStore((state) => state.setCollapsed);
  const left = RAIL_WIDTH + PANEL_GAP;

  return (
    <>
      <motion.aside
        aria-label="Панель раздела"
        inert={collapsed}
        initial={false}
        animate={{ x: collapsed ? HIDDEN_X : 0, opacity: collapsed ? 0 : 1 }}
        transition={SPRING.sheet}
        style={{ left, width: PANEL_WIDTH, top: PANEL_GAP, bottom: PANEL_GAP }}
        className="absolute z-30 overflow-hidden rounded-panel border border-line/60 shadow-float glass"
      >
        {children}
      </motion.aside>
      <motion.div
        initial={false}
        animate={{ x: collapsed ? 0 : PANEL_WIDTH + 8 }}
        transition={SPRING.sheet}
        style={{ left, top: PANEL_GAP + 8 }}
        className="absolute z-30"
      >
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? 'Показать панель' : 'Скрыть панель'}
          variant="surface"
          onClick={() => setCollapsed(!collapsed)}
        />
      </motion.div>
    </>
  );
}
