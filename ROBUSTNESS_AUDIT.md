# EnatAI — Robustness Audit

**Date:** June 6, 2026
**Phase:** Hardening & Production Readiness
**Scope:** Reliability, correctness, conversation quality, operational robustness

---

## Architecture Changes

### Before
```
SMS → webhook → extract context → rules engine → template response → SMS reply
```

### After
```
SMS → webhook → idempotency check → find/create mother
  → intent classification → conversation state lookup
  → normalize text → extract context (Hasab AI)
  → rules engine (if symptoms) → AI response generation
  → store trace → update conversation state → SMS reply
```

### New Modules Created
| File | Purpose |
|------|---------|
| `src/lib/idempotency.ts` | SHA-256 message fingerprinting with 5-minute time buckets |
| `src/lib/intentClassifier.ts` | Deterministic intent classification (8 categories) |
| `src/lib/responseGenerator.ts` | AI-powered response generation with template fallbacks |
| `src/lib/conversationManager.ts` | Multi-turn conversation state machine |
| `src/lib/scheduler.ts` | Pregnancy timeline calculation & guidance scheduling interfaces |
| `src/lib/logger.ts` | Structured observability logging & trace management |
| `supabase/migrations/003_hardening.sql` | DB schema: dedup, conversation state, traces |

### Modified Modules
| File | Changes |
|------|---------|
| `src/lib/messageProcessor.ts` | Full rewrite integrating all 9 priorities |
| `src/lib/pregnancyRules.ts` | Emergency combination detection added |
| `src/lib/normalization.ts` | Fuzzy matching, typo handling, expanded dictionary |
| `src/types/database.ts` | New types: MessageIntent, ConversationState, MessageTrace |
| `src/lib/supabase.ts` | New functions: checkDuplicate, getConversationState, updateConversationState, storeTrace |
| `src/app/api/webhooks/sms/route.ts` | Dedup handling, intent in response |
| `src/app/api/demo/route.ts` | Intent + dedup fields in response |
| `src/app/api/test/sms/route.ts` | Intent + dedup fields in response |

---

## Priority 1: Duplicate Message Prevention

### Strategy
**Message fingerprinting with time-bucketed hashing.**

```
hash = SHA-256(phone + normalized_message + 5_minute_time_bucket)[0:32]
```

### How It Works
1. Every inbound message gets a hash computed from phone + message content + 5-minute time bucket
2. Before processing, `checkDuplicate()` queries the `messages` table for an existing row with the same `(mother_id, message_hash, direction)`
3. If found → return immediately with `deduplicated: true`, no response sent
4. If not found → store the inbound message with `processing_status: "processing"` and proceed

### Database Support
- `messages.message_hash` — 32-char hex hash
- `messages.processing_status` — tracks `processing` | `completed` | `failed`
- `UNIQUE INDEX idx_messages_dedup ON messages (mother_id, message_hash, direction)` — prevents races at DB level

### Edge Cases Handled
- **Webhook retries** — same SMS delivered twice within 5 minutes → deduplicated
- **Legitimate re-sends** — same text hours later → new time bucket → processed normally
- **Race conditions** — unique index constraint prevents two concurrent inserts
- **Different phones, same text** — hash includes phone → processed independently

### Remaining Risk
- If the gateway sends the same SMS with modified whitespace, the hash differs. The `trim().toLowerCase()` normalization mitigates most cases.

---

## Priority 2: Real AI Responses

### Flow
```
Intent classification → Rules engine decides risk → Hasab AI generates wording
```

### Implementation
- `responseGenerator.ts` dispatches by intent:
  - **Greeting, Registration, Out-of-scope, Unknown** → template-based (fast, no API call)
  - **Symptom report** → Hasab AI with risk assessment context
  - **Pregnancy question** → Hasab AI with safety guardrails

### AI Prompt Design (Symptom Response)
The prompt includes:
- Language (Amharic/Oromo/Tigrinya/English)
- Pregnancy week (if known)
- Risk level (from rules engine — AI cannot change this)
- Recommended action (from rules engine)
- Detected symptoms
- Recent conversation history (last 3 messages)

