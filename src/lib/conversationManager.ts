/**
 * Conversation Manager — multi-turn conversation state machine.
 *
 * Tracks what question the system last asked, what we're waiting for,
 * and interprets short follow-up responses in context.
 */

import type { ConversationState, ConversationStateUpdate } from "@/types/database";
import { getConversationState, updateConversationState } from "./supabase";

export interface ConversationContext {
  state: ConversationState["state"];
  pendingQuestion: string | null;
  pendingContext: Record<string, unknown>;
  lastIntent: string | null;
  lastRiskLevel: string | null;
}

export interface FollowupResolution {
  resolved: boolean;
  escalate: boolean;
  symptoms: string[];
  interpretation: string;
}

const AFFIRMATIVE = new Set([
  "yes", "awo", "ishi", "ok", "okay", "yeah", "yep", "eya", "ehi",
  "eeyyee", "tole", "mhm", "1",
]);

const NEGATIVE = new Set([
  "no", "aye", "nope", "nah", "lakki", "miti", "2", "yelem",
]);

export async function getContext(motherId: string): Promise<ConversationContext> {
  const state = await getConversationState(motherId);

  if (!state) {
    return {
      state: "idle",
      pendingQuestion: null,
      pendingContext: {},
      lastIntent: null,
      lastRiskLevel: null,
    };
  }

  return {
    state: state.state,
    pendingQuestion: state.pending_question,
    pendingContext: state.pending_context ?? {},
    lastIntent: state.last_intent,
    lastRiskLevel: state.last_risk_level,
  };
}

export async function updateContext(
  motherId: string,
  updates: Partial<ConversationContext>
): Promise<void> {
  const mapped: ConversationStateUpdate = {};

  if (updates.state !== undefined) mapped.state = updates.state;
  if (updates.pendingQuestion !== undefined) mapped.pending_question = updates.pendingQuestion;
  if (updates.pendingContext !== undefined) mapped.pending_context = updates.pendingContext;
  if (updates.lastIntent !== undefined) mapped.last_intent = updates.lastIntent;
  if (updates.lastRiskLevel !== undefined) mapped.last_risk_level = updates.lastRiskLevel;

  await updateConversationState(motherId, mapped);
}

/**
 * Interpret a short follow-up response in the context of
 * the last question the system asked.
 */
export function resolveFollowup(
  response: string,
  context: ConversationContext
): FollowupResolution {
  const lower = response.trim().toLowerCase();
  const words = lower.split(/\s+/);
  const isAffirmative = words.some((w) => AFFIRMATIVE.has(w));
  const isNegative = words.some((w) => NEGATIVE.has(w));

  if (!context.pendingQuestion) {
    return {
      resolved: false,
      escalate: false,
      symptoms: [],
      interpretation: "No pending question to resolve",
    };
  }

  const pending = context.pendingQuestion.toLowerCase();
  const pendingCtx = context.pendingContext;

  // Symptom confirmation: "Do you have vision changes?" → "yes"
  if (pendingCtx.askingAboutSymptom && isAffirmative) {
    const symptom = String(pendingCtx.askingAboutSymptom);
    return {
      resolved: true,
      escalate: true,
      symptoms: [symptom],
      interpretation: `Confirmed: ${symptom}`,
    };
  }

  if (pendingCtx.askingAboutSymptom && isNegative) {
    return {
      resolved: true,
      escalate: false,
      symptoms: [],
      interpretation: `Denied: ${String(pendingCtx.askingAboutSymptom)}`,
    };
  }

  // Pregnancy week question: response should contain a number
  if (pending.includes("month") || pending.includes("wer") || pending.includes("week")) {
    const numMatch = lower.match(/\d+/);
    if (numMatch) {
      return {
        resolved: true,
        escalate: false,
        symptoms: [],
        interpretation: `Pregnancy info: ${numMatch[0]}`,
      };
    }
  }

  // Generic affirmative/negative
  if (isAffirmative) {
    return {
      resolved: true,
      escalate: context.lastRiskLevel === "high",
      symptoms: [],
      interpretation: "Affirmative response",
    };
  }

  if (isNegative) {
    return {
      resolved: true,
      escalate: false,
      symptoms: [],
      interpretation: "Negative response",
    };
  }

  return {
    resolved: false,
    escalate: false,
    symptoms: [],
    interpretation: "Could not interpret follow-up",
  };
}
