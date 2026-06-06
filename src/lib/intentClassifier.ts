import type { MessageIntent } from "@/types/database";
import { ALL_SYMPTOM_RULES } from "@/types/symptoms";

export type { MessageIntent };

export interface ClassificationResult {
  primaryIntent: MessageIntent;
  /** Every signal detected in the message — a message can be many things at once */
  signals: MessageSignal[];
  isInScope: boolean;
  hasSymptoms: boolean;
  hasRegistration: boolean;
  hasQuestion: boolean;
  hasGreeting: boolean;
}

export interface MessageSignal {
  type: MessageIntent;
  confidence: number;
  detail?: string;
}

const GREETING_KEYWORDS = new Set([
  "selam", "salam", "salaam", "hi", "hello", "hey",
  "endemin", "dehna", "dehnaneh", "dehnanesh",
  "endemineh", "endeminaderk", "endeminadersh",
  "akkam", "nagaa", "nagaya", "kemey",
  "halo", "merhaba", "tena yistilign",
]);

const REGISTRATION_PATTERNS = [
  /\d+\s*(?:wer|wor|month|week|semint|sement|tornet)/i,
  /(?:wer|wor|month|week|semint|sement|tornet)\s*\d+/i,
  /(?:ene|i)\s*\d+\s*(?:wer|wor|month|week)/i,
  /(?:ene|i\s+am)\s*.*?(?:pregnant|erguze|erguzi|ulfaa)/i,
  /\d+\s*(?:months?\s*)?pregnant/i,
  /pregnant\s*\d+/i,
];

const REGISTRATION_KEYWORDS = [
  "wer", "wor", "month", "week", "semint", "sement",
  "tornet", "pregnant", "erguze", "erguzi", "irguz", "ulfaa", "ulf",
];

const FOLLOWUP_WORDS = new Set([
  "yes", "no", "awo", "aye", "ishi", "ok", "okay", "eya", "ehi",
  "mhm", "yep", "nope", "nah", "yeah", "lakki", "tole",
  "eeyyee", "miti", "thanks", "thank", "ameseginalehu", "galatoomi",
]);

const QUESTION_INDICATORS = [
  "what should", "can i", "is it ok", "is it safe", "should i",
  "how do i", "how to", "when should", "why do", "why is", "why am",
  "min", "yichalal", "yitchalal", "indet", "mechel",
  "yimechal", "yifelegal", "malet", "lemin", "?",
];

const PREGNANCY_TOPIC_KEYWORDS = [
  "pregnancy", "pregnant", "baby", "lij", "erguze", "erguzi", "ulfaa",
  "food", "eat", "diet", "exercise", "fasting", "tsom", "sleep",
  "travel", "sex", "work", "birth", "delivery", "labor", "clinic",
  "checkup", "vitamin", "iron", "folic", "breastfeed", "kick",
  "movement", "weight", "trimester", "morning sickness", "belly",
  "breast", "milk", "water", "rest", "stress", "yoga", "walk",
  "injection", "vaccine", "ultrasound", "scan",
];

const NON_PREGNANCY_HEALTH = new Set([
  "malaria", "cough", "diabetes", "hiv", "aids", "corona", "covid",
  "cold", "flu", "diarrhea", "cholera", "typhoid", "tuberculosis", "tb",
  "asthma", "allergy", "infection", "wound", "injury", "broken",
  "fracture", "cancer", "heart disease", "hypertension", "blood pressure",
  "dengue", "measles", "pneumonia", "skin rash", "toothache", "dental",
  "eye infection", "ear infection",
]);

let _symptomTriggerCache: Set<string> | null = null;

function getSymptomTriggers(): Set<string> {
  if (_symptomTriggerCache) return _symptomTriggerCache;
  const triggers = new Set<string>();
  for (const rule of ALL_SYMPTOM_RULES) {
    for (const trigger of rule.triggers) {
      triggers.add(trigger.toLowerCase());
    }
  }
  const fallback = [
    "ras", "dem", "hod", "ayne", "yimetagnal", "yikorenal", "yikoregnal",
    "bleeding", "headache", "pain", "blood", "swelling", "swollen",
    "fever", "discharge", "nausea", "vomiting", "tired", "fatigue",
    "cramp", "convulsion", "seizure", "tinifas", "ababiwal", "tikus",
    "dekimognal", "jerbat", "kurtet", "mikitat", "ayinkasakesim",
    "dhukkubbii", "dhiiga", "matane", "hatsbi",
  ];
  for (const kw of fallback) triggers.add(kw);
  _symptomTriggerCache = triggers;
  return triggers;
}

