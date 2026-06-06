/**
 * Pregnancy Scheduling Service.
 *
 * Manages weekly guidance delivery based on a mother's registration date
 * and current pregnancy week. Designed as interfaces + services so actual
 * cron/trigger implementation can be added later without code changes.
 */

import type { Language } from "@/types/database";

export interface ScheduledGuidance {
  motherId: string;
  phone: string;
  weekNumber: number;
  language: Language;
  content: string;
  title: string;
}

export interface GuidanceDeliveryRecord {
  motherId: string;
  weekNumber: number;
  deliveredAt: string;
}

/**
 * Calculate the current pregnancy week from the registration snapshot.
 * If a mother registered at week 20 three weeks ago, she's now at week 23.
 */
export function calculateCurrentWeek(
  registeredWeek: number,
  registrationDate: string
): number {
  const registered = new Date(registrationDate);
  const now = new Date();
  const elapsedMs = now.getTime() - registered.getTime();
  const elapsedWeeks = Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000));
  return Math.min(42, registeredWeek + elapsedWeeks);
}

/**
 * Determine which guidance weeks are due for a mother.
 * Returns week numbers that have milestone content and haven't been sent.
 */
export function getDueGuidanceWeeks(
  currentWeek: number,
  alreadySentWeeks: number[]
): number[] {
  const milestoneWeeks = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
  const sent = new Set(alreadySentWeeks);

  return milestoneWeeks.filter(
    (w) => w <= currentWeek && !sent.has(w)
  );
}

/**
 * Scheduler interface — implemented by cron, webhook trigger, or manual call.
 */
export interface GuidanceScheduler {
  checkAndSendGuidance(motherId: string): Promise<ScheduledGuidance[]>;
  getDeliveryHistory(motherId: string): Promise<GuidanceDeliveryRecord[]>;
  markDelivered(motherId: string, weekNumber: number): Promise<void>;
}
