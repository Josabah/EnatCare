import type { RiskAssessment } from "@/types/risk";
import type { Language, MessageIntent } from "@/types/database";
import { generateResponse as generateTemplateResponse } from "./pregnancyRules";

export type { MessageIntent };

const HASAB_API_KEY = process.env.HASAB_API_KEY ?? "";
const HASAB_BASE_URL =
  process.env.HASAB_BASE_URL ?? "https://api.hasab.ai/api/v1";

const LANGUAGE_NAMES: Record<Language, string> = {
  am: "Amharic",
  om: "Afaan Oromo",
  ti: "Tigrinya",
  en: "English",
  mixed: "simple English mixed with Amharic",
};

export interface ResponseContext {
  intent: MessageIntent;
  language: Language;
  pregnancyWeek: number | null;
  motherName: string | null;
  assessment: RiskAssessment | null;
  conversationHistory: string[];
  pendingQuestion: string | null;
}

interface HasabChatResponse {
  message: {
    role: "assistant";
    content: string;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateResponse(ctx: ResponseContext): Promise<string> {
  switch (ctx.intent) {
    case "greeting":
      return greetingResponse(ctx);
    case "registration":
      return registrationResponse(ctx);
    case "symptom_report":
      return symptomResponse(ctx);
    case "followup_response":
      return followupResponse(ctx);
    case "pregnancy_question":
      return pregnancyQuestionResponse(ctx);
    case "non_pregnancy_health":
      return nonPregnancyHealthResponse(ctx);
    case "unrelated":
      return unrelatedResponse(ctx);
    case "unknown":
    default:
      return unknownResponse(ctx);
  }
}

// ---------------------------------------------------------------------------
// Template-based responses (no LLM needed)
// ---------------------------------------------------------------------------

function greetingResponse(ctx: ResponseContext): string {
  const name = ctx.motherName;
  const lang = ctx.language;

  if (ctx.pregnancyWeek !== null && name) {
    const templates: Record<Language, string> = {
      am: `ሰላም ${name}! እንኳን ደህና ተመለሱ። ዛሬ እንዴት ይሰማዎታል?`,
      om: `Nagaa ${name}! Baga nagaan deebitee. Har'a akkam jirta?`,
      ti: `ሰላም ${name}! ደሓን ተመሊስኪ። ሎሚ ከመይ ኣለኺ?`,
      en: `Hello ${name}! Welcome back. How are you feeling today?`,
      mixed: `Hello ${name}! Welcome back. How are you feeling today?`,
    };
    return templates[lang];
  }

  if (name) {
    const templates: Record<Language, string> = {
      am: `ሰላም ${name}! እኔ EnatAI ነኝ፣ የእርግዝና ጤና ጓደኛዎ። ስንት ወር ነው?`,
      om: `Nagaa ${name}! Ani EnatAI dha, hiriyyaa fayyaa da'umsaa keeti. Ji'a meeqaffaa irra jirta?`,
      ti: `ሰላም ${name}! ኣነ EnatAI እየ፣ ናይ ጥንሲ ጥዕና መሓዛኺ። ክንደይ ወርሒ ኮይንኪ?`,
      en: `Hello ${name}! I'm EnatAI, your pregnancy care companion. How many months pregnant are you?`,
      mixed: `Hello ${name}! I'm EnatAI, your pregnancy care companion. How many months pregnant are you?`,
    };
    return templates[lang];
  }

  const templates: Record<Language, string> = {
    am: "ሰላም! እኔ EnatAI ነኝ፣ የእርግዝና ጤና ጓደኛዎ። ስንት ወር ነው? (ለምሳሌ: 5 ወር)",
    om: "Nagaa! Ani EnatAI dha, hiriyyaa fayyaa da'umsaa keeti. Ji'a meeqa irra jirta?",
    ti: "ሰላም! ኣነ EnatAI እየ፣ ናይ ጥንሲ ጥዕና መሓዛኺ። ክንደይ ወርሒ ኮይንኪ?",
    en: "Hello! I'm EnatAI, your pregnancy care companion. How many months pregnant are you? (e.g. 5 months)",
    mixed: "Hello! I'm EnatAI, your pregnancy care companion. How many months pregnant are you? (e.g. 5 wer)",
  };
  return templates[lang];
}

function registrationResponse(ctx: ResponseContext): string {
  const week = ctx.pregnancyWeek;
  const lang = ctx.language;

  if (week === null) {
    const templates: Record<Language, string> = {
      am: "ስንት ወር ነው እርጉዝ የሆኑት? ቁጥር ብቻ ይላኩ። (ለምሳሌ: 5 ወር)",
      om: "Ji'a meeqa ulfaa taatee? Lakkoofsa qofa ergi. (Fkn: 5 ji'a)",
      ti: "ክንደይ ወርሒ ጥንስ ኮይንኪ? ቁጽሪ ጥራይ ስደዲ።",
      en: "How many months pregnant are you? Just send the number (e.g. 5 months).",
      mixed: "How many months pregnant are you? (e.g. 5 wer)",
    };
    return templates[lang];
  }

  const month = Math.round(week / 4);

  const templates: Record<Language, string> = {
    am: `አመሰግናለሁ! ${month} ወር (${week} ሳምንት) ተመዝግቧል። EnatAI በእርግዝናዎ ጊዜ ሁሉ አብሮዎት ይሆናል። ማንኛውም ምልክት ወይም ጥያቄ ካለዎት ያሳውቁኝ።`,
    om: `Galatoomi! Ji'a ${month} (torban ${week}) galmaa'eera. EnatAI yeroo ulfaa kee hunda si waliin ta'a. Mallattoo ykn gaaffii yoo qabaatte na beeksisi.`,
    ti: `አመስግነኪ! ${month} ወርሒ (${week} ሰሙን) ተመዝጊቡ። EnatAI ኣብ ግዜ ጥንስኺ ምሳኺ ክኸውን እዩ። ምልክት ወይ ሕቶ እንተሃልዩ ሓብሪኒ።`,
    en: `Thank you! Registered at ${month} months (week ${week}). EnatAI will be with you throughout your pregnancy. Let me know if you have any symptoms or questions.`,
    mixed: `Thank you! ${month} months (week ${week}) registered. EnatAI will be with you. Tell me about any symptoms or questions.`,
  };
  return templates[lang];
}

function nonPregnancyHealthResponse(ctx: ResponseContext): string {
  const lang = ctx.language;

  const templates: Record<Language, string> = {
    am: "EnatAI በእርግዝና ጤና ላይ ያተኩራል። ለዚህ ችግር እባክዎ ወደ ጤና ባለሙያ ይሂዱ። የእርግዝና ጥያቄ ካለዎት ለመርዳት ዝግጁ ነኝ።",
    om: "EnatAI fayyaa da'umsaa irratti xiyyeeffata. Rakkoo kanaaf maaloo ogeessa fayyaa mari. Gaaffii ulfaa yoo qabaatte, si gargaaruuf qophii dha.",
    ti: "EnatAI ኣብ ጥዕና ጥንሲ ዘተኰረ እዩ። ነዚ ጸገም ብኽብረትኪ ናብ ሓኪም ኪዲ። ናይ ጥንሲ ሕቶ እንተሃልዩ ክሕግዘኪ ድልዊ እየ።",
    en: "EnatAI specializes in pregnancy care. For this health concern, please consult a healthcare provider. If you have pregnancy-related questions, I'm here to help!",
    mixed: "EnatAI specializes in pregnancy care. For this concern, please see a healthcare provider. For pregnancy questions, I'm here to help!",
  };
  return templates[lang];
}

function unrelatedResponse(ctx: ResponseContext): string {
  const lang = ctx.language;

  const templates: Record<Language, string> = {
    am: "እኔ EnatAI ነኝ፣ የእርግዝና ጤና ጓደኛዎ። በእርግዝና ምልክቶች፣ መመሪያ እና ጤና ጥያቄዎች ልረዳዎ እችላለሁ። እንዴት ልረዳዎ?",
    om: "Ani EnatAI dha, hiriyyaa fayyaa da'umsaa keeti. Mallattoo ulfaa, qajeelfamaa fi gaaffii fayyaa irratti si gargaaruu danda'a. Akkamitti si gargaaruu?",
    ti: "ኣነ EnatAI እየ፣ ናይ ጥንሲ ጥዕና መሓዛኺ። ብምልክታት ጥንሲ፣ መምርሒ ከምኡውን ሕቶ ጥዕና ክሕግዘኪ እኽእል። ከመይ ክሕግዘኪ?",
    en: "I'm EnatAI, your pregnancy care companion. I can help with pregnancy symptoms, guidance, and health questions during pregnancy. How can I help you today?",
    mixed: "I'm EnatAI, your pregnancy care companion. I can help with pregnancy symptoms, guidance, and health questions. How can I help you today?",
  };
  return templates[lang];
}

function unknownResponse(ctx: ResponseContext): string {
  const lang = ctx.language;

  const templates: Record<Language, string> = {
    am: "መልእክትዎን ሙሉ በሙሉ አልገባኝም። ስለ እርግዝና ምልክቶች ሊነግሩኝ፣ ጥያቄ ሊጠይቁ ወይም ስንት ወር እንደሆኑ ሊነግሩኝ ይችላሉ።",
    om: "Ergaa kee guutuutti hin hubanne. Mallattoo ulfaa naaf himuu, gaaffii gaafachuu, ykn ji'a meeqa akka taate naaf himuu dandeessa.",
    ti: "ሙሉእ ብሙሉእ መልእኽትኺ ኣይተረድኣንን። ብዛዕባ ምልክታት ጥንሲ ክትነግሪኒ፣ ሕቶ ክትሓቲ ወይ ክንደይ ወርሒ ምዃንኪ ክትነግሪኒ ትኽእሊ።",
    en: "I didn't fully understand your message. You can tell me about pregnancy symptoms, ask pregnancy questions, or tell me how many months pregnant you are.",
    mixed: "I didn't fully understand your message. You can tell me about pregnancy symptoms, ask questions, or tell me how many months (wer) pregnant you are.",
  };
  return templates[lang];
}

// ---------------------------------------------------------------------------
// Follow-up responses — context-aware
// ---------------------------------------------------------------------------

function followupResponse(ctx: ResponseContext): string {
  if (ctx.pendingQuestion) {
    return unknownResponse(ctx);
  }

  const lang = ctx.language;
  const templates: Record<Language, string> = {
    am: "ስለ መልስዎ አመሰግናለሁ። ሌላ ጥያቄ ወይም ምልክት ካለዎት ያሳውቁኝ።",
    om: "Deebii keef galatoomi. Gaaffii ykn mallattoo biraa yoo qabaatte na beeksisi.",
    ti: "ንመልስኺ አመስግነኪ። ካልእ ሕቶ ወይ ምልክት እንተሃልዩ ሓብሪኒ።",
    en: "Thank you for your response. Let me know if you have any other questions or symptoms.",
    mixed: "Thank you for your response. Let me know if you have other questions or symptoms.",
  };
  return templates[lang];
}

// ---------------------------------------------------------------------------
// AI-powered responses (Hasab AI with template fallback)
// ---------------------------------------------------------------------------

async function symptomResponse(ctx: ResponseContext): Promise<string> {
  if (!ctx.assessment) {
    return unknownResponse(ctx);
  }

  const { assessment, language, pregnancyWeek } = ctx;

  // Try Hasab AI for a natural, caring response
  if (HASAB_API_KEY) {
    try {
      const languageName = LANGUAGE_NAMES[language];
      const symptoms = assessment.symptoms.map((s) => s.name).join(", ");
      const history = ctx.conversationHistory.slice(-3).join("\n");

      const prompt = `You are EnatAI, a caring maternal health companion for Ethiopian mothers. Generate a natural, warm SMS response.

CONTEXT:
- Language: ${languageName}
- Pregnancy week: ${pregnancyWeek ?? "unknown"}
- Risk level: ${assessment.level} (determined by medical rules, do NOT change)
- Recommended action: ${assessment.recommendedAction}
- Detected symptoms: ${symptoms}
- Recent conversation: ${history || "none"}

RULES:
- Respond in ${languageName}
- Keep under 400 characters (SMS limit)
- Be warm and caring, not clinical
- Include the recommended action naturally
- If HIGH risk: urgency is critical, tell them to go to hospital NOW
- If MEDIUM risk: encourage monitoring, mention next clinic visit
- If LOW risk: reassure, give practical advice
- NEVER diagnose
- NEVER guarantee outcomes
- Ask ONE follow-up question if relevant

SMS Response:`;

      const aiResponse = await callHasab(prompt);
      if (aiResponse) return truncateSms(aiResponse);
    } catch (error) {
      console.error("Hasab AI response generation failed:", error);
    }
  }

  // Fallback to template-based response from pregnancyRules
  return generateTemplateResponse(assessment, language, pregnancyWeek);
}

async function pregnancyQuestionResponse(ctx: ResponseContext): Promise<string> {
  const { language, conversationHistory } = ctx;

  if (HASAB_API_KEY) {
    try {
      const languageName = LANGUAGE_NAMES[language];
      const question = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1]
        : "";
      const weekContext = ctx.pregnancyWeek
        ? `The mother is at week ${ctx.pregnancyWeek} of pregnancy.`
        : "Pregnancy week is unknown.";

      const prompt = `You are EnatAI, a caring maternal health companion for Ethiopian mothers. Answer this pregnancy question.

Question: "${question}"

Context: ${weekContext}

RULES:
- Answer in ${languageName}
- Keep response under 400 characters (SMS limit)
- Only answer if it's about pregnancy, maternal health, or newborn care
- If the question is not pregnancy-related, politely say you specialize in pregnancy care
- Be warm, supportive, and practical
- NEVER diagnose or prescribe medication
- If unsure, recommend consulting a healthcare provider
- Do not make up medical facts

Answer:`;

      const aiResponse = await callHasab(prompt);
      if (aiResponse) return truncateSms(aiResponse);
    } catch (error) {
      console.error("Hasab AI pregnancy question failed:", error);
    }
  }

  // Template fallback for pregnancy questions
  const templates: Record<Language, string> = {
    am: "ጥሩ ጥያቄ ነው! ለተሻለ መልስ ጤና ባለሙያዎን ያማክሩ። ምልክት ካጋጠมዎ ያሳውቁኝ።",
    om: "Gaaffii gaarii dha! Deebii foyyaa'aaf ogeessa fayyaa kee mari. Mallattoo yoo qabaatte na beeksisi.",
    ti: "ጽቡቕ ሕቶ! ንዝሓሸ መልሲ ሓኪምኪ ኣማኽሪ። ምልክት እንተሃልዩ ሓብሪኒ።",
    en: "Great question! For the best answer, please consult your healthcare provider at your next visit. If you experience any symptoms, let me know.",
    mixed: "Great question! Please consult your healthcare provider for the best answer. If you have symptoms, let me know.",
  };
  return templates[language];
}

// ---------------------------------------------------------------------------
// Hasab AI call
// ---------------------------------------------------------------------------

async function callHasab(prompt: string): Promise<string | null> {
  const response = await fetch(`${HASAB_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HASAB_API_KEY}`,
    },
    body: JSON.stringify({
      message: prompt,
      model: "hasab-1-main",
      temperature: 0.7,
      max_tokens: 512,
      stream: false,
    }),
  });

  if (!response.ok) {
    console.error(
      `Hasab API error: ${response.status} ${response.statusText}`
    );
    return null;
  }

  const data = (await response.json()) as HasabChatResponse;
  return data.message?.content?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function truncateSms(text: string): string {
  if (text.length <= 400) return text;
  return text.slice(0, 397) + "...";
}
