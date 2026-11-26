// Northstar image-generation and universal product-analysis Worker.
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const VISION_MODEL = '@cf/moondream/moondream3.1-9B-A2B';
const TEXT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
const MAX_BODY_BYTES = 15 * 1024 * 1024;
const SYNC_TABLES = { workspaces: 'workspaces', products: 'products', posts: 'posts', activities: 'activities', agentTasks: 'agent_tasks', financeTransactions: 'finance_transactions', settings: 'settings' };
const jwksCache = new Map();

export default {
 async fetch(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://kibruder.github.io';
  const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' };
  if (origin && origin !== allowedOrigin) return json({ error: 'Origin nicht erlaubt.' }, 403, cors);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  if (url.pathname.endsWith('/api/auth/register')) return await authApi(request, env, cors, 'register');
   if (url.pathname.endsWith('/api/auth/login')) return await authApi(request, env, cors, 'login');
   if (url.pathname.endsWith('/api/auth/me')) return await authApi(request, env, cors, 'me');
   if (url.pathname.endsWith('/api/sync')) return await syncApi(request, env, cors);
  if (url.pathname.endsWith('/api/storefront/products')) return await storefrontProductsApi(request, env, cors);
  if (url.pathname.endsWith('/api/store-admin/offers')) return await storeAdminOffersApi(request, env, cors);
  if (url.pathname.endsWith('/api/awin/publishers')) return await awinPublishersApi(request, env, cors);
  if (url.pathname.endsWith('/api/awin/feeds')) return await awinFeedsApi(request, env, cors);
  if (url.pathname.endsWith('/api/awin/catalog/import')) return await awinCatalogImportApi(request, env, cors);
  if (url.pathname.endsWith('/api/awin/catalog/import-feed')) return await awinCatalogImportFeedApi(request, env, cors);
  if (url.pathname.endsWith('/api/awin/catalog/search')) return await awinCatalogSearchApi(request, env, cors);
  if (url.pathname.endsWith('/api/awin/catalog/status')) return await awinCatalogStatusApi(request, env, cors);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!env.AI || !env.NORTHSTAR_ACCESS_TOKEN) return json({ error: 'Cloudflare-AI-Binding oder Zugriffstoken fehlt.' }, 503, cors);
  if (request.headers.get('Authorization') !== 'Bearer ' + env.NORTHSTAR_ACCESS_TOKEN) return json({ error: 'Nicht autorisiert.' }, 401, cors);
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return json({ error: 'Anfrage zu groß (max. 15 MB).' }, 413, cors);
  try {
   const url = new URL(request.url);
   if (url.pathname.endsWith('/api/analyze-product')) return await analyzeProduct(request, env, cors);
   if (!url.pathname.endsWith('/api/generate-image')) return json({ error: 'Unbekannter API-Endpunkt.' }, 404, cors);
   const body = await request.json();
   const prompt = String(body.prompt || '').trim();
   const images = Array.isArray(body.images) ? body.images : [];
   if (!prompt || prompt.length > 12000) return json({ error: 'Prompt fehlt oder ist zu lang.' }, 400, cors);
   if (images.length > 4) return json({ error: 'FLUX.2 Klein unterstützt maximal vier Referenzbilder pro Slide.' }, 400, cors);
   const form = new FormData();
   form.append('prompt', prompt);
   form.append('width', '1024');
   form.append('height', '1152');
   for (let i = 0; i < images.length; i++) {
    const {bytes,mime}=decodeImage(images[i],i);
    form.append('input_image_'+i, new Blob([bytes], { type: mime }), 'reference-'+(i+1)+'.'+(mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]));
   }
   const serialized = new Response(form);
   const result = await env.AI.run(MODEL, { multipart: { body: serialized.body, contentType: serialized.headers.get('content-type') } });
   if (!result || typeof result.image !== 'string' || !result.image.length) return json({ error: 'Cloudflare AI hat keine Bilddaten zurückgegeben.' }, 502, cors);
   return json({ imageDataUrl: 'data:image/png;base64,' + result.image, model: MODEL }, 200, cors);
  } catch (error) {
   const message = String(error && error.message || 'Unbekannter Worker-Fehler.');
   const limited = /limit|quota|neurons|capacity|rate/i.test(message);
   return json({ error: limited ? 'Cloudflare AI-Kontingent oder Kapazitätslimit erreicht. Bitte später erneut versuchen.' : message }, limited ? 429 : 502, cors);
  }
 }
};

