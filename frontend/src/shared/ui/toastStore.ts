import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

/** Optional button in a toast, e.g. «Вернуть» after removing something. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

const TOAST_TTL_MS = 4500;
/** Toasts with an action (undo) stay longer — the user needs time to react. */
export const ACTION_TOAST_TTL_MS = 7000;
const MAX_TOASTS = 3;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message, action) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message, action }].slice(-MAX_TOASTS) });
    window.setTimeout(() => get().dismiss(id), action ? ACTION_TOAST_TTL_MS : TOAST_TTL_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((item) => item.id !== id) }),
}));

/** Imperative toasts, usable outside React: `toast.success('Сохранено')`. */
export const toast = {
  success: (message: string, action?: ToastAction) =>
    useToastStore.getState().push('success', message, action),
  error: (message: string) => useToastStore.getState().push('error', message),
  info: (message: string, action?: ToastAction) =>
    useToastStore.getState().push('info', message, action),
};
