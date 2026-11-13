/**
 * Quests (SPEC §27) — mirror of the quest part of docs/API.md. A player only ever receives the
 * stages already passed and, of the current one, what `QuestCurrentStage` carries.
 */
import type { Photo, RouteStatus, RouteVisibility, ScreeningHold, UserBrief } from './types';

export type QuestCondition = 'arrival' | 'code' | 'answer';
export type QuestZone = 'riddle' | 'circle';
export type QuestSort = 'new' | 'popular' | 'rating';

export interface QuestsQuery {
  q?: string;
  author_id?: number;
  sort?: QuestSort;
  limit?: number;
  offset?: number;
}

/** Where the quest starts — the only point of a quest anyone may see. */
export interface QuestStart {
  title: string;
  lat: number;
  lng: number;
}

export interface QuestCard {
  id: number;
  title: string;
  description: string;
  status: RouteStatus;
  visibility: RouteVisibility;
  cover_url: string | null;
  stages_count: number;
  duration_min: number;
  rating_avg: number | null;
  rating_count: number;
  /** Players who finished it (test runs aside). */
  finished_count: number;
  start: QuestStart;
  author: UserBrief;
  created_at: string;
  updated_at: string;
}

export interface QuestRunBrief {
  id: number;
  is_team: boolean;
  team_name: string | null;
  is_test: boolean;
  stage_number: number;
  stages_total: number;
}

export interface QuestResult {
  rank: number;
  /** Team name, or the player's display name. */
  name: string;
  is_team: boolean;
  members_count: number;
  /** Seconds from the start to the last stage plus 5 minutes per hint. */
  result_s: number;
  hints: number;
  finished_at: string;
  is_mine: boolean;
}

export interface QuestDetail extends QuestCard {
  can_edit: boolean;
  my_run: QuestRunBrief | null;
  my_result: QuestResult | null;
  /** Finished at least once (test runs aside): may rate it. */
  has_finished: boolean;
  my_rating: number | null;
  screening_hold: ScreeningHold | null;
}

/** A stage as its author and moderators see it. */
export interface QuestStage {
  id: number;
  position: number;
  title: string;
  lat: number;
  lng: number;
  place_id: number | null;
  riddle: string;
  photo: Photo | null;
  condition: QuestCondition;
  check_arrival: boolean;
  radius_m: number;
  question: string;
  answers: string[];
  hint: string;
  reward: string;
  zone: QuestZone;
  zone_radius_m: number | null;
  /** The centre players see, moved off the point. */
  zone_center: { lat: number; lng: number } | null;
}

export interface QuestEditor extends QuestDetail {
  cover_photo: Photo | null;
  stages: QuestStage[];
}

export interface QuestStageInput {
  /** An existing stage of the quest being edited: runs in progress keep their place in it. */
  id?: number | null;
  title: string;
  lat: number;
  lng: number;
  place_id?: number | null;
  riddle: string;
  photo_id?: number | null;
  condition: QuestCondition;
  check_arrival?: boolean;
  radius_m?: number;
  question?: string;
  answers?: string[];
  hint?: string;
  reward?: string;
  zone?: QuestZone;
  zone_radius_m?: number | null;
}

export interface QuestInput {
  title: string;
  description?: string;
  start_title: string;
  start_lat: number;
  start_lng: number;
  duration_min: number;
  cover_photo_id?: number | null;
  visibility?: RouteVisibility;
  stages: QuestStageInput[];
}

export interface QuestSearchZone {
  lat: number;
  lng: number;
  radius_m: number;
}

export interface QuestRunMember {
  user: UserBrief;
  is_captain: boolean;
  is_lead: boolean;
}

export interface QuestPassedStage {
  position: number;
  title: string;
  lat: number;
  lng: number;
  /** The story of the place. */
  reward: string;
  passed_at: string | null;
  passed_by: UserBrief | null;
  hint_used: boolean;
}

/** The stage the run is on: never its place, code, answers or story. */
export interface QuestCurrentStage {
  position: number;
  condition: QuestCondition;
  /** The server checks the player's position (always for `arrival`). */
  check_arrival: boolean;
  /** `null` for a team member who does not hold this riddle. */
  riddle: string | null;
  photo: Photo | null;
  /** Team runs: who holds the riddle of this stage. */
  riddle_holder: UserBrief | null;
  question: string | null;
  has_hint: boolean;
  /** Set once the hint was taken. */
  hint: string | null;
  zone: QuestSearchZone | null;
  tries_left: number;
  locked_until: string | null;
}

export interface QuestRun {
  id: number;
  quest_id: number;
  quest_title: string;
  start: QuestStart;
  is_team: boolean;
  team_name: string | null;
  join_code: string | null;
  is_test: boolean;
  captain_id: number;
  members: QuestRunMember[];
  stages_total: number;
  /** 1-based; `stages_total + 1` once finished. */
  stage_number: number;
  finished: boolean;
  abandoned: boolean;
  started_at: string;
  finished_at: string | null;
  hints_taken: number;
  penalty_min: number;
  result_s: number | null;
  passed: QuestPassedStage[];
  current: QuestCurrentStage | null;
  /** A test run: arrival can be confirmed by a button. */
  can_confirm_on_site: boolean;
  ranked: boolean;
}

export interface QuestRunStartInput {
  team?: boolean;
  team_name?: string;
  test?: boolean;
}

export interface QuestCheckInput {
  stage: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  answer?: string;
  on_site?: boolean;
}

export interface QuestCheckResult {
  passed: boolean;
  message: string;
  run: QuestRun;
}
