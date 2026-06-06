import type { MessageIntent } from "@/types/database";
import { ALL_SYMPTOM_RULES } from "@/types/symptoms";
import { DICTIONARY } from "./normalization";

export type { MessageIntent };

export interface ClassificationResult {
  intent: MessageIntent;
  confidence: number;
  isInScope: boolean;
}

// ---------------------------------------------------------------------------
// Greeting keywords (Amharic, Oromo, Tigrinya, English, Arabic-influenced)
// ---------------------------------------------------------------------------
const GREETING_KEYWORDS = new Set([
  "selam",
  "salam",
  "salaam",
  "hi",
  "hello",
  "hey",
  "endemin",
  "dehna",
  "dehnaneh",
  "dehnanesh",
  "dehna neh",
  "dehna nesh",
  "endemineh",
  "endeminaderk",
  "endeminadersh",
  "akkam",
  "nagaa",
  "nagaya",
  "kemey",
  "good morning",
  "good evening",
  "good afternoon",
  "enkuan dehna metsah",
  "tena yistilign",
  "halo",
  "merhaba",
]);

// ---------------------------------------------------------------------------
// Registration patterns — pregnancy week/month mentions
// ---------------------------------------------------------------------------
const REGISTRATION_KEYWORDS = [
  "wer",
  "wor",
  "month",
  "week",
  "semint",
  "sement",
  "tornet",
  "pregnant",
  "erguze",
  "erguzi",
  "irguz",
  "ulfaa",
  "ulf",
  "register",
  "registration",
];

const REGISTRATION_PATTERNS = [
  /\d+\s*(?:wer|wor|month|week|semint|sement|tornet)/i,
  /(?:wer|wor|month|week|semint|sement|tornet)\s*\d+/i,
  /(?:ene|i)\s*\d+\s*(?:wer|wor|month|week)/i,
  /(?:ene|i\s+am)\s*.*?(?:pregnant|erguze|erguzi|ulfaa)/i,
  /\d+\s*(?:months?\s*)?pregnant/i,
  /pregnant\s*\d+/i,
];

// ---------------------------------------------------------------------------
// Follow-up response patterns — short confirmations/denials
// ---------------------------------------------------------------------------
const FOLLOWUP_WORDS = new Set([
  "yes",
  "no",
  "awo",
  "aye",
  "ishi",
  "ok",
  "okay",
  "eya",
  "ehi",
  "mhm",
  "yep",
  "nope",
  "nah",
  "yeah",
  "lakki",
  "tole",
  "eeyyee",
  "miti",
  "thanks",
  "thank",
  "ameseginalehu",
  "betam",
  "galatoomi",
]);

// ---------------------------------------------------------------------------
// Pregnancy question patterns
// ---------------------------------------------------------------------------
const QUESTION_INDICATORS = [
  "what should",
  "can i",
  "is it ok",
  "is it safe",
  "should i",
  "how do i",
  "how to",
  "when should",
  "why do",
  "why is",
  "why am",
  "min",
  "yichalal",
  "yitchalal",
  "indet",
  "mechel",
  "yimechal",
  "yifelegal",
  "malet",
  "lemin",
  "?",
];

const PREGNANCY_TOPIC_KEYWORDS = [
  "pregnancy",
  "pregnant",
  "baby",
  "lij",
  "erguze",
  "erguzi",
  "ulfaa",
  "food",
  "eat",
  "diet",
  "exercise",
  "fasting",
  "tsom",
  "sleep",
  "travel",
  "sex",
  "work",
  "birth",
  "delivery",
  "labor",
  "clinic",
  "checkup",
  "vitamin",
  "iron",
  "folic",
  "breastfeed",
  "kick",
  "movement",
  "weight",
  "trimester",
  "morning sickness",
  "belly",
  "breast",
  "milk",
  "water",
  "rest",
  "stress",
  "yoga",
  "walk",
  "injection",
  "vaccine",
  "ultrasound",
  "scan",
];

// ---------------------------------------------------------------------------
// Non-pregnancy health keywords
// ---------------------------------------------------------------------------
const NON_PREGNANCY_HEALTH = new Set([
  "malaria",
  "cough",
  "diabetes",
  "hiv",
  "aids",
  "corona",
  "covid",
  "cold",
  "flu",
  "diarrhea",
  "cholera",
  "typhoid",
  "tuberculosis",
  "tb",
  "asthma",
  "allergy",
  "infection",
  "wound",
  "injury",
  "broken",
  "fracture",
  "cancer",
  "heart disease",
  "hypertension",
  "blood pressure",
  "dengue",
  "measles",
  "pneumonia",
  "skin rash",
  "toothache",
  "dental",
  "eye infection",
  "ear infection",
]);

// ---------------------------------------------------------------------------
// Build a set of all known symptom triggers from the rules engine
// ---------------------------------------------------------------------------
let _symptomTriggerCache: Set<string> | null = null;

