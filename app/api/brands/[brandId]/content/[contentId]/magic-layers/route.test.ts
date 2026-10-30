import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { AiProviderError } from '@/lib/ai/types';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const BRAND_ID = '00000000-0000-4000-8000-000000000003';
const CONTENT_ID = '00000000-0000-4000-8000-000000000004';

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  postJson: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  requireOrgRole: mocks.requireOrgRole,
  CAN_GENERATE_CONTENT: ['OWNER', 'ADMIN', 'STRATEGIST', 'EDITOR'],
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock('@/lib/ai/http', () => ({ postJson: mocks.postJson }));
vi.mock('@/lib/env', () => ({
  env: () => ({
    GROQ_API_KEY: 'test-key-1',
    GROQ_API_KEY_2: 'test-key-2',
    GROQ_API_KEY_3: undefined,
    GROQ_VISION_MODEL: 'qwen/qwen3.8-27b',
  }),
}));

/** Minimal valid 1×1 PNG for the magic-byte gate. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const VALID_PLAN = {
  background: { kind: 'solid', color: '#ffffff' },
  elements: [
    { kind: 'text', text: 'SUMMER SALE', bounds: { x: 150, y: 520, w: 700, h: 90 }, fontSize: 90, color: '#111111', align: 'center', confidence: 0.9 },
    { kind: 'shape', shape: 'rectangle', bounds: { x: 100, y: 100, w: 300, h: 200 }, fill: '#e11d48', confidence: 0.85 },
    { kind: 'image', bounds: { x: 600, y: 100, w: 300, h: 300 }, description: 'product photo', confidence: 0.7 },
  ],
  notes: ['poster with one photo region'],
};

function supabaseWithItem(status = 'DRAFT') {
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: { id: CONTENT_ID, status }, error: null })),
          })),
        })),
      })),
    })),
  }));
  mocks.createSupabaseServerClient.mockResolvedValue({ from });
  return from;
}

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/brands/${BRAND_ID}/content/${CONTENT_ID}/magic-layers`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function modelCompletion(plan: unknown) {
  return { choices: [{ message: { content: JSON.stringify(plan) } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgRole.mockResolvedValue({ context: { organizationId: ORG_ID, role: 'EDITOR', userId: USER_ID } });
});

describe('POST /api/brands/[brandId]/content/[contentId]/magic-layers', () => {
  it('returns a validated plan with normalized elements', async () => {
    supabaseWithItem();
    mocks.postJson.mockResolvedValue(modelCompletion(VALID_PLAN));
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plan.background.kind).toBe('solid');
    expect(payload.plan.elements).toHaveLength(3);
    expect(payload.plan.elements.map((element: { kind: string }) => element.kind)).toEqual(['text', 'shape', 'image']);
    expect(payload.dropped).toEqual([]);
    expect(mocks.postJson).toHaveBeenCalledTimes(1);
    const call = mocks.postJson.mock.calls[0]!;
    expect(call[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(call[1].body.model).toBe('qwen/qwen3.8-27b');
    expect(call[1].body.response_format).toEqual({ type: 'json_object' });
  });

  it('normalizes unsafe plans instead of rejecting the whole reconstruction', async () => {
    supabaseWithItem();
    const noisy = {
      ...VALID_PLAN,
      elements: [
        ...VALID_PLAN.elements,
        { kind: 'text', text: 'tiny', bounds: { x: 10, y: 10, w: 3, h: 3 }, fontSize: 5, color: '#000000', align: 'left', confidence: 0.9 },
      ],
    };
    mocks.postJson.mockResolvedValue(modelCompletion(noisy));
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plan.elements).toHaveLength(3);
    expect(payload.dropped).toHaveLength(1);
    expect(payload.dropped[0]).toMatch(/too small/i);
  });

  it('rejects unauthenticated requests', async () => {
    mocks.requireOrgRole.mockResolvedValue({ error: { body: { error: 'Forbidden' }, status: 403 } });
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(403);
    expect(mocks.postJson).not.toHaveBeenCalled();
  });

  it('rejects unknown content', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
    }));
    mocks.createSupabaseServerClient.mockResolvedValue({ from });
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(404);
  });

  it('rejects content that is not editable', async () => {
    supabaseWithItem('PUBLISHED');
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(409);
  });

  it('rejects non-image and corrupted payloads before any provider call', async () => {
    supabaseWithItem();
    const notPng = await POST(request({ mimeType: 'image/png', data: Buffer.from('not a png').toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(notPng.status).toBe(400);
    const wrongMime = await POST(request({ mimeType: 'image/gif', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(wrongMime.status).toBe(400);
    expect(mocks.postJson).not.toHaveBeenCalled();
  });

  it('fails over to the next configured Groq key on transient errors', async () => {
    supabaseWithItem();
    mocks.postJson
      .mockRejectedValueOnce(new AiProviderError('groq-vision', 'Provider returned 429', 429))
      .mockResolvedValueOnce(modelCompletion(VALID_PLAN));
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(mocks.postJson).toHaveBeenCalledTimes(2);
    expect(mocks.postJson.mock.calls[0]![1].headers.authorization).toBe('Bearer test-key-1');
    expect(mocks.postJson.mock.calls[1]![1].headers.authorization).toBe('Bearer test-key-2');
  });

  it('reports an honest 502 when the model returns invalid JSON', async () => {
    supabaseWithItem();
    mocks.postJson.mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] });
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(502);
  });

  it('reports an honest 502 when the model output does not match the plan schema', async () => {
    supabaseWithItem();
    mocks.postJson.mockResolvedValue(modelCompletion({ background: { kind: 'spaghetti' }, elements: 'many' }));
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error).toMatch(/safe layer plan/i);
  });

  it('propagates provider failure after the last key fails', async () => {
    supabaseWithItem();
    mocks.postJson.mockRejectedValue(new AiProviderError('groq-vision', 'Provider returned 500', 500));
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    expect(response.status).toBe(502);
    expect(mocks.postJson).toHaveBeenCalledTimes(2);
  });

  it('does not leak provider details in the error body', async () => {
    supabaseWithItem();
    mocks.postJson.mockRejectedValue(new Error('boom with secret data'));
    const response = await POST(request({ mimeType: 'image/png', data: PNG_BYTES.toString('base64') }), {
      params: Promise.resolve({ brandId: BRAND_ID, contentId: CONTENT_ID }),
    });
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(JSON.stringify(payload)).not.toContain('test-key');
  });
});
