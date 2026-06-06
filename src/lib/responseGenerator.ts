/**
 * Response Generator — AI writes the response.
 *
 * Templates are ONLY used as fallback when Hasab AI is unavailable.
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
2. Keep under 400 characters (SMS limit)
3. Show you understood their SPECIFIC message — reference what they actually said
4. Address ALL parts: if they registered AND reported symptoms, acknowledge both
5. If symptoms found: naturally include the required action from the risk assessment
6. If HIGH risk: urgency is critical — tell them to go to a health facility NOW
7. If MEDIUM risk: encourage monitoring, mention clinic visit
8. If LOW risk: reassure with practical advice
9. If the message is NOT pregnancy-related: politely explain you are a pregnancy health assistant and suggest they see a healthcare provider for other concerns. Be natural about it.
10. If new mother and pregnancy week unknown: ask how many months pregnant they are
11. If emotional state is anxious/distressed: be extra gentle and reassuring
12. NEVER diagnose or name a medical condition
13. NEVER guarantee outcomes
14. Ask ONE useful follow-up question when relevant
15. Do NOT use generic phrases like "What you described is common during pregnancy" or "Let me know if you have questions"

SMS Response:`;

  const aiResponse = await generateAiResponse(prompt);
  if (aiResponse) return truncate(aiResponse);

  // Fallback: template response when Hasab is down
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
  if (text.length <= 400) return text;
  return text.slice(0, 397) + "...";
}
