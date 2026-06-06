import { NextRequest, NextResponse } from "next/server";
import { SmsGatewayTransport, isReplyableNumber } from "@/lib/smsTransport";
import { processIncomingMessage } from "@/lib/messageProcessor";

const transport = new SmsGatewayTransport();

/**
 * SMS Gateway Webhook — receives inbound SMS from Android phone.
 *
 * POST /api/webhooks/sms
 *
 * Idempotency: duplicate webhook deliveries are detected by message hash
 * inside processIncomingMessage and silently dropped (no duplicate reply).
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

    if (!transport.verifyPayload(rawBody, headers)) {
      console.warn("[SMS Webhook] Invalid HMAC signature");
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);

    if (body.event && body.event !== "sms:received") {
      return NextResponse.json({ status: "ignored", event: body.event });
    }

    const inbound = transport.parseInbound(body);

    // Drop messages from non-replyable senders (shortcodes, banks, telecom, apps)
    if (!isReplyableNumber(inbound.phone)) {
      console.log(
        `[SMS Webhook] Ignored non-replyable sender: ${inbound.phone}`
      );
      return NextResponse.json({ status: "ignored", reason: "non-replyable sender" });
    }

    console.log(
      `[SMS Webhook] Received from ${inbound.phone}: "${inbound.text.slice(0, 60)}"`
    );

    const result = await processIncomingMessage(
      inbound.phone,
      inbound.text,
      { channel: "sms", skipSms: false }
    );

    if (result.deduplicated) {
      console.log(`[SMS Webhook] Duplicate detected, skipped processing`);
      return NextResponse.json({ success: true, deduplicated: true });
    }

    console.log(
      `[SMS Webhook] Processed: intent=${result.intent} risk=${result.assessment.level} ` +
        `symptoms=${result.assessment.symptoms.length} sms_sent=${result.smsSent}`
    );

    return NextResponse.json({
      success: true,
      intent: result.intent,
      riskLevel: result.assessment.level,
      symptomsDetected: result.assessment.symptoms.length,
      responseSent: result.smsSent,
    });
  } catch (error) {
    console.error("[SMS Webhook] Error:", error);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "EnatAI SMS Webhook",
    transport: transport.name,
    timestamp: new Date().toISOString(),
  });
}