### Safety Guardrails
- Prompt explicitly states: "do NOT change risk level"
- Prompt explicitly states: "NEVER diagnose", "NEVER guarantee outcomes"
- If Hasab API fails → falls back to template-based responses from `pregnancyRules.ts`
- SMS truncated to 400 characters

### AI Controls
- `temperature: 0.7` for natural variation in symptom responses
- `temperature: 0.1` for extraction (existing, unchanged)
- `max_tokens: 512` — prevents runaway generation

---

## Priority 3: Conversation Intelligence

### Intent Categories
| Intent | Detection Method | In Scope |
|--------|-----------------|----------|
| `greeting` | Keyword set (selam, hi, hello, etc.) + word count ≤ 4 | Yes |
| `registration` | Regex patterns for pregnancy week/month + number | Yes |
| `symptom_report` | Match against ALL_SYMPTOM_RULES triggers + fallback keywords | Yes |
| `followup_response` | Short messages (≤ 3 words) with yes/no/awo/aye/numbers | Yes |
| `pregnancy_question` | Question patterns + pregnancy topic keywords | Yes |
| `non_pregnancy_health` | Health keywords NOT in pregnancy symptom list | No |
| `unrelated` | No health/pregnancy keywords, > 3 words | No |
| `unknown` | Ambiguous, doesn't match any category | No |

### Response Strategy Per Intent
| Intent | Response Source | Sends SMS |
|--------|---------------|-----------|
| `greeting` | Template (multi-language) | Yes |
| `registration` | Template (confirms week) | Yes |
| `symptom_report` | Hasab AI → template fallback | Yes |
| `followup_response` | Context-aware template | Yes |
| `pregnancy_question` | Hasab AI → template fallback | Yes |
| `non_pregnancy_health` | Template (polite redirect) | Yes |
| `unrelated` | Template (scope explanation) | Yes |
| `unknown` | Template (clarification request) | Yes |

### Classification Priority Order
1. Greeting (checked first for short messages)
2. Follow-up response (very short confirmations)
3. Registration (pregnancy week/month patterns)
4. Symptom report (symptom keyword matching)
5. Non-pregnancy health (health keywords not in pregnancy list)
6. Pregnancy question (question patterns + pregnancy topics)
7. Unrelated (fallback for longer messages)
8. Unknown (final fallback)

---

## Priority 4: Out-of-Scope Handling

### Strategy
- **Non-pregnancy health** (malaria, cough, diabetes, etc.): "EnatAI specializes in pregnancy care. For this concern, please consult a healthcare provider."
- **Unrelated** (football, politics, etc.): "I'm EnatAI, your pregnancy care companion. I can help with pregnancy symptoms, guidance, and health questions."
- All responses available in am, om, ti, en, mixed.

### No Hallucination Policy
- Template-based responses for out-of-scope — no AI generation
- Never answers medical questions outside pregnancy domain
- Never invents symptoms or diagnoses

---

## Priority 5: Multi-Turn Conversations

### State Machine
```
                    ┌──────────────┐
                    │     idle     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
   ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐
   │  awaiting_   │ │  awaiting_   │ │   awaiting_        │
   │  followup    │ │  registration│ │   clarification    │
   └──────┬───────┘ └──────┬───────┘ └────────┬───────────┘
          │                │                   │
          └────────────────┴───────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │     idle     │
                    └──────────────┘
```

### State Transitions
- `greeting` → `awaiting_registration` (asks for pregnancy week)
- `symptom_report` with follow-up questions → `awaiting_followup` (stores pending question)
- Follow-up resolved → `idle`

### Follow-up Resolution
When the system asks "Do you have vision changes?" and the mother replies "yes":
1. System detects `followup_response` intent
2. Checks `conversation_state.pending_context.askingAboutSymptom = "vision changes"`
3. Matches "yes" → affirmative → `escalate: true, symptoms: ["vision changes"]`
4. Re-classifies as `symptom_report` with the confirmed symptom

### Database Support
- `conversation_state` table with `UNIQUE(mother_id)` constraint
- `pending_question`, `pending_context` (JSONB), `last_intent`, `last_risk_level`
- Upserted on every message processing cycle

---

## Priority 6: Scheduling Architecture

