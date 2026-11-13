/**
 * «Потеряшки» (SPEC §26) — mirror of the lost-and-found part of docs/API.md. No public shape
 * carries a contact: only `LostResponse`, served to the two people of one response, has them.
 */
import type { Photo, UserBrief } from './types';

export type LostKind = 'lost' | 'found';
export type LostCategory =
  'documents' | 'keys' | 'phone' | 'wallet' | 'bag' | 'clothes' | 'jewelry' | 'pet' | 'other';
/** `returned` — «Вернули хозяину», closed by the author; `expired` — 30 days after creation. */
export type LostState = 'active' | 'returned' | 'expired';
export type LostResponseState = 'pending' | 'accepted' | 'declined';
/** How sure the owner is about the place; `null` — «не знаю где» (the whole city). */
export type LostRadius = 300 | 1000 | 3000;

export interface LostItemCard {
  id: number;
  kind: LostKind;
  category: LostCategory;
  title: string;
  description: string;
  lat: number;
  lng: number;
  radius_m: LostRadius | null;
  /** `YYYY-MM-DD`: the day it was lost or found. */
  happened_on: string;
  state: LostState;
  created_at: string;
  expires_at: string;
  author: UserBrief;
  cover_url: string | null;
  photos_count: number;
  /** The viewer's own post that did not pass the automatic check. */
  on_review: boolean;
}

export interface LostResponse {
  id: number;
  item_id: number;
  author: UserBrief;
  message: string;
  state: LostResponseState;
  created_at: string;
  decided_at: string | null;
  on_review: boolean;
  /** The responder's contact: theirs, and the post author's once accepted. */
  contact: string | null;
  /** The post author's contact: theirs, and the responder's once accepted. */
  owner_contact: string | null;
}

export interface LostItem extends LostItemCard {
  photos: Photo[];
  control_question: string | null;
  is_mine: boolean;
  can_respond: boolean;
  can_delete: boolean;
  can_moderate: boolean;
  /** Moderators only: hidden by reports or by a moderator. */
  is_hidden: boolean;
  reported_by_me: boolean;
  /** The author only. */
  pending_responses: number;
  my_response: LostResponse | null;
}

/** A post that may be the same thing; the reason is in plain words, never a score. */
export interface LostMatch {
  item: LostItemCard;
  reason: string;
}

export interface LostItemInput {
  kind: LostKind;
  category: LostCategory;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  radius_m?: LostRadius | null;
  happened_on: string;
  control_question?: string | null;
  photo_ids?: number[];
}

export interface LostQuery {
  kind?: LostKind;
  /** Comma-separated categories. */
  category?: string;
  /** `YYYY-MM-DD`: lost or found on this day or later. */
  since?: string;
  bbox?: string;
  limit?: number;
}

export interface LostSearchQuery {
  q?: string;
  category?: LostCategory;
  /** `<lat>,<lng>` */
  near?: string;
  radius_m?: LostRadius;
  lost_on?: string;
}
