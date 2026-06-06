# EnatAI — Implementation Audit

Audited: 2026-06-06
Auditor: Automated full-source review + live documentation verification

---

## System Architecture

```
AfroMessage SMS (inbound)
        ↓
  POST /api/webhooks/afromessage    ← webhook route
        ↓
  receiveSMS()                     ← parse inbound payload
        ↓
  processIncomingMessage()         ← orchestration layer
        ├── findOrCreateMother()   ← Supabase
        ├── storeMessage()         ← Supabase
        ├── normalizeMessage()     ← local normalization
        ├── extractPregnancyContext()  ← Hasab AI (or fallback)
        ├── processContext()       ← rule-based risk engine
        ├── updateMother()         ← Supabase
        ├── storeRiskEvent()       ← Supabase
        ├── storeMessage()         ← Supabase (outbound)
        └── sendSMS()              ← AfroMessage (outbound)
```

## Dependency Map

| Component | Depends On | External? |
|-----------|-----------|-----------|
| Webhook route | afromessage.ts, messageProcessor.ts | No |
| messageProcessor.ts | normalization.ts, hasab.ts, riskEngine.ts, supabase.ts, afromessage.ts | No |
| hasab.ts | Hasab AI API | **YES** |
| afromessage.ts | AfroMessage API | **YES** |
| supabase.ts | Supabase project | **YES** |
| riskEngine.ts | pregnancyRules.ts | No |
| pregnancyRules.ts | symptoms.ts | No |
| normalization.ts | (none) | No |
| Dashboard page | /api/dashboard/stats route | No |
| Dashboard stats route | supabase.ts | No |

---

# VERIFIED

These components are implemented correctly and will work.

### 1. Next.js Application Shell
- Builds cleanly with `next build` (verified)
- Zero TypeScript errors (verified)
- Zero lint errors (verified)
- Static pages render correctly
- API routes are properly configured

### 2. Database Schema (`supabase/migrations/001_initial_schema.sql`)
- SQL is syntactically correct
- Tables: mothers, messages, risk_events, weekly_guidance — all defined
- Constraints: CHECK constraints on enums, week ranges — correct
- Indexes: on phone, mother_id, created_at, risk_level — present
- RLS: enabled on all tables with service role bypass — correct pattern
- Seed data: 10 English + 6 Amharic weekly guidance entries — present
- Foreign keys with ON DELETE CASCADE — correct

### 3. Supabase Client (`src/lib/supabase.ts`)
- Uses `@supabase/supabase-js` v2.107.0 — standard, well-documented library
- Lazy initialization via `db()` function — prevents build-time crashes
- Service role key used server-side only — correct security pattern
- All CRUD operations follow standard Supabase query patterns
- Dashboard aggregation queries are correct

### 4. Normalization Layer (`src/lib/normalization.ts`)
- Pure local code, no external dependencies
- Dictionary with 100+ terms across Amharic, Oromo, Tigrinya
- Language detection via weighted voting — functional
- Ge'ez script detection via Unicode range `\u1200-\u137F` — correct
- Pregnancy week extraction handles Arabic numerals + Amharic number words
- Month-to-week conversion (×4) — present

### 5. Pregnancy Rules Engine (`src/lib/pregnancyRules.ts`)
- All 7 WHO-aligned danger signs are represented as HIGH rules
- 4 MEDIUM risk categories defined
- 3 LOW risk categories defined
- Symptom matching is purely rule-based (string matching against trigger lists)
- Gestational context escalation: bleeding/pain in early (<12w) or late (>28w) pregnancy → escalates to HIGH
- Multiple low symptoms (≥3) → escalates to MEDIUM
- Multi-language response templates for all 5 languages × 3 risk levels = 15 templates
- Follow-up questions are context-aware (bleeding, pain, fetal movement)
- SMS length truncation at 800 chars — present

### 6. Risk Engine (`src/lib/riskEngine.ts`)
- Correctly bridges AI extraction → rule assessment → response generation
- No direct AI dependency in risk classification logic

### 7. Message Processor Orchestration (`src/lib/messageProcessor.ts`)
- Correct sequencing of all 9 steps
- Stores both inbound and outbound messages
- Updates mother record with discovered language/week
- Only stores risk events for non-trivial cases
- Returns full ProcessingResult for webhook response

### 8. Type Definitions (`src/types/`)
- Clean TypeScript interfaces matching database schema
- Insert types properly omit auto-generated fields
- Risk types are comprehensive

