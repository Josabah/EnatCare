import { NextRequest, NextResponse } from "next/server";
import { processIncomingMessage } from "@/lib/messageProcessor";

/**
 * Demo endpoint — runs the full EnatAI pipeline via web.
 *
 * POST /api/demo
 * Body: { "phone": "+251912345678", "message": "..." }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = body.phone ?? "+251900000000";
    const message = body.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing required field: message" },
        { status: 400 }
      );
    }

    const result = await processIncomingMessage(phone, message, {
      channel: "web",
      skipSms: true,
    });

    return NextResponse.json({
      success: true,
      deduplicated: result.deduplicated ?? false,
      input: { phone, message },
      intent: result.intent,
      understanding: {
        language: result.understanding.language,
        pregnancyRelated: result.understanding.pregnancyRelated,
        symptoms: result.understanding.symptoms,
        pregnancyWeek: result.understanding.pregnancyWeek,
        questions: result.understanding.questions,
        emotionalState: result.understanding.emotionalState,
        summary: result.understanding.messageSummary,
      },
      assessment: {
        riskLevel: result.assessment.level,
        detectedSymptoms: result.assessment.symptoms.map((s) => ({
          name: s.name,
          category: s.category,
          severity: s.severity,
        })),
        reasoning: result.assessment.reasoning,
        recommendedAction: result.assessment.recommendedAction,
        followUpQuestions: result.assessment.followUpQuestions,
      },
      response: {
        text: result.response.text,
        language: result.response.language,
      },
      mother: {
        id: result.mother.id,
        pregnancyWeek: result.mother.pregnancy_week,
        language: result.mother.preferred_language,
      },
      smsSent: result.smsSent,
    });
  } catch (error) {
    console.error("[EnatAI Demo] Error:", error);
    return NextResponse.json(
      {
        error: "Processing failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
