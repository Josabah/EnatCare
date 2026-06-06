import type { PregnancyContext, RiskAssessment, ResponseMessage } from "@/types/risk";
import type { Mother, Language, MessageChannel } from "@/types/database";
import { normalizeMessage, extractPregnancyWeekFromText } from "./normalization";
import { extractPregnancyContext } from "./hasab";
import { processContext } from "./riskEngine";
import {
  findOrCreateMother,
  updateMother,
  storeMessage,
  storeRiskEvent,
} from "./supabase";
import { sendSMS } from "./smsGateway";

export interface ProcessingResult {
  mother: Mother;
  context: PregnancyContext;
  assessment: RiskAssessment;
  response: ResponseMessage;
  smsSent: boolean;
}

export interface ProcessingOptions {
  /** Which channel this message arrived from */
  channel?: MessageChannel;
  /** Skip sending the reply SMS (for web chat / testing) */
  skipSms?: boolean;
}

/**
 * Central message processing orchestration.
 *
 * This is the ONLY entry point for processing messages.
 * Every channel — SMS, web chat, WhatsApp, test endpoint — calls this.
 *
 * 1. Find or create mother
 * 2. Store inbound message
 * 3. Normalize text
 * 4. Extract pregnancy context (Hasab AI)
 * 5. Assess risk (deterministic rules)
 * 6. Generate response
 * 7. Update mother record
 * 8. Store risk event
 * 9. Store outbound message
 * 10. Send reply (if channel = sms)
 */
export async function processIncomingMessage(
  phone: string,
  rawMessage: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  const channel = options.channel ?? "web";
  const skipSms = options.skipSms ?? channel !== "sms";

  const mother = await findOrCreateMother(phone);

  await storeMessage({
    mother_id: mother.id,
    channel,
    direction: "inbound",
    message: rawMessage,
    raw_message: rawMessage,
  });

  const normalization = normalizeMessage(rawMessage);
  const context = await extractPregnancyContext(rawMessage);

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

  const { assessment, response } = processContext(context);

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

  if (assessment.level !== "low" || assessment.symptoms.length > 0) {
    await storeRiskEvent({
      mother_id: mother.id,
      risk_level: assessment.level,
      symptoms: assessment.symptoms.map((s) => s.name),
      reasoning: assessment.reasoning,
    });
  }

  await storeMessage({
    mother_id: mother.id,
    channel,
    direction: "outbound",
    message: response.text,
    risk_level: assessment.level,
  });

  let smsSent = false;
  if (!skipSms) {
    const smsResult = await sendSMS(phone, response.text);
    smsSent = smsResult.success;
  }

  return {
    mother: updatedMother,
    context,
    assessment,
    response,
    smsSent,
  };
}
