export type ExamType =
  | "NEET"
  | "JEE"
  | "CUET"
  | "CAT"
  | "GATE"
  | "UPSC"
  | "boards"
  | "other";

interface AgeProfile {
  ageGroup: string;
  context: string;
}

const AGE_PROFILES: Record<ExamType, AgeProfile> = {
  JEE: {
    ageGroup: "16-18 years",
    context:
      "Intense parental involvement, living at home, fierce peer comparison in coaching batches. " +
      "First major life decision. Frame strategies around what they can control today, not rank.",
  },
  NEET: {
    ageGroup: "16-18 years",
    context:
      "Similar to JEE: high parental expectations, coaching culture, self-worth tied to a single exam. " +
      "Acknowledge the biology/chemistry grind and the fear of a gap year.",
  },
  boards: {
    ageGroup: "15-17 years",
    context:
      "Adolescent identity stage. 'Marks = worth' messaging from school and society. " +
      "Peer comparison amplifies. Validate emotional intensity at this age without minimising it.",
  },
  CUET: {
    ageGroup: "18-19 years",
    context:
      "College transition anxiety, first taste of independence vs fear of leaving home. " +
      "Identity shift from school student to young adult. Less parental day-to-day, more self-driven pressure.",
  },
  CAT: {
    ageGroup: "21-25 years",
    context:
      "Career pivot pressure, gap-year stigma, financial concerns about MBA investment. " +
      "Watching engineering peers land jobs while still prepping. The 'now or never' myth.",
  },
  GATE: {
    ageGroup: "21-24 years",
    context:
      "Technical career anxiety, PSU vs private sector debate. Often working while prepping, " +
      "so time management is the real stressor. Fear of 'wasting' engineering degree if GATE doesn't work.",
  },
  UPSC: {
    ageGroup: "22-30+ years",
    context:
      "Multiple-attempt weight, deep family expectations for 'sarkari naukri', watching non-UPSC peers " +
      "marry, buy homes, settle. Relationship/marriage pressure layered on study pressure. " +
      "Respect sacrifice without reinforcing all-or-nothing thinking.",
  },
  other: {
    ageGroup: "varies",
    context:
      "Generic exam pressure. Validate stress without assuming a specific life stage. Ask to know more.",
  },
};

export function journalAnalystSystemPrompt(examType: ExamType): string {
  const profile = AGE_PROFILES[examType] ?? AGE_PROFILES.other;

  return `You are a warm, empathetic mental-wellness analyst for Indian students preparing for competitive exams.

The student is preparing for ${examType}, which places them in the ${profile.ageGroup} age range.

Life-stage context: ${profile.context}

Analyze the journal entry and mood log provided by the user. Use the tools defined below to return structured output.

TOOL RULES:
Call BOTH extract_triggers AND produce_analysis together in a SINGLE response.
Do NOT send them sequentially - return both tool_calls in one message.

ANALYSIS GUIDELINES:
- Emotion must be one of the allowed values. Choose the dominant emotion you detect.
- Intensity: 1 (mild/barely there) to 5 (overwhelming/crisis level).
- Summary: one sentence capturing the emotional core of this entry.
- Reframe: a warm CBT-style cognitive shift, 2-3 sentences. Age-appropriate. Challenge the thought gently with evidence from their own entry. No clinical terms.
- Strategy: ONE concrete, actionable coping tip they can do today. Scale it to their life stage.
- Mindfulness: ONE adaptive breathing or mindfulness exercise, with clear simple steps. Under 50 words.
- Nudge: ONE warm motivational line, under 20 words. Like a trusted senior friend, not a coach.
- Safety flag: set to true ONLY if the journal mentions self-harm, suicide, severe hopelessness, or explicit crisis language. If flagged, the strategy MUST include India's Tele-MANAS helpline (14416) and Vandrevala Foundation (1860-2662-345).

CRITICAL CONSTRAINTS:
- NEVER diagnose, prescribe medication, or use clinical/medical language.
- NEVER say "it's just an exam" or minimise their feelings.
- NEVER compare them to other students.
- ALWAYS anchor advice to the Indian student context (coaching, mock tests, parent-teacher meetings, the "beta beta" pressure).
- Tag triggers with categories: academic, social, family, health, or self.
- Sentiment per trigger: -2 (very negative) to +2 (very positive).`;
}

export const journalAnalystTools: Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> = [
  {
    type: "function",
    function: {
      name: "extract_triggers",
      description:
        "Identify the stress triggers and emotional drivers in the journal entry. Call this first.",
      parameters: {
        type: "object",
        properties: {
          triggers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description:
                    'Trigger label, e.g. "mock test", "peer comparison", "sleep loss", "family expectations"',
                },
                category: {
                  type: "string",
                  enum: ["academic", "social", "family", "health", "self"],
                },
                sentiment: {
                  type: "integer",
                  minimum: -2,
                  maximum: 2,
                  description: "-2 = very negative, 2 = very positive",
                },
              },
              required: ["label", "category", "sentiment"],
            },
          },
        },
        required: ["triggers"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "produce_analysis",
      description:
        "Provide the complete analysis with emotion, coping plan, reframe, and safety flag. Call this after extract_triggers.",
      parameters: {
        type: "object",
        properties: {
          emotion: {
            type: "string",
            enum: [
              "anxiety",
              "self-doubt",
              "burnout",
              "hopeful",
              "calm",
              "frustrated",
              "overwhelmed",
              "motivated",
              "lonely",
              "grateful",
            ],
          },
          intensity: {
            type: "integer",
            minimum: 1,
            maximum: 5,
          },
          summary: {
            type: "string",
            description: "One-sentence emotional summary of the entry",
          },
          reframe: {
            type: "string",
            description:
              "Warm CBT-style cognitive shift, 2-3 sentences, age-appropriate",
          },
          strategy: {
            type: "string",
            description:
              "ONE concrete, actionable coping tip for today. Scale to life stage.",
          },
          mindfulness: {
            type: "string",
            description:
              "ONE adaptive breathing/mindfulness exercise with clear steps, under 50 words",
          },
          nudge: {
            type: "string",
            description:
              "ONE warm motivational line, under 20 words, like a trusted senior friend",
          },
          safety_flag: {
            type: "boolean",
            description:
              "Set true ONLY if crisis language detected. If true, strategy must include Tele-MANAS 14416.",
          },
        },
        required: [
          "emotion",
          "intensity",
          "summary",
          "reframe",
          "strategy",
          "mindfulness",
          "nudge",
          "safety_flag",
        ],
      },
    },
  },
];
