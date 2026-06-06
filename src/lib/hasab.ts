/**
 * Hasab AI — the understanding layer.
 *
 * One call. Receives the raw message + context.
 * Returns a structured understanding of everything the mother said.
 * Fallback to keyword extraction when Hasab is unavailable.
 */

import type { Language } from "@/types/database";

const HASAB_API_KEY = process.env.HASAB_API_KEY ?? "";
const HASAB_BASE_URL =
  process.env.HASAB_BASE_URL ?? "https://api.hasab.ai/api/v1";

interface HasabChatResponse {
  message: { role: "assistant"; content: string };
}

export interface MessageUnderstanding {
  language: Language;
  pregnancyRelated: boolean;
  pregnancyWeek: number | null;
  symptoms: string[];
  questions: string[];
  emotionalState: "neutral" | "concerned" | "anxious" | "distressed" | "happy";
  missingInformation: string[];
  messageSummary: string;
  confidence: number;
}

const UNDERSTANDING_PROMPT = `You are a medical information extraction system for EnatAI, a maternal health SMS service in Ethiopia.

Your job: understand EVERYTHING in the mother's message. Not just one thing — everything.

The message may be in Amharic (Ge'ez script '), Romanized Amharic, Afaan Oromo, Tigrinya, English, or mixed.

CONTEXT:
{{CONTEXT}}

Extract this JSON from the message:
{
  "language": "am" | "om" | "ti" | "en" | "mixed",
  "pregnancyRelated": true or false,
  "pregnancyWeek": number or null (convert months to weeks: month × 4),
  "symptoms": ["bleeding", "headache", ...] (normalize ALL symptoms to English, e.g. "dem"/"demchalew"/"medmat"/"ደም" = "bleeding", "ras yimetagnal"/"rase yimetagnal"/"rasye" = "headache", "hod yikoregnal" = "abdominal pain", "ayne yadetebignal" = "vision changes", "cramp"/"kurtet" = "cramping"),
  "questions": ["What foods should I eat?"] (any questions the mother asked, translated to English),
  "emotionalState": "neutral" | "concerned" | "anxious" | "distressed" | "happy",
  "missingInformation": ["headache_severity", "cramp_location"] (what would be useful to know),
  "messageSummary": "one sentence summary in English of what the mother said"
}

Rules:
- Extract ALL symptoms, not just the first one
- Extract pregnancy week AND symptoms from the same message
- If the message contains a greeting AND symptoms, extract both
- If the message is not about pregnancy/health at all, set pregnancyRelated to false
- Normalize ALL symptom names to English regardless of input language
- Convert months to weeks (month × 4)
- "confidence" is not needed — just extract accurately

Respond with ONLY valid JSON. No explanation. No markdown.

Message: `;

