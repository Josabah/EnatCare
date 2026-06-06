/**
 * Message Processor — the core pipeline.
 *
 * Three steps:
 * 1. AI understands the message (Hasab)
 * 2. Rules assess risk (deterministic)
 * 3. AI writes the response (Hasab)
 *
 * Everything else is infrastructure: dedup, storage, SMS transport.
 */

import type { RiskAssessment, ResponseMessage } from "@/types/risk";
import type { Mother, Language, MessageChannel, MessageIntent } from "@/types/database";
import { understandMessage, type MessageUnderstanding } from "./hasab";
import { evaluateRisk } from "./riskEngine";
import { generateResponse } from "./responseGenerator";
import { getContext, updateContext, resolveFollowup } from "./conversationManager";
import { generateMessageHash } from "./idempotency";
import { logInbound, logOutbound, logTrace, traceStart, traceEnd } from "./logger";
import {
  findOrCreateMother,
  updateMother,
  storeMessage,
  storeRiskEvent,
  storeTrace,
  checkDuplicate,
  getRecentMessages,
} from "./supabase";
import { sendSMS } from "./smsGateway";

export interface ProcessingResult {
  mother: Mother;
  understanding: MessageUnderstanding;
  assessment: RiskAssessment;
  response: ResponseMessage;
  intent: MessageIntent;
  smsSent: boolean;
  deduplicated?: boolean;
}

export interface ProcessingOptions {
  channel?: MessageChannel;
  skipSms?: boolean;
}

