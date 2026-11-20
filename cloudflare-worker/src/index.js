// Northstar image-generation Worker — deployed through Cloudflare Workers Builds.
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
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
   const body = await request.json();
   const prompt = String(body.prompt || '').trim();
   const images = Array.isArray(body.images) ? body.images : [];
   if (!prompt || prompt.length > 12000) return json({ error: 'Prompt fehlt oder ist zu lang.' }, 400, cors);
   if (images.length > 1) return json({ error: 'Maximal ein Referenzbild pro Slide.' }, 400, cors);
   const form = new FormData();
   form.append('prompt', prompt);
   form.append('width', '1024');
   form.append('height', '1152');
   if (images.length) {
    const match = typeof images[0] === 'string' && images[0].match(/^data:image\\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return json({ error: 'Ungültige Bildreferenz (PNG, JPEG oder WebP erwartet).' }, 400, cors);
    const binary = atob(match[2]);
    if (binary.length > 8 * 1024 * 1024) return json({ error: 'Referenzbild zu groß (max. 8 MB).' }, 413, cors);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const mime = match[1].toLowerCase().replace('jpg','jpeg');
    form.append('input_image_0', new Blob([bytes], { type: 'image/' + mime }), 'reference.' + (mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]));
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

function json(data, status, headers) {
 return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}