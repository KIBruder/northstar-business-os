import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db.js';

const DB_NAME = 'northstar-business-os';
const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

test('migrates v1 data to v2 stores and persists CRUD across reopen', async () => {
  await requestResult(indexedDB.deleteDatabase(DB_NAME));

  // Simulate an existing installation created by the previous v1 schema.
  const legacy = await requestResult(indexedDB.open(DB_NAME, 1));
  for (const name of ['workspaces', 'products', 'posts', 'activities']) {
    legacy.createObjectStore(name, { keyPath: 'id' });
  }
  await requestResult(legacy.transaction('workspaces', 'readwrite')
    .objectStore('workspaces').put({ id: 'legacy-workspace', name: 'Existing workspace' }));
  legacy.close();

  await db.init();
  const expectedStores = [
    'workspaces', 'products', 'posts', 'activities',
    'agentTasks', 'financeTransactions', 'settings'
  ];
  for (const store of expectedStores) {
    assert.equal(db.db.objectStoreNames.contains(store), true, `missing store: ${store}`);
  }

  assert.deepEqual(await db.all('workspaces'), [
    { id: 'legacy-workspace', name: 'Existing workspace' }
  ]);

  const samples = {
    agentTasks: { id: 'task-1', workspaceId: 'legacy-workspace', status: 'queued' },
    financeTransactions: { id: 'finance-1', workspaceId: 'legacy-workspace', amount: 40 },
    settings: { id: 'setting-1', workspaceId: 'legacy-workspace', fundRate: 50 }
  };
  for (const [store, value] of Object.entries(samples)) await db.put(store, value);
  for (const [store, value] of Object.entries(samples)) {
    assert.deepEqual(await db.all(store), [value], `write/read failed for ${store}`);
  }

  // A fresh connection must see the same records after the database is closed.
  db.db.close();
  db.db = null;
  await db.init();
  for (const [store, value] of Object.entries(samples)) {
    assert.deepEqual(await db.all(store), [value], `persistence failed for ${store}`);
  }

  await db.delete('agentTasks', 'task-1');
  assert.deepEqual(await db.all('agentTasks'), []);
  db.db.close();
  db.db = null;
  await requestResult(indexedDB.deleteDatabase(DB_NAME));
});
