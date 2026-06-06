import type { SymptomCategory } from "./risk";

export interface SymptomRule {
  category: SymptomCategory;
  triggers: string[];
  riskLevel: "low" | "medium" | "high";
  description: string;
  action: string;
}

export const HIGH_RISK_SYMPTOMS: SymptomRule[] = [
  {
    category: "bleeding",
    triggers: [
      "bleeding",
      "dem",
      "blood",
      "spotting",
      "hemorrhage",
      "dem yiferesal",
      "dem metat",
      "dhiiga",
    ],
    riskLevel: "high",
    description: "Vaginal bleeding during pregnancy",
    action: "Seek immediate medical care",
  },
  {
    category: "headache",
    triggers: [
      "severe headache",
      "ras yimetagnal",
      "rase yimetagnal",
      "ras mikitat",
      "matane",
      "dhukkubbii mataa",
    ],
    riskLevel: "high",
    description: "Severe or persistent headache",
    action: "Seek medical evaluation today",
  },
  {
    category: "vision",
    triggers: [
      "vision changes",
      "blurry vision",
      "seeing spots",
      "ayne yadetebignal",
      "ayne birignal",
      "ija",
      "vision problem",
    ],
    riskLevel: "high",
    description: "Vision changes or disturbances",
    action: "Seek medical evaluation today",
  },
  {
    category: "convulsion",
    triggers: [
      "convulsion",
      "seizure",
      "fit",
      "yemikesakes",
      "mirgirgir",
      "qufaa",
    ],
    riskLevel: "high",
    description: "Seizures or convulsions",
    action: "Seek emergency medical care immediately",
  },
  {
    category: "fetal_movement",
    triggers: [
      "no movement",
      "baby not moving",
      "less movement",
      "lijie ayinkasakesim",
      "lij ayinkasakesim",
      "yemayinkasakes",
      "sochii daa'imaa",
    ],
    riskLevel: "high",
    description: "Reduced or absent fetal movement",
    action: "Seek medical evaluation today",
  },
  {
    category: "pain",
    triggers: [
      "severe abdominal pain",
      "hod yikoregnal",
      "hod kurtet",
      "betam yikorenal",
      "dhukkubbii garaa",
      "sharp pain",
      "severe pain",
    ],
    riskLevel: "high",
    description: "Severe abdominal pain",
    action: "Seek immediate medical care",
  },
  {
    category: "breathing",
    triggers: [
      "difficulty breathing",
      "cant breathe",
      "breathing problem",
      "tinifas chigir",
      "tinifas yikotenal",
      "hafuura",
    ],
    riskLevel: "high",
    description: "Difficulty breathing",
    action: "Seek immediate medical care",
  },
];

export const MEDIUM_RISK_SYMPTOMS: SymptomRule[] = [
  {
    category: "swelling",
    triggers: [
      "swelling",
      "swollen",
      "igir ababiwal",
      "fit ababiwal",
      "edema",
      "dhiita",
    ],
    riskLevel: "medium",
    description: "Swelling in hands, face, or feet",
    action: "Monitor closely and consult at next visit",
  },
  {
    category: "fever",
    triggers: [
      "fever",
      "hot",
      "temperature",
      "tikus",
      "mikiyet",
      "ho'a qaamaa",
    ],
    riskLevel: "medium",
    description: "Fever or elevated temperature",
    action: "Monitor temperature and seek care if persistent",
  },
  {
    category: "discharge",
    triggers: [
      "discharge",
      "fluid leaking",
      "water breaking",
      "wuha yiferesal",
      "bishaan",
    ],
    riskLevel: "medium",
    description: "Unusual vaginal discharge or fluid leaking",
    action: "Seek medical evaluation soon",
  },
  {
    category: "pain",
    triggers: [
      "back pain",
      "jerbat",
      "mild cramp",
      "cramps",
      "hod yimetal",
      "dhukkubbii dugdaa",
    ],
    riskLevel: "medium",
    description: "Persistent back pain or cramping",
    action: "Rest and monitor; seek care if worsening",
  },
];

export const LOW_RISK_SYMPTOMS: SymptomRule[] = [
  {
    category: "nausea",
    triggers: [
      "nausea",
      "morning sickness",
      "vomiting",
      "yimetal",
      "yaskosikosal",
      "tokko",
      "lolaa",
    ],
    riskLevel: "low",
    description: "Nausea or morning sickness",
    action: "Common in early pregnancy. Eat small frequent meals. Seek care if unable to keep fluids down.",
  },
  {
    category: "fatigue",
    triggers: [
      "tired",
      "fatigue",
      "exhausted",
      "sleepy",
      "dekimognal",
      "slekome",
      "dadhabbii",
    ],
    riskLevel: "low",
    description: "Fatigue and tiredness",
    action: "Rest when possible. This is common during pregnancy.",
  },
  {
    category: "other",
    triggers: [
      "heartburn",
      "constipation",
      "frequent urination",
      "yemikelaw",
      "hod dirket",
    ],
    riskLevel: "low",
    description: "Common pregnancy discomfort",
    action: "These are common pregnancy symptoms. Mention at your next clinic visit.",
  },
];

export const ALL_SYMPTOM_RULES: SymptomRule[] = [
  ...HIGH_RISK_SYMPTOMS,
  ...MEDIUM_RISK_SYMPTOMS,
  ...LOW_RISK_SYMPTOMS,
];
