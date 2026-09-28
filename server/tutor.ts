import OpenAI from "openai";
import type { Assignment, ChatMessage } from "@shared/schema";
import { config } from "./config";

// The final stage of the conversation flow; the AI's reply at this stage is the summary.
export const SUMMARY_STAGE = 9;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openai.apiKey) {
    throw new Error("OpenAI is not configured - set OPENAI_API_KEY");
  }
  client ??= new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });
  return client;
}

export function buildSystemPrompt(assignment: Assignment, aiMessageCount: number): string {
  const { subject, topic, instructions } = assignment;
  const stage = Math.min(aiMessageCount + 1, SUMMARY_STAGE);

  return `You are a friendly AI tutor for GCSE/AQA ${subject}, helping a student with their homework on "${topic}".

**UNIVERSAL CONVERSATION FLOW:**

Current AI message count: ${aiMessageCount}

Stage 1 (message 0): "Hi there! How are you today?"
Stage 2 (message 1): "I have a homework topic from ${subject} about ${topic}. I'm your teacher. Are you ready?"
Stage 3 (message 2): "Before we begin, how much do you already know about ${topic}?"
Stage 4 (message 3): "Good effort! [brief feedback]. Now, [ask first analytical question - e.g., How does ${topic} differ from related concepts?]"
Stage 5 (message 4): "[Brief feedback]. [Ask comprehension question - e.g., Can you describe a real-world example?]"
Stage 6 (message 5): "[Brief feedback]. [Ask application question - e.g., What happens in a specific scenario related to ${topic}?]"
Stage 7 (message 6): "[Brief feedback]. [Ask analytical question - e.g., How does X affect Y in ${topic}?]"
Stage 8 (message 7): "[Brief feedback]. [Ask critical thinking question - e.g., Why is ${topic} important in this context?]"
Stage 9 (message 8+): "Excellent work! Here's a summary of what we covered: [3-4 sentences covering key concepts, real-world applications, and critical insights about ${topic}]"

**QUESTION TYPES (DO NOT ask for definitions):**
- Basic: Compare/contrast with related concepts
- Comprehension: Real-world examples and applications
- Application: Specific scenarios and outcomes
- Analytical: Cause and effect relationships
- Critical Thinking: Importance and broader implications

**TEACHER INSTRUCTIONS (follow these unless they conflict with the rules below):**
${instructions}

**RULES:**
- You are currently at Stage ${stage}
- Ask ONLY the question for your current stage
- Keep responses under 20 words (except final summary)
- Give brief, encouraging feedback (max 5 words)
- Questions must be analytical, NOT definitional
- NEVER ask "What is ${topic}?" - ask HOW, WHY, or application questions
- Move linearly through stages - no going back
- Stay on the homework topic; politely decline unrelated or inappropriate requests`;
}

const SUMMARY_PHRASES = [
  "summary",
  "summarize",
  "summarise",
  "in conclusion",
  "to conclude",
  "we've covered",
  "we have covered",
  "what we covered",
];

/**
 * True when an AI reply is the end-of-session summary. Requires the conversation
 * to have reached the summary stage so encouraging phrases earlier in the flow
 * (e.g. "great job") do not unlock completion prematurely.
 */
export function isSummaryMessage(aiResponse: string, aiMessageCountBefore: number): boolean {
  if (aiMessageCountBefore + 1 < SUMMARY_STAGE) return false;
  const text = aiResponse.toLowerCase();
  return SUMMARY_PHRASES.some((p) => text.includes(p));
}

export async function generateTutorReply(
  assignment: Assignment,
  history: ChatMessage[],
  studentMessage: string,
): Promise<string> {
  const aiMessageCount = history.filter((m) => m.role === "ai").length;
  let systemPrompt = buildSystemPrompt(assignment, aiMessageCount);
  if (history.length > 0) {
    systemPrompt +=
      "\n\n**CRITICAL: Do NOT repeat any questions you have already asked. Move forward in the conversation based on the student's latest response.**";
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user", content: studentMessage },
  ];

  const completion = await getClient().chat.completions.create({
    model: config.openai.model,
    messages,
    temperature: 0.7,
    max_tokens: 500,
  });

  return (
    completion.choices[0]?.message?.content?.trim() ||
    "I'm having trouble responding right now. Could you try saying that again?"
  );
}
