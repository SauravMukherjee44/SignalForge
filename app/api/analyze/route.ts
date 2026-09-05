import { emitOtelIncidentEvent } from '@/lib/otel';
import { getConfig } from '@/lib/runtime-config';

type Analysis = {
  category:
    | 'fact'
    | 'hypothesis'
    | 'decision'
    | 'action'
    | 'conflict'
    | 'question';
  confidence: number;
  normalizedClaim: string;
  missingEvidence: string[];
  recommendation: {
    title: string;
    rationale: string;
    ownerRole: string;
    informationGain: number;
    risk: 'low' | 'medium' | 'high';
  };
};

function localAnalysis(text: string): Analysis {
  const normalized = text.toLowerCase();
  const category: Analysis['category'] =
    /decided|approve|rollback|we will|go ahead/.test(normalized)
      ? 'decision'
      : /maybe|think|suspect|could be|probably/.test(normalized)
        ? 'hypothesis'
        : /who|what|when|where|why|how|\?$/.test(normalized)
          ? 'question'
          : /assign|owner|follow up|please check|investigate/.test(normalized)
            ? 'action'
            : /but|however|conflict|does not match|before/.test(normalized)
              ? 'conflict'
              : 'fact';
  const verificationTarget =
    category === 'hypothesis'
      ? 'Find one telemetry signal that would falsify this hypothesis.'
      : category === 'decision'
        ? 'Define the recovery metric and observation window before execution.'
        : 'Corroborate this statement with a second independent source.';
  return {
    category,
    confidence: category === 'fact' ? 0.72 : 0.82,
    normalizedClaim: text.replace(/\s+/g, ' ').trim(),
    missingEvidence: [verificationTarget],
    recommendation: {
      title: verificationTarget,
      rationale:
        'This closes the highest-value evidence gap created by the latest statement.',
      ownerRole:
        category === 'decision' ? 'Incident Commander' : 'Site Reliability',
      informationGain: category === 'hypothesis' ? 91 : 78,
      risk: 'low',
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    transcript?: unknown;
    speaker?: unknown;
    context?: unknown;
  };
  if (
    typeof body.transcript !== 'string' ||
    !body.transcript.trim() ||
    body.transcript.length > 2_000
  ) {
    return Response.json(
      { error: 'A transcript under 2,000 characters is required.' },
      { status: 400 },
    );
  }
  const apiKey = getConfig('GEMINI_API_KEY');
  if (!apiKey)
    return Response.json({
      ...localAnalysis(body.transcript),
      engine: 'local',
    });

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'category',
      'confidence',
      'normalizedClaim',
      'missingEvidence',
      'recommendation',
    ],
    properties: {
      category: {
        type: 'string',
        enum: [
          'fact',
          'hypothesis',
          'decision',
          'action',
          'conflict',
          'question',
        ],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      normalizedClaim: { type: 'string' },
      missingEvidence: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 3,
      },
      recommendation: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'rationale',
          'ownerRole',
          'informationGain',
          'risk',
        ],
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          ownerRole: { type: 'string' },
          informationGain: { type: 'number', minimum: 0, maximum: 100 },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  };
  const model = getConfig('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'You are SignalForge, a conservative incident evidence analyst. Classify only what was said. Never claim a root cause. Separate observation from inference and propose the safest next evidence-gathering step.',
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  speaker: body.speaker,
                  transcript: body.transcript,
                  incidentContext: body.context,
                }),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 650,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        },
      }),
    },
  );
  if (!response.ok) {
    const fallback = localAnalysis(body.transcript);
    return Response.json({
      ...fallback,
      engine: 'local',
      providerError: response.status,
    });
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    const analysis = JSON.parse(
      payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    ) as Analysis;
    void emitOtelIncidentEvent('incident.statement.analyzed', {
      'ai.provider': 'gemini',
      'ai.model': model,
      'incident.category': analysis.category,
      'incident.confidence': analysis.confidence,
    }).catch(() => undefined);
    return Response.json({ ...analysis, engine: 'gemini', model });
  } catch {
    return Response.json({
      ...localAnalysis(body.transcript),
      engine: 'local',
    });
  }
}