export async function understandMessage(
  message: string,
  context: {
    conversationHistory?: string[];
    pregnancyWeek?: number | null;
    previousSymptoms?: string[];
    pendingQuestion?: string | null;
  } = {}
): Promise<MessageUnderstanding> {
  if (!HASAB_API_KEY) {
    console.warn("[Hasab] No API key, using fallback extraction");
    return fallbackUnderstanding(message);
  }

  try {
    const contextParts: string[] = [];
    if (context.pregnancyWeek) {
      contextParts.push(`Mother is at week ${context.pregnancyWeek} of pregnancy.`);
    }
    if (context.previousSymptoms?.length) {
      contextParts.push(`Previously reported symptoms: ${context.previousSymptoms.join(", ")}`);
    }
    if (context.pendingQuestion) {
      contextParts.push(`The assistant last asked: "${context.pendingQuestion}"`);
    }
    if (context.conversationHistory?.length) {
      contextParts.push(`Recent conversation:\n${context.conversationHistory.slice(-4).join("\n")}`);
    }

    const ctxText = contextParts.length > 0 ? contextParts.join("\n") : "No prior context (new conversation).";
    const prompt = UNDERSTANDING_PROMPT.replace("{{CONTEXT}}", ctxText) + `"${message}"`;

    const response = await fetch(`${HASAB_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HASAB_API_KEY}`,
      },
      body: JSON.stringify({
        message: prompt,
        model: "hasab-1-main",
        temperature: 0.1,
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error(`[Hasab] API error: ${response.status}`);
      return fallbackUnderstanding(message);
    }

    const data = (await response.json()) as HasabChatResponse;
    const content = data.message?.content;
    if (!content) return fallbackUnderstanding(message);

    const parsed = JSON.parse(cleanJson(content));

    return {
      language: validateLanguage(parsed.language),
      pregnancyRelated: parsed.pregnancyRelated !== false,
      pregnancyWeek: typeof parsed.pregnancyWeek === "number" ? parsed.pregnancyWeek : null,
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      emotionalState: validateEmotion(parsed.emotionalState),
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      messageSummary: typeof parsed.messageSummary === "string" ? parsed.messageSummary : "",
      confidence: 0.8,
    };
  } catch (error) {
    console.error("[Hasab] Understanding failed:", error);
    return fallbackUnderstanding(message);
  }
}

/**
 * Generate the final SMS response using AI.
 */
export async function generateAiResponse(prompt: string): Promise<string | null> {
  if (!HASAB_API_KEY) return null;

  try {
    const response = await fetch(`${HASAB_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HASAB_API_KEY}`,
      },
      body: JSON.stringify({
        message: prompt,
        model: "hasab-1-main",
        temperature: 0.7,
        max_tokens: 512,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error(`[Hasab] Response gen error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as HasabChatResponse;
    return data.message?.content?.trim() ?? null;
  } catch (error) {
    console.error("[Hasab] Response generation failed:", error);
    return null;
  }
}

// ── Fallback (keyword-based, when Hasab is down) ───────

function fallbackUnderstanding(message: string): MessageUnderstanding {
  const lower = message.toLowerCase();
  const symptoms: string[] = [];
  const seen = new Set<string>();

  const keywords: Record<string, string> = {
    bleeding: "bleeding", dem: "bleeding", blood: "bleeding", dhiiga: "bleeding",
    "ras yimetagnal": "headache", "rase yimetagnal": "headache", headache: "headache",
    ayne: "vision changes", "ayne yadetebignal": "vision changes", blurry: "vision changes",
    convulsion: "convulsions", seizure: "convulsions",
    ayinkasakesim: "no fetal movement", "not moving": "no fetal movement",
    "hod yikoregnal": "abdominal pain", "severe pain": "abdominal pain",
    tinifas: "breathing difficulty", "difficulty breathing": "breathing difficulty",
    swelling: "swelling", swollen: "swelling", ababiwal: "swelling",
    fever: "fever", tikus: "fever",
    discharge: "discharge", leaking: "discharge",
    cramp: "cramping", "back pain": "back pain", jerbat: "back pain",
    nausea: "nausea", vomiting: "nausea", yimetal: "nausea",
    tired: "fatigue", fatigue: "fatigue", dekimognal: "fatigue",
    heartburn: "heartburn", constipation: "constipation",
  };

  for (const [kw, symptom] of Object.entries(keywords)) {
    if (lower.includes(kw) && !seen.has(symptom)) {
      symptoms.push(symptom);
      seen.add(symptom);
    }
  }

  const hasGeez = /[\u1200-\u137F]/.test(message);
  const hasAmharic = /\b(ene|negn|yimetagnal|hod|rase)\b/i.test(message);
  const hasOromo = /\b(dhukkubbii|garaa|ulfaa|dhiiga)\b/i.test(message);
  const hasTigrinya = /\b(matane|hatsbi|resi)\b/i.test(message);

  let language: Language = "en";
  if (hasGeez || hasAmharic) language = "am";
  else if (hasOromo) language = "om";
  else if (hasTigrinya) language = "ti";

  const weekMatch = lower.match(/(\d+)\s*(?:week|month|wer|wor)/);
  let pregnancyWeek: number | null = null;
  if (weekMatch) {
    const num = parseInt(weekMatch[1], 10);
    pregnancyWeek = /month|wer|wor/.test(lower) ? num * 4 : num;
  }

  return {
    language,
    pregnancyRelated: symptoms.length > 0 || pregnancyWeek !== null || hasAmharic || hasGeez,
    pregnancyWeek,
    symptoms,
    questions: [],
    emotionalState: symptoms.length > 0 ? "concerned" : "neutral",
    missingInformation: [],
    messageSummary: "",
    confidence: 0.3,
  };
}

// ── Utilities ──────────────────────────────────────────

function cleanJson(content: string): string {
  let s = content.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

function validateLanguage(lang: unknown): Language {
  const valid = ["am", "om", "ti", "en", "mixed"];
  return valid.includes(lang as string) ? (lang as Language) : "en";
}

function validateEmotion(e: unknown): MessageUnderstanding["emotionalState"] {
  const valid = ["neutral", "concerned", "anxious", "distressed", "happy"];
  return valid.includes(e as string) ? (e as MessageUnderstanding["emotionalState"]) : "neutral";
}
