import { getConfig, type ConfigKey } from '@/lib/runtime-config';

type ActionRequest = {
  provider?: 'slack' | 'jira';
  confirmed?: boolean;
  title?: string;
  message?: string;
};

const missing = (keys: ConfigKey[]) => keys.filter((key) => !getConfig(key));

export async function POST(request: Request) {
  const body = (await request.json()) as ActionRequest;
  if (!body.confirmed) {
    return Response.json(
      { error: 'Human confirmation is required before an external write.' },
      { status: 409 },
    );
  }
  if (
    !body.provider ||
    !['slack', 'jira'].includes(body.provider)
  ) {
    return Response.json({ error: 'Unsupported provider.' }, { status: 400 });
  }
  if (!body.message?.trim() || body.message.length > 4_000) {
    return Response.json(
      { error: 'A message under 4,000 characters is required.' },
      { status: 400 },
    );
  }

  if (body.provider === 'slack') {
    const required: ConfigKey[] = ['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID'];
    const absent = missing(required);
    if (absent.length)
      return Response.json(
        { error: 'Slack is not configured.', missing: absent },
        { status: 503 },
      );
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getConfig('SLACK_BOT_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: getConfig('SLACK_CHANNEL_ID'),
        text: body.message,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: (body.title?.trim() || 'SignalForge incident update').slice(0, 150),
            },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: body.message.slice(0, 3000) },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Published after human review • SignalForge Incident Commander',
              },
            ],
          },
        ],
      }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      ts?: string;
    };
    if (!response.ok || !result.ok)
      return Response.json(
        { error: result.error ?? 'Slack request failed.' },
        { status: 502 },
      );
    return Response.json({
      status: 'sent',
      provider: 'slack',
      reference: result.ts,
    });
  }

  if (body.provider === 'jira') {
    const required: ConfigKey[] = [
      'JIRA_BASE_URL',
      'JIRA_EMAIL',
      'JIRA_API_TOKEN',
      'JIRA_PROJECT_KEY',
    ];
    const absent = missing(required);
    if (absent.length)
      return Response.json(
        { error: 'Jira is not configured.', missing: absent },
        { status: 503 },
      );
    const auth = Buffer.from(
      `${getConfig('JIRA_EMAIL')}:${getConfig('JIRA_API_TOKEN')}`,
    ).toString('base64');
    const response = await fetch(
      `${getConfig('JIRA_BASE_URL')}/rest/api/3/issue`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            project: { key: getConfig('JIRA_PROJECT_KEY') },
            summary: body.title?.trim() || 'SignalForge incident follow-up',
            issuetype: { name: 'Task' },
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: body.message }],
                },
              ],
            },
          },
        }),
      },
    );
    const result = (await response.json()) as {
      key?: string;
      errorMessages?: string[];
    };
    if (!response.ok)
      return Response.json(
        { error: result.errorMessages?.[0] ?? 'Jira request failed.' },
        { status: 502 },
      );
    return Response.json({
      status: 'created',
      provider: 'jira',
      reference: result.key,
    });
  }

  return Response.json({ error: 'Unsupported provider.' }, { status: 400 });
}
