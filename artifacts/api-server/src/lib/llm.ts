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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_completion_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are SafeNest, a cautious facility safety assistant. Rewrite the supplied summary in two concise sentences for a facility manager. Use only the supplied evidence. Never claim that an incident will or will not happen, never give a guarantee, and explicitly frame the result as a recommendation for qualified human review.",
          },
          {
            role: "user",
            content: JSON.stringify(context),
          },
        ],
      }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "OpenAI summary request failed");
      return undefined;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() || undefined;
  } catch (error) {
    logger.warn({ err: error }, "OpenAI summary request unavailable");
    return undefined;
  }
}