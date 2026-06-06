import type { PregnancyContext, RiskAssessment, ResponseMessage } from "@/types/risk";
import type { Mother, Language, MessageChannel, MessageIntent } from "@/types/database";
import { normalizeMessage, extractPregnancyWeekFromText } from "./normalization";
import { extractPregnancyContext } from "./hasab";
import { processContext } from "./riskEngine";
import { classifyMessage } from "./intentClassifier";
import { generateResponse as generateAiResponse, type ResponseContext } from "./responseGenerator";
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
  context: PregnancyContext;
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

/**
 * Central message processing orchestration.
 *
 * 1.  Idempotency check (deduplicate webhook retries)
 * 2.  Find or create mother
 * 3.  Classify intent
 * 4.  Check conversation state (multi-turn)
 * 5.  Normalize text
 * 6.  Extract pregnancy context (Hasab AI)
 * 7.  Assess risk (deterministic rules)
 * 8.  Generate response (AI-powered, intent-aware)
 * 9.  Update mother record
 * 10. Store risk event
 * 11. Store messages + trace
 * 12. Update conversation state
 * 13. Send reply
 */
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
  let intent: MessageIntent = "unknown";
  let context: PregnancyContext = {
    language: "en",
    symptoms: [],
    pregnancyWeek: null,
    urgency: "low",
    confidence: 0,
  };
  let assessment: RiskAssessment = {
    level: "low",
    symptoms: [],
    reasoning: "No assessment performed",
    recommendedAction: "",
    followUpQuestions: [],
  };
  let responseText = "";
  let error: string | null = null;

  try {
    // 1. Find or create mother
    mother = await findOrCreateMother(phone);

    // 2. Idempotency — check for duplicate
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
        mother,
        context,
        assessment,
        response: { text: "", language: "en", riskLevel: "low", includesGuidance: false },
        intent: "unknown",
        smsSent: false,
        deduplicated: true,
      };
    }

    // 3. Store inbound message with processing status
    const inboundMsg = await storeMessage({
      mother_id: mother.id,
      channel,
      direction: "inbound",
      message: rawMessage,
      raw_message: rawMessage,
      message_hash: messageHash,
      processing_status: "processing",
    });

    // 4. Classify intent
    const classification = classifyMessage(rawMessage);
    intent = classification.intent;

    // 5. Check conversation state for multi-turn context
    const convContext = await getContext(mother.id);

    // If we're awaiting a follow-up and got a short response, resolve it
    if (convContext.state === "awaiting_followup" && intent === "followup_response") {
      const resolution = resolveFollowup(rawMessage, convContext);
      if (resolution.resolved && resolution.escalate && resolution.symptoms.length > 0) {
        intent = "symptom_report";
        // Merge confirmed symptoms into the message for extraction
      }
    }

    // 6. Normalize + extract (for symptom reports and registration)
    const normalization = normalizeMessage(rawMessage);
    context = await extractPregnancyContext(rawMessage);

    if (context.pregnancyWeek === null) {
      const ruleWeek = extractPregnancyWeekFromText(rawMessage);
      if (ruleWeek !== null) context.pregnancyWeek = ruleWeek;
    }

    if (
      normalization.detectedLanguage !== "en" &&
      context.language === "en" &&
      context.confidence < 0.7
    ) {
      context.language = normalization.detectedLanguage;
    }

    // 7. Risk assessment (rules engine — only for symptom reports)
    if (intent === "symptom_report" || context.symptoms.length > 0) {
      const result = processContext(context);
      assessment = result.assessment;
    }

    // 8. Update mother record
    const updates: Partial<Pick<Mother, "preferred_language" | "pregnancy_week">> = {};

    if (context.language !== "en" && context.language !== "mixed") {
      updates.preferred_language = context.language as Language;
    } else if (!mother.preferred_language) {
      updates.preferred_language = normalization.detectedLanguage;
    }

    if (context.pregnancyWeek !== null) {
      updates.pregnancy_week = context.pregnancyWeek;
    }

    const updatedMother =
      Object.keys(updates).length > 0
        ? await updateMother(mother.id, updates)
        : mother;
    mother = updatedMother;

    // 9. Generate response (AI-powered, intent-aware)
    const recentMsgs = await getRecentMessages(mother.id, 6);
    const conversationHistory = recentMsgs
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Mother" : "EnatAI"}: ${m.message}`);

    const responseCtx: ResponseContext = {
      intent,
      language: context.language,
      pregnancyWeek: mother.pregnancy_week ?? context.pregnancyWeek,
      motherName: mother.name,
      assessment: intent === "symptom_report" || context.symptoms.length > 0 ? assessment : null,
      conversationHistory,
      pendingQuestion: convContext.pendingQuestion,
    };

    responseText = await generateAiResponse(responseCtx);

    // 10. Store risk event
    if (assessment.level !== "low" || assessment.symptoms.length > 0) {
      await storeRiskEvent({
        mother_id: mother.id,
        risk_level: assessment.level,
        symptoms: assessment.symptoms.map((s) => s.name),
        reasoning: assessment.reasoning,
      });
    }

    // 11. Update inbound message as completed
    // (We already stored it with processing status; update isn't critical for V1)

    // 12. Store outbound message
    await storeMessage({
      mother_id: mother.id,
      channel,
      direction: "outbound",
      message: responseText,
      risk_level: assessment.level,
      intent,
      processing_status: "completed",
    });

    // 13. Update conversation state
    const nextState = determineNextState(intent, assessment);
    await updateContext(mother.id, {
      state: nextState.state,
      pendingQuestion: nextState.pendingQuestion,
      pendingContext: nextState.pendingContext,
      lastIntent: intent,
      lastRiskLevel: assessment.level,
    });

    // 14. Send SMS
    let smsSent = false;
    if (!skipSms && responseText) {
      const smsResult = await sendSMS(phone, responseText);
      smsSent = smsResult.success;
    }

    logOutbound(phone, assessment.level, smsSent);

    const processingTimeMs = traceEnd(traceId);
    await storeTrace({
      mother_id: mother.id,
      message_id: inboundMsg.id,
      phone,
      raw_message: rawMessage,
      channel,
      detected_language: context.language,
      intent,
      extracted_symptoms: context.symptoms,
      pregnancy_week: context.pregnancyWeek,
      risk_level: assessment.level,
      response_text: responseText,
      processing_time_ms: processingTimeMs,
    });

    return {
      mother,
      context,
      assessment,
      response: {
        text: responseText,
        language: context.language,
        riskLevel: assessment.level,
        includesGuidance: assessment.level === "low" && context.pregnancyWeek !== null,
      },
      intent,
      smsSent,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
    const processingTimeMs = traceEnd(traceId);

    logTrace({
      phone, channel, rawMessage, detectedLanguage: context.language,
      intent, extractedSymptoms: context.symptoms,
      pregnancyWeek: context.pregnancyWeek, riskLevel: assessment.level,
      responseText: null, processingTimeMs, error,
      motherId: mother?.id ?? null, messageId: null,
    });

    if (mother) {
      await storeTrace({
        mother_id: mother.id,
        phone,
        raw_message: rawMessage,
        channel,
        detected_language: context.language,
        intent,
        extracted_symptoms: context.symptoms,
        pregnancy_week: context.pregnancyWeek,
        risk_level: assessment.level,
        processing_time_ms: processingTimeMs,
        error,
      }).catch(() => {});
    }

    throw err;
  }
}

