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
