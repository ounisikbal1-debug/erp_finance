import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLoginResponse } from './login-response';

describe('login response parsing', () => {
  it('reports an HTML response with its HTTP status instead of a JSON parser error', async () => {
    const response = new Response('<!DOCTYPE html><html></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });

    await assert.rejects(
      parseLoginResponse(response),
      /réponse non JSON \(HTTP 404\).*URL et le proxy API/,
    );
  });

  it('preserves JSON authentication errors', async () => {
    const response = new Response(JSON.stringify({ error: 'Identifiant ou mot de passe invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

    await assert.rejects(parseLoginResponse(response), /Identifiant ou mot de passe invalide/);
  });

  it('rejects malformed JSON and invalid successful payloads explicitly', async () => {
    const malformed = new Response('{', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    await assert.rejects(parseLoginResponse(malformed), /JSON invalide \(HTTP 200\)/);

    const invalidPayload = new Response(JSON.stringify({ accessToken: 'token', user: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    await assert.rejects(parseLoginResponse(invalidPayload), /profil retourné.*invalide/);
  });

  it('accepts a structurally valid successful login response', async () => {
    const response = new Response(JSON.stringify({
      accessToken: 'test-token',
      user: { id: 'user-id', username: 'test-user', role: 'ACCOUNTANT', entityId: null },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

    assert.deepEqual(await parseLoginResponse(response), {
      accessToken: 'test-token',
      user: { id: 'user-id', username: 'test-user', role: 'ACCOUNTANT', entityId: null },
    });
  });
});