### 9. AfroMessage Send SMS — Endpoint & Auth
- **Endpoint**: `POST https://api.afromessage.com/api/send` — **VERIFIED** from official docs at afromessage.com/developers
- **Auth**: `Authorization: Bearer {TOKEN}` — **VERIFIED** from official docs
- **Request body**: `{ from, to, message }` — **PARTIALLY VERIFIED**: docs show `from` is the identifier ID and `sender` is the sender name. Our code sends `from: AFROMESSAGE_SENDER_ID` which conflates identifier ID with sender name. The `sender` parameter is missing.
- **Response shape**: `{ acknowledge: "success", response: { message_id: "..." } }` — **VERIFIED** from official docs. Our code parses this correctly.

### 10. Environment Variables
- All 8 env vars are documented in `.env.example`
- Supabase vars follow standard naming convention
- AfroMessage vars are correctly separated (API key, base URL, sender ID, webhook secret)

---

# ASSUMED

These were inferred or guessed without verification from official documentation.

### 1. AfroMessage Inbound SMS Webhook — PAYLOAD SHAPE IS ASSUMED

**THIS IS THE MOST CRITICAL ASSUMPTION IN THE SYSTEM.**

Our code assumes the webhook payload looks like:

```json
{
  "type": "inbound",
  "from": "+251912345678",
  "to": "+251900000000",
  "message": "ene 7 wer negn",
  "date": "2024-01-15T10:30:00Z",
  "smsc_message_id": "msg_123",
  "token": "your-webhook-secret"
}
```

**What the AfroMessage docs actually show:**

AfroMessage's public developer documentation (afromessage.com/developers) documents exactly 4 endpoints:
1. `GET /api/send` — send single SMS
2. `POST /api/send` — send single SMS (POST version)
3. `POST /api/bulk_send` — send bulk SMS
4. `GET /api/challenge` — send OTP/security code
5. `GET /api/verify` — verify OTP code

There is **NO documented inbound SMS webhook** in the public API docs. The only "callback" documented is a delivery STATUS callback, which is a GET request appending `message_id` and `status` to your URL. This is NOT an inbound message webhook.

AfroMessage likely offers inbound SMS via shortcode/longcode subscriptions configured in their dashboard, but the payload shape and configuration method are not publicly documented.

**Impact**: The entire `receiveSMS()` function and `verifyWebhook()` function are based on assumed payload shapes. Every field name (`type`, `from`, `to`, `message`, `date`, `smsc_message_id`, `token`) is fabricated.

**Status**: ASSUMED — must be verified with AfroMessage support or dashboard documentation before deployment.

### 2. AfroMessage Webhook Verification — METHOD IS ASSUMED

Our code checks `payload.token === AFROMESSAGE_WEBHOOK_SECRET`. There is no documentation confirming AfroMessage uses a `token` field for webhook verification. They may use HMAC signatures, IP whitelisting, or no verification at all.

**Status**: ASSUMED

### 3. AfroMessage Send SMS — `sender` Parameter Missing

The official docs show two separate parameters:
- `from` — the system identifier ID (shortcode/longcode subscription)
- `sender` — the verified sender name shown to recipients

Our code sends:
```json
{ "from": AFROMESSAGE_SENDER_ID, "to": "...", "message": "..." }
```

But `from` should be the identifier ID, and `sender` should be the sender name. These are different values. Our env var `AFROMESSAGE_SENDER_ID` is ambiguous about which one it represents. The `sender` parameter is not sent at all.

**Status**: ASSUMED — may work if sender is optional in beta, but will likely need correction.

### 4. Ethiopian Phone Number Normalization

Our `normalizePhone()` function assumes all Ethiopian numbers follow the pattern `+251XXXXXXXXX`. While this is the standard format, edge cases exist:
- Some AfroMessage shortcodes use 4-5 digit numbers
- Landline numbers have different formats
- The function doesn't validate the resulting number length

**Status**: ASSUMED — likely correct for 90%+ of mobile numbers.

---

# MOCKED

These use placeholder logic that will not work against real services.

### 1. Hasab AI Integration — ENTIRE API CONTRACT IS WRONG

**THIS ENDPOINT WAS ASSUMED**

Our code calls:
```
POST https://api.hasab.chat/v1/chat/completions
```

**The real endpoint** (verified from developer.hasab.ai/api-integration/chat):
```
POST https://api.hasab.ai/api/v1/chat
```

Every aspect of our Hasab AI integration is wrong:

| Aspect | Our Code | Real API |
|--------|----------|----------|
| Base URL | `https://api.hasab.chat/v1` | `https://api.hasab.ai/api/v1` |
| Endpoint | `/chat/completions` | `/chat` |
| Request format | `{ model, messages: [{role, content}...], temperature, max_tokens }` (OpenAI format) | `{ message: "string", model: "hasab-1-lite", temperature, max_tokens, stream }` |
| Model name | `hasab-1` | `hasab-1-lite` or `hasab-1-main` |
| System prompt | Sent as `messages[0]` with `role: "system"` | **NOT SUPPORTED** — the API takes a single `message` string, not a messages array |
| Response format | `{ choices: [{ message: { content } }] }` (OpenAI format) | `{ message: { role: "assistant", content: "..." }, usage: {...} }` |
| Auth | `Bearer {HASAB_API_KEY}` | `Bearer {API_KEY}` — **VERIFIED correct method** |

The Hasab AI API is NOT OpenAI-compatible. It uses a completely different request/response format. Our code sends an OpenAI-shaped request to a wrong URL with a wrong model name and tries to parse an OpenAI-shaped response.

**What actually happens at runtime**: The fetch to `https://api.hasab.chat/v1/chat/completions` will fail (wrong domain). The code gracefully falls back to `fallbackExtraction()` which uses keyword matching. **The AI component is effectively mocked — it will always fall back to rules.**

**Status**: MOCKED — the fallback works, but the AI integration is non-functional.

### 2. Hasab AI System Prompt / Structured Extraction

The Hasab API does not support system prompts or multi-turn conversations in a single request. It takes one `message` string. To do structured extraction, we would need to:
1. Pack the system instruction + user message into a single `message` string
2. Parse the response from `data.message.content` instead of `data.choices[0].message.content`
3. Use model `hasab-1-main` (not `hasab-1`) for better extraction quality
4. Handle the fact that max_tokens is capped at 1024

**Status**: MOCKED — requires complete rewrite of `hasab.ts`.

---

# INCOMPLETE

These cannot function yet.

### 1. Inbound SMS Reception — Cannot Work Without Verified Webhook Shape

Without knowing AfroMessage's actual inbound webhook payload format, the system cannot receive SMS messages. The entire inbound pipeline is blocked on this.

**To unblock**: Contact AfroMessage support, or subscribe to a shortcode in their dashboard and inspect the actual webhook payload format they send.

### 2. Dashboard Authentication — None

The dashboard at `/dashboard` and the API at `/api/dashboard/stats` have zero authentication. Anyone with the URL can view all mother data, phone numbers, messages, and risk events. This is a privacy/security gap.

**Status**: INCOMPLETE — no auth whatsoever.

### 3. Weekly Guidance Delivery — Not Wired

The `weekly_guidance` table exists and has seed data. The `getWeeklyGuidance()` function exists. But nothing in the message processing pipeline actually fetches and includes weekly guidance in responses. The response generation in `pregnancyRules.ts` has a hardcoded string `"You are at week X"` instead of pulling from the database.

**Status**: INCOMPLETE — schema and query exist, but not integrated into the response flow.

### 4. Automated Weekly Guidance Scheduling

The spec mentions "Allow future automated scheduling." No cron job, no scheduled function, no pub/sub mechanism exists. Only the schema is present.

**Status**: INCOMPLETE — by design (acknowledged as future work).

### 5. Ge'ez Script (Native Amharic) Processing

The normalization layer handles Romanized Amharic well, but native Ge'ez script messages (e.g., "ራሴ ይመታኛል") pass through the dictionary untouched. The dictionary only maps Latin-script tokens. Ge'ez tokens are detected for language identification but not translated.

The system relies entirely on Hasab AI (which speaks Amharic) for Ge'ez processing. Since Hasab AI integration is broken, Ge'ez messages will get fallback extraction which cannot parse Ge'ez tokens.

**Status**: INCOMPLETE — Ge'ez messages produce low-quality extraction without working AI.

### 6. Supabase Migration Not Applied

The migration file exists at `supabase/migrations/001_initial_schema.sql` but has not been applied to any Supabase project. No `.env.local` file exists.

**Status**: INCOMPLETE — requires manual setup.

---

## Architecture Violation Audit

### AI vs. Rules Boundary

**VIOLATION FOUND** in `src/lib/pregnancyRules.ts`, lines 100-107:

```typescript
function escalateRisk(
  ruleLevel: RiskLevel,
  aiLevel: "low" | "medium" | "high"
): RiskLevel {
  const levels: Record<string, number> = { low: 0, medium: 1, high: 2 };
  const max = Math.max(levels[ruleLevel], levels[aiLevel]);
  return (["low", "medium", "high"] as const)[max];
}
```

This function takes `Math.max()` of the rule-determined level and the AI-suggested urgency. If the AI returns `urgency: "high"` but rules only detect `"low"`, the final result is **"high"**.

**This means the AI CAN escalate risk levels.** The AI's `urgency` field directly determines the final risk classification. This violates the stated principle: "The LLM must NOT make medical decisions. Rules make decisions. AI extracts information. Rules determine outcomes."

The AI urgency should be treated as a signal for the rules engine to re-evaluate, not as a direct input to the final classification.

**Severity**: Medium. In practice, because Hasab AI is non-functional and the fallback assigns urgency based on the same keywords the rules use, this violation has no current runtime impact. But it is an architectural defect that matters when the AI is connected.

### Other Checks — PASSED

- Risk classification (`determineRiskLevel`) — purely rule-based ✓
- Symptom matching (`matchSymptoms`) — purely rule-based ✓
- Response generation (`generateResponse`) — template-based, no AI ✓
- Follow-up questions — rule-based ✓
- The AI's output is only used for: language, symptoms list, pregnancy week, urgency
- Language, symptoms, and pregnancy week are pure data extraction ✓
- Urgency is the one field that leaks into risk classification ✗

---

## External API Call Inventory

### 1. Hasab AI — Extract Pregnancy Context

| Field | Value |
|-------|-------|
| Endpoint | `POST https://api.hasab.chat/v1/chat/completions` |
| Real endpoint | `POST https://api.hasab.ai/api/v1/chat` |
| Method | POST |
| Auth | `Authorization: Bearer {HASAB_API_KEY}` |
| Source | **ASSUMED** — modeled after OpenAI API. Real API verified from developer.hasab.ai |
| Status | **THIS ENDPOINT WAS ASSUMED — URL, request shape, response shape are all wrong** |

### 2. AfroMessage — Send SMS

| Field | Value |
|-------|-------|
| Endpoint | `POST https://api.afromessage.com/api/send` |
| Method | POST |
| Auth | `Authorization: Bearer {AFROMESSAGE_API_KEY}` |
| Request body | `{ from, to, message }` |
| Real request body | `{ from, sender, to, message, callback }` |
| Source | **VERIFIED** from afromessage.com/developers |
| Status | **PARTIALLY CORRECT** — endpoint and auth are right, `sender` param is missing |

### 3. AfroMessage — Receive SMS (Webhook)

| Field | Value |
|-------|-------|
| Endpoint | `POST /api/webhooks/afromessage` (our receiver) |
| Incoming payload | `{ type, from, to, message, date, smsc_message_id, token }` |
| Source | **ASSUMED** — no public documentation for inbound SMS webhooks |
| Status | **THIS PAYLOAD WAS ASSUMED** |

### 4. Supabase — All Database Operations

| Field | Value |
|-------|-------|
| Endpoint | Supabase REST API via `@supabase/supabase-js` |
| Auth | Service role key |
| Source | **VERIFIED** — standard Supabase client library |
| Status | **VERIFIED** — will work once credentials are configured |

---

## Environment Variables Audit

| Variable | Used In | Required At | Status |
|----------|---------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | supabase.ts | Runtime | VERIFIED standard |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase.ts | Runtime | VERIFIED standard |
| `HASAB_API_KEY` | hasab.ts | Runtime | VERIFIED (auth method confirmed) |
| `HASAB_BASE_URL` | hasab.ts | Runtime | **WRONG DEFAULT** — defaults to `https://api.hasab.chat/v1`, should be `https://api.hasab.ai/api/v1` |
| `AFROMESSAGE_API_KEY` | afromessage.ts | Runtime | VERIFIED |
| `AFROMESSAGE_BASE_URL` | afromessage.ts | Runtime | VERIFIED — `https://api.afromessage.com/api` |
| `AFROMESSAGE_SENDER_ID` | afromessage.ts | Runtime | AMBIGUOUS — should distinguish identifier ID from sender name |
| `AFROMESSAGE_WEBHOOK_SECRET` | afromessage.ts | Runtime | ASSUMED — verification method unknown |
| `NEXT_PUBLIC_APP_URL` | .env.example | Unused | Not referenced in any code |

---

## Risks

### Critical

