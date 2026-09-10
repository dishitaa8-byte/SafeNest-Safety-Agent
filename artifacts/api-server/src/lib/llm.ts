import { logger } from "./logger";

type InvestigationContext = {
  assetCode: string;
  riskLevel: string;
  riskScore: number;
  summary: string;
  evidence: string[];
  recommendedActions: string[];
};

type AssistantContext = InvestigationContext & {
  draftAnswer: string;
};

const GEMINI_MODEL = "gemini-3.6-flash";

export async function refineInvestigationSummary(
  context: InvestigationContext,
): Promise<string | undefined> {
  return refineAssistantAnswer({ ...context, draftAnswer: context.summary });
}

export async function refineAssistantAnswer(
  context: AssistantContext,
): Promise<string | undefined> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are SafeNest, a cautious facility safety assistant. Rewrite the draft response in two concise sentences for a facility manager. Use only the supplied evidence. Preserve exact asset names, risk levels, scores, and approval requirements. Do not invent diagnoses, change classifications, or add actions. Never claim that an incident will or will not happen, never give a guarantee, and explicitly frame the result as a recommendation for qualified human review.\n\n${JSON.stringify(context)}`,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 8192,
          },
        }),
      },
    );
    if (!response.ok) {
      logger.warn(
        { model: GEMINI_MODEL, status: response.status },
        "Gemini response request failed",
      );
      return undefined;
    }
    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string | null }> };
      }>;
    };
    const text =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || undefined;
    if (text) logger.info({ model: GEMINI_MODEL }, "Gemini response received");
    return text;
  } catch (error) {
    logger.warn({ err: error, model: GEMINI_MODEL }, "Gemini request unavailable");
    return undefined;
  }
}