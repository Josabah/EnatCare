import type { Language, RiskLevel } from "@/types/database";
import type { RiskAssessment, DetectedSymptom, SymptomCategory } from "@/types/risk";
import { ALL_SYMPTOM_RULES } from "@/types/symptoms";

/**
 * The Pregnancy Rules Engine.
 *
 * This is the core decision-making layer. It uses deterministic rules —
 * never LLM output — to classify risk and determine actions.
 *
 * AI extracts information. Rules determine outcomes.
 */

export function assessRisk(
  symptoms: string[],
  pregnancyWeek: number | null
): RiskAssessment {
  const detected = matchSymptoms(symptoms);
  const level = determineRiskLevel(detected, pregnancyWeek);
  const reasoning = buildReasoning(detected, pregnancyWeek, level);
  const recommendedAction = getRecommendedAction(level, detected);
  const followUpQuestions = getFollowUpQuestions(level, detected, pregnancyWeek);

  return {
    level,
    symptoms: detected,
    reasoning,
    recommendedAction,
    followUpQuestions,
  };
}

function matchSymptoms(symptoms: string[]): DetectedSymptom[] {
  const detected: DetectedSymptom[] = [];
  const normalizedSymptoms = symptoms.map((s) => s.toLowerCase());

  for (const symptom of normalizedSymptoms) {
    for (const rule of ALL_SYMPTOM_RULES) {
      const matched = rule.triggers.some(
        (trigger) =>
          symptom.includes(trigger.toLowerCase()) ||
          trigger.toLowerCase().includes(symptom)
      );

      if (matched) {
        // Avoid duplicates by category
        if (!detected.some((d) => d.category === rule.category)) {
          detected.push({
            name: rule.description,
            category: rule.category,
            severity: riskToSeverity(rule.riskLevel),
            originalText: symptom,
          });
        }
        break;
      }
    }
  }

  return detected;
}

function determineRiskLevel(
  detected: DetectedSymptom[],
  pregnancyWeek: number | null
): RiskLevel {
  if (detected.length === 0) return "low";

  const hasHigh = detected.some((d) => d.severity === "severe");
  if (hasHigh) return "high";

  const hasMedium = detected.some((d) => d.severity === "moderate");

  // Gestational context: some medium symptoms become high-risk in late pregnancy
  if (hasMedium && pregnancyWeek !== null) {
    const latePregnancy = pregnancyWeek >= 28;
    const earlyPregnancy = pregnancyWeek <= 12;

    const hasBleedingOrPain = detected.some(
      (d) => d.category === "bleeding" || d.category === "pain"
    );

    if (hasBleedingOrPain && (latePregnancy || earlyPregnancy)) {
      return "high";
    }
  }

  if (hasMedium) return "medium";

  // Multiple low-risk symptoms may warrant monitoring
  if (detected.length >= 3) return "medium";

  return "low";
}

function riskToSeverity(risk: string): "mild" | "moderate" | "severe" {
  if (risk === "high") return "severe";
  if (risk === "medium") return "moderate";
  return "mild";
}

function buildReasoning(
  detected: DetectedSymptom[],
  pregnancyWeek: number | null,
  level: RiskLevel
): string {
  if (detected.length === 0) {
    return "No specific symptoms detected. General guidance provided.";
  }

  const symptomList = detected.map((d) => d.name).join(", ");
  const weekContext =
    pregnancyWeek !== null ? ` at week ${pregnancyWeek}` : "";

  return `Detected: ${symptomList}${weekContext}. Risk classified as ${level}.`;
}

function getRecommendedAction(
  level: RiskLevel,
  detected: DetectedSymptom[]
): string {
  if (level === "high") {
    const dangerSymptoms = detected
      .filter((d) => d.severity === "severe")
      .map((d) => d.name);

    if (dangerSymptoms.length > 0) {
      return `Seek immediate medical care for: ${dangerSymptoms.join(", ")}. Go to the nearest health facility.`;
    }
    return "Please seek medical care as soon as possible. Contact a health worker or go to the nearest clinic.";
  }

  if (level === "medium") {
    return "Monitor your symptoms closely. If they worsen, please seek medical care. Mention these symptoms at your next clinic visit.";
  }

  return "These are common pregnancy experiences. Rest, eat well, and attend your regular clinic visits.";
}

