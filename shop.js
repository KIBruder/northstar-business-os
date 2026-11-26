const API='https://northstar-image-generator.kibruder.workers.dev';
const euro=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value)||0);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],cart=[];
const $=s=>document.querySelector(s);
function drawProducts(){
 $('#catalogCount').textContent=products.length+' Produkte';
 if(!products.length){$('#productGrid').innerHTML='<div class="empty-card"><strong>Unser Sortiment wird vorbereitet.</strong><br>Aktuell sind noch keine Produkte für den öffentlichen Verkauf freigegeben.<br>Wir veröffentlichen erst geprüfte Angebote mit geklärtem Versand und Kundenservice.</div>';return;}
 $('#productGrid').innerHTML=products.map(p=>`<article class="product-card"><div class="product-image">${p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="${esc(p.title)}" loading="lazy">`:'<span class="product-placeholder">✳</span>'}</div><div class="product-info"><h3>${esc(p.title)}</h3><p>${esc(p.description||'Ausgewähltes Produkt für Haus, Garten und Alltag.')}</p><div class="product-meta"><strong class="product-price">${euro(p.price)}</strong><span class="product-tag">Freigegeben</span></div><button class="add-cart" data-add="${esc(p.id)}">In den Warenkorb</button></div></article>`).join('');
 document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.add)));
}
function drawCart(){
 $('#cartCount').textContent=cart.reduce((n,x)=>n+x.qty,0);
 $('#cartItems').innerHTML=cart.length?cart.map(x=>`<div class="cart-line"><span>${esc(x.title)} × ${x.qty}</span><span>${euro(x.price*x.qty)} <button data-remove="${esc(x.id)}" aria-label="Entfernen">✕</button></span></div>`).join(''):'<p>Dein Warenkorb ist leer.</p>';
 $('#cartTotal').textContent=euro(cart.reduce((n,x)=>n+x.price*x.qty,0));
 document.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{cart=cart.filter(x=>x.id!==b.dataset.remove);drawCart();}));
}
function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const line=cart.find(x=>x.id===id);if(line)line.qty++;else cart.push({...p,qty:1});drawCart();openCart();}
function openCart(){ $('#cartPanel').classList.add('open');$('#cartPanel').setAttribute('aria-hidden','false');$('#scrim').classList.add('show');}
function closeCart(){ $('#cartPanel').classList.remove('open');$('#cartPanel').setAttribute('aria-hidden','true');$('#scrim').classList.remove('show');}
$('#cartToggle').addEventListener('click',openCart);$('#cartClose').addEventListener('click',closeCart);$('#scrim').addEventListener('click',closeCart);
$('#year').textContent=new Date().getFullYear();
async function loadProducts(){
 try{const r=await fetch(API+'/api/storefront/products',{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();products=Array.isArray(data.products)?data.products:[];drawProducts();$('#catalogNote').textContent='Nur veröffentlichte Produkte werden angezeigt. Preise und Verfügbarkeit können sich ändern.';}
 catch(e){$('#productGrid').innerHTML='<div class="empty-card">Der Produktkatalog ist momentan nicht erreichbar. Bitte später erneut versuchen.</div>';$('#catalogCount').textContent='Katalog nicht verfügbar';console.error(e);}
}
drawCart();loadProducts();