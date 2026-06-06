/**
 * Structured logging for observability.
 *
 * Every message processing run produces a trace that captures
 * every stage of the pipeline for debugging.
 */

export interface ProcessingTrace {
  phone: string;
  channel: string;
  rawMessage: string;
  detectedLanguage: string | null;
  intent: string | null;
  extractedSymptoms: string[];
  pregnancyWeek: number | null;
  riskLevel: string | null;
  responseText: string | null;
  processingTimeMs: number;
  error: string | null;
  motherId: string | null;
  messageId: string | null;
}

const startTimes = new Map<string, number>();

export function traceStart(traceId: string): void {
  startTimes.set(traceId, Date.now());
}

export function traceEnd(traceId: string): number {
  const start = startTimes.get(traceId);
  startTimes.delete(traceId);
  return start ? Date.now() - start : 0;
}

export function logTrace(trace: ProcessingTrace): void {
  const level = trace.error
    ? "ERROR"
    : trace.riskLevel === "high"
      ? "WARN"
      : "INFO";

  const summary = [
    `[EnatAI ${level}]`,
    `phone=${trace.phone}`,
    `ch=${trace.channel}`,
    `lang=${trace.detectedLanguage ?? "?"}`,
    `intent=${trace.intent ?? "?"}`,
    `risk=${trace.riskLevel ?? "none"}`,
    `symptoms=${trace.extractedSymptoms.length}`,
    `time=${trace.processingTimeMs}ms`,
  ].join(" ");

  if (trace.error) {
    console.error(summary, `error="${trace.error}"`);
  } else {
    console.log(summary);
  }
}

export function logInbound(phone: string, message: string, channel: string): void {
  console.log(
    `[EnatAI RECV] phone=${phone} ch=${channel} len=${message.length} msg="${message.slice(0, 80)}"`
  );
}

export function logOutbound(phone: string, riskLevel: string, smsSent: boolean): void {
  console.log(
    `[EnatAI SEND] phone=${phone} risk=${riskLevel} sms_sent=${smsSent}`
  );
}
