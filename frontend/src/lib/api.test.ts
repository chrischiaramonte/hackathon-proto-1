import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, isServerReady, MAX_FRAMES, recognize, type LandmarkFrame } from './api';

const frame: LandmarkFrame = { face: null, leftHand: null, pose: null, rightHand: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recognition API client', () => {
  it('posts the target and frames as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'accepted' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await recognize('hello', [frame, frame]);
    expect(result.status).toBe('accepted');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/recognize');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ target: 'hello', frames: [frame, frame] });
  });

  it('never sends more frames than the model reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await recognize('hello', Array.from({ length: MAX_FRAMES + 50 }, () => frame));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).frames).toHaveLength(MAX_FRAMES);
  });

  it('reports an unreachable server as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(recognize('hello', [frame])).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('slow', 'TimeoutError')));
    await expect(recognize('hello', [frame])).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('reports server errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));
    const error = await recognize('hello', [frame]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'server' });
  });

  it('checks server health without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 })));
    expect(await isServerReady()).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await isServerReady()).toBe(false);
  });
});