// ── Conversation state transitions ──────────────────────

function determineNextState(
  intent: MessageIntent,
  assessment: RiskAssessment
): { state: "idle" | "awaiting_followup" | "awaiting_registration" | "awaiting_clarification"; pendingQuestion: string | null; pendingContext: Record<string, unknown> } {
  if (intent === "greeting") {
    return {
      state: "awaiting_registration",
      pendingQuestion: "How many months pregnant are you?",
      pendingContext: {},
    };
  }

  if (intent === "symptom_report" && assessment.followUpQuestions.length > 0) {
    const question = assessment.followUpQuestions[0];
    const askingAboutSymptom = inferSymptomFromQuestion(question);

    return {
      state: "awaiting_followup",
      pendingQuestion: question,
      pendingContext: askingAboutSymptom ? { askingAboutSymptom } : {},
    };
  }

  return { state: "idle", pendingQuestion: null, pendingContext: {} };
}

function inferSymptomFromQuestion(question: string): string | null {
  const lower = question.toLowerCase();
  if (lower.includes("vision")) return "vision changes";
  if (lower.includes("bleeding")) return "bleeding";
  if (lower.includes("headache")) return "headache";
  if (lower.includes("movement") || lower.includes("move")) return "no fetal movement";
  if (lower.includes("pain")) return "abdominal pain";
  if (lower.includes("fever")) return "fever";
  if (lower.includes("swelling")) return "swelling";
  return null;
}
