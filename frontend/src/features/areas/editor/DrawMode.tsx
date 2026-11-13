import { Eraser, Trash2, Undo2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/format';
import { polygonAreaM2 } from '@/shared/lib/polygon';
import { Button, IconButton } from '@/shared/ui';

import { formatSquare, outlineGeometry, outlineProblem } from '../lib/geometry';
import { DrawLayer } from './DrawLayer';
import type { Outline } from './useOutline';

const VERTEX_FORMS = ['точка', 'точки', 'точек'] as const;

/** «Нарисовать на карте»: live size or what is wrong, undo / clear / delete a vertex, hints. */
export function DrawMode({ outline }: { outline: Outline }) {
  const { vertices, selected } = outline;
  const problem = outlineProblem(vertices);
  const size = problem ? null : formatSquare(polygonAreaM2(outlineGeometry(vertices)));

  return (
    <div className="flex flex-col gap-2">
      <DrawLayer outline={outline} />
      <div className="flex items-center gap-1">
        <p
          aria-live="polite"
          className={cn(
            'mr-auto min-w-0 truncate text-sm font-semibold',
            problem ? 'text-warning-ink' : 'text-success-ink',
          )}
        >
          {problem ?? `${pluralize(vertices.length, VERTEX_FORMS)} · ${size}`}
        </p>
        {selected !== null && (
          <Button size="sm" variant="soft" icon={Trash2} onClick={() => outline.remove(selected)}>
            Удалить точку
          </Button>
        )}
        <IconButton
          icon={Undo2}
          label="Отменить"
          disabled={!outline.canUndo}
          onClick={outline.undo}
        />
        <IconButton
          icon={Eraser}
          label="Очистить"
          disabled={vertices.length === 0}
          onClick={outline.clear}
        />
      </div>
      <p className="text-sm text-ink-soft">
        Нажимайте на карту по краю территории. Точку можно перетащить, удержание — удалить, кружок
        на стороне добавляет точку.
      </p>
    </div>
  );
}
