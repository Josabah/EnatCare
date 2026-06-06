/**
 * Response Generator — AI writes the response.
 *
 * Templates are ONLY used as fallback when Gemini is unavailable.
 * The AI handles tone, language, personalization, and out-of-scope detection.
 */

import type { RiskAssessment } from "@/types/risk";
import type { Language } from "@/types/database";
import type { MessageUnderstanding } from "./hasab";
import { generateAiResponse } from "./hasab";
import { generateResponse as generateTemplateResponse } from "./pregnancyRules";

const LANGUAGE_NAMES: Record<Language, string> = {
  am: "Amharic",
  om: "Afaan Oromo",
  ti: "Tigrinya",
  en: "English",
  mixed: "simple English mixed with Amharic",
};

export interface ResponseContext {
  rawMessage: string;
  understanding: MessageUnderstanding;
  assessment: RiskAssessment;
  language: Language;
  pregnancyWeek: number | null;
  motherName: string | null;
  conversationHistory: string[];
  pendingQuestion: string | null;
  isNewMother: boolean;
}

export async function generateResponse(ctx: ResponseContext): Promise<string> {
  const {
    rawMessage, understanding, assessment, language, pregnancyWeek,
    motherName, conversationHistory, pendingQuestion, isNewMother,
  } = ctx;

  const languageName = LANGUAGE_NAMES[language];
  const history = conversationHistory.slice(-6).join("\n");
  const symptoms = understanding.symptoms.join(", ");
  const questions = understanding.questions.join("; ");

  const prompt = `You are EnatAI, a caring and knowledgeable pregnancy companion for Ethiopian mothers. You communicate via SMS.

THE MOTHER'S MESSAGE:
"${rawMessage}"

WHAT YOU UNDERSTOOD:
- Language: ${languageName}
- Pregnancy related: ${understanding.pregnancyRelated}
- Pregnancy week: ${pregnancyWeek ?? "unknown"}
- Symptoms found: ${symptoms || "none"}
- Questions asked: ${questions || "none"}
- Emotional state: ${understanding.emotionalState}
- Missing information: ${understanding.missingInformation.join(", ") || "none"}
- Summary: ${understanding.messageSummary}

MOTHER'S PROFILE:
- Name: ${motherName ?? "unknown"}
- New mother: ${isNewMother ? "yes (first time)" : "no (returning)"}
- Previous question from you: ${pendingQuestion ?? "none"}

RISK ASSESSMENT (from medical rules — do NOT change):
- Risk level: ${assessment.level.toUpperCase()}
- Reasoning: ${assessment.reasoning}
- Required action: ${assessment.recommendedAction}
- Follow-up needed: ${assessment.followUpQuestions.join("; ") || "none"}

CONVERSATION HISTORY:
${history || "(first message)"}

RESPONSE RULES:
1. Respond in ${languageName}
2. STRICT: Keep under 155 characters total. This is an SMS — every character counts. Be concise.
3. Show you understood their SPECIFIC message
4. If symptoms found: include the required action from the risk assessment
5. If HIGH risk: urgency is critical — tell them to go to a health facility NOW
6. If MEDIUM risk: encourage clinic visit
7. If LOW risk: reassure with practical advice
8. If NOT pregnancy-related: briefly explain you focus on pregnancy care
9. If new mother and pregnancy week unknown: warmly ask how many months pregnant
10. NEVER diagnose or name a medical condition
11. NEVER guarantee outcomes
12. Do NOT use filler phrases

SMS Response:`;

  const aiResponse = await generateAiResponse(prompt);
  if (aiResponse) return truncate(aiResponse);

  // Fallback: template response when Gemini is down
  return buildFallback(ctx);
}

function buildFallback(ctx: ResponseContext): string {
  const { understanding, assessment, language, pregnancyWeek, isNewMother } = ctx;
  const parts: string[] = [];

  if (!understanding.pregnancyRelated) {
    const oos: Record<Language, string> = {
      am: "EnatAI በእርግዝና ጤና ላይ ያተኩራል። ለዚህ ችግር ወደ ጤና ባለሙያ ይሂዱ።",
      om: "EnatAI fayyaa da'umsaa irratti xiyyeeffata. Rakkoo kanaaf ogeessa fayyaa mari.",
      ti: "EnatAI ኣብ ጥዕና ጥንሲ ዘተኰረ እዩ። ነዚ ብኽብረትኪ ናብ ሓኪም ኪዲ።",
      en: "EnatAI focuses on pregnancy care. For other health concerns, please see a healthcare provider.",
      mixed: "EnatAI focuses on pregnancy care. For other concerns, please see a healthcare provider.",
    };
    return oos[language];
  }

  if (understanding.symptoms.length > 0) {
    parts.push(generateTemplateResponse(assessment, language, pregnancyWeek));
  }

  if (understanding.pregnancyWeek !== null && parts.length === 0) {
    const month = Math.round((understanding.pregnancyWeek) / 4);
    const reg: Record<Language, string> = {
      am: `${month} ወር ተመዝግቧል። ማንኛውም ምልክት ካለዎት ያሳውቁኝ።`,
      om: `Ji'a ${month} galmaa'eera. Mallattoo yoo qabaatte na beeksisi.`,
      ti: `${month} ወርሒ ተመዝጊቡ። ምልክት እንተሃልዩ ሓብሪኒ።`,
      en: `Registered at ${month} months. Let me know if you have any symptoms.`,
      mixed: `${month} months registered. Tell me about any symptoms.`,
    };
    parts.push(reg[language]);
  }

  if (isNewMother && understanding.pregnancyWeek === null) {
    const ask: Record<Language, string> = {
      am: "ስንት ወር ነው?", om: "Ji'a meeqa?", ti: "ክንደይ ወርሒ?",
      en: "How many months pregnant are you?",
      mixed: "How many months pregnant are you?",
    };
    parts.push(ask[language]);
  }

  if (parts.length === 0) {
    const generic: Record<Language, string> = {
      am: "እንዴት ልረዳዎ? ስለ እርግዝና ምልክቶች ወይም ጥያቄ ያሳውቁኝ።",
      om: "Akkamitti si gargaaruu? Mallattoo ykn gaaffii ulfaa naaf himi.",
      ti: "ከመይ ክሕግዘኪ? ብዛዕባ ምልክታት ጥንሲ ሓብሪኒ።",
      en: "How can I help? Tell me about any pregnancy symptoms or questions.",
      mixed: "How can I help? Tell me about pregnancy symptoms or questions.",
    };
    parts.push(generic[language]);
  }

  return truncate(parts.join(" "));
}

function truncate(text: string): string {
  if (text.length <= 160) return text;
  // Cut at last sentence or space boundary within 160 chars
  const cut = text.slice(0, 157);
  const lastPeriod = cut.lastIndexOf(".");
  const lastSpace = cut.lastIndexOf(" ");
  const breakAt = lastPeriod > 100 ? lastPeriod + 1 : lastSpace > 100 ? lastSpace : 157;
  return text.slice(0, breakAt).trim();
}
