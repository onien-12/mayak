import { api } from './client';
import type {
  OutageAddressMatch,
  OutageBuildingPoint,
  OutageBuildingsQuery,
  OutageSummary,
} from './types';

/** Address-level view of imported utility outages (the outages themselves are `issue` places). */
export const outagesApi = {
  summary: () => api.get<OutageSummary>('/outages/summary'),
  /** One entry per house with all its current outages; at most 2000. */
  buildings: (query: OutageBuildingsQuery, signal?: AbortSignal) =>
    api.get<OutageBuildingPoint[]>('/outages/buildings', { ...query }, signal),
  /** «Проверить мой адрес»: free-text address → up to 10 matching houses with their outages. */
  check: (q: string, signal?: AbortSignal) =>
    api.get<OutageAddressMatch[]>('/outages/check', { q }, signal),
};
