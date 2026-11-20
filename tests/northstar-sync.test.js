import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/src/index.js';

test('D1 sync API rejects anonymous requests before exposing configuration', async () => {
  const request = new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=test', {
    method: 'GET',
    headers: { Origin: 'https://kibruder.github.io' }
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: 'https://kibruder.github.io' });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Cloudflare Access Anmeldung fehlt oder ist ungültig.' });
});

test('D1 sync API rejects unapproved browser origins', async () => {
  const request = new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=test', {
    method: 'GET',
    headers: { Origin: 'https://example.com' }
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: 'https://kibruder.github.io' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'Origin nicht erlaubt.');
});

test('D1 sync API answers preflight without opening database access', async () => {
  const request = new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync', {
    method: 'OPTIONS',
    headers: { Origin: 'https://kibruder.github.io' }
  });
  const response = await worker.fetch(request, { ALLOWED_ORIGIN: 'https://kibruder.github.io' });
  assert.equal(response.status, 204);
});


import { webcrypto } from 'node:crypto';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function signedAccessToken(team, audience) {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = 'northstar-sync-test-key';
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid }));
  const claims = base64url(JSON.stringify({ iss: team, aud: audience, sub: 'northstar-test-owner', iat: now, nbf: now - 5, exp: now + 300 }));
  const signingInput = header + '.' + claims;
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signingInput));
  return { token: signingInput + '.' + base64url(signature), jwk };
}

async function assertAuthenticatedSyncBinding(bindingName) {
  const team = 'https://northstar-' + bindingName.toLowerCase() + '.cloudflareaccess.com';
  const audience = 'northstar-sync-test-audience';
  const { token, jwk } = await signedAccessToken(team, audience);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), team + '/cdn-cgi/access/certs');
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(sql);
      return {
        bind() { return this; },
        async all() { return { results: [] }; }
      };
    }
  };
  try {
    const env = {
      ALLOWED_ORIGIN: 'https://kibruder.github.io',
      ACCESS_TEAM_DOMAIN: team,
      ACCESS_AUD: audience,
      [bindingName]: db
    };
    const request = new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=test-workspace', {
      method: 'GET',
      headers: {
        Origin: 'https://kibruder.github.io',
        'Cf-Access-Jwt-Assertion': token
      }
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.workspaceId, 'test-workspace');
    assert.deepEqual(Object.keys(payload.stores).sort(), ['activities', 'agentTasks', 'financeTransactions', 'posts', 'products', 'settings', 'workspaces'].sort());
    assert.equal(calls.length, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('D1 sync API accepts the lowercase db binding with a verified Access JWT', async () => {
  await assertAuthenticatedSyncBinding('db');
});

test('D1 sync API remains compatible with the uppercase DB binding with a verified Access JWT', async () => {
  await assertAuthenticatedSyncBinding('DB');
});
