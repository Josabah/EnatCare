/**
 * Normalization layer for multi-language SMS input.
 *
 * Handles Amharic (Ge'ez & Romanized), Afaan Oromo, Tigrinya, English,
 * and mixed-language messages. The dictionary is intentionally kept as a
 * flat map so field health workers can expand it without code changes.
 */

export interface NormalizationResult {
  normalized: string;
  detectedLanguage: "am" | "om" | "ti" | "en" | "mixed";
  tokens: string[];
}

// ---------------------------------------------------------------------------
// Romanized Amharic / Afaan Oromo / Tigrinya → English keyword mapping
// Organized by medical domain so expansions stay grouped.
// ---------------------------------------------------------------------------
const DICTIONARY: Record<string, string> = {
  // --- Pregnancy / gestational terms ---
  wer: "month",
  wor: "month",
  amet: "year",
  negn: "am",
  nesh: "are",
  pregnant: "pregnant",
  erguze: "pregnant",
  erguzi: "pregnant",
  irguz: "pregnant",
  ulfaa: "pregnant",
  ulf: "pregnant",
  month: "month",
  semint: "week",
  sement: "week",
  tornet: "week",

  // --- Pronouns / common sentence words ---
  ene: "I",
  ante: "you",
  anchi: "you",
  esu: "he",
  eswa: "she",
  doctor: "doctor",
  hakim: "doctor",
  hospitaal: "hospital",
  hospital: "hospital",
  clinic: "clinic",
  bota: "place",

  // --- Symptom terms (Romanized Amharic) ---
  ras: "head",
  rase: "head",
  yimetagnal: "hurts",
  yikorenal: "hurts",
  yikoregnal: "hurts",
  yimetal: "nausea",
  yadetebignal: "impaired",
  birignal: "blurred",
  ayne: "eye",
  hod: "stomach",
  igir: "foot",
  ej: "hand",
  fit: "face",
  jerbat: "back",
  dem: "blood",
  yiferesal: "flowing",
  metat: "coming",
  kurtet: "pain",
  mikitat: "headache",
  tikus: "fever",
  mikiyet: "temperature",
  dekimognal: "tired",
  slekome: "weak",
  yaskosikosal: "nauseous",
  ababiwal: "swollen",
  tinifas: "breath",
  yikotenal: "difficult",
  chigir: "problem",
  lij: "child",
  lijie: "my child",
  ayinkasakesim: "not moving",
  yemayinkasakes: "not moving",
  yemikesakes: "shaking",
  mirgirgir: "shaking",
  wuha: "water",
  hod_dirket: "constipation",
  yemikelaw: "heartburn",
  betam: "very",
  tinish: "small",
  bizu: "much",

  // --- Afaan Oromo terms ---
  dhukkubbii: "pain",
  mataa: "head",
  garaa: "stomach",
  dugdaa: "back",
  dhiiga: "blood",
  hafuura: "breath",
  dhiita: "swelling",
  tokko: "nausea",
  lolaa: "vomiting",
  dadhabbii: "fatigue",
  ho_a: "fever",
  qaamaa: "body",
  sochii: "movement",
  daa_imaa: "stopped",
  bishaan: "water",
  qufaa: "convulsion",
  ija: "eye",

  // --- Tigrinya terms ---
  matane: "headache",
  resi: "head",
  kebd: "stomach",
  hatsbi: "pain",

  // --- Numeric Amharic ---
  and: "1",
  hulet: "2",
  sost: "3",
  arat: "4",
  amist: "5",
  sidist: "6",
  sebat: "7",
  siment: "8",
  zetegn: "9",
  asir: "10",
};

// Words that strongly signal a specific language
const LANGUAGE_SIGNALS: Record<string, "am" | "om" | "ti"> = {
  ene: "am",
  negn: "am",
  yimetagnal: "am",
  yikorenal: "am",
  yikoregnal: "am",
  yadetebignal: "am",
  hod: "am",
  rase: "am",
  erguze: "am",
  lijie: "am",
  dhukkubbii: "om",
  garaa: "om",
  ulfaa: "om",
  bishaan: "om",
  dhiiga: "om",
  matane: "ti",
  hatsbi: "ti",
  resi: "ti",
  kebd: "ti",
};

export function normalizeMessage(raw: string): NormalizationResult {
  const cleaned = raw
    .toLowerCase()
    .replace(/[፡።፣]/g, " ") // Ge'ez punctuation
    .replace(/[.,!?;:'"()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  const languageVotes: Record<string, number> = { am: 0, om: 0, ti: 0, en: 0 };

  const normalizedTokens = tokens.map((token) => {
    if (LANGUAGE_SIGNALS[token]) {
      languageVotes[LANGUAGE_SIGNALS[token]] += 2;
    }

    if (DICTIONARY[token]) {
      return DICTIONARY[token];
    }

    // Check if the token looks like English
    if (/^[a-z]+$/.test(token) && token.length > 2) {
      languageVotes.en += 1;
    }

    return token;
  });

  // Detect if message contains Ge'ez script
  const hasGeez = /[\u1200-\u137F]/.test(raw);
  if (hasGeez) {
    languageVotes.am += 5;
  }

  const detectedLanguage = resolveLanguage(languageVotes);

  return {
    normalized: normalizedTokens.join(" "),
    detectedLanguage,
    tokens: normalizedTokens,
  };
}

function resolveLanguage(
  votes: Record<string, number>
): "am" | "om" | "ti" | "en" | "mixed" {
  const entries = Object.entries(votes).filter(([, v]) => v > 0);
  if (entries.length === 0) return "en";

  entries.sort(([, a], [, b]) => b - a);
  const [topLang, topVotes] = entries[0];
  const totalVotes = entries.reduce((sum, [, v]) => sum + v, 0);

  // If top language has less than 60% of votes, it's mixed
  if (topVotes / totalVotes < 0.6 && entries.length > 1) return "mixed";

  return topLang as "am" | "om" | "ti" | "en";
}

/**
 * Extracts a numeric pregnancy week/month from the message.
 * Handles both Arabic numerals and Amharic number words.
 * Returns the value in weeks (converts months → weeks).
 */
export function extractPregnancyWeekFromText(text: string): number | null {
  const normalized = text.toLowerCase();

  // "X month" or "X wer" patterns
  const monthPatterns = [
    /(\d+)\s*(?:month|wer|wor|ወር)/,
    /(?:month|wer|wor|ወር)\s*(\d+)/,
  ];
  for (const pattern of monthPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const months = parseInt(match[1], 10);
      if (months >= 1 && months <= 10) return months * 4;
    }
  }

  // "X week" or "X semint" patterns
  const weekPatterns = [
    /(\d+)\s*(?:week|semint|sement|tornet)/,
    /(?:week|semint|sement|tornet)\s*(\d+)/,
  ];
  for (const pattern of weekPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const weeks = parseInt(match[1], 10);
      if (weeks >= 1 && weeks <= 42) return weeks;
    }
  }

  // Amharic number words followed by month/week indicators
  const amharicNumbers: Record<string, number> = {
    and: 1, hulet: 2, sost: 3, arat: 4, amist: 5,
    sidist: 6, sebat: 7, siment: 8, zetegn: 9, asir: 10,
  };

  for (const [word, num] of Object.entries(amharicNumbers)) {
    if (normalized.includes(word)) {
      if (/wer|wor|month|ወር/.test(normalized)) return num * 4;
      if (/semint|sement|week|tornet/.test(normalized)) return num;
    }
  }

  return null;
}

export { DICTIONARY };