/**
 * Analyze a message for ALL signals — not just one.
 *
 * "I am 5 months pregnant and have a headache and cramps"
 * → hasRegistration: true, hasSymptoms: true, hasGreeting: false
 * → signals: [registration(0.9), symptom_report(0.9)]
 * → primaryIntent: "symptom_report" (symptoms take priority for risk)
 */
export function classifyMessage(message: string): ClassificationResult {
  const lower = message.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const signals: MessageSignal[] = [];

  let hasGreeting = false;
  let hasRegistration = false;
  let hasSymptoms = false;
  let hasQuestion = false;
  let isOutOfScope = false;

  // ── Check for greeting ──
  const greetingMatch = words.some((w) => GREETING_KEYWORDS.has(w)) ||
    Array.from(GREETING_KEYWORDS).some((g) => g.includes(" ") && lower.includes(g));
  if (greetingMatch) {
    hasGreeting = true;
    signals.push({ type: "greeting", confidence: 0.9 });
  }

  // ── Check for registration info ──
  const hasRegPattern = REGISTRATION_PATTERNS.some((p) => p.test(lower));
  const hasNumber = /\d+/.test(lower);
  const hasPregnancyWord = REGISTRATION_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasRegPattern && hasNumber && hasPregnancyWord) {
    hasRegistration = true;
    signals.push({ type: "registration", confidence: 0.9 });
  }

  // ── Check for symptoms ──
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
    hasSymptoms = true;
    const conf = Math.min(0.95, 0.7 + matchedSymptoms.length * 0.1);
    signals.push({ type: "symptom_report", confidence: conf, detail: matchedSymptoms.join(", ") });
  }

  // ── Check for question ──
  const hasQuestionIndicator = QUESTION_INDICATORS.some((qi) => lower.includes(qi));
  const hasPregnancyTopic = PREGNANCY_TOPIC_KEYWORDS.some((pt) => lower.includes(pt));
  if (hasQuestionIndicator) {
    hasQuestion = true;
    signals.push({ type: "pregnancy_question", confidence: hasPregnancyTopic ? 0.85 : 0.6 });
  }

  // ── Check for non-pregnancy health ──
  const nonPregMatch = words.some((w) => NON_PREGNANCY_HEALTH.has(w)) ||
    Array.from(NON_PREGNANCY_HEALTH).some((kw) => kw.includes(" ") && lower.includes(kw));
  if (nonPregMatch) {
    isOutOfScope = true;
    signals.push({ type: "non_pregnancy_health", confidence: 0.8 });
  }

  // ── Check for follow-up ──
  if (wordCount <= 3) {
    const isFollowup = words.every((w) => FOLLOWUP_WORDS.has(w) || /^\d+$/.test(w));
    if (isFollowup) {
      signals.push({ type: "followup_response", confidence: 0.9 });
    }
  }

  // ── Determine primary intent (priority order for safety) ──
  let primaryIntent: MessageIntent = "unknown";

  if (hasSymptoms) {
    primaryIntent = "symptom_report";
  } else if (hasRegistration) {
    primaryIntent = "registration";
  } else if (hasQuestion) {
    primaryIntent = "pregnancy_question";
  } else if (isOutOfScope && !hasSymptoms && !hasRegistration) {
    primaryIntent = "non_pregnancy_health";
  } else if (hasGreeting && signals.length === 1) {
    primaryIntent = "greeting";
  } else if (wordCount <= 3 && signals.some((s) => s.type === "followup_response")) {
    primaryIntent = "followup_response";
  } else if (wordCount > 3 && signals.length === 0) {
    primaryIntent = "unrelated";
  }

  const isInScope = hasSymptoms || hasRegistration || hasGreeting || hasQuestion ||
    signals.some((s) => s.type === "followup_response");

  return {
    primaryIntent,
    signals,
    isInScope,
    hasSymptoms,
    hasRegistration,
    hasQuestion,
    hasGreeting,
  };
}
