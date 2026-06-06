import type { PregnancyContext } from "@/types/risk";

const HASAB_API_KEY = process.env.HASAB_API_KEY ?? "";
const HASAB_BASE_URL =
  process.env.HASAB_BASE_URL ?? "https://api.hasab.ai/api/v1";

interface HasabChatResponse {
  message: {
    role: "assistant";
    content: string;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const EXTRACTION_PROMPT = `You are a medical information extraction system for a maternal health SMS service in Ethiopia. Your ONLY job is to extract structured information from SMS messages sent by pregnant women. You do NOT diagnose. You do NOT give medical advice. You extract facts.

The messages may be in Amharic (Ge'ez script), Romanized Amharic, Afaan Oromo, Tigrinya, English, or mixed language.

From the following SMS message, extract this JSON:
{
  "language": "am" | "om" | "ti" | "en" | "mixed",
  "symptoms": ["symptom1", "symptom2"],
  "pregnancyWeek": number or null,
  "confidence": 0.0 to 1.0
}

Rules:
- Convert months to weeks (month × 4)
- Normalize symptoms to English
- "dem"/"dhiiga" = bleeding, "ras yimetagnal" = headache, "ayne yadetebignal" = vision changes, "hod yikoregnal" = abdominal pain, "tinifas chigir" = breathing difficulty, "lijie ayinkasakesim" = no fetal movement

Respond with ONLY valid JSON. No explanation. No markdown.

SMS message: `;

export async function extractPregnancyContext(
  message: string
): Promise<PregnancyContext> {
  if (!HASAB_API_KEY) {
    console.warn("HASAB_API_KEY not set, using fallback extraction");
    return fallbackExtraction(message);
  }

  try {
    const response = await fetch(`${HASAB_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HASAB_API_KEY}`,
      },
      body: JSON.stringify({
        message: `${EXTRACTION_PROMPT}"${message}"`,
        model: "hasab-1-main",
        temperature: 0.1,
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error(
        `Hasab API error: ${response.status} ${response.statusText}`
      );
      return fallbackExtraction(message);
    }

    const data = (await response.json()) as HasabChatResponse;
    const content = data.message?.content;

    if (!content) return fallbackExtraction(message);

    const parsed = JSON.parse(cleanJsonResponse(content));

    return {
      language: validateLanguage(parsed.language),
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms : [],
      pregnancyWeek:
        typeof parsed.pregnancyWeek === "number" ? parsed.pregnancyWeek : null,
      urgency: "low", // AI must NOT determine urgency — rules do
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5,
    };
  } catch (error) {
    console.error("Hasab AI extraction failed:", error);
    return fallbackExtraction(message);
  }
}

/**
 * Rule-based fallback when the LLM is unavailable.
 * Uses keyword matching on the raw message.
 */
function fallbackExtraction(message: string): PregnancyContext {
  const lower = message.toLowerCase();
  const symptoms: string[] = [];

  const highKeywords: Record<string, string> = {
    bleeding: "bleeding",
    dem: "bleeding",
    blood: "bleeding",
    dhiiga: "bleeding",
    "ras yimetagnal": "headache",
    "rase yimetagnal": "headache",
    "severe headache": "headache",
    ayne: "vision changes",
    "ayne yadetebignal": "vision changes",
    blurry: "vision changes",
    convulsion: "convulsions",
    seizure: "convulsions",
    ayinkasakesim: "no fetal movement",
    "not moving": "no fetal movement",
    "hod yikoregnal": "severe abdominal pain",
    "betam yikorenal": "severe abdominal pain",
    "severe pain": "severe abdominal pain",
    tinifas: "breathing difficulty",
    "difficulty breathing": "breathing difficulty",
  };

  const mediumKeywords: Record<string, string> = {
    swelling: "swelling",
    swollen: "swelling",
    ababiwal: "swelling",
    fever: "fever",
    tikus: "fever",
    discharge: "discharge",
    leaking: "discharge",
    cramp: "cramping",
    "back pain": "back pain",
    jerbat: "back pain",
  };

  const lowKeywords: Record<string, string> = {
    nausea: "nausea",
    vomiting: "nausea",
    yimetal: "nausea",
    yaskosikosal: "nausea",
    tired: "fatigue",
    fatigue: "fatigue",
    dekimognal: "fatigue",
    heartburn: "heartburn",
    constipation: "constipation",
  };

  const seen = new Set<string>();
  for (const [kw, symptom] of Object.entries(highKeywords)) {
    if (lower.includes(kw) && !seen.has(symptom)) {
      symptoms.push(symptom);
      seen.add(symptom);
    }
  }
  for (const [kw, symptom] of Object.entries(mediumKeywords)) {
    if (lower.includes(kw) && !seen.has(symptom)) {
      symptoms.push(symptom);
      seen.add(symptom);
    }
  }
  for (const [kw, symptom] of Object.entries(lowKeywords)) {
    if (lower.includes(kw) && !seen.has(symptom)) {
      symptoms.push(symptom);
      seen.add(symptom);
    }
  }

  const hasGeez = /[\u1200-\u137F]/.test(message);
  const hasAmharicRoman = /\b(ene|negn|yimetagnal|hod|rase)\b/i.test(message);
  const hasOromo = /\b(dhukkubbii|garaa|ulfaa|dhiiga)\b/i.test(message);
  const hasTigrinya = /\b(matane|hatsbi|resi)\b/i.test(message);

  let language: PregnancyContext["language"] = "en";
  if (hasGeez || hasAmharicRoman) language = "am";
  else if (hasOromo) language = "om";
  else if (hasTigrinya) language = "ti";

  const mixedSignals =
    [hasAmharicRoman, hasOromo, hasTigrinya].filter(Boolean).length > 1;
  if (mixedSignals) language = "mixed";

  const weekMatch = lower.match(/(\d+)\s*(?:week|month|wer|wor)/);
  let pregnancyWeek: number | null = null;
  if (weekMatch) {
    const num = parseInt(weekMatch[1], 10);
    pregnancyWeek =
      lower.includes("month") || lower.includes("wer") || lower.includes("wor")
        ? num * 4
        : num;
  }

  return {
    language,
    symptoms,
    pregnancyWeek,
    urgency: "low", // fallback never determines urgency — rules do
    confidence: 0.3,
  };
}

function cleanJsonResponse(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

function validateLanguage(lang: unknown): PregnancyContext["language"] {
  const valid = ["am", "om", "ti", "en", "mixed"];
  return valid.includes(lang as string)
    ? (lang as PregnancyContext["language"])
    : "en";
}
