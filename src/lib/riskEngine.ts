import type { PregnancyContext, RiskAssessment, ResponseMessage } from "@/types/risk";
import type { Language } from "@/types/database";
import { assessRisk, generateResponse } from "./pregnancyRules";

/**
 * Risk Engine — the bridge between AI extraction and rule-based assessment.
 *
 * Takes the structured output from Hasab AI, runs it through the
 * pregnancy rules engine, and produces a response message ready for SMS.
 */

export function evaluateRisk(context: PregnancyContext): RiskAssessment {
  return assessRisk(context.symptoms, context.pregnancyWeek);
}

export function buildResponseMessage(
  assessment: RiskAssessment,
  language: Language,
  pregnancyWeek: number | null
): ResponseMessage {
  const text = generateResponse(assessment, language, pregnancyWeek);

  return {
    text,
    language,
    riskLevel: assessment.level,
    includesGuidance: assessment.level === "low" && pregnancyWeek !== null,
  };
}

/**
 * Full pipeline: context → assessment → response.
 * Convenience function for the message processor.
 */
export function processContext(context: PregnancyContext): {
  assessment: RiskAssessment;
  response: ResponseMessage;
} {
  const assessment = evaluateRisk(context);
  const response = buildResponseMessage(
    assessment,
    context.language,
    context.pregnancyWeek
  );

  return { assessment, response };
}
