import type { RiskLevel, Language } from "./database";

export interface RiskAssessment {
  level: RiskLevel;
  symptoms: DetectedSymptom[];
  reasoning: string;
  recommendedAction: string;
  followUpQuestions: string[];
}

export interface DetectedSymptom {
  name: string;
  category: SymptomCategory;
  severity: "mild" | "moderate" | "severe";
  originalText: string;
}

export type SymptomCategory =
  | "bleeding"
  | "pain"
  | "headache"
  | "vision"
  | "convulsion"
  | "fetal_movement"
  | "breathing"
  | "swelling"
  | "fever"
  | "discharge"
  | "nausea"
  | "fatigue"
  | "other";

export interface PregnancyContext {
  language: Language;
  symptoms: string[];
  pregnancyWeek: number | null;
  urgency: "low" | "medium" | "high";
  confidence: number;
}

export interface ResponseMessage {
  text: string;
  language: Language;
  riskLevel: RiskLevel;
  includesGuidance: boolean;
}
