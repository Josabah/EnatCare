import { NextRequest, NextResponse } from "next/server";
import { SmsGatewayTransport } from "@/lib/smsTransport";
import { processIncomingMessage } from "@/lib/messageProcessor";

const transport = new SmsGatewayTransport();

/**
 * SMS Gateway Webhook — receives inbound SMS from Android phone.
 *
 * POST /api/webhooks/sms
 *
 * The SMS Gateway for Android app forwards received SMS here.
 * Payload shape: { event: "sms:received", payload: { sender, message, receivedAt } }
 * Verification: HMAC-SHA256 via X-Signature + X-Timestamp headers.
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

    console.log(
      `[SMS Webhook] Received from ${inbound.phone}: "${inbound.text.slice(0, 60)}"`
    );

    const result = await processIncomingMessage(
      inbound.phone,
      inbound.text,
      { channel: "sms", skipSms: false }
    );

    console.log(
      `[SMS Webhook] Processed: risk=${result.assessment.level}, ` +
        `symptoms=${result.assessment.symptoms.length}, sms_sent=${result.smsSent}`
    );

    return NextResponse.json({
      success: true,
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

/**
 * Health check — verify the webhook endpoint is active.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "EnatAI SMS Webhook",
    transport: transport.name,
    timestamp: new Date().toISOString(),
  });
}