1. **Hasab AI integration will fail on first request.** Wrong URL, wrong request format, wrong response parsing. The fallback masks this failure, but AI extraction is offline.

2. **Inbound SMS webhook payload is fabricated.** If AfroMessage sends a different shape, `receiveSMS()` will throw and the webhook will return 500.

3. **No dashboard authentication.** Patient data (phone numbers, messages, health information) is publicly accessible.

### High

4. **Ge'ez script messages produce poor results** without working AI. A mother texting in native Amharic script gets only language detection, not symptom extraction.

5. **AI urgency leaks into risk classification**, violating the architecture contract.

6. **AfroMessage `sender` parameter missing** — SMS may send with default "AfroMessage" sender name or fail.

### Medium

7. **Weekly guidance is not delivered** in responses despite schema and data existing.

8. **No rate limiting** on webhook endpoint — vulnerable to abuse.

9. **No retry logic** — if Supabase or AfroMessage is temporarily down, the message is lost.

10. **`NEXT_PUBLIC_APP_URL` env var is documented but never used** in code.

---

## What Works If Deployed Today

### Works End-to-End:
- Landing page renders ✓
- Dashboard page renders (shows empty state) ✓
- Dashboard API returns data from Supabase ✓
- `GET /api/webhooks/afromessage` health check ✓
- Supabase schema can be applied ✓
- Database read/write operations ✓

### Works Partially:
- **Webhook receives POST** → parses body → but payload shape may be wrong
- **AI extraction** → will fail → falls back to keyword matching → **fallback works**
- **SMS sending** → endpoint is correct → but missing `sender` param → may work in beta mode
- **Risk engine** → works correctly on the data it receives → but AI urgency leaks into classification
- **Normalization** → works for Romanized text → fails for Ge'ez script

### Does Not Work:
- **Inbound SMS reception** — webhook payload shape is unverified, will likely break
- **Hasab AI extraction** — wrong URL, wrong format, will always fall back
- **Native Amharic (Ge'ez) symptom extraction** — requires working AI
- **Weekly guidance in responses** — not wired up
- **Dashboard security** — no authentication

---

## Recommended Next Steps (in priority order)

1. **Verify AfroMessage webhook format.** Subscribe to a shortcode in the AfroMessage dashboard. Send a test SMS. Inspect the actual webhook payload they deliver. Update `receiveSMS()` and `verifyWebhook()` to match.

2. **Fix Hasab AI integration.** Rewrite `hasab.ts` to match the real API at `https://api.hasab.ai/api/v1/chat`. Use single `message` string instead of messages array. Parse response from `data.message.content`. Use model `hasab-1-main`.

3. **Remove AI urgency from risk classification.** Delete the `escalateRisk()` function. Use only the rule-based `determineRiskLevel()` output. The AI should extract symptoms, not assess urgency.

4. **Add dashboard authentication.** Even a simple shared password or Supabase Auth check would be better than nothing.

5. **Fix AfroMessage send payload.** Add `sender` parameter separately from `from` (identifier ID).

6. **Wire up weekly guidance.** Pull guidance content from the database and include in low-risk responses.

---

## Bottom Line

> **If I deployed this project today, what would actually work end-to-end and what would fail?**

**What works**: The landing page, the dashboard UI (empty), the database schema, and the rule-based risk engine. If you manually POST a correctly-shaped JSON body to the webhook endpoint, the system will process it through keyword-based fallback extraction, classify risk using rules, generate a multi-language response, store everything in Supabase, and attempt to send an SMS. The SMS send call hits the correct AfroMessage endpoint with correct auth.

**What fails**: Real SMS messages from AfroMessage will almost certainly fail to parse because the webhook payload shape is fabricated. Hasab AI calls will fail on every request (wrong URL, wrong format) and silently fall back to keyword matching. The dashboard exposes patient data without authentication. Native Amharic script messages get poor extraction without working AI.

**The system's strongest asset is the rule-based pregnancy engine.** It correctly classifies all 7 WHO danger signs, handles gestational context, and generates appropriate multi-language responses. This core is production-quality.

**The system's weakest point is the two external API integrations.** Both Hasab AI and AfroMessage inbound webhooks need to be verified against real documentation and real API calls before the system can function end-to-end.

**Honest assessment**: This is a well-architected V1 with correct internal logic, but it cannot process a real SMS end-to-end until the two external integrations are fixed against verified API contracts. The fixes are straightforward — hours, not days — but they require real API credentials and testing.