async function analyzeProduct(request, env, cors) {
 const body = await request.json();
 const product = body.product && typeof body.product === 'object' ? body.product : {};
 const images = Array.isArray(body.images) ? body.images : [];
 if (!images.length || images.length > 3) return json({ error: 'Für die Produktanalyse werden ein bis drei Referenzbilder benötigt.' }, 400, cors);
 const visualNotes = await Promise.all(images.map(async (image,index) => {
  const {dataUri}=decodeImage(image,index);
  const result = await env.AI.run(VISION_MODEL, {
   task:'query', image:dataUri, reasoning:false, stream:false, max_tokens:700,
   question:'Analyze this shopping/product image for a product-commerce creative workflow. Identify the main physical product, exact visible design, shape, colors, materials only when visually evident, brand/logo text only when readable, components/accessories actually visible, and what is uncertain. Ignore shopping page UI, prices, ratings, banners and unrelated text. Do not guess hidden specifications. Reply in concise German with clearly labeled fields: Produkt; Kategorie; Sichtbare Identitätsmerkmale; Sichtbare Bestandteile; Unsicher/nicht erkennbar.'
  });
  return String(result?.answer||'').trim();
 }));
 if (visualNotes.every(note => !note)) return json({ error: 'Die Bildanalyse konnte kein Produkt erkennen. Bitte schärfere Produktfotos hochladen.' }, 422, cors);
 const textPrompt = `Du bist die universelle Produkt- und Creative-Direktion von Northstar. Erstelle aus den gelieferten visuellen Beobachtungen und Produktdaten einen belastbaren Drei-Slide-BOFU-Plan für GENAU dieses Produkt. Funktioniere für JEDE Produktkategorie, ohne fest codierte Kategorien oder Beispielannahmen. Leite Kategorie und passende Nutzungssituation aus den Bildbeobachtungen ab. Das Produkt muss in jedem Motiv das klare Hauptmotiv sein. Keine generischen Personenporträts, in denen das Produkt fehlt. Erfinde keine technischen Daten, Materialien, Lieferumfänge, Vorteile, Preise oder Funktionen. Trenne klar sichtbare Fakten von Unsicherheiten. Gib ausschließlich valides JSON ohne Markdown mit exakt diesen Feldern zurück: {"productName":"...","category":"...","summary":"...","visibleIdentity":"...","visibleFeatures":"...","unknowns":["..."],"audience":"...","hooks":["Hook kurz","Produktdetail kurz","CTA-Frage kurz"],"slideScenes":["konkretes Bildmotiv für Hook, Produkt sofort sichtbar","konkretes Produktdetail-Motiv, tatsächliches Produkt groß und klar","konkretes Abschluss-/Nutzungsmotiv, Produkt sichtbar und unverdeckt"],"negativePrompt":"..."}. Hooks und Bildmotive auf Deutsch. Keine pauschalen Werbeversprechen. Produktdaten: Name=${String(product.name||'').slice(0,180)}; Beschreibung=${String(product.description||'').slice(0,1200)}; Händler=${String(product.merchant||'').slice(0,100)}. Visuelle Analyse je Referenzbild: ${visualNotes.map((x,i)=>'Bild '+(i+1)+': '+x).join('\\n')} `;
 const generated = await env.AI.run(TEXT_MODEL, { prompt:textPrompt, max_tokens:1300, temperature:0.25 });
 const raw = String(generated?.response||generated?.result||'').trim();
 const match = raw.match(/\{[\s\S]*\}/);
 if (!match) return json({ error: 'Die Produkt-KI lieferte kein auswertbares JSON. Bitte erneut versuchen.' }, 502, cors);
 let analysis;
 try { analysis = JSON.parse(match[0]); } catch { return json({ error: 'Die Produkt-KI lieferte ungültige strukturierte Daten. Bitte erneut versuchen.' }, 502, cors); }
 const required=['productName','category','summary','visibleIdentity','visibleFeatures','hooks','slideScenes','negativePrompt'];
 if (required.some(key=>!analysis[key]) || !Array.isArray(analysis.hooks) || analysis.hooks.length<3 || !Array.isArray(analysis.slideScenes) || analysis.slideScenes.length<3) return json({ error: 'Die Produkt-KI-Analyse ist unvollständig.' }, 502, cors);
 return json({ analysis, model:VISION_MODEL+' + '+TEXT_MODEL, referenceCount:images.length }, 200, cors);
}

function decodeImage(value,index) {
 const match=typeof value==='string'&&value.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);
 if(!match)throw new Error('Ungültige Bildreferenz '+(index+1)+' (PNG, JPEG oder WebP erwartet).');
 const binary=atob(match[2]);
 if(binary.length>8*1024*1024)throw new Error('Referenzbild '+(index+1)+' zu groß (max. 8 MB).');
 const mime='image/'+match[1].toLowerCase().replace('jpg','jpeg');
 return {bytes:Uint8Array.from(binary,ch=>ch.charCodeAt(0)),mime,dataUri:value};
}
function json(data,status,headers) {
 return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}




