import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import app from '../src/api/index';
import { mcpRoutes } from '../src/api/routes/mcp';

describe('hosted MCP route', () => {
  it('requires authentication', async () => {
    const response = await app.request('/mcp', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('/mcp/.well-known/oauth-protected-resource');
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects API-key auth on hosted MCP', async () => {
    const response = await app.request('/mcp', { method: 'POST', headers: { 'x-api-key': 'ntak_invalid' } });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('serves OAuth protected resource metadata for MCP', async () => {
    const response = await app.request('/mcp/.well-known/oauth-protected-resource');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: 'http://localhost/mcp',
      authorization_servers: ['http://localhost'],
      bearer_methods_supported: ['header'],
    });
  });

  it('lists the expanded tool set over streamable HTTP with OAuth bearer auth', async () => {
    const testApp = new Hono();
    testApp.use('*', async (c, next) => {
      c.set('user', { id: 'user_test', name: 'Test User', email: 'test@example.com' });
      c.set('session', null);
      c.set('apiKey', null);
      c.set('oauthAuthorization', { id: 'oauth_auth_test' });
      await next();
    });
    testApp.route('/mcp', mcpRoutes);

    const response = await testApp.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer mnoac_test',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const toolNames = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'notes_move_notes',
        'notes_create_canvas',
        'notes_create_canvas_from_syntax',
        'notes_replace_canvas',
        'notes_replace_canvas_from_syntax',
        'notes_set_canvas_node_note_link',
        'notes_remove_canvas_node_note_link',
        'notes_read_outline',
        'notes_read_events',
        'notes_list_tags',
        'notes_read_note_tags',
        'notes_replace_note_tags',
      ])
    );
    expect(toolNames.filter((name: string) => /trash|restore|permanent.*delete/i.test(name))).toEqual([]);
  });

  it('calls a new read tool through the hosted OAuth adapter', async () => {
    const testApp = new Hono();
    testApp.use('*', async (c, next) => {
      c.set('user', { id: 'user_test', name: 'Test User', email: 'test@example.com' });
      c.set('session', null);
      c.set('apiKey', null);
      c.set('oauthAuthorization', { id: 'oauth_auth_test' });
      await next();
    });
    testApp.route('/mcp', mcpRoutes);

    const response = await testApp.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer mnoac_test',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'notes_list_tags', arguments: {} },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        structuredContent: { result: { tags: [] } },
      },
    });
  });

  it('propagates hosted OAuth write permission failures through a new canvas tool', async () => {
    const testApp = new Hono();
    testApp.use('*', async (c, next) => {
      c.set('user', { id: 'user_test', name: 'Test User', email: 'test@example.com' });
      c.set('session', null);
      c.set('apiKey', null);
      c.set('oauthAuthorization', { id: 'oauth_auth_test' });
      await next();
    });
    testApp.route('/mcp', mcpRoutes);

    const response = await testApp.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer mnoac_test',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'notes_create_canvas',
          arguments: { folderId: 'folder_forbidden', canvas: { nodes: [], edges: [] } },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: expect.stringContaining('Forbidden (403)') }],
      },
    });
  });

  it('serves MCP initialize over streamable HTTP with OAuth bearer auth', async () => {
    const testApp = new Hono();
    testApp.use('*', async (c, next) => {
      c.set('user', { id: 'user_test', name: 'Test User', email: 'test@example.com' });
      c.set('session', null);
      c.set('apiKey', null);
      c.set('oauthAuthorization', { id: 'oauth_auth_test' });
      await next();
    });
    testApp.route('/mcp', mcpRoutes);

    const response = await testApp.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer mnoac_test',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.1.0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { serverInfo: { name: 'minunotes', version: '0.1.0' } },
    });
  });
});
