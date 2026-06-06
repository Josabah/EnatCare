"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface PipelineStage {
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

interface DemoMessage {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  timestamp: Date;
  pipeline?: {
    extraction: {
      language: string;
      symptoms: string[];
      pregnancyWeek: number | null;
      confidence: number;
    };
    assessment: {
      riskLevel: string;
      detectedSymptoms: { name: string; category: string; severity: string }[];
      reasoning: string;
      recommendedAction: string;
    };
  };
}

const EXAMPLE_MESSAGES = [
  "ene 8 wer negn rase yimetagnal ena ayne yadetebignal",
  "dem yiferesal",
  "hod yikoregnal betam",
  "I am 6 months pregnant and feeling very tired",
  "ene 7 wer negn dekimognal",
  "lijie ayinkasakesim",
];

const LANG_LABEL: Record<string, string> = {
  am: "Amharic",
  om: "Afaan Oromo",
  ti: "Tigrinya",
  en: "English",
  mixed: "Mixed",
};

function riskColor(level: string) {
  if (level === "high") return "bg-red-100 text-red-700 border-red-300";
  if (level === "medium") return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-emerald-100 text-emerald-700 border-emerald-300";
}

function riskBg(level: string) {
  if (level === "high") return "bg-red-50 border-red-200";
  if (level === "medium") return "bg-amber-50 border-amber-200";
  return "bg-emerald-50 border-emerald-200";
}

export default function DemoPage() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phone] = useState("+251912345678");
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<DemoMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function setPipelineStage(stages: PipelineStage[]) {
    setPipeline([...stages]);
  }

  async function handleSend(text?: string) {
    const messageText = text ?? input.trim();
    if (!messageText || loading) return;

    const userMsg: DemoMessage = {
      id: crypto.randomUUID(),
      direction: "inbound",
      text: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setSelectedMsg(null);

    const stages: PipelineStage[] = [
      { label: "SMS Received", status: "done", detail: messageText.slice(0, 50) },
      { label: "Language Detection", status: "active" },
      { label: "Symptom Extraction", status: "pending" },
      { label: "Risk Assessment", status: "pending" },
      { label: "Response Generation", status: "pending" },
      { label: "SMS Reply", status: "pending" },
    ];
    setPipelineStage(stages);

    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: messageText }),
      });

      const data = await res.json();

      if (data.success) {
        stages[1] = { label: "Language Detection", status: "done", detail: LANG_LABEL[data.extraction.language] ?? data.extraction.language };
        stages[2] = { label: "Symptom Extraction", status: "done", detail: data.extraction.symptoms.length > 0 ? data.extraction.symptoms.join(", ") : "None detected" };
        stages[3] = { label: "Risk Assessment", status: "done", detail: `${data.assessment.riskLevel.toUpperCase()} — ${data.assessment.detectedSymptoms.length} symptom(s)` };
        stages[4] = { label: "Response Generation", status: "done", detail: `${data.response.text.length} chars` };
        stages[5] = { label: "SMS Reply", status: "done", detail: "Sent via web (SMS skipped)" };
        setPipelineStage(stages);

        const reply: DemoMessage = {
          id: crypto.randomUUID(),
          direction: "outbound",
          text: data.response.text,
          timestamp: new Date(),
          pipeline: {
            extraction: data.extraction,
            assessment: data.assessment,
          },
        };
        setMessages((prev) => [...prev, reply]);
        setSelectedMsg(reply);
      } else {
        stages[1] = { label: "Language Detection", status: "done", detail: "Error" };
        stages[2] = { label: "Symptom Extraction", status: "done", detail: "Error" };
        stages[3] = { label: "Risk Assessment", status: "done", detail: "Error" };
        stages[4] = { label: "Response Generation", status: "done", detail: "Error" };
        stages[5] = { label: "SMS Reply", status: "done", detail: "Failed" };
        setPipelineStage(stages);

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            direction: "outbound",
            text: `Error: ${data.error ?? data.details ?? "Unknown error"}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          direction: "outbound",
          text: "Failed to connect to server.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-100 lg:flex-row">
      {/* Left: Phone Simulator */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold">
            Enat<span className="text-emerald-600">AI</span>{" "}
            <span className="text-base font-normal text-stone-400">Live Demo</span>
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Type a message as a pregnant mother would via SMS
          </p>
          <div className="mt-2 flex justify-center gap-3">
            <Link href="/dashboard" className="text-xs text-emerald-600 underline underline-offset-2">
              Dashboard
            </Link>
          </div>
        </div>

        <div
          className="flex w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-stone-300 bg-white shadow-xl"
          style={{ height: "65vh", minHeight: 480 }}
        >
          <div className="flex items-center justify-between bg-emerald-600 px-5 py-3 text-white">
            <div>
              <div className="text-sm font-semibold">EnatAI</div>
              <div className="text-[11px] opacity-75">Maternal Care</div>
            </div>
            <div className="text-right text-[11px] opacity-75">{phone}</div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm text-stone-400">No messages yet. Try one:</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {EXAMPLE_MESSAGES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(ex)}
                      className="rounded-full border border-stone-200 px-3 py-1.5 text-left text-xs text-stone-600 transition hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      {ex.length > 40 ? ex.slice(0, 40) + "..." : ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-3 flex ${msg.direction === "inbound" ? "justify-end" : "justify-start"}`}
              >
                <button
                  type="button"
                  onClick={() => msg.pipeline && setSelectedMsg(msg)}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-left ${
                    msg.direction === "inbound"
                      ? "rounded-br-md bg-emerald-600 text-white"
                      : `rounded-bl-md ${msg.pipeline ? "cursor-pointer ring-1 ring-transparent hover:ring-emerald-300" : ""} bg-stone-100 text-stone-800`
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                  <div
                    className={`mt-1 text-[10px] ${msg.direction === "inbound" ? "text-emerald-200" : "text-stone-400"}`}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {msg.pipeline && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${riskColor(msg.pipeline.assessment.riskLevel)}`}>
                        {msg.pipeline.assessment.riskLevel.toUpperCase()} RISK
                      </span>
                      <span className="inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[10px] text-stone-600">
                        {LANG_LABEL[msg.pipeline.extraction.language] ?? msg.pipeline.extraction.language}
                      </span>
                      {msg.pipeline.extraction.pregnancyWeek && (
                        <span className="inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[10px] text-stone-600">
                          Week {msg.pipeline.extraction.pregnancyWeek}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </div>
            ))}

            {loading && (
              <div className="mb-3 flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-stone-100 px-4 py-3">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2 border-t border-stone-200 bg-white px-3 py-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type an SMS message..."
              disabled={loading}
              className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Right: Pipeline Inspector */}
      <div className="w-full border-t border-stone-200 bg-white p-6 lg:w-[420px] lg:border-t-0 lg:border-l lg:overflow-y-auto" style={{ maxHeight: "100vh" }}>
        <h2 className="mb-4 text-sm font-semibold text-stone-700">Pipeline Inspector</h2>

        {/* Pipeline stages */}
        {pipeline.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Processing Stages</h3>
            <div className="space-y-1">
              {pipeline.map((stage, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
                  <span className="mt-0.5">
                    {stage.status === "done" && <span className="text-emerald-600">&#10003;</span>}
                    {stage.status === "active" && <span className="animate-pulse text-amber-500">&#9679;</span>}
                    {stage.status === "pending" && <span className="text-stone-300">&#9675;</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium ${stage.status === "pending" ? "text-stone-400" : "text-stone-700"}`}>
                      {stage.label}
                    </div>
                    {stage.detail && (
                      <div className="truncate text-xs text-stone-500">{stage.detail}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected message detail */}
        {selectedMsg?.pipeline && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Extraction</h3>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-stone-400">Language</span>
                    <div className="font-medium">{LANG_LABEL[selectedMsg.pipeline.extraction.language] ?? selectedMsg.pipeline.extraction.language}</div>
                  </div>
                  <div>
                    <span className="text-xs text-stone-400">Confidence</span>
                    <div className="font-medium">{(selectedMsg.pipeline.extraction.confidence * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <span className="text-xs text-stone-400">Pregnancy Week</span>
                    <div className="font-medium">{selectedMsg.pipeline.extraction.pregnancyWeek ?? "—"}</div>
                  </div>
                  <div>
                    <span className="text-xs text-stone-400">Symptoms</span>
                    <div className="font-medium">{selectedMsg.pipeline.extraction.symptoms.length}</div>
                  </div>
                </div>
                {selectedMsg.pipeline.extraction.symptoms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedMsg.pipeline.extraction.symptoms.map((s, i) => (
                      <span key={i} className="rounded bg-white px-2 py-0.5 text-xs text-stone-600 border border-stone-200">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Risk Assessment</h3>
              <div className={`rounded-lg border p-3 text-sm ${riskBg(selectedMsg.pipeline.assessment.riskLevel)}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${riskColor(selectedMsg.pipeline.assessment.riskLevel)}`}>
                    {selectedMsg.pipeline.assessment.riskLevel.toUpperCase()}
                  </span>
                  <span className="text-xs text-stone-500">
                    {selectedMsg.pipeline.assessment.detectedSymptoms.length} symptom(s) detected
                  </span>
                </div>
                {selectedMsg.pipeline.assessment.detectedSymptoms.map((s, i) => (
                  <div key={i} className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.severity === "severe" ? "bg-red-500" : s.severity === "moderate" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <span>{s.name}</span>
                    <span className="text-stone-400">({s.category})</span>
                  </div>
                ))}
                <p className="mt-2 text-xs text-stone-600">{selectedMsg.pipeline.assessment.reasoning}</p>
                {selectedMsg.pipeline.assessment.recommendedAction && (
                  <p className="mt-1 text-xs font-medium">{selectedMsg.pipeline.assessment.recommendedAction}</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Generated Response</h3>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed whitespace-pre-line">
                {selectedMsg.text}
              </div>
            </div>
          </div>
        )}

        {!selectedMsg && pipeline.length === 0 && (
          <div className="flex h-40 items-center justify-center text-center text-sm text-stone-400">
            <div>
              <p>Send a message to see the</p>
              <p>processing pipeline here</p>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <h3 className="mb-1 text-xs font-semibold text-stone-500">Architecture</h3>
          <div className="text-[11px] leading-5 text-stone-400 font-mono">
            SMS &rarr; Android Phone &rarr; Webhook &rarr; Normalize<br />
            &rarr; Hasab AI &rarr; Rules Engine &rarr; Response<br />
            &rarr; SMS Reply
          </div>
        </div>
      </div>
    </div>
  );
}