async function storeAdminOffersApi(request, env, cors) {
 if (!['GET','POST'].includes(request.method)) return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
 let subject;
 try { subject=await verifySessionToken(request,env); }
 catch { return json({error:'Bitte anmelden. Die Sitzung fehlt oder ist abgelaufen.'},401,cors); }
 const db=env.DB||env.db;
 if(!db)return json({error:'D1-Datenbank ist nicht verfügbar.'},503,cors);
 try {
  if(request.method==='GET') {
   const workspaceId=new URL(request.url).searchParams.get('workspaceId');
   if(!workspaceId||workspaceId.length>128)return json({error:'workspaceId fehlt oder ist ungültig.'},400,cors);
   const exists=await db.prepare('SELECT id FROM workspaces WHERE owner_sub=? AND id=? AND deleted_at IS NULL').bind(subject,workspaceId).first();
   if(!exists)return json({error:'Arbeitsbereich nicht gefunden oder kein Zugriff.'},403,cors);
   const rows=await db.prepare('SELECT id,source_type,title,brand,category,cost_price,sale_price,currency,stock_status,shipping_days,image_url,product_url,fulfillment_type,score,status,created_at,updated_at FROM commerce_offers WHERE owner_sub=? AND workspace_id=? ORDER BY updated_at DESC LIMIT 500').bind(subject,workspaceId).all();
   return json({offers:rows.results},200,cors);
  }
  const body=await request.json();
  const workspaceId=String(body.workspaceId||'');
  const title=String(body.title||'').trim().slice(0,180);
  const id=String(body.id||crypto.randomUUID());
  const sourceType=['manual','supplier'].includes(body.sourceType)?body.sourceType:'manual';
  const status=['candidate','review','published','paused'].includes(body.status)?body.status:'candidate';
  const price=body.salePrice===''||body.salePrice===null||body.salePrice===undefined?null:Number(body.salePrice);
  const cost=body.costPrice===''||body.costPrice===null||body.costPrice===undefined?null:Number(body.costPrice);
  if(!workspaceId||workspaceId.length>128||!title||id.length>128)return json({error:'Titel oder Arbeitsbereich fehlt.'},400,cors);
  if(price!==null&&(!Number.isFinite(price)||price<=0||price>1000000))return json({error:'Verkaufspreis muss größer als 0 sein.'},400,cors);
  if(cost!==null&&(!Number.isFinite(cost)||cost<0||cost>1000000))return json({error:'Einkaufspreis ist ungültig.'},400,cors);
  if(status==='published'&&price===null)return json({error:'Zum Veröffentlichen ist ein gültiger Verkaufspreis erforderlich.'},400,cors);
  const exists=await db.prepare('SELECT id FROM workspaces WHERE owner_sub=? AND id=? AND deleted_at IS NULL').bind(subject,workspaceId).first();
  if(!exists)return json({error:'Arbeitsbereich nicht gefunden oder kein Zugriff.'},403,cors);
  const now=new Date().toISOString();
  const bind=(v,max=500)=>String(v||'').trim().slice(0,max)||null;
  await db.prepare("INSERT INTO commerce_offers (id,owner_sub,workspace_id,source_type,title,brand,category,cost_price,sale_price,currency,stock_status,shipping_days,image_url,product_url,fulfillment_type,compliance_json,score,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_sub,id) DO UPDATE SET source_type=excluded.source_type,title=excluded.title,brand=excluded.brand,category=excluded.category,cost_price=excluded.cost_price,sale_price=excluded.sale_price,currency=excluded.currency,stock_status=excluded.stock_status,shipping_days=excluded.shipping_days,image_url=excluded.image_url,product_url=excluded.product_url,fulfillment_type=excluded.fulfillment_type,status=excluded.status,updated_at=excluded.updated_at").bind(id,subject,workspaceId,sourceType,title,bind(body.brand,120),bind(body.category,120),cost,price,'EUR',bind(body.stockStatus,60),body.shippingDays===''||body.shippingDays==null?null:Math.max(0,Math.min(365,Number(body.shippingDays))),bind(body.imageUrl,1500),bind(body.productUrl,1500),bind(body.fulfillmentType,80),JSON.stringify(body.compliance||{}),null,status,now,now).run();
  return json({ok:true,id,status},200,cors);
 } catch(error) {
  console.error('[northstar-store-admin]',String(error?.message||error));
  return json({error:'Shop-Angebot konnte nicht gespeichert werden.'},500,cors);
 }
}

async function storefrontProductsApi(request, env, cors) {
 if (request.method !== 'GET') return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, OPTIONS'});
 const db=env.DB||env.db;
 if(!db) return json({error:'Produktdatenbank ist nicht verfügbar.'},503,cors);
 try {
  const rows=await db.prepare("SELECT id,title,brand,category,sale_price,currency,image_url,product_url,stock_status,updated_at FROM commerce_offers WHERE status='published' AND source_type IN ('manual','supplier') AND sale_price IS NOT NULL AND sale_price > 0 ORDER BY updated_at DESC LIMIT 100").all();
  const products=rows.results.map(row=>({
   id:row.id,title:row.title,brand:row.brand||'',category:row.category||'',
   price:Number(row.sale_price),currency:row.currency||'EUR',
   imageUrl:row.image_url||'',productUrl:row.product_url||'',
   availability:row.stock_status||'unbekannt',updatedAt:row.updated_at
  }));
  return json({products,count:products.length},200,{...cors,'Cache-Control':'public, max-age=60, s-maxage=60'});
 } catch(error) {
  console.error('[northstar-storefront] catalog failed',String(error?.message||error));
  return json({error:'Produktkatalog konnte nicht geladen werden.'},500,cors);
 }
}

