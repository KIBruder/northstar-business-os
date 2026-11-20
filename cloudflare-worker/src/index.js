export default {
 async fetch(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://kibruder.github.io';
  const cors = { 'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : allowedOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!env.OPENAI_API_KEY || !env.NORTHSTAR_ACCESS_TOKEN) return json({ error: 'Worker-Secrets fehlen.' }, 503, cors);
  if (request.headers.get('Authorization') !== `Bearer ${env.NORTHSTAR_ACCESS_TOKEN}`) return json({ error: 'Nicht autorisiert.' }, 401, cors);
  if (Number(request.headers.get('Content-Length') || 0) > 15 * 1024 * 1024) return json({ error: 'Anfrage zu groß (max. 15 MB).' }, 413, cors);
  try {
   const body = await request.json();
   const prompt = String(body.prompt || '').trim();
   const images = Array.isArray(body.images) ? body.images : [];
   if (!prompt || prompt.length > 12000) return json({ error: 'Prompt fehlt oder ist zu lang.' }, 400, cors);
   if (!images.length || images.length > 8) return json({ error: 'Es werden 1 bis 8 Produktreferenzen benötigt.' }, 400, cors);
   if (images.reduce((n, image) => n + (typeof image === 'string' ? image.length : 0), 0) > 14 * 1024 * 1024) return json({ error: 'Produktreferenzen zusammen zu groß (max. 14 MB).' }, 413, cors);
   for (const image of images) if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) return json({ error: 'Ungültige Bildreferenz. Unterstützt werden PNG, JPEG und WebP.' }, 400, cors);
   const upstream = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-2.6-flare', images: images.map(image_url => ({ image_url })), prompt, size: '1024x1536', quality: 'high', output_format: 'png', n: 1 }) });
   const result = await upstream.json().catch(() => ({}));
   if (!upstream.ok) return json({ error: result.error?.message || `OpenAI Images API Fehler (${upstream.status})` }, upstream.status >= 500 ? 502 : upstream.status, cors);
   const encoded = result.data?.[0]?.b64_json;
   if (!encoded) return json({ error: 'Die Bild-API hat keine Bilddaten zurückgegeben.' }, 502, cors);
   return json({ imageDataUrl: `data:image/png;base64,${encoded}`, model: 'gpt-image-2.6-flare' }, 200, cors);
  } catch (error) { return json({ error: error?.message || 'Unbekannter Worker-Fehler.' }, 500, cors); }
 }
};
function json(data, status, headers) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } }); }