/**
 * SMS Transport Layer — abstraction over SMS delivery.
 *
 * Uses "SMS Gateway for Android" by capcom6 in CLOUD mode.
 * The phone syncs with api.sms-gate.app, and our server
 * talks to the same cloud API. No direct phone-to-server connection needed.
 *
 * Cloud API: https://api.sms-gate.app/3rdparty/v1
 * Docs:      https://docs.sms-gate.app
 * App:       https://play.google.com/store/apps/details?id=com.capcom.smsgateway
 */

import crypto from "crypto";

export interface InboundMessage {
  phone: string;
  text: string;
  timestamp: string;
  gatewayMessageId?: string;
}

export interface OutboundResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MessageTransport {
  readonly name: string;
  parseInbound(payload: unknown): InboundMessage;
  sendMessage(phone: string, text: string): Promise<OutboundResult>;
  verifyPayload(rawBody: string, headers: Record<string, string>): boolean;
}

// ── SMS Gateway for Android (capcom6) ───────────────────

interface SmsGatewayWebhookPayload {
  event: string;
  payload: {
    messageId?: string;
    message?: string;
    sender?: string;
    phoneNumber?: string;
    receivedAt?: string;
  };
}

export class SmsGatewayTransport implements MessageTransport {
  readonly name = "sms-gateway-android";

  private baseUrl: string;
  private username: string;
  private password: string;
  private signingKey: string;

  constructor(config?: {
    baseUrl?: string;
    username?: string;
    password?: string;
    signingKey?: string;
  }) {
    this.baseUrl = config?.baseUrl ?? process.env.SMS_GATEWAY_URL ?? "https://api.sms-gate.app/3rdparty/v1";
    this.username = config?.username ?? process.env.SMS_GATEWAY_USERNAME ?? "";
    this.password = config?.password ?? process.env.SMS_GATEWAY_PASSWORD ?? "";
    this.signingKey = config?.signingKey ?? process.env.SMS_GATEWAY_SIGNING_KEY ?? "";
  }

  /**
   * Parse the sms:received webhook payload.
   *
   * Payload shape:
   * {
   *   "event": "sms:received",
   *   "payload": {
   *     "messageId": "abc123",
   *     "message": "ene 8 wer negn...",
   *     "sender": "+251912345678",
   *     "receivedAt": "2024-01-15T10:30:00.000+03:00"
   *   }
   * }
   */
  parseInbound(payload: unknown): InboundMessage {
    const data = payload as SmsGatewayWebhookPayload;

    if (!data?.payload) {
      throw new Error("Invalid webhook payload: missing payload object");
    }

    const p = data.payload;
    const phone = p.sender ?? p.phoneNumber;
    const text = p.message;

    if (!phone) throw new Error("Missing sender phone number in webhook payload");
    if (!text) throw new Error("Missing message text in webhook payload");

    return {
      phone: normalizeEthiopianPhone(phone),
      text,
      timestamp: p.receivedAt ?? new Date().toISOString(),
      gatewayMessageId: p.messageId ?? undefined,
    };
  }

  /**
   * Verify webhook HMAC-SHA256 signature.
   *
   * The app signs: HMAC-SHA256(rawBody + X-Timestamp, signingKey)
   * and sends the result in the X-Signature header.
   */
  verifyPayload(rawBody: string, headers: Record<string, string>): boolean {
    if (!this.signingKey) return true;

    const signature = headers["x-signature"];
    const timestamp = headers["x-timestamp"];

    if (!signature || !timestamp) return false;

    const message = rawBody + timestamp;
    const expected = crypto
      .createHmac("sha256", this.signingKey)
      .update(message)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(signature, "hex")
      );
    } catch {
      return false;
    }
  }

  /**
   * Send SMS through the cloud API.
   *
   * API: POST https://api.sms-gate.app/3rdparty/v1/message
   * Auth: Basic Auth (username:password from app's Home tab)
   * Body: { "phoneNumbers": ["+251..."], "message": "..." }
   */
  async sendMessage(phone: string, text: string): Promise<OutboundResult> {
    if (!this.baseUrl) {
      console.warn("[SMS Transport] No SMS_GATEWAY_URL configured — skipping send");
      return { success: false, error: "SMS gateway not configured" };
    }

    try {
      const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");

      const response = await fetch(`${this.baseUrl}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          phoneNumbers: [normalizeEthiopianPhone(phone)],
          message: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SMS Transport] Send failed: ${response.status}`, errorText);
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as { id?: string; state?: string };
      return {
        success: true,
        messageId: data.id ?? undefined,
      };
    } catch (error) {
      console.error("[SMS Transport] Send error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ── No-op transport for testing and web chat ────────────

export class NoopTransport implements MessageTransport {
  readonly name = "noop";

  parseInbound(payload: unknown): InboundMessage {
    const p = payload as Record<string, unknown>;
    return {
      phone: asString(p.phone ?? p.from) || "+251900000000",
      text: asString(p.message ?? p.text) || "",
      timestamp: new Date().toISOString(),
    };
  }

  verifyPayload(): boolean {
    return true;
  }

  async sendMessage(): Promise<OutboundResult> {
    return { success: true, messageId: "noop" };
  }
}

// ── Sender validation ───────────────────────────────────

/**
 * Returns true if the sender looks like a real person's phone number
 * that we can reply to. Returns false for shortcodes, alphanumeric
 * sender IDs, and service numbers.
 *
 * Non-replyable senders include:
 * - Shortcodes (4-6 digits): "8844", "127", "994"
 * - Alphanumeric IDs: "EthioTel", "CBE", "Telebirr", "AwashBank"
 * - Very short numbers (< 7 digits after cleaning)
 * - Numbers starting with known service prefixes
 */
export function isReplyableNumber(sender: string): boolean {
  const cleaned = sender.replace(/[\s\-()+"]/g, "");

  // Alphanumeric sender ID (contains letters) — not a real phone
  if (/[a-zA-Z]/.test(cleaned)) return false;

  // Strip country code to get local digits
  let digits = cleaned;
  if (digits.startsWith("251")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  // Ethiopian mobile numbers are 9 digits (9XXXXXXXX or 7XXXXXXXX)
  // Anything shorter than 7 digits is a shortcode or service number
  if (digits.length < 7) return false;

  // Ethiopian mobile prefixes:
  //   9X — Ethio Telecom (all 09XX numbers)
  //   7X — Safaricom Ethiopia (07XX numbers)
  if (digits.length === 9 && (digits.startsWith("9") || digits.startsWith("7"))) {
    return true;
  }

  // Allow other reasonably-lengthed numbers (international, landline, etc.)
  if (digits.length >= 7) return true;

  return false;
}

// ── Helpers ─────────────────────────────────────────────

function asString(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return "";
}

export function normalizeEthiopianPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");

  if (cleaned.startsWith("+251")) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith("251")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  return `+251${cleaned}`;
}