function getSymptomTriggers(): Set<string> {
  if (_symptomTriggerCache) return _symptomTriggerCache;

  const triggers = new Set<string>();
  for (const rule of ALL_SYMPTOM_RULES) {
    for (const trigger of rule.triggers) {
      triggers.add(trigger.toLowerCase());
    }
  }

  // Additional fallback symptom keywords from hasab.ts / normalization
  const fallbackSymptoms = [
    "ras",
    "dem",
    "hod",
    "ayne",
    "yimetagnal",
    "yikorenal",
    "yikoregnal",
    "bleeding",
    "headache",
    "pain",
    "blood",
    "swelling",
    "swollen",
    "fever",
    "discharge",
    "nausea",
    "vomiting",
    "tired",
    "fatigue",
    "cramp",
    "convulsion",
    "seizure",
    "tinifas",
    "ababiwal",
    "tikus",
    "dekimognal",
    "jerbat",
    "kurtet",
    "mikitat",
    "ayinkasakesim",
    "dhukkubbii",
    "dhiiga",
    "matane",
    "hatsbi",
  ];

  for (const kw of fallbackSymptoms) {
    triggers.add(kw);
  }

  _symptomTriggerCache = triggers;
  return triggers;
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

export function classifyMessage(message: string): ClassificationResult {
  const lower = message.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // --- Greeting: short messages with greeting words ---
  if (wordCount <= 4) {
    const isGreeting = words.some((w) => GREETING_KEYWORDS.has(w)) ||
      Array.from(GREETING_KEYWORDS).some((g) => g.includes(" ") && lower.includes(g));

    if (isGreeting) {
      return { intent: "greeting", confidence: 0.95, isInScope: true };
    }
  }

  // --- Follow-up response: very short messages ---
  if (wordCount <= 3) {
    const isFollowup = words.every(
      (w) => FOLLOWUP_WORDS.has(w) || /^\d+$/.test(w)
    );
    if (isFollowup) {
      return { intent: "followup_response", confidence: 0.9, isInScope: true };
    }

    // Single number (e.g. answering "choose 1 or 2")
    if (wordCount === 1 && /^\d+$/.test(words[0])) {
      return { intent: "followup_response", confidence: 0.85, isInScope: true };
    }
  }

  // --- Registration: pregnancy week/month information ---
  const hasRegistrationPattern = REGISTRATION_PATTERNS.some((p) => p.test(lower));
  if (hasRegistrationPattern) {
    const hasNumber = /\d+/.test(lower);
    const hasPregnancyWord = REGISTRATION_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasNumber && hasPregnancyWord) {
      return { intent: "registration", confidence: 0.9, isInScope: true };
    }
  }

  // --- Symptom report: check symptom triggers ---
  const symptomTriggers = getSymptomTriggers();
  const matchedSymptoms: string[] = [];

  for (const trigger of symptomTriggers) {
    if (trigger.includes(" ")) {
      if (lower.includes(trigger)) matchedSymptoms.push(trigger);
    } else {
      if (words.includes(trigger)) matchedSymptoms.push(trigger);
    }
  }

  if (matchedSymptoms.length > 0) {
    const confidence = Math.min(0.95, 0.7 + matchedSymptoms.length * 0.1);
    return { intent: "symptom_report", confidence, isInScope: true };
  }

  // --- Non-pregnancy health ---
  const nonPregnancyMatches = words.filter((w) => NON_PREGNANCY_HEALTH.has(w));
  const multiWordNPH = Array.from(NON_PREGNANCY_HEALTH).filter(
    (kw) => kw.includes(" ") && lower.includes(kw)
  );
  if (nonPregnancyMatches.length > 0 || multiWordNPH.length > 0) {
    return { intent: "non_pregnancy_health", confidence: 0.8, isInScope: false };
  }

  // --- Pregnancy question: question patterns + pregnancy topics ---
  const hasQuestionIndicator = QUESTION_INDICATORS.some((qi) =>
    lower.includes(qi)
  );
  const hasPregnancyTopic = PREGNANCY_TOPIC_KEYWORDS.some((pt) =>
    lower.includes(pt)
  );

  if (hasQuestionIndicator && hasPregnancyTopic) {
    return { intent: "pregnancy_question", confidence: 0.85, isInScope: true };
  }

  // Pregnancy topic without explicit question marker — still in scope
  if (hasPregnancyTopic) {
    return { intent: "pregnancy_question", confidence: 0.6, isInScope: true };
  }

  // --- Unrelated: no health or pregnancy keywords, more than 3 words ---
  if (wordCount > 3) {
    return { intent: "unrelated", confidence: 0.5, isInScope: false };
  }

  // --- Unknown: ambiguous short message ---
  return { intent: "unknown", confidence: 0.3, isInScope: false };
}
