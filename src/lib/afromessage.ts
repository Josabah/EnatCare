/**
 * AfroMessage SMS Gateway integration.
 *
 * Handles receiving inbound SMS via webhook, sending outbound SMS,
 * and verifying webhook payloads.
 *
 * Docs reference: https://afromessage.com/docs
 */

const AFROMESSAGE_API_KEY = process.env.AFROMESSAGE_API_KEY ?? "";
const AFROMESSAGE_BASE_URL =
  process.env.AFROMESSAGE_BASE_URL ?? "https://api.afromessage.com/api";
const AFROMESSAGE_IDENTIFIER_ID = process.env.AFROMESSAGE_IDENTIFIER_ID ?? "";
const AFROMESSAGE_SENDER_NAME = process.env.AFROMESSAGE_SENDER_NAME ?? "";
const AFROMESSAGE_WEBHOOK_SECRET = process.env.AFROMESSAGE_WEBHOOK_SECRET ?? "";

export interface InboundSMS {
  from: string;
  to: string;
  message: string;
  timestamp: string;
  messageId: string;
}

export interface OutboundSMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface AfroMessageWebhookPayload {
  type: string;
  from: string;
  to: string;
  message: string;
  date: string;
  smsc_message_id?: string;
  token?: string;
}

/**
 * Parse the inbound webhook payload from AfroMessage.
 * Validates required fields and returns a normalized InboundSMS object.
 */
export function receiveSMS(body: unknown): InboundSMS {
  const payload = body as AfroMessageWebhookPayload;

  if (!payload?.from || !payload?.message) {
    throw new Error("Invalid AfroMessage webhook payload: missing from or message");
  }

  return {
    from: normalizePhone(payload.from),
    to: payload.to ?? "",
    message: payload.message,
    timestamp: payload.date ?? new Date().toISOString(),
    messageId: payload.smsc_message_id ?? crypto.randomUUID(),
  };
}

/**
 * Verify the webhook payload authenticity.
 * Checks the token field against our stored secret.
 */
export function verifyWebhook(body: unknown): boolean {
  if (!AFROMESSAGE_WEBHOOK_SECRET) return true; // skip verification in dev

  const payload = body as AfroMessageWebhookPayload;
  return payload?.token === AFROMESSAGE_WEBHOOK_SECRET;
}

/**
 * Send an SMS response to a phone number via AfroMessage.
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<OutboundSMSResult> {
  try {
    const response = await fetch(`${AFROMESSAGE_BASE_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AFROMESSAGE_API_KEY}`,
      },
      body: JSON.stringify({
        from: AFROMESSAGE_IDENTIFIER_ID,
        sender: AFROMESSAGE_SENDER_NAME,
        to: normalizePhone(to),
        message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AfroMessage send failed: ${response.status}`, errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      acknowledge: "success" | "error";
      response?: { message_id?: string; errors?: string[] };
    };

    if (data.acknowledge !== "success") {
      const errors = data.response?.errors?.join(", ") ?? "Unknown API error";
      console.error("AfroMessage API error:", errors);
      return { success: false, error: errors };
    }

    return {
      success: true,
      messageId: data.response?.message_id ?? undefined,
    };
  } catch (error) {
    console.error("AfroMessage send error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Normalize Ethiopian phone numbers to a consistent format.
 * Handles +251, 251, 09, and 9 prefixes.
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s-()]/g, "");

  if (cleaned.startsWith("+251")) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith("251")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  return `+251${cleaned}`;
}