async function syncApi(request, env, cors) {
 if (!['GET','POST'].includes(request.method)) return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
 let subject;
 try { subject = await verifySessionToken(request, env); }
 catch (error) { return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors); }
 const db = env.DB || env.db;
 if (!db) return json({error:'D1-Binding DB/db ist nicht konfiguriert.'},503,cors);
 try {
  if (request.method === 'GET') {
   const workspaceId = new URL(request.url).searchParams.get('workspaceId');
   if (workspaceId && workspaceId.length>128) return json({error:'workspaceId ist ungültig.'},400,cors);
   const result={};
   if (!workspaceId) {
    const rows=await db.prepare('SELECT id,payload_json,updated_at FROM workspaces WHERE owner_sub=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 2000').bind(subject).all();
    result.workspaces=rows.results.map(row=>({id:row.id,...JSON.parse(row.payload_json),updatedAt:row.updated_at}));
    return json({workspaceId:null,stores:result},200,cors);
   }
   for (const [store, table] of Object.entries(SYNC_TABLES)) {
    const rows = store==='workspaces'
     ? await db.prepare('SELECT id, payload_json, updated_at FROM workspaces WHERE owner_sub = ? AND id = ? AND deleted_at IS NULL LIMIT 1').bind(subject,workspaceId).all()
     : await db.prepare('SELECT id, payload_json, updated_at FROM '+table+' WHERE owner_sub = ? AND workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 2000').bind(subject,workspaceId).all();
    result[store]=rows.results.map(row=>({id:row.id,...JSON.parse(row.payload_json),updatedAt:row.updated_at}));
   }
   return json({workspaceId,stores:result},200,cors);
  }
  const body=await request.json();
  if (!body || !Array.isArray(body.records) || body.records.length>500) return json({error:'records muss ein Array mit maximal 500 Einträgen sein.'},400,cors);
  const now=new Date().toISOString();
  const statements=[];
  for (const record of body.records) {
   const store=String(record?.store||'');
   const item=record?.item;
   const table=SYNC_TABLES[store];
   if (!table || !item || typeof item!=='object' || Array.isArray(item)) return json({error:'Ungültiger Datensatz.'},400,cors);
   const id=String(item.id||'');
   const workspaceId=store==='workspaces'?id:String(item.workspaceId||'');
   if (!id || id.length>128 || !workspaceId || workspaceId.length>128) return json({error:'Datensatz-ID oder workspaceId fehlt.'},400,cors);
   if (store==='workspaces' && id!==workspaceId) return json({error:'Workspace-ID muss der Datensatz-ID entsprechen.'},400,cors);
   const payload=JSON.stringify(item);
   if (payload.length>1_000_000) return json({error:'Datensatz überschreitet 1 MB.'},413,cors);
   const exists=await db.prepare('SELECT id FROM workspaces WHERE owner_sub=? AND id=? AND deleted_at IS NULL').bind(subject,workspaceId).first();
   if (store!=='workspaces' && !exists) return json({error:'Arbeitsbereich nicht gefunden oder kein Zugriff.'},403,cors);
   statements.push(db.prepare('INSERT INTO '+table+' (id,owner_sub,workspace_id,payload_json,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(owner_sub,id) DO UPDATE SET workspace_id=excluded.workspace_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at,deleted_at=NULL WHERE '+table+'.updated_at <= excluded.updated_at').bind(id,subject,workspaceId,payload, String(item.createdAt||now),String(item.updatedAt||now)));
  }
  if (statements.length) await db.batch(statements);
  return json({ok:true,saved:statements.length,ownerScoped:true},200,cors);
 } catch(error) {
  return json({error:'Synchronisierung fehlgeschlagen.',detail:String(error.message||error)},500,cors);
 }
}


