import { OpenAI } from "openai";

let groqClient: OpenAI | null = null;

export function getGroqClient(): OpenAI | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
}

export const GROQ_TEXT_MODEL = "llama-3.1-70b-versatile";
export const GROQ_VISION_MODEL = "llama-3.2-11b-vision-preview";

export async function groqChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model = GROQ_TEXT_MODEL
): Promise<string> {
  const client = getGroqClient();
  if (!client) throw new Error("GROQ_API_KEY not configured");
  const completion = await client.chat.completions.create({ model, messages, max_tokens: 4096 });
  return completion.choices[0]?.message?.content || "";
}

export async function groqVision(base64Image: string, mimeType: string, prompt: string): Promise<string> {
  const client = getGroqClient();
  if (!client) throw new Error("GROQ_API_KEY not configured");
  const completion = await client.chat.completions.create({
    model: GROQ_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
    max_tokens: 2048,
  });
  return completion.choices[0]?.message?.content || "";
}