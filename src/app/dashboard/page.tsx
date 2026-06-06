"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface DashboardStats {
  motherCount: number;
  messageCount: number;
  highRiskCount: number;
}

interface RiskEvent {
  id: string;
  mother_id: string;
  risk_level: "low" | "medium" | "high";
  symptoms: string[];
  reasoning: string;
  created_at: string;
}

interface Conversation {
  id: string;
  mother_id: string;
  direction: "inbound" | "outbound";
  message: string;
  created_at: string;
  mothers: { phone: string; name: string | null; pregnancy_week: number | null } | null;
}

interface LanguageDist {
  language: string;
  count: number;
}

interface WeekDist {
  week: number;
  count: number;
}

interface DashboardData {
  stats: DashboardStats;
  riskEvents: RiskEvent[];
  conversations: Conversation[];
  languages: LanguageDist[];
  weekDistribution: WeekDist[];
}

const LANGUAGE_LABELS: Record<string, string> = {
  am: "Amharic",
  om: "Afaan Oromo",
  ti: "Tigrinya",
  en: "English",
  mixed: "Mixed",
  unknown: "Unknown",
};

const RISK_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  high: { bg: "bg-danger-light", text: "text-danger", dot: "bg-danger" },
  medium: { bg: "bg-warning-light", text: "text-warning", dot: "bg-warning" },
  low: { bg: "bg-accent-light", text: "text-accent", dot: "bg-accent" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-foreground/50">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-danger">Failed to load dashboard: {error}</p>
        <button
          onClick={fetchData}
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-foreground/10 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Enat<span className="text-accent">AI</span>
            <span className="ml-2 text-sm font-normal text-foreground/50">
              Dashboard
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-foreground/40">
              Auto-refresh: 30s
            </span>
            <button
              onClick={fetchData}
              className="rounded-md border border-foreground/15 px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats Cards */}
        <div className="grid gap-5 sm:grid-cols-3">
          <StatCard
            label="Registered Mothers"
            value={data.stats.motherCount}
            icon="👩"
          />
          <StatCard
            label="Total Messages"
            value={data.stats.messageCount}
            icon="💬"
          />
          <StatCard
            label="High-Risk Alerts"
            value={data.stats.highRiskCount}
            icon="⚠️"
            alert={data.stats.highRiskCount > 0}
          />
        </div>

        {/* Main Grid */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Risk Events */}
          <section className="rounded-xl border border-foreground/10 bg-white">
            <div className="border-b border-foreground/10 px-5 py-4">
              <h2 className="font-semibold">Recent Risk Events</h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.riskEvents.length === 0 ? (
                <EmptyState message="No risk events recorded yet." />
              ) : (
                <ul className="divide-y divide-foreground/5">
                  {data.riskEvents.map((event) => (
                    <li key={event.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <RiskBadge level={event.risk_level} />
                            <span className="text-xs text-foreground/40">
                              {formatTime(event.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-foreground/70">
                            {event.reasoning}
                          </p>
                          {event.symptoms.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {event.symptoms.map((s, i) => (
                                <span
                                  key={i}
                                  className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/60"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Recent Conversations */}
          <section className="rounded-xl border border-foreground/10 bg-white">
            <div className="border-b border-foreground/10 px-5 py-4">
              <h2 className="font-semibold">Recent Conversations</h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.conversations.length === 0 ? (
                <EmptyState message="No conversations yet." />
              ) : (
                <ul className="divide-y divide-foreground/5">
                  {data.conversations.map((msg) => (
                    <li key={msg.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 text-xs text-foreground/40">
                        <span
                          className={
                            msg.direction === "inbound"
                              ? "font-medium text-accent"
                              : "font-medium text-foreground/60"
                          }
                        >
                          {msg.direction === "inbound" ? "← IN" : "→ OUT"}
                        </span>
                        {msg.mothers && (
                          <span>{maskPhone(msg.mothers.phone)}</span>
                        )}
                        <span>{formatTime(msg.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm text-foreground/80 line-clamp-2">
                        {msg.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Language Distribution */}
          <section className="rounded-xl border border-foreground/10 bg-white">
            <div className="border-b border-foreground/10 px-5 py-4">
              <h2 className="font-semibold">Language Distribution</h2>
            </div>
            <div className="p-5">
              {data.languages.length === 0 ? (
                <EmptyState message="No data yet." />
              ) : (
                <div className="space-y-3">
                  {data.languages.map((lang) => {
                    const total = data.languages.reduce(
                      (s, l) => s + l.count,
                      0
                    );
                    const pct = total > 0 ? (lang.count / total) * 100 : 0;
                    return (
                      <div key={lang.language}>
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {LANGUAGE_LABELS[lang.language] ?? lang.language}
                          </span>
                          <span className="text-foreground/50">
                            {lang.count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-foreground/5">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Pregnancy Week Distribution */}
          <section className="rounded-xl border border-foreground/10 bg-white">
            <div className="border-b border-foreground/10 px-5 py-4">
              <h2 className="font-semibold">Pregnancy Week Distribution</h2>
            </div>
            <div className="p-5">
              {data.weekDistribution.length === 0 ? (
                <EmptyState message="No data yet." />
              ) : (
                <div className="flex items-end gap-1" style={{ height: 160 }}>
                  {data.weekDistribution.map((w) => {
                    const max = Math.max(
                      ...data.weekDistribution.map((d) => d.count)
                    );
                    const heightPct = max > 0 ? (w.count / max) * 100 : 0;
                    return (
                      <div
                        key={w.week}
                        className="group relative flex flex-1 flex-col items-center"
                      >
                        <div
                          className="w-full rounded-t bg-accent/70 transition-colors group-hover:bg-accent"
                          style={{ height: `${heightPct}%`, minHeight: 4 }}
                        />
                        <span className="mt-1 text-[10px] text-foreground/40">
                          {w.week}
                        </span>
                        <div className="pointer-events-none absolute -top-8 rounded bg-foreground px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                          W{w.week}: {w.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  alert,
}: {
  label: string;
  value: number;
  icon: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-5 ${
        alert ? "border-danger/30" : "border-foreground/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground/50">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div
        className={`mt-2 text-3xl font-bold ${alert ? "text-danger" : ""}`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: "low" | "medium" | "high" }) {
  const style = RISK_STYLES[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {level.toUpperCase()}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-foreground/40">
      {message}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return phone.slice(0, 4) + "****" + phone.slice(-2);
}