export async function processIncomingMessage(
  phone: string,
  rawMessage: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  const channel = options.channel ?? "web";
  const skipSms = options.skipSms ?? channel !== "sms";
  const traceId = crypto.randomUUID();

  traceStart(traceId);
  logInbound(phone, rawMessage, channel);

  let mother: Mother | null = null;
  let understanding: MessageUnderstanding = {
    language: "en", pregnancyRelated: true, pregnancyWeek: null,
    symptoms: [], questions: [], emotionalState: "neutral",
    missingInformation: [], messageSummary: "", confidence: 0,
  };
  let assessment: RiskAssessment = {
    level: "low", symptoms: [], reasoning: "No symptoms detected",
    recommendedAction: "", followUpQuestions: [],
  };
  let responseText = "";
  let error: string | null = null;

  try {
    // ── Infrastructure: find mother, deduplicate ────────

    mother = await findOrCreateMother(phone);
    const isNewMother = !mother.pregnancy_week;

    const messageHash = generateMessageHash(phone, rawMessage);
    const isDuplicate = await checkDuplicate(mother.id, messageHash);

    if (isDuplicate) {
      logTrace({
        phone, channel, rawMessage, detectedLanguage: null,
        intent: "duplicate", extractedSymptoms: [], pregnancyWeek: null,
        riskLevel: null, responseText: null, processingTimeMs: traceEnd(traceId),
        error: null, motherId: mother.id, messageId: null,
      });
      return {
        mother, understanding, assessment,
        response: { text: "", language: "en", riskLevel: "low", includesGuidance: false },
        intent: "unknown", smsSent: false, deduplicated: true,
      };
    }

    const inboundMsg = await storeMessage({
      mother_id: mother.id, channel, direction: "inbound",
      message: rawMessage, raw_message: rawMessage,
      message_hash: messageHash, processing_status: "processing",
    });

    // ── Conversation context ───────────────────────────

    const convContext = await getContext(mother.id);
    const recentMsgs = await getRecentMessages(mother.id, 6);
    const conversationHistory = recentMsgs
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Mother" : "EnatAI"}: ${m.message}`);

    // ── STEP 1: AI understands the message ─────────────

    understanding = await understandMessage(rawMessage, {
      conversationHistory,
      pregnancyWeek: mother.pregnancy_week,
      pendingQuestion: convContext.pendingQuestion,
    });

    // Handle follow-ups: if awaiting and got a short response
    if (convContext.state === "awaiting_followup" && rawMessage.trim().split(/\s+/).length <= 3) {
      const resolution = resolveFollowup(rawMessage, convContext);
      if (resolution.resolved && resolution.escalate && resolution.symptoms.length > 0) {
        understanding.symptoms = [...new Set([...understanding.symptoms, ...resolution.symptoms])];
      }
    }

    // ── STEP 2: Rules assess risk ──────────────────────

    if (understanding.symptoms.length > 0) {
      assessment = evaluateRisk({
        language: understanding.language,
        symptoms: understanding.symptoms,
        pregnancyWeek: understanding.pregnancyWeek ?? mother.pregnancy_week ?? null,
        urgency: "low",
        confidence: understanding.confidence,
      });
    }

    // ── Update mother record ───────────────────────────

    const updates: Partial<Pick<Mother, "preferred_language" | "pregnancy_week">> = {};

    if (understanding.language !== "en" && understanding.language !== "mixed") {
      updates.preferred_language = understanding.language as Language;
    }

    if (understanding.pregnancyWeek !== null) {
      updates.pregnancy_week = understanding.pregnancyWeek;
    }

    if (Object.keys(updates).length > 0) {
      mother = await updateMother(mother.id, updates);
    }

    // ── STEP 3: AI writes the response ─────────────────

    responseText = await generateResponse({
      rawMessage,
      understanding,
      assessment,
      language: understanding.language,
      pregnancyWeek: mother.pregnancy_week ?? understanding.pregnancyWeek,
      motherName: mother.name,
      conversationHistory,
      pendingQuestion: convContext.pendingQuestion,
      isNewMother,
    });

    // ── Infrastructure: store, update state, send ──────

    if (assessment.level !== "low" || assessment.symptoms.length > 0) {
      await storeRiskEvent({
        mother_id: mother.id,
        risk_level: assessment.level,
        symptoms: assessment.symptoms.map((s) => s.name),
        reasoning: assessment.reasoning,
      });
    }

    const primaryIntent = deriveIntent(understanding);

    await storeMessage({
      mother_id: mother.id, channel, direction: "outbound",
      message: responseText, risk_level: assessment.level,
      intent: primaryIntent, processing_status: "completed",
    });

    const nextState = determineNextState(understanding, assessment, isNewMother);
    await updateContext(mother.id, {
      state: nextState.state,
      pendingQuestion: nextState.pendingQuestion,
      pendingContext: nextState.pendingContext,
      lastIntent: primaryIntent,
      lastRiskLevel: assessment.level,
    });

    let smsSent = false;
    if (!skipSms && responseText) {
      const smsResult = await sendSMS(phone, responseText);
      smsSent = smsResult.success;
    }

    logOutbound(phone, assessment.level, smsSent);

    const processingTimeMs = traceEnd(traceId);
    await storeTrace({
      mother_id: mother.id, message_id: inboundMsg.id, phone,
      raw_message: rawMessage, channel,
      detected_language: understanding.language,
      intent: primaryIntent,
      extracted_symptoms: understanding.symptoms,
      pregnancy_week: understanding.pregnancyWeek,
      risk_level: assessment.level,
      response_text: responseText,
      processing_time_ms: processingTimeMs,
    });

    return {
      mother, understanding, assessment,
      response: {
        text: responseText, language: understanding.language,
        riskLevel: assessment.level,
        includesGuidance: assessment.level === "low" && (mother.pregnancy_week ?? understanding.pregnancyWeek) !== null,
      },
      intent: primaryIntent, smsSent,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
    const processingTimeMs = traceEnd(traceId);

    logTrace({
      phone, channel, rawMessage, detectedLanguage: understanding.language,
      intent: "unknown", extractedSymptoms: understanding.symptoms,
      pregnancyWeek: understanding.pregnancyWeek, riskLevel: assessment.level,
      responseText: null, processingTimeMs, error,
      motherId: mother?.id ?? null, messageId: null,
    });

    if (mother) {
      await storeTrace({
        mother_id: mother.id, phone, raw_message: rawMessage, channel,
        detected_language: understanding.language, intent: "unknown",
        extracted_symptoms: understanding.symptoms,
        pregnancy_week: understanding.pregnancyWeek,
        risk_level: assessment.level,
        processing_time_ms: processingTimeMs, error,
      }).catch(() => {});
    }

    throw err;
  }
}

// ── Derive a primary intent label for storage ──────────

function deriveIntent(u: MessageUnderstanding): MessageIntent {
  if (!u.pregnancyRelated) return "unrelated";
  if (u.symptoms.length > 0) return "symptom_report";
  if (u.pregnancyWeek !== null) return "registration";
  if (u.questions.length > 0) return "pregnancy_question";
  return "greeting";
}

// ── Conversation state transitions ─────────────────────

function determineNextState(
  understanding: MessageUnderstanding,
  assessment: RiskAssessment,
  isNewMother: boolean
): {
  state: "idle" | "awaiting_followup" | "awaiting_registration" | "awaiting_clarification";
  pendingQuestion: string | null;
  pendingContext: Record<string, unknown>;
} {
  if (understanding.symptoms.length > 0 && assessment.followUpQuestions.length > 0) {
    const question = assessment.followUpQuestions[0];
    const symptom = inferSymptom(question);
    return {
      state: "awaiting_followup",
      pendingQuestion: question,
      pendingContext: symptom ? { askingAboutSymptom: symptom } : {},
    };
  }

  if (isNewMother && understanding.pregnancyWeek === null) {
    return {
      state: "awaiting_registration",
      pendingQuestion: "How many months pregnant are you?",
      pendingContext: {},
    };
  }

  return { state: "idle", pendingQuestion: null, pendingContext: {} };
}

function inferSymptom(question: string): string | null {
  const q = question.toLowerCase();
  if (q.includes("vision")) return "vision changes";
  if (q.includes("bleeding")) return "bleeding";
  if (q.includes("headache")) return "headache";
  if (q.includes("movement") || q.includes("move")) return "no fetal movement";
  if (q.includes("pain")) return "abdominal pain";
  if (q.includes("fever")) return "fever";
  if (q.includes("swelling")) return "swelling";
  return null;
}
