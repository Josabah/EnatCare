export interface Mother {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: Language | null;
  pregnancy_week: number | null;
  registration_date: string | null;
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
  message_hash: string | null;
  processing_status: "processing" | "completed" | "failed";
  intent: MessageIntent | null;
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
  message_hash?: string | null;
  processing_status?: "processing" | "completed" | "failed";
  intent?: MessageIntent | null;
}

export interface RiskEventInsert {
  mother_id: string;
  risk_level: RiskLevel;
  symptoms: string[];
  reasoning: string;
}

export type MessageIntent =
  | "greeting"
  | "registration"
  | "symptom_report"
  | "followup_response"
  | "pregnancy_question"
  | "non_pregnancy_health"
  | "unrelated"
  | "unknown";

export type ConversationStateType =
  | "idle"
  | "awaiting_followup"
  | "awaiting_registration"
  | "awaiting_clarification";

export interface ConversationState {
  id: string;
  mother_id: string;
  state: ConversationStateType;
  pending_question: string | null;
  pending_context: Record<string, unknown>;
  last_intent: string | null;
  last_risk_level: string | null;
  updated_at: string;
}

export interface ConversationStateUpdate {
  state?: ConversationStateType;
  pending_question?: string | null;
  pending_context?: Record<string, unknown>;
  last_intent?: string | null;
  last_risk_level?: string | null;
}

export interface MessageTrace {
  id: string;
  mother_id: string;
  message_id: string | null;
  phone: string;
  raw_message: string;
  channel: string;
  detected_language: string | null;
  intent: string | null;
  extracted_symptoms: string[];
  pregnancy_week: number | null;
  risk_level: string | null;
  response_text: string | null;
  processing_time_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface MessageTraceInsert {
  mother_id: string;
  message_id?: string | null;
  phone: string;
  raw_message: string;
  channel: string;
  detected_language?: string | null;
  intent?: string | null;
  extracted_symptoms?: string[];
  pregnancy_week?: number | null;
  risk_level?: string | null;
  response_text?: string | null;
  processing_time_ms?: number | null;
  error?: string | null;
}
