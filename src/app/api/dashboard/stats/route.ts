import { NextResponse } from "next/server";
import {
  getDashboardStats,
  getRecentRiskEvents,
  getRecentConversations,
  getLanguageDistribution,
  getPregnancyWeekDistribution,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [stats, riskEvents, conversations, languages, weekDistribution] =
      await Promise.all([
        getDashboardStats(),
        getRecentRiskEvents(20),
        getRecentConversations(20),
        getLanguageDistribution(),
        getPregnancyWeekDistribution(),
      ]);

    return NextResponse.json({
      stats,
      riskEvents,
      conversations,
      languages,
      weekDistribution,
    });
  } catch (error) {
    console.error("[EnatAI] Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
