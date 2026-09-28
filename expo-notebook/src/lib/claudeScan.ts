import { CLAUDE_SCAN_MODEL } from '../config/expo';
import { PARSED_FIELDS, type ParsedCard } from './cardParser';

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(PARSED_FIELDS.map((f) => [f, { type: 'string' }])),
  required: [...PARSED_FIELDS],
  additionalProperties: false,
};

const PROMPT = `Extract contact details from this business card photo.
Return company (organisation name incl. legal suffix), person (full name), role (job title),
phone (primary numbers as printed; join up to two with " / "; skip fax), email, website.
Use an empty string for anything not on the card. Do not guess.`;

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(binary);
}

export class ClaudeScanError extends Error {}

/**
 * Sends the (already compressed) card image to the Messages API. The key is passed per call and
 * never logged. Throws ClaudeScanError so the caller can fall back to on-device OCR.
 */
export async function scanWithClaude(image: Blob, apiKey: string, signal?: AbortSignal): Promise<ParsedCard> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // Browser use is intentional: the key belongs to the device owner and is stored only on-device.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 30_000 });
  try {
    const response = await client.messages.create(
      {
        model: CLAUDE_SCAN_MODEL,
        max_tokens: 1024,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(image) },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal') throw new ClaudeScanError('Claude declined this image');
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const out = {} as ParsedCard;
    for (const f of PARSED_FIELDS) out[f] = typeof parsed[f] === 'string' ? (parsed[f] as string).trim() : '';
    return out;
  } catch (err) {
    if (err instanceof ClaudeScanError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ClaudeScanError('API key rejected');
    if (err instanceof Anthropic.RateLimitError) throw new ClaudeScanError('Rate limited');
    if (err instanceof Anthropic.APIError) throw new ClaudeScanError(`API error ${err.status ?? ''}`.trim());
    if (err instanceof SyntaxError) throw new ClaudeScanError('Unexpected response');
    throw new ClaudeScanError('Network error');
  }
}
