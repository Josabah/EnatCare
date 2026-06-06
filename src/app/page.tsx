import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="max-w-2xl text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Enat<span className="text-accent">AI</span>
          </h1>
          <p className="mt-2 text-lg text-foreground/60">
            Maternal Care Companion
          </p>
        </div>

        <p className="text-lg leading-relaxed text-foreground/80">
          SMS-based pregnancy guidance for Ethiopian mothers. Symptom screening,
          risk detection, and personalized care — in Amharic, Afaan Oromo,
          Tigrinya, and English.
        </p>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/demo"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90"
          >
            Try Demo
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-foreground/15 px-6 py-3 text-sm font-semibold transition hover:bg-foreground/5"
          >
            Open Dashboard
          </Link>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <div className="rounded-lg border border-foreground/10 p-5 text-left">
            <div className="mb-2 text-sm font-semibold text-accent">
              Risk Detection
            </div>
            <p className="text-sm text-foreground/60">
              Rule-based symptom screening with danger sign escalation.
            </p>
          </div>
          <div className="rounded-lg border border-foreground/10 p-5 text-left">
            <div className="mb-2 text-sm font-semibold text-accent">
              Local Languages
            </div>
            <p className="text-sm text-foreground/60">
              Amharic, Romanized Amharic, Afaan Oromo, Tigrinya, and mixed input.
            </p>
          </div>
          <div className="rounded-lg border border-foreground/10 p-5 text-left">
            <div className="mb-2 text-sm font-semibold text-accent">
              Pregnancy Guidance
            </div>
            <p className="text-sm text-foreground/60">
              Week-by-week milestone tracking and educational content.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
