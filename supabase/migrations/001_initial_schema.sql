-- EnatAI: Maternal Care Companion
-- Initial database schema

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- -------------------------------------------------------------------
-- Table: mothers
-- Core registry of pregnant women using the service.
-- -------------------------------------------------------------------
create table mothers (
  id              uuid primary key default uuid_generate_v4(),
  phone           text not null unique,
  name            text,
  preferred_language text check (preferred_language in ('am', 'om', 'ti', 'en', 'mixed')),
  pregnancy_week  integer check (pregnancy_week >= 1 and pregnancy_week <= 45),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_mothers_phone on mothers (phone);

-- -------------------------------------------------------------------
-- Table: messages
-- Full SMS conversation log — both inbound and outbound.
-- -------------------------------------------------------------------
create table messages (
  id              uuid primary key default uuid_generate_v4(),
  mother_id       uuid not null references mothers(id) on delete cascade,
  direction       text not null check (direction in ('inbound', 'outbound')),
  message         text not null,
  raw_message     text,
  created_at      timestamptz not null default now()
);

create index idx_messages_mother_id on messages (mother_id);
create index idx_messages_created_at on messages (created_at desc);

-- -------------------------------------------------------------------
-- Table: risk_events
-- Every time the system detects a non-trivial risk.
-- -------------------------------------------------------------------
create table risk_events (
  id              uuid primary key default uuid_generate_v4(),
  mother_id       uuid not null references mothers(id) on delete cascade,
  risk_level      text not null check (risk_level in ('low', 'medium', 'high')),
  symptoms        jsonb not null default '[]'::jsonb,
  reasoning       text not null,
  created_at      timestamptz not null default now()
);

create index idx_risk_events_mother_id on risk_events (mother_id);
create index idx_risk_events_level on risk_events (risk_level);
create index idx_risk_events_created_at on risk_events (created_at desc);

-- -------------------------------------------------------------------
-- Table: weekly_guidance
-- Pre-authored pregnancy education content, per week and language.
-- -------------------------------------------------------------------
create table weekly_guidance (
  id              uuid primary key default uuid_generate_v4(),
  week_number     integer not null check (week_number >= 1 and week_number <= 42),
  title           text not null,
  content         text not null,
  language        text not null check (language in ('am', 'om', 'ti', 'en')),
  unique (week_number, language)
);

create index idx_weekly_guidance_week on weekly_guidance (week_number);

-- -------------------------------------------------------------------
-- Enable Row Level Security (tables are accessed via service role key
-- from the backend, but RLS is enabled for defense in depth).
-- -------------------------------------------------------------------
alter table mothers enable row level security;
alter table messages enable row level security;
alter table risk_events enable row level security;
alter table weekly_guidance enable row level security;

-- Service role bypasses RLS. These policies allow the anon/authenticated
-- role to read weekly guidance (public educational content).
create policy "Public can read weekly guidance"
  on weekly_guidance for select
  using (true);

-- -------------------------------------------------------------------
-- Seed: Sample weekly guidance (English)
-- -------------------------------------------------------------------
insert into weekly_guidance (week_number, title, content, language) values
  (4,  'Week 4: Early Pregnancy', 'Your baby is the size of a poppy seed. You may start to feel tired or nauseous. This is normal. Start taking folic acid if you have not already.', 'en'),
  (8,  'Week 8: First Trimester', 'Your baby is about the size of a raspberry. Morning sickness may be at its worst. Eat small, frequent meals. Stay hydrated.', 'en'),
  (12, 'Week 12: End of First Trimester', 'Your baby is about the size of a lime. The risk of miscarriage drops significantly. You should have your first antenatal visit if you have not already.', 'en'),
  (16, 'Week 16: Second Trimester Begins', 'Your baby is about the size of an avocado. You may start to feel the baby move soon. Continue attending antenatal care.', 'en'),
  (20, 'Week 20: Halfway There', 'Your baby is about the size of a banana. This is a good time for an ultrasound if available. You may feel the baby kicking.', 'en'),
  (24, 'Week 24: Viability Milestone', 'Your baby could potentially survive outside the womb with intensive care. You may notice swelling in your feet. Keep your feet elevated when resting.', 'en'),
  (28, 'Week 28: Third Trimester Begins', 'Your baby is about the size of an eggplant. Start counting fetal movements daily. If you notice less movement, contact your health provider.', 'en'),
  (32, 'Week 32: Getting Closer', 'Your baby is about the size of a squash. You may feel short of breath as the baby grows. Practice breathing exercises. Prepare for delivery.', 'en'),
  (36, 'Week 36: Almost There', 'Your baby is about the size of a papaya. The baby may drop lower in your pelvis. Pack your hospital bag. Know the signs of labor.', 'en'),
  (40, 'Week 40: Due Date', 'Your baby is ready to be born! Signs of labor include regular contractions, water breaking, and bloody show. Go to the health facility when contractions are regular.', 'en');

-- Amharic guidance
insert into weekly_guidance (week_number, title, content, language) values
  (4,  'ሳምንት 4: የእርግዝና መጀመሪያ', 'ልጅዎ በጣም ትንሽ ነው። ድካምና ማቅለሽለሽ ሊሰማዎት ይችላል። ይህ የተለመደ ነው። ፎሊክ አሲድ መውሰድ ጀምሩ።', 'am'),
  (12, 'ሳምንት 12: የመጀመሪያ ሦስት ወር መጨረሻ', 'የጽንስ ውርጃ አደጋ ይቀንሳል። የመጀመሪያ የቅድመ ወሊድ ምርመራ ካላደረጉ አሁን ያድርጉ።', 'am'),
  (20, 'ሳምንት 20: ግማሽ መንገድ', 'ልጅዎ እየተንቀሳቀሰ ሊሰማዎት ይችላል። አልትራሳውንድ ማድረግ ጥሩ ጊዜ ነው።', 'am'),
  (28, 'ሳምንት 28: ሦስተኛ ሦስት ወር ጅምር', 'የልጅዎን እንቅስቃሴ በየቀኑ ይቁጠሩ። እንቅስቃሴ ከቀነሰ ጤና ባለሙያ ያግኙ።', 'am'),
  (36, 'ሳምንት 36: ልደት ሊቃረብ ነው', 'የሆስፒታል ቦርሳ ያዘጋጁ። የምጥ ምልክቶችን ይወቁ። ሆስፒታል መሄድ ያለብዎትን ይረዱ።', 'am'),
  (40, 'ሳምንት 40: የልደት ቀን', 'ልጅዎ ለመወለድ ዝግጁ ነው! ምጥ ሲጀመር ወደ ጤና ተቋም ይሂዱ።', 'am');
