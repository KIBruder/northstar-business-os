import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../cloudflare-worker/src/index.js';

const SECRET='test-only-secret-with-at-least-32-characters';
const ORIGIN='https://kibruder.github.io';
function b64url(value){return Buffer.from(value).toString('base64url');}
async function sessionToken(subject='northstar-test-user',expires=Math.floor(Date.now()/1000)+600){
 const header=b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
 const payload=b64url(JSON.stringify({sub:subject,iss:'northstar-business-os',aud:'northstar-app',iat:Math.floor(Date.now()/1000),exp:expires}));
 const input=header+'.'+payload;
 const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(input));
 return input+'.'+Buffer.from(signature).toString('base64url');
}
function fakeDb(){
 const calls=[];
 return {calls,prepare(sql){
  calls.push(sql);
  return {bind(){return this;},async all(){return {results:[]};},async first(){return null;},async run(){return {success:true};}};
 },async batch(){return {success:true};}};
}

test('D1 sync API rejects anonymous requests',async()=>{
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=test',{method:'GET',headers:{Origin:ORIGIN}});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN,db:fakeDb(),NORTHSTAR_AUTH_SECRET:SECRET});
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'});
});
test('D1 sync API rejects unapproved browser origins',async()=>{
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=test',{method:'GET',headers:{Origin:'https://example.com'}});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN});
 assert.equal(response.status,403);
});
test('D1 sync API answers preflight without database access',async()=>{
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync',{method:'OPTIONS',headers:{Origin:ORIGIN}});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN});
 assert.equal(response.status,204);
});
test('D1 sync API accepts a signed Northstar session and scopes queries to its user',async()=>{
 const db=fakeDb(),token=await sessionToken('owner-123');
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=workspace-1',{method:'GET',headers:{Origin:ORIGIN,Authorization:'Bearer '+token}});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN,db,NORTHSTAR_AUTH_SECRET:SECRET});
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.workspaceId,'workspace-1');
 assert.deepEqual(Object.keys(payload.stores).sort(),['activities','agentTasks','financeTransactions','posts','products','settings','workspaces'].sort());
 assert.equal(db.calls.length,7);
 assert.ok(db.calls.every(sql=>sql.includes('owner_sub')));
});
test('D1 sync API rejects expired sessions',async()=>{
 const db=fakeDb(),token=await sessionToken('owner-123',Math.floor(Date.now()/1000)-10);
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/sync?workspaceId=workspace-1',{method:'GET',headers:{Origin:ORIGIN,Authorization:'Bearer '+token}});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN,db,NORTHSTAR_AUTH_SECRET:SECRET});
 assert.equal(response.status,401);
});
test('Registration requires a valid email and a 12-character password',async()=>{
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/auth/register',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email:'not-an-email',password:'short'})});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN,db:fakeDb(),NORTHSTAR_AUTH_SECRET:SECRET});
 assert.equal(response.status,400);
});
test('Auth endpoints fail closed when the signing secret is missing',async()=>{
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/auth/register',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'a-very-long-test-password'})});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN,db:fakeDb()});
 assert.equal(response.status,503);
});

test('Registration is disabled after the private owner account exists',async()=>{
 const db={prepare(sql){return {bind(){return this;},async first(){return {count:1};}};}};
 const request=new Request('https://northstar-image-generator.kibruder.workers.dev/api/auth/register',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email:'second@example.com',password:'a-very-long-test-password'})});
 const response=await worker.fetch(request,{ALLOWED_ORIGIN:ORIGIN,db,NORTHSTAR_AUTH_SECRET:SECRET});
 assert.equal(response.status,403);
});