async function authApi(request, env, cors, action) {
 if (request.method !== 'POST' && !(action === 'me' && request.method === 'GET')) return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS'});
 const db=env.DB||env.db;
 if(!db) return json({error:'D1-Datenbank ist nicht konfiguriert.'},503,cors);
 if(!env.NORTHSTAR_AUTH_SECRET || String(env.NORTHSTAR_AUTH_SECRET).length<32) return json({error:'NORTHSTAR_AUTH_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen).'},503,cors);
 let stage='start';
 try {
  if(action==='me') {
   const subject=await verifySessionToken(request,env);
   const user=await db.prepare('SELECT id,email,created_at FROM users WHERE id=? AND disabled_at IS NULL').bind(subject).first();
   if(!user)return json({error:'Benutzerkonto nicht gefunden.'},401,cors);
   return json({user:{id:user.id,email:user.email,createdAt:user.created_at}},200,cors);
  }
  const body=await request.json();
  const email=String(body.email||'').trim().toLowerCase();
  const password=String(body.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return json({error:'Bitte eine gültige E-Mail-Adresse eingeben.'},400,cors);
  if(password.length<12||password.length>128) return json({error:'Das Passwort muss mindestens 12 und höchstens 128 Zeichen lang sein.'},400,cors);
  let user;
  if(action==='register') {
   stage='count-users';
   const existing=await db.prepare('SELECT COUNT(*) AS count FROM users').first();
   if(Number(existing?.count||0)>0)return json({error:'Das private Northstar-Konto ist bereits eingerichtet. Weitere Registrierungen sind deaktiviert.'},403,cors);
   stage='hash-password';
   const salt=crypto.getRandomValues(new Uint8Array(16));
   const hash=await hashPassword(password,salt);
   const id=crypto.randomUUID(), now=new Date().toISOString();
   try {
    stage='insert-user';
    await db.prepare('INSERT INTO users (id,email,password_salt,password_hash,created_at,updated_at,disabled_at) VALUES (?,?,?,?,?,?,NULL)').bind(id,email,toBase64Url(salt),toBase64Url(hash),now,now).run();
   } catch(error) {
    if(/registration closed/i.test(String(error.message||error)))return json({error:'Das private Northstar-Konto ist bereits eingerichtet.'},403,cors);
    if(/unique|constraint/i.test(String(error.message||error)))return json({error:'Für diese E-Mail-Adresse existiert bereits ein Konto.'},409,cors);
    throw error;
   }
   user={id,email,created_at:now};
  } else {
   user=await db.prepare('SELECT id,email,password_salt,password_hash,created_at,disabled_at FROM users WHERE email=?').bind(email).first();
   if(!user||user.disabled_at)return json({error:'E-Mail-Adresse oder Passwort ist falsch.'},401,cors);
   const actual=await hashPassword(password,fromBase64Url(user.password_salt));
   if(!constantTimeEqual(actual,fromBase64Url(user.password_hash)))return json({error:'E-Mail-Adresse oder Passwort ist falsch.'},401,cors);
  }
  stage='create-session';
  const token=await createSessionToken(user.id,env);
  return json({token,tokenType:'Bearer',expiresIn:604800,user:{id:user.id,email:user.email,createdAt:user.created_at}},200,cors);
 } catch(error) {
  const errorName=String(error?.name||'Error').slice(0,80);
  const errorMessage=String(error?.message||error||'Unbekannter Fehler').slice(0,240);
  console.error('[northstar-auth] request failed', { action, stage, name:errorName, message:errorMessage });
  return json({error:'Authentifizierung fehlgeschlagen.',detail:'Schritt: '+stage+' · '+errorName+': '+errorMessage},500,cors);
 }
}
async function hashPassword(password,salt) {
 let key;
 try {
  key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 } catch(error) {
  throw new Error('PBKDF2 importKey fehlgeschlagen: '+String(error?.name||'Error')+' '+String(error?.message||error).slice(0,160));
 }
 try {
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt),iterations:100000},key,256);
  return new Uint8Array(bits);
 } catch(error) {
  throw new Error('PBKDF2 deriveBits fehlgeschlagen: '+String(error?.name||'Error')+' '+String(error?.message||error).slice(0,160));
 }
}
function toBase64Url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64Url(value){const raw=atob(String(value).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-String(value).length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
async function hmacKey(env,usage){return crypto.subtle.importKey('raw',new TextEncoder().encode(env.NORTHSTAR_AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,usage);}
async function createSessionToken(subject,env){
 const now=Math.floor(Date.now()/1000);
 const header=toBase64Url(new TextEncoder().encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
 const payload=toBase64Url(new TextEncoder().encode(JSON.stringify({sub:subject,iss:'northstar-business-os',aud:'northstar-app',iat:now,exp:now+604800})));
 const input=header+'.'+payload;
 const signature=await crypto.subtle.sign('HMAC',await hmacKey(env,['sign']),new TextEncoder().encode(input));
 return input+'.'+toBase64Url(new Uint8Array(signature));
}
async function verifySessionToken(request,env){
 if(!env.NORTHSTAR_AUTH_SECRET||String(env.NORTHSTAR_AUTH_SECRET).length<32)throw new Error('Auth secret unavailable');
 const auth=request.headers.get('Authorization')||'';
 if(!auth.startsWith('Bearer '))throw new Error('Missing bearer token');
 const token=auth.slice(7),parts=token.split('.');
 if(parts.length!==3)throw new Error('Malformed session token');
 const decode=value=>JSON.parse(new TextDecoder().decode(fromBase64Url(value)));
 const header=decode(parts[0]),claims=decode(parts[1]);
 if(header.alg!=='HS256'||claims.iss!=='northstar-business-os'||claims.aud!=='northstar-app'||!claims.sub||!claims.exp||claims.exp<=Math.floor(Date.now()/1000))throw new Error('Invalid session claims');
 const valid=await crypto.subtle.verify('HMAC',await hmacKey(env,['verify']),fromBase64Url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 if(!valid)throw new Error('Invalid session signature');
 return String(claims.sub);
}



async function awinPublishersApi(request, env, cors) {
 if (request.method !== 'GET') return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, OPTIONS'});
 try { await verifySessionToken(request,env); }
 catch { return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors); }
 if (!env.AWIN_API_TOKEN) return json({error:'AWIN_API_TOKEN ist in Cloudflare noch nicht hinterlegt.'},503,cors);
 try {
  const response=await fetch('https://api.awin.com/accounts?type=publisher',{
   method:'GET',
   headers:{'Authorization':'Bearer '+env.AWIN_API_TOKEN,'Accept':'application/json'}
  });
  const body=await response.text();
  if(!response.ok) return json({error:'Awin API Anfrage fehlgeschlagen.',status:response.status,detail:body.slice(0,1200)},response.status===429?429:502,cors);
  let data;
  try { data=JSON.parse(body); } catch { return json({error:'Awin lieferte keine gültige JSON-Antwort.'},502,cors); }
  return json({ok:true,connected:true,accounts:data},200,cors);
 } catch(error) {
  return json({error:'Awin ist derzeit nicht erreichbar.',detail:String(error?.message||error)},502,cors);
 }
}

async function awinFeedsApi(request, env, cors) {
 if(request.method!=='GET')return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, OPTIONS'});
 try{await verifySessionToken(request,env);}catch{return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors);}
 if(!env.AWIN_DATAFEED_KEY)return json({error:'AWIN_DATAFEED_KEY fehlt. Der separate Awin-Data-Feed-Key muss als Cloudflare-Worker-Secret hinterlegt werden.'},503,cors);
 const publisherId='2069027';
 try{
  const url='https://productdata.awin.com/datafeed/list/apikey/'+encodeURIComponent(env.AWIN_DATAFEED_KEY);
  const response=await fetch(url,{headers:{Accept:'text/csv'}});
  const body=await response.text();
  if(!response.ok)return json({error:'Awin-Feedliste konnte nicht geladen werden.',status:response.status,detail:body.slice(0,400)},response.status===429?429:502,cors);
  const rows=parseAwinCsv(body);
  if(rows.length<2)return json({ok:true,publisherId,feedCount:0,feeds:[]},200,cors);
  const headers=rows[0].map(v=>String(v||'').trim().toLowerCase());
  const get=(row,names)=>{const i=headers.findIndex(h=>names.includes(h));return i<0?'':String(row[i]||'').trim();};
  const feeds=rows.slice(1).filter(r=>r.some(Boolean)).map(r=>({
   advertiserId:get(r,['advertiser id','advertiserid']),advertiserName:get(r,['advertiser name','advertisername']),
   region:get(r,['primary region','primaryregion']),membershipStatus:get(r,['membership status','membershipstatus']),
   format:get(r,['datafeed format','datafeedformat']),feedId:get(r,['feed id','feedid']),feedName:get(r,['feed name','feedname']),
   language:get(r,['language']),vertical:get(r,['vertical']),lastImported:get(r,['last imported','lastimported']),
   lastChecked:get(r,['last checked','lastchecked']),productCount:Number(get(r,['no of products','number of products','product count']).replace(/[^0-9]/g,''))||0
  })).filter(x=>x.advertiserId||x.advertiserName);
  return json({ok:true,publisherId,feedCount:feeds.length,feeds},200,cors);
 }catch(error){return json({error:'Awin-Feedliste ist derzeit nicht erreichbar.',detail:String(error?.message||error).slice(0,300)},502,cors);}
}
function parseAwinCsv(input){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
 if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}return rows;
}


// D1-backed Awin catalogue: no R2 subscription or payment method required.
async function awinCatalogImportApi(request, env, cors) {
 if(request.method!=='POST')return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'POST, OPTIONS'});
 try{await verifySessionToken(request,env);}catch{return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors);}
 const db=env.DB||env.db;
 if(!db)return json({error:'D1-Binding fehlt.'},503,cors);
 try{
  const body=await request.json();
  const products=Array.isArray(body?.products)?body.products:[];
  if(!products.length||products.length>100)return json({error:'products muss 1 bis 100 Einträge enthalten.'},400,cors);
  const now=new Date().toISOString(), statements=[];
  for(const p of products){
   const productId=String(p.aw_product_id||p.product_id||'').trim();
   const name=String(p.product_name||p.name||'').trim();
   if(!productId||!name||productId.length>100||name.length>500)continue;
   const raw=JSON.stringify(p);
   if(raw.length>30000)continue;
   const price=Number(String(p.search_price??p.price??'').replace(',','.'));
   const stockRaw=String(p.in_stock??'').toLowerCase();
   const stock=['1','true','yes','in stock'].includes(stockRaw)?1:(['0','false','no','out of stock'].includes(stockRaw)?0:null);
   statements.push(db.prepare(`INSERT INTO awin_catalog_products
    (product_id,publisher_id,advertiser_id,merchant_name,product_name,category_name,merchant_category,search_price,currency,in_stock,image_url,deep_link,updated_at,raw_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(product_id) DO UPDATE SET publisher_id=excluded.publisher_id,advertiser_id=excluded.advertiser_id,merchant_name=excluded.merchant_name,product_name=excluded.product_name,category_name=excluded.category_name,merchant_category=excluded.merchant_category,search_price=excluded.search_price,currency=excluded.currency,in_stock=excluded.in_stock,image_url=excluded.image_url,deep_link=excluded.deep_link,updated_at=excluded.updated_at,raw_json=excluded.raw_json`)
    .bind(productId,'2069027',String(p.merchant_id||p.advertiser_id||''),String(p.merchant_name||p.advertiser_name||'').slice(0,200),name,String(p.category_name||'').slice(0,200),String(p.merchant_category||'').slice(0,300),Number.isFinite(price)?price:null,String(p.currency||'EUR').slice(0,8),stock,String(p.merchant_image_url||p.aw_image_url||p.image_url||'').slice(0,2000),String(p.aw_deep_link||p.deep_link||'').slice(0,3000),now,raw));
  }
  if(!statements.length)return json({error:'Keine gültigen Produktdatensätze im Paket.'},422,cors);
  await db.batch(statements);
  return json({ok:true,imported:statements.length,publisherId:'2069027',updatedAt:now},200,cors);
 }catch(error){return json({error:'Katalogimport fehlgeschlagen.',detail:String(error?.message||error).slice(0,300)},500,cors);}
}