### Implementation Status
**Interfaces and calculation functions created. Actual cron/trigger not yet wired.**

### Design
- `scheduler.ts` provides:
  - `calculateCurrentWeek(registeredWeek, registrationDate)` — calculates current week from snapshot
  - `getDueGuidanceWeeks(currentWeek, alreadySentWeeks)` — milestone weeks: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40
  - `GuidanceScheduler` interface for future implementation

### Database Support
- `mothers.registration_date` column added
- `weekly_guidance` table (pre-existing) stores content per week per language

### To Complete
- Wire a Vercel Cron Job or external scheduler to call `checkAndSendGuidance`
- Implement delivery tracking (mark weeks as sent to prevent duplicates)
- Populate `weekly_guidance` table with actual content

---

## Priority 7: Language Robustness

### Improvements
1. **Expanded dictionary** — 40+ new entries covering misspellings, abbreviations, SMS shorthand, alternative romanizations, greetings, and confirmation words

2. **Fuzzy normalization** — `fuzzyNormalize()` function generates variants:
   - Remove doubled letters: "demm" → "dem" → "blood"
   - Remove trailing vowels: "hode" → "hod" → "stomach"
   - Common vowel swaps: a↔e substitution
   - Applied as second pass when direct dictionary lookup fails

3. **New entries added**:
   - Misspellings: "yimetagnl", "ymetal", "ane", "hode", "demm", etc.
   - SMS shorthand: "preg", "mnths", "wks", "doc", "hosp", etc.
   - Alt romanizations: "yimategnal", "yikorignal", "hodye", "rasye", etc.
   - Greetings: "selam", "endemin", "dehna", "nagaa", etc.
   - Confirmations: "awo", "aye", "ishi", "ameseginalehu", etc.

