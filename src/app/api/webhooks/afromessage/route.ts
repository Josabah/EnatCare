import { NextResponse } from "next/server";

/**
 * AfroMessage webhook — DEPRECATED.
 *
 * EnatAI has pivoted to an Android SMS Gateway architecture.
 * Inbound SMS is now handled at /api/webhooks/sms.
 *
 * This route is kept as a redirect notice only.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use /api/webhooks/sms instead.",
      migration: "EnatAI now uses an Android SMS Gateway for SMS transport.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json({
    status: "deprecated",
    message: "AfroMessage integration has been replaced by Android SMS Gateway.",
    newEndpoint: "/api/webhooks/sms",
  });
}