async function awinCatalogImportFeedApi(request, env, cors) {
 if(request.method!=='POST')return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'POST, OPTIONS'});
 try{await verifySessionToken(request,env);}catch{return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors);}
 const db=env.DB||env.db;if(!db||!env.AWIN_DATAFEED_KEY)return json({error:'D1-Binding oder AWIN_DATAFEED_KEY fehlt.'},503,cors);
 try{
  const input=await request.json();const rawId=input?.feedId??input?.feed_id??input?.id??'';const id=String(rawId).replace(/[\\u200B-\\u200D\\uFEFF]/g,'').trim();
  if(!/^\\d{1,12}$/.test(id))return json({error:'Ungültige Feed-ID.',receivedType:typeof rawId,receivedValue:String(rawId).slice(0,80)},400,cors);
  const lr=await fetch('https://productdata.awin.com/datafeed/list/apikey/'+encodeURIComponent(env.AWIN_DATAFEED_KEY));
  if(!lr.ok)return json({error:'Awin-Feedliste nicht erreichbar.',status:lr.status},502,cors);
  const rows=parseAwinCsv(await lr.text()),h=rows[0].map(x=>String(x||'').trim().toLowerCase());
  const ix=(...n)=>h.findIndex(x=>n.includes(x)),fi=ix('feed id','feedid'),ui=ix('url','download url','downloadurl'),ri=ix('primary region','primaryregion');
  if(fi<0||ui<0)return json({error:'Feed-ID oder Download-URL fehlt in Awin-Liste.'},502,cors);
  const row=rows.slice(1).find(r=>String(r[fi]||'').trim()===id);
  if(!row)return json({error:'Feed nicht gefunden.'},404,cors);
  if(ri>=0&&String(row[ri]||'').toUpperCase()!=='DE')return json({error:'Nur deutsche Feeds dürfen importiert werden.'},403,cors);
  const u=String(row[ui]||'').trim();if(!u.startsWith('https://productdata.awin.com/datafeed/download/'))return json({error:'Ungültige Awin-Feed-URL.'},502,cors);
  const fr=await fetch(u);if(!fr.ok)return json({error:'Feeddownload fehlgeschlagen.',status:fr.status},502,cors);
  let bytes=await fr.arrayBuffer();const magic=new Uint8Array(bytes,0,2);if(magic[0]===31&&magic[1]===139)bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const data=parseAwinCsv(new TextDecoder('utf-8').decode(bytes));if(data.length<2)return json({error:'Feed leer oder nicht lesbar.'},422,cors);
  const heads=data[0].map(x=>String(x||'').trim().toLowerCase()),col=(...n)=>heads.findIndex(x=>n.includes(x));
  const ixp={id:col('aw_product_id','product_id','pid'),name:col('product_name','name'),price:col('search_price','price'),merchant:col('merchant_name'),merchantId:col('merchant_id','advertiser_id'),category:col('category_name'),mcat:col('merchant_category'),currency:col('currency'),stock:col('in_stock','stock_status'),image:col('merchant_image_url','aw_image_url','image_url','imgurl'),link:col('aw_deep_link','deep_link','purl')};
  if(ixp.id<0||ixp.name<0)return json({error:'Produkt-ID oder Produktname fehlt.'},422,cors);
  const now=new Date().toISOString();let imported=0,skipped=0,batch=[];
  const flush=async()=>{if(batch.length){await db.batch(batch);imported+=batch.length;batch=[];}};
  for(const r of data.slice(1)){
   const v=i=>i<0?'':String(r[i]||'').trim(),pid=v(ixp.id),name=v(ixp.name);if(!pid||!name){skipped++;continue;}
   const p=Number(v(ixp.price).replace(',','.')),st=v(ixp.stock).toLowerCase(),stock=['1','true','yes','in stock'].includes(st)?1:(['0','false','no','out of stock'].includes(st)?0:null);
   batch.push(db.prepare('INSERT INTO awin_catalog_products (product_id,publisher_id,advertiser_id,merchant_name,product_name,category_name,merchant_category,search_price,currency,in_stock,image_url,deep_link,updated_at,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET publisher_id=excluded.publisher_id,advertiser_id=excluded.advertiser_id,merchant_name=excluded.merchant_name,product_name=excluded.product_name,category_name=excluded.category_name,merchant_category=excluded.merchant_category,search_price=excluded.search_price,currency=excluded.currency,in_stock=excluded.in_stock,image_url=excluded.image_url,deep_link=excluded.deep_link,updated_at=excluded.updated_at,raw_json=excluded.raw_json').bind(pid,'2069027',v(ixp.merchantId),v(ixp.merchant),name,v(ixp.category),v(ixp.mcat),Number.isFinite(p)?p:null,v(ixp.currency)||'EUR',stock,v(ixp.image),v(ixp.link),now,JSON.stringify({feedId:id})));
   if(batch.length===100)await flush();
  }
  await flush();return json({ok:true,feedId:id,imported,skipped,updatedAt:now},200,cors);
 }catch(e){return json({error:'Feedimport fehlgeschlagen.',detail:String(e?.message||e).slice(0,300)},500,cors);}
}

