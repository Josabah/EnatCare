/**
 * AI Layer — powered by Google Gemini.
 *
 * Two calls per message:
 * 1. understandMessage() — extracts structured understanding
 * 2. generateAiResponse() — writes the SMS response
 *
 * Supports multiple API keys (separated by " || " in GEMINI_API_KEY).
 * Each key maps to a different Google Cloud project with its own
 * free-tier quota (~1,500 RPD each). Keys rotate round-robin and
 * automatically skip exhausted keys for 60 s before retrying them.
 */

import type { Language } from "@/types/database";

const GEMINI_KEYS = (process.env.GEMINI_API_KEY ?? "")
  .split("||")
  .map((k) => k.trim())
  .filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// ── Key rotation state ─────────────────────────────────
let currentKeyIndex = 0;
const cooldowns = new Map<number, number>(); // index → timestamp when cooldown expires
const COOLDOWN_MS = 60_000;

function getNextKey(): string | null {
  if (GEMINI_KEYS.length === 0) return null;

  const now = Date.now();
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const idx = (currentKeyIndex + i) % GEMINI_KEYS.length;
    const until = cooldowns.get(idx);
    if (!until || now >= until) {
      currentKeyIndex = (idx + 1) % GEMINI_KEYS.length;
      return GEMINI_KEYS[idx];
    }
  }

  // All keys on cooldown — use the one closest to expiring
  let soonest = 0;
  let soonestTime = Infinity;
  for (const [idx, until] of cooldowns) {
    if (until < soonestTime) { soonest = idx; soonestTime = until; }
  }
  cooldowns.delete(soonest);
  currentKeyIndex = (soonest + 1) % GEMINI_KEYS.length;
  return GEMINI_KEYS[soonest];
}

function markKeyExhausted(key: string): void {
  const idx = GEMINI_KEYS.indexOf(key);
  if (idx !== -1) {
    cooldowns.set(idx, Date.now() + COOLDOWN_MS);
    console.warn(`[AI] Key #${idx + 1} rate-limited, cooldown 60s (${GEMINI_KEYS.length - 1} remaining)`);
  }
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

const UNDERSTANDING_SYSTEM = `You are a medical information extraction system for EnatAI, a maternal health SMS service in Ethiopia.

Your job: understand EVERYTHING in the mother's message. Not just one thing — everything.

The message may be in Amharic (Ge'ez script), Romanized Amharic, Afaan Oromo, Tigrinya, English, or mixed language. You understand all of these natively.

Common Amharic medical terms you must recognize (and ALL their spelling variations):
- dem/demchalew/medmat/ደም = bleeding
- ras/rase/rasye/rasien + yimetagnal/yimetagnl/eyamemegn/yamegnal = headache
- hod/hodye + yikoregnal/yikorenal = abdominal pain
- ayne/aynem + yadetebignal = vision changes
- tinifas/tinifase + chigir = breathing difficulty
- lij/lijie + ayinkasakesim/enakaseskim = no fetal movement
- cramp/kurtet = cramping
- wer/wor = month (pregnancy)
- ene X wer negn = I am X months pregnant

Extract this JSON:
{
  "language": "am" | "om" | "ti" | "en" | "mixed",
  "pregnancyRelated": true or false,
  "pregnancyWeek": number or null (convert months × 4),
  "symptoms": ["symptom1", "symptom2"] (normalized to English),
  "questions": ["question in English"],
  "emotionalState": "neutral" | "concerned" | "anxious" | "distressed" | "happy",
  "missingInformation": ["what would be useful to know"],
  "messageSummary": "one sentence English summary"
}

Rules:
- Extract ALL symptoms, not just the first one
- Extract pregnancy info AND symptoms from the same message
- If message has a greeting AND symptoms, extract both
- If not about pregnancy/health at all, set pregnancyRelated to false
- Normalize ALL symptom names to English
- Convert months to weeks (month × 4)
- "selam", "hi", "hello" are greetings — they ARE pregnancy-related (the mother is reaching out)

Respond with ONLY valid JSON.`;

export async function understandMessage(
  message: string,
  context: {
    conversationHistory?: string[];
    pregnancyWeek?: number | null;
    previousSymptoms?: string[];
    pendingQuestion?: string | null;
  } = {}
): Promise<MessageUnderstanding> {
  if (GEMINI_KEYS.length === 0) {
    console.warn("[AI] No GEMINI_API_KEY configured, using fallback");
    return fallbackUnderstanding(message);
  }

  try {
    const contextParts: string[] = [];
    if (context.pregnancyWeek) {
      contextParts.push(`Mother is at week ${context.pregnancyWeek}.`);
    }
    if (context.previousSymptoms?.length) {
      contextParts.push(`Previous symptoms: ${context.previousSymptoms.join(", ")}`);
    }
    if (context.pendingQuestion) {
      contextParts.push(`You last asked: "${context.pendingQuestion}"`);
    }
    if (context.conversationHistory?.length) {
      contextParts.push(`Recent:\n${context.conversationHistory.slice(-4).join("\n")}`);
    }

    const ctxText = contextParts.length > 0
      ? `\n\nContext:\n${contextParts.join("\n")}`
      : "";

    const userPrompt = `${ctxText}\n\nMessage: "${message}"`;

    const content = await callGemini(UNDERSTANDING_SYSTEM, userPrompt, 0.1, 1024);
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
      confidence: 0.85,
    };
  } catch (error) {
    console.error("[AI] Understanding failed:", error);
    return fallbackUnderstanding(message);
  }
}

export async function generateAiResponse(prompt: string): Promise<string | null> {
  if (GEMINI_KEYS.length === 0) return null;
  return callGemini(null, prompt, 0.7, 512);
}

// ── Gemini API call with key rotation ──────────────────

async function callGemini(
  systemInstruction: string | null,
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string | null> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const payload = JSON.stringify(body);

  // Try up to N keys (one attempt per key)
  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const key = getNextKey();
    if (!key) break;

    const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${key}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    if (response.ok) {
      const data = await response.json();
      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== "STOP") {
        console.warn(`[AI] Gemini finishReason: ${finishReason}`);
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof text === "string" ? text.trim() : null;
    }

    const status = response.status;

    // 429 = rate limit, 403 = quota exceeded, 401 = invalid key — rotate
    if (status === 429 || status === 403 || status === 401) {
      markKeyExhausted(key);
      continue;
    }

    // Other errors (400, 500, etc.) — don't blame the key
    const errorText = await response.text();
    console.error(`[AI] Gemini ${status}: ${errorText.slice(0, 200)}`);
    return null;
  }

  console.error("[AI] All Gemini keys exhausted");
  return null;
}

// ── Fallback (keyword-based, when Gemini is down) ──────

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
  const hasGreeting = /\b(selam|salam|hi|hello|hey|endemin|dehna)\b/i.test(lower);
  const hasPregnancy = /\b(pregnant|wer|wor|month|week|erguze|ulfaa)\b/i.test(lower);

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
    pregnancyRelated: symptoms.length > 0 || pregnancyWeek !== null ||
      hasAmharic || hasGeez || hasGreeting || hasPregnancy,
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
