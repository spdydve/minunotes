import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, loadConfig, NotesConfigurationError } from '../src/config';

describe('config', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads API URL and key from env', () => {
    expect(loadConfig({ NOTES_API_URL: 'https://example.com/api', NOTES_API_KEY: 'key' })).toEqual({
      apiUrl: 'https://example.com/api',
      apiKey: 'key',
    });
  });

  it('requires API URL and key', () => {
    expect(() => loadConfig({ NOTES_API_KEY: 'key' })).toThrow(NotesConfigurationError);
    expect(() => loadConfig({ NOTES_API_URL: 'https://example.com/api' })).toThrow(NotesConfigurationError);
  });

  it.each([
    ['https://example.com', 'https://example.com/v1/harness/folders'],
    ['https://example.com/', 'https://example.com/v1/harness/folders'],
    ['https://example.com/api', 'https://example.com/v1/harness/folders'],
    ['https://example.com/v1', 'https://example.com/v1/harness/folders'],
  ])('calls v1 harness endpoints for NOTES_API_URL=%s', async (apiUrl, expectedUrl) => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ folders: [] }), { headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    await createClient({ NOTES_API_URL: apiUrl, NOTES_API_KEY: 'key' }).folders.list();

    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'key' }) })
    );
  });
});
