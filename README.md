# EnatAI

SMS-based maternal care companion for Ethiopian mothers.

Pregnancy milestone guidance, symptom screening, warning sign detection, risk classification, personalized responses, and local language support — all delivered over SMS.

**EnatAI is not an AI doctor. It does not diagnose. It helps women understand when they should seek care.**

## How It Works

```
Mother sends SMS (any language)
        ↓
  AfroMessage Webhook
        ↓
  Normalization Layer (Amharic, Oromo, Tigrinya, English, mixed)
        ↓
  Hasab AI — structured extraction (symptoms, week, language)
        ↓
  Pregnancy Rules Engine — deterministic risk classification
        ↓
  Response Generator — simple, supportive guidance
        ↓
  SMS Response via AfroMessage
```

**AI extracts information. Rules determine outcomes.**

The LLM never makes medical decisions. All risk classification, escalation, and response selection is handled by configurable rules.

## Supported Languages

| Language | Script | Romanized |
|----------|--------|-----------|
| Amharic | ✅ Ge'ez | ✅ Latin |
| Afaan Oromo | — | ✅ Latin |
| Tigrinya | ✅ Ge'ez | ✅ Latin |
| English | — | ✅ |
| Mixed | — | ✅ |

### Example Messages

```
"ene 7 wer negn rase yimetagnal"       → Week 28, headache → MEDIUM/HIGH
"doctor ene 8 month pregnant negn"      → Week 32, general inquiry
"hod yikoregnal"                        → Abdominal pain → HIGH
"dem yiferesal"                         → Bleeding → HIGH
```

## Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **SMS**: AfroMessage
- **AI**: Hasab AI
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/afromessage/route.ts   # SMS webhook endpoint
│   │   └── dashboard/stats/route.ts        # Dashboard data API
│   ├── dashboard/page.tsx                  # Admin dashboard
│   ├── layout.tsx
│   └── page.tsx                            # Landing page
├── lib/
│   ├── afromessage.ts      # AfroMessage SMS integration
│   ├── hasab.ts            # Hasab AI integration
│   ├── messageProcessor.ts # Central orchestration
│   ├── normalization.ts    # Multi-language normalization + dictionary
│   ├── pregnancyRules.ts   # Rule-based risk engine + response generator
│   ├── riskEngine.ts       # Risk evaluation bridge
│   └── supabase.ts         # Database operations
└── types/
    ├── database.ts         # Database table types
    ├── risk.ts             # Risk assessment types
    └── symptoms.ts         # Symptom rules and definitions
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in your API keys and Supabase credentials
```

### 3. Set up the database

Run the migration in your Supabase project:

```bash
# Option A: Via Supabase Dashboard → SQL Editor
# Paste the contents of supabase/migrations/001_initial_schema.sql

# Option B: Via Supabase CLI
supabase db push
```

### 4. Configure AfroMessage webhook

Set your webhook URL in the AfroMessage dashboard:

```
https://your-domain.vercel.app/api/webhooks/afromessage
```

### 5. Run locally

```bash
npm run dev
```

- App: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- Webhook health: http://localhost:3000/api/webhooks/afromessage

## Risk Levels

| Level | Triggers | Response |
|-------|----------|----------|
| **HIGH** | Bleeding, severe headache, vision changes, convulsions, no fetal movement, severe abdominal pain, breathing difficulty | Immediate recommendation to seek care |
| **MEDIUM** | Swelling, fever, unusual discharge, persistent cramps | Monitoring advice + follow-up questions |
| **LOW** | Nausea, fatigue, heartburn, constipation | Educational response + reassurance |

## Webhook Payload

AfroMessage sends inbound SMS as a POST to `/api/webhooks/afromessage`:

```json
{
  "type": "inbound",
  "from": "+251912345678",
  "to": "+251900000000",
  "message": "ene 8 wer negn rase yimetagnal",
  "date": "2024-01-15T10:30:00Z",
  "smsc_message_id": "msg_123",
  "token": "your-webhook-secret"
}
```

Response:

```json
{
  "success": true,
  "riskLevel": "high",
  "symptomsDetected": 1,
  "responseSent": true
}
```

## Deployment

Deploy to Vercel:

```bash
vercel deploy
```

Set all environment variables in the Vercel dashboard under Project Settings → Environment Variables.

## License

Private — EnatAI