async function awinCatalogSearchApi(request, env, cors) {
 if(request.method!=='GET')return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, OPTIONS'});
 try{await verifySessionToken(request,env);}catch{return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors);}
 const db=env.DB||env.db;if(!db)return json({error:'D1-Binding fehlt.'},503,cors);
 const url=new URL(request.url),q=String(url.searchParams.get('q')||'').trim().slice(0,120),category=String(url.searchParams.get('category')||'').trim().slice(0,120),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||30)));
 try{
  let sql='SELECT product_id,merchant_name,product_name,category_name,merchant_category,search_price,currency,in_stock,image_url,deep_link,updated_at FROM awin_catalog_products WHERE publisher_id=?';
  const args=['2069027'];
  if(q){sql+=' AND (product_name LIKE ? OR merchant_name LIKE ? OR category_name LIKE ? OR merchant_category LIKE ?)';const like='%'+q+'%';args.push(like,like,like,like);}
  if(category){sql+=' AND category_name LIKE ?';args.push('%'+category+'%');}
  sql+=' ORDER BY updated_at DESC, product_name LIMIT ?';args.push(limit);
  const rows=await db.prepare(sql).bind(...args).all();
  return json({ok:true,count:rows.results.length,products:rows.results},200,cors);
 }catch(error){return json({error:'Katalogsuche fehlgeschlagen.',detail:String(error?.message||error).slice(0,240)},500,cors);}
}
async function awinCatalogStatusApi(request, env, cors) {
 if(request.method!=='GET')return json({error:'Method not allowed'},405,{...cors,'Access-Control-Allow-Methods':'GET, OPTIONS'});
 try{await verifySessionToken(request,env);}catch{return json({error:'Anmeldung fehlt oder Sitzung ist abgelaufen.'},401,cors);}
 const db=env.DB||env.db;if(!db)return json({error:'D1-Binding fehlt.'},503,cors);
 try{
  const [count,merchants,categories]=await Promise.all([
   db.prepare('SELECT COUNT(*) AS count, MAX(updated_at) AS updated_at FROM awin_catalog_products WHERE publisher_id=?').bind('2069027').first(),
   db.prepare('SELECT COUNT(DISTINCT merchant_name) AS count FROM awin_catalog_products WHERE publisher_id=?').bind('2069027').first(),
   db.prepare('SELECT COUNT(DISTINCT category_name) AS count FROM awin_catalog_products WHERE publisher_id=?').bind('2069027').first()
  ]);
  return json({ok:true,available:Number(count?.count||0)>0,productCount:Number(count?.count||0),merchantCount:Number(merchants?.count||0),categoryCount:Number(categories?.count||0),updatedAt:count?.updated_at||null,storage:'D1'},200,cors);
 }catch(error){return json({error:'Katalogstatus konnte nicht gelesen werden.',detail:String(error?.message||error).slice(0,240)},500,cors);}
}
