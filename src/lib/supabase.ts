import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Mother,
  Message,
  MessageInsert,
  RiskEvent,
  RiskEventInsert,
  WeeklyGuidance,
  Language,
  ConversationState,
  ConversationStateUpdate,
  MessageTraceInsert,
} from "@/types/database";

let _client: SupabaseClient | null = null;

function db() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

export async function findOrCreateMother(phone: string): Promise<Mother> {
  const { data: existing } = await db()
    .from("mothers")
    .select("*")
    .eq("phone", phone)
    .single<Mother>();

  if (existing) return existing;

  const { data: created, error } = await db()
    .from("mothers")
    .insert({ phone })
    .select()
    .single<Mother>();

  if (error) throw new Error(`Failed to create mother: ${error.message}`);
  return created!;
}

export async function updateMother(
  id: string,
  updates: Partial<Pick<Mother, "name" | "preferred_language" | "pregnancy_week">>
): Promise<Mother> {
  const { data, error } = await db()
    .from("mothers")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single<Mother>();

  if (error) throw new Error(`Failed to update mother: ${error.message}`);
  return data!;
}

export async function storeMessage(msg: MessageInsert): Promise<Message> {
  const { data, error } = await db()
    .from("messages")
    .insert({
      mother_id: msg.mother_id,
      channel: msg.channel ?? "web",
      direction: msg.direction,
      message: msg.message,
      raw_message: msg.raw_message ?? null,
      risk_level: msg.risk_level ?? null,
      message_hash: msg.message_hash ?? null,
      processing_status: msg.processing_status ?? "completed",
      intent: msg.intent ?? null,
    })
    .select()
    .single<Message>();

  if (error) throw new Error(`Failed to store message: ${error.message}`);
  return data!;
}

export async function storeRiskEvent(event: RiskEventInsert): Promise<RiskEvent> {
  const { data, error } = await db()
    .from("risk_events")
    .insert({
      mother_id: event.mother_id,
      risk_level: event.risk_level,
      symptoms: event.symptoms,
      reasoning: event.reasoning,
    })
    .select()
    .single<RiskEvent>();

  if (error) throw new Error(`Failed to store risk event: ${error.message}`);
  return data!;
}

export async function getWeeklyGuidance(
  week: number,
  language: Language
): Promise<WeeklyGuidance | null> {
  const { data } = await db()
    .from("weekly_guidance")
    .select("*")
    .eq("week_number", week)
    .eq("language", language)
    .single<WeeklyGuidance>();

  return data ?? null;
}

export async function getRecentMessages(
  motherId: string,
  limit = 10
): Promise<Message[]> {
  const { data } = await db()
    .from("messages")
    .select("*")
    .eq("mother_id", motherId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Message[]>();

  return data ?? [];
}

// --- Dashboard queries ---

export async function getDashboardStats() {
  const [mothers, messages, highRisk] = await Promise.all([
    db().from("mothers").select("*", { count: "exact", head: true }),
    db().from("messages").select("*", { count: "exact", head: true }),
    db()
      .from("risk_events")
      .select("*", { count: "exact", head: true })
      .eq("risk_level", "high"),
  ]);

  return {
    motherCount: mothers.count ?? 0,
    messageCount: messages.count ?? 0,
    highRiskCount: highRisk.count ?? 0,
  };
}

export async function getRecentRiskEvents(limit = 20): Promise<RiskEvent[]> {
  const { data } = await db()
    .from("risk_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<RiskEvent[]>();

  return data ?? [];
}

interface ConversationRow {
  id: string;
  mother_id: string;
  direction: string;
  message: string;
  created_at: string;
  mothers: { phone: string; name: string | null; pregnancy_week: number | null } | null;
}

export async function getRecentConversations(limit = 20): Promise<ConversationRow[]> {
  const { data } = await db()
    .from("messages")
    .select("*, mothers(phone, name, pregnancy_week)")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ConversationRow[]>();

  return data ?? [];
}

export async function getLanguageDistribution() {
  const { data } = await db()
    .from("mothers")
    .select("preferred_language")
    .returns<{ preferred_language: string | null }[]>();

  if (!data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const lang = row.preferred_language ?? "unknown";
    counts[lang] = (counts[lang] ?? 0) + 1;
  }

  return Object.entries(counts).map(([language, count]) => ({ language, count }));
}

export async function getPregnancyWeekDistribution() {
  const { data } = await db()
    .from("mothers")
    .select("pregnancy_week")
    .not("pregnancy_week", "is", null)
    .returns<{ pregnancy_week: number }[]>();

  if (!data) return [];

  const counts: Record<number, number> = {};
  for (const row of data) {
    counts[row.pregnancy_week] = (counts[row.pregnancy_week] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([week, count]) => ({ week: Number(week), count }))
    .sort((a, b) => a.week - b.week);
}

// --- Idempotency & conversation state ---

export async function checkDuplicate(
  motherId: string,
  messageHash: string
): Promise<boolean> {
  const { data } = await db()
    .from("messages")
    .select("id")
    .eq("mother_id", motherId)
    .eq("message_hash", messageHash)
    .limit(1)
    .maybeSingle();

  return data !== null;
}

export async function getConversationState(
  motherId: string
): Promise<ConversationState | null> {
  const { data } = await db()
    .from("conversation_state")
    .select("*")
    .eq("mother_id", motherId)
    .single<ConversationState>();

  return data ?? null;
}

export async function updateConversationState(
  motherId: string,
  update: ConversationStateUpdate
): Promise<void> {
  const { error } = await db()
    .from("conversation_state")
    .upsert(
      {
        mother_id: motherId,
        ...update,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mother_id" }
    );

  if (error)
    throw new Error(`Failed to update conversation state: ${error.message}`);
}

export async function storeTrace(trace: MessageTraceInsert): Promise<void> {
  const { error } = await db().from("message_traces").insert(trace);

  if (error) throw new Error(`Failed to store trace: ${error.message}`);
}