function getFollowUpQuestions(
  level: RiskLevel,
  detected: DetectedSymptom[],
  pregnancyWeek: number | null
): string[] {
  const questions: string[] = [];

  if (pregnancyWeek === null) {
    questions.push("How many months or weeks pregnant are you?");
  }

  if (level === "medium" || level === "high") {
    questions.push("When did these symptoms start?");
    questions.push("Have you experienced this before?");
  }

  if (detected.some((d) => d.category === "bleeding")) {
    questions.push("How much bleeding are you experiencing?");
  }

  if (detected.some((d) => d.category === "pain")) {
    questions.push("Where exactly is the pain? Is it constant or comes and goes?");
  }

  if (detected.some((d) => d.category === "fetal_movement") && pregnancyWeek && pregnancyWeek >= 24) {
    questions.push("When did you last feel the baby move?");
  }

  return questions.slice(0, 3);
}

// --- Response generation ---

const RESPONSES: Record<RiskLevel, Record<Language, (action: string) => string>> = {
  high: {
    am: (action) =>
      `⚠️ ያስተዋልነው ምልክቶች ትኩረት ሊሰጣቸው ይገባል። ${action} እባክዎ ወደ ጤና ተቋም ይሂዱ።`,
    om: (action) =>
      `⚠️ Mallattoon argine kun xiyyeeffannaa barbaada. ${action} Maaloo gara dhaabbata fayyaatti deemaa.`,
    ti: (action) =>
      `⚠️ ዝተረኽቡ ምልክታት ቆላሕታ ዘድልዮም እዮም። ${action} በጃኻ ናብ ጥዕና ትካል ኺድ።`,
    en: (action) =>
      `⚠️ We noticed symptoms that may need urgent attention. ${action}`,
    mixed: (action) =>
      `⚠️ We noticed symptoms that need attention. ${action} Please visit a health facility.`,
  },
  medium: {
    am: (action) =>
      `ያስተዋልነው ምልክቶች ክትትል ያስፈልጋቸዋል። ${action}`,
    om: (action) =>
      `Mallattoon argine hordoffii barbaada. ${action}`,
    ti: (action) =>
      `ዝተረኽቡ ምልክታት ክትትል ዘድልዮም እዮም። ${action}`,
    en: (action) =>
      `We noticed some symptoms worth monitoring. ${action}`,
    mixed: (action) =>
      `We noticed some symptoms worth monitoring. ${action}`,
  },
  low: {
    am: (action) =>
      `ያስተዋልነው ነገር በእርግዝና ወቅት የተለመደ ነው። ${action} ለምርመራ ሲሄዱ ለጤና ባለሙያ ይንገሩ።`,
    om: (action) =>
      `Wanti argine kun yeroo ulfaa keessatti waan beekamaa dha. ${action}`,
    ti: (action) =>
      `ዝተረኽበ ነገር ኣብ እዋን ጥንሲ ልሙድ እዩ። ${action}`,
    en: (action) =>
      `What you described is common during pregnancy. ${action}`,
    mixed: (action) =>
      `What you described is common during pregnancy. ${action}`,
  },
};

export function generateResponse(
  assessment: RiskAssessment,
  language: Language,
  pregnancyWeek: number | null
): string {
  const formatter = RESPONSES[assessment.level][language];
  let response = formatter(assessment.recommendedAction);

  // Append weekly guidance hint if we know the week
  if (pregnancyWeek !== null && assessment.level === "low") {
    response += `\n\nYou are at week ${pregnancyWeek}. Keep attending your regular checkups.`;
  }

  // Append follow-up questions for medium/high risk
  if (
    assessment.followUpQuestions.length > 0 &&
    assessment.level !== "low"
  ) {
    response += `\n\n${assessment.followUpQuestions[0]}`;
  }

  // SMS character limit: truncate if needed (standard SMS = 160 chars,
  // but concatenated SMS supports up to ~1600 chars for Amharic/UTF-8)
  if (response.length > 800) {
    response = response.slice(0, 797) + "...";
  }

  return response;
}