### Languages Supported
- Amharic (Ge'ez script + 2 romanization styles)
- Afaan Oromo
- Tigrinya
- English
- Mixed language

---

## Priority 8: Safety

### Emergency Detection
Added **emergency symptom combinations** that ALWAYS escalate to HIGH risk regardless of individual symptom severity:

| Combination | Clinical Concern |
|-------------|-----------------|
| headache + vision changes | Preeclampsia |
| headache + swelling | Preeclampsia |
| headache + convulsions | Eclampsia |
| bleeding + pain | Placental abruption |
| bleeding + no fetal movement | Fetal distress |
| convulsions + vision changes | Eclampsia |

### High-Risk Response Behavior
- AI prompt includes: "urgency is critical, tell them to go to hospital NOW"
- Template fallback includes: "Seek immediate medical care"
- All high-risk responses include ⚠️ prefix
- Follow-up questions probe for related danger signs

### What the AI Never Does
- Diagnose conditions
- Prescribe medication
- Guarantee outcomes
- Determine risk levels (rules engine only)

---

## Priority 9: Observability

### Structured Logging
Every message processing produces:
```
[EnatAI INFO] phone=+251... ch=sms lang=am intent=symptom_report risk=high symptoms=2 time=342ms
```

### Message Traces
`message_traces` table captures the full pipeline:
- `phone`, `raw_message`, `channel`
- `detected_language`, `intent`
- `extracted_symptoms` (JSONB array)
- `pregnancy_week`, `risk_level`
- `response_text`
- `processing_time_ms`
- `error` (if processing failed)

### Debugging Capability
- Query traces by mother_id, created_at, or intent
- Filter by error IS NOT NULL for failed processing
- Measure p50/p95 processing time via `processing_time_ms`
- Correlate with `message_id` for full audit trail

---

## Conversation Flows

### Flow 1: New Mother Registration
```
Mother: "selam"
  → intent: greeting
  → response: "ሰላም! እኔ EnatAI ነኝ፣ የእርግዝና ጤና ጓደኛዎ። ስንት ወር ነው?"
  → state: awaiting_registration

Mother: "5 wer"
  → intent: registration
  → pregnancy_week: 20
  → response: "አመሰግናለሁ! 5 ወር (20 ሳምንት) ተመዝግቧል..."
  → state: idle
```

### Flow 2: Symptom Report → Follow-up → Escalation
```
Mother: "rase yimetagnal"
  → intent: symptom_report
  → symptoms: [headache]
  → risk: medium → high (if late pregnancy)
  → response: AI-generated caring response + "Do you have vision changes?"
  → state: awaiting_followup (askingAboutSymptom: "vision changes")

Mother: "awo"
  → intent: followup_response
  → resolution: confirmed vision changes → escalate
  → re-classified as symptom_report with headache + vision
  → risk: HIGH (emergency combination)
  → response: "⚠️ Go to hospital NOW"
  → state: idle
```

### Flow 3: Out-of-Scope
```
Mother: "I have malaria"
  → intent: non_pregnancy_health
  → response: "EnatAI specializes in pregnancy care. For malaria, please see a healthcare provider."
```

### Flow 4: Duplicate SMS (Webhook Retry)
```
Mother: "dem yiferesal" (sent)
  → processed normally → HIGH risk response sent
  
Gateway: same webhook delivered again (retry)
  → hash matches existing → deduplicated: true → no response sent
```

---

## Edge Cases

### Handled
| Case | Handling |
|------|----------|
| Webhook retry (same SMS) | Message hash deduplication |
| Same text hours later | New time bucket → processed as new |
| Race condition (concurrent webhooks) | Unique index on (mother_id, hash, direction) |
| Hasab AI down | Falls back to template responses |
| Unknown language | Defaults to English |
| Empty message | Returns "unknown" intent → clarification |
| Very long message | SMS truncated to 400 chars |
| Multiple symptoms in one message | All extracted, highest risk wins |
| Headache + vision (combo) | Emergency escalation to HIGH |
| Follow-up without pending question | Treated as unknown intent |
| Number-only response ("1") | Treated as follow-up |

### Remaining Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| Hasab AI slow response (> 10s) | Medium | Could add timeout; currently relies on Hasab defaults |
| Ge'ez script extraction accuracy | Medium | Hasab AI handles; fallback has no Ge'ez parsing |
| Concurrent messages from same mother | Low | DB unique index prevents duplicate hashes |
| SMS Gateway cloud API downtime | Medium | Error logged; message still processed internally |
| Scheduler not yet wired to cron | Low | Interfaces ready; needs Vercel Cron integration |
| conversation_state race condition | Low | Upsert with ON CONFLICT handles concurrent writes |
| Long message with mixed intents | Low | First matching intent wins; could miss secondary |

---

## What Works End-to-End Today

1. **Inbound SMS → processing → reply SMS** ✅
2. **Duplicate prevention** ✅
3. **Intent classification** (8 categories) ✅
4. **AI-powered responses** (with template fallback) ✅
5. **Multi-turn conversations** (state machine) ✅
6. **Emergency symptom combination detection** ✅
7. **Out-of-scope handling** ✅
8. **Multi-language support** (am, om, ti, en, mixed) ✅
9. **Fuzzy normalization** (typos, abbreviations, SMS shorthand) ✅
10. **Full pipeline observability** (traces + structured logs) ✅
11. **Web demo** (`/demo`) ✅
12. **Test endpoint** (`/api/test/sms`) ✅

## What Needs Wiring

1. **Cron-based weekly guidance delivery** — interfaces exist, needs Vercel Cron trigger
2. **Delivery tracking for scheduled messages** — needs implementation
3. **Weekly guidance content** — needs population in `weekly_guidance` table
4. **Processing status update** — inbound messages stored as "processing" but not updated to "completed" in DB (response stored separately as new row)

---

## Database Schema (Post-Hardening)

### Tables
- `mothers` — phone, name, language, pregnancy_week, registration_date
- `messages` — with channel, risk_level, message_hash, processing_status, intent
- `risk_events` — risk_level, symptoms[], reasoning
- `weekly_guidance` — week_number, title, content, language
- `conversation_state` — state machine: state, pending_question, pending_context
- `message_traces` — full pipeline trace per message

### Key Indexes
- `idx_messages_dedup` — UNIQUE on (mother_id, message_hash, direction) WHERE hash IS NOT NULL
- `idx_messages_processing` — partial index on processing_status = 'processing'
- `idx_traces_mother` — traces by mother
- `idx_traces_created` — traces by time (DESC)
- `idx_conv_state_mother` — conversation state by mother
