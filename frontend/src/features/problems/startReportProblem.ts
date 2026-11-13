import { requireAuth } from '@/features/auth';
import { openCreatePlace } from '@/features/places';

/** Opens the create wizard already set to a problem: the layer step is skipped. */
export function startReportProblem(): void {
  requireAuth(() => openCreatePlace({ layer: 'issue' }), 'чтобы сообщить о проблеме');
}
