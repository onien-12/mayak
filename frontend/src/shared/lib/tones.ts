import type { Layer } from '../api/types';

/** Semantic colour roles shared by badges, chips, banners and icons. */
export type Tone =
  'neutral' | 'brand' | 'beam' | 'success' | 'warning' | 'danger' | 'official' | Layer;

export interface ToneClasses {
  /** Tinted background with dark readable text — chips, badges, banners. */
  soft: string;
  /** Saturated background with contrast text — markers, active toggles. */
  solid: string;
  /** Coloured text / icon on a white surface. */
  text: string;
  /** Saturated background only (dots, bars). */
  fill: string;
  /** Coloured border. */
  border: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  neutral: {
    soft: 'bg-canvas text-ink-soft',
    solid: 'bg-ink-soft text-white',
    text: 'text-ink-soft',
    fill: 'bg-ink-faint',
    border: 'border-line',
  },
  brand: {
    soft: 'bg-brand-soft text-brand',
    solid: 'bg-brand text-white',
    text: 'text-brand',
    fill: 'bg-brand',
    border: 'border-brand',
  },
  beam: {
    soft: 'bg-beam-soft text-ink',
    solid: 'bg-beam text-ink',
    text: 'text-warning-ink',
    fill: 'bg-beam',
    border: 'border-beam',
  },
  success: {
    soft: 'bg-success-soft text-success-ink',
    solid: 'bg-success text-white',
    text: 'text-success-ink',
    fill: 'bg-success',
    border: 'border-success',
  },
  warning: {
    soft: 'bg-warning-soft text-warning-ink',
    solid: 'bg-warning text-ink',
    text: 'text-warning-ink',
    fill: 'bg-warning',
    border: 'border-warning',
  },
  danger: {
    soft: 'bg-danger-soft text-danger-ink',
    solid: 'bg-danger text-white',
    text: 'text-danger-ink',
    fill: 'bg-danger',
    border: 'border-danger',
  },
  official: {
    soft: 'bg-official-soft text-official-ink',
    solid: 'bg-official text-white',
    text: 'text-official-ink',
    fill: 'bg-official',
    border: 'border-official',
  },
  infrastructure: {
    soft: 'bg-infrastructure-soft text-infrastructure-ink',
    solid: 'bg-infrastructure text-white',
    text: 'text-infrastructure-ink',
    fill: 'bg-infrastructure',
    border: 'border-infrastructure',
  },
  event: {
    soft: 'bg-event-soft text-event-ink',
    solid: 'bg-event text-white',
    text: 'text-event-ink',
    fill: 'bg-event',
    border: 'border-event',
  },
  tourism: {
    soft: 'bg-tourism-soft text-tourism-ink',
    solid: 'bg-tourism text-white',
    text: 'text-tourism-ink',
    fill: 'bg-tourism',
    border: 'border-tourism',
  },
  issue: {
    soft: 'bg-issue-soft text-issue-ink',
    solid: 'bg-issue text-white',
    text: 'text-issue-ink',
    fill: 'bg-issue',
    border: 'border-issue',
  },
};
