// Northstar image-generation and universal product-analysis Worker.
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const VISION_MODEL = '@cf/moondream/moondream3.1-9B-A2B';
const TEXT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
const MAX_BODY_BYTES = 15 * 1024 * 1024;

export default {
 async fetch(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://kibruder.github.io';
  const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' };
  if (origin && origin !== allowedOrigin) return json({ error: 'Origin nicht erlaubt.' }, 403, cors);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
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
 const required=['productName','category','summary','visibleIdentity','verifiedVisibleFeatures','hooks','slideScenes','negativePrompt'];
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
