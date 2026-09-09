import { logger } from "./logger";

type InvestigationContext = {
  assetCode: string;
  riskLevel: string;
  riskScore: number;
  summary: string;
  evidence: string[];
  recommendedActions: string[];
};

export async function refineInvestigationSummary(
  context: InvestigationContext,
): Promise<string | undefined> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
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
                text: `You are SafeNest, a cautious facility safety assistant. Rewrite the supplied summary in two concise sentences for a facility manager. Use only the supplied evidence. Never claim that an incident will or will not happen, never give a guarantee, and explicitly frame the result as a recommendation for qualified human review.\n\n${JSON.stringify(context)}`,
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
      logger.warn({ status: response.status }, "Gemini summary request failed");
      return undefined;
    }
    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string | null }> };
      }>;
    };
    return (
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || undefined
    );
  } catch (error) {
    logger.warn({ err: error }, "Gemini summary request unavailable");
    return undefined;
  }
}