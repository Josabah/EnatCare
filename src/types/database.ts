export interface Mother {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: Language | null;
  pregnancy_week: number | null;
  created_at: string;
  updated_at: string;
}

export type MessageChannel = "sms" | "web" | "future_whatsapp";

export interface Message {
  id: string;
  mother_id: string;
  channel: MessageChannel;
  direction: "inbound" | "outbound";
  message: string;
  raw_message: string | null;
  risk_level: RiskLevel | null;
  created_at: string;
}

export interface RiskEvent {
  id: string;
  mother_id: string;
  risk_level: RiskLevel;
  symptoms: string[];
  reasoning: string;
  created_at: string;
}

export interface WeeklyGuidance {
  id: string;
  week_number: number;
  title: string;
  content: string;
  language: Language;
}

export type Language = "am" | "om" | "ti" | "en" | "mixed";

export type RiskLevel = "low" | "medium" | "high";

export interface MotherInsert {
  phone: string;
  name?: string | null;
  preferred_language?: Language | null;
  pregnancy_week?: number | null;
}

export interface MessageInsert {
  mother_id: string;
  channel?: MessageChannel;
  direction: "inbound" | "outbound";
  message: string;
  raw_message?: string | null;
  risk_level?: RiskLevel | null;
}

export interface RiskEventInsert {
  mother_id: string;
  risk_level: RiskLevel;
  symptoms: string[];
  reasoning: string;
}
