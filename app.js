import { db } from './db.js';
import { analyzeProductLocally } from './analysis-engine.js';

const sections = [
  ['overview','Übersicht','▦'],['products','Produkte','◇'],['content','Content-Studio','▤'],
  ['production','Produktion','✦'],['calendar','Planung','▦'],['analytics','Analysen','⌁'],
  ['finance','Finanzen','€'],['partners','Partnernetzwerk','◎'],['agents','KI-Agenten','⌘'],
  ['documents','Dokumente','▧'],['reports','Managementberichte','▥'],['settings','Einstellungen','⚙']
];
let active = 'overview';
let pendingScreenshotDataUrl = '';
let pendingScreenshotImages = [];
let ocrWorkerPromise = null;
let generatedScreenshotOcrText = '';

let state = { workspaceId: null, workspaces: [], products: [], posts: [], activities: [], selectedProductId: null, selectedPostId: null, productSearch: '' };

const $ = (s, root=document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n)||0);
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600); }
function currentWorkspace(){ return state.workspaces.find(w=>w.id===state.workspaceId) || state.workspaces[0]; }
function scoped(items){ return items.filter(x=>x.workspaceId===state.workspaceId); }
function log(action, detail=''){ state.activities.unshift({id:crypto.randomUUID(),workspaceId:state.workspaceId,action,detail,at:new Date().toISOString()}); state.activities=state.activities.slice(0,300); db.put('activities',state.activities.at(0)); }
function navMarkup(items){return items.map(([id,label,icon])=>`<button class="nav-item ${active===id?'active':''}" data-nav="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');}
function renderNav(){
  $('#sideNav').innerHTML = `<div class="nav-group-label">ARBEITSPLATZ</div>${navMarkup(sections.slice(0,5))}<div class="nav-group-label">STEUERUNG</div>${navMarkup(sections.slice(5,11))}<div class="nav-group-label">SYSTEM</div>${navMarkup(sections.slice(11))}`;
  $('#mobileNav').innerHTML = navMarkup([sections[0],sections[1],sections[2],sections[5],sections[11]]);
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.nav)));
}
function go(id){active=id;renderNav();renderPage();$('#sideNav').classList.remove('open');}
function header(title,sub){$('#pageTitle').textContent=title;$('#sectionEyebrow').textContent=sub;}
function card(label,value,meta,icon='•'){return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><strong>${value}</strong><small>${meta}</small></article>`;}
function empty(title,desc,action=''){return `<div class="empty-state"><div class="empty-icon">◇</div><h3>${title}</h3><p>${desc}</p>${action}</div>`;}
function overview(){
 const products=scoped(state.products), posts=scoped(state.posts), activities=scoped(state.activities);
 const confirmed=0, fund=0;
 header('Übersicht','UNTERNEHMENSSTEUERUNG');
 return `<div class="welcome-row"><div><h2>Guten Tag.</h2><p>Hier laufen deine Geschäftsbereiche und Produktionsprozesse zusammen.</p></div><span class="status-tag">● Lokale Datenhaltung aktiv</span></div>
 <div class="metric-grid">${card('Produkte',products.length,'im aktuellen Arbeitsbereich','◇')}${card('Content-Entwürfe',posts.length,'gespeicherte Beiträge','▤')}${card('Bestätigter Gewinn',money(confirmed),'noch keine Finanzdaten erfasst','€')}${card('KI-Fonds',money(fund),'Startguthaben: 0,00 €','✦')}</div>
 <div class="content-grid"><section class="panel"><div class="panel-head"><div><h3>Arbeitsbereich</h3><p>Aktiver Geschäftsbereich</p></div><span class="subtle">LOKAL</span></div><div class="workspace-summary"><div class="workspace-avatar">${esc((currentWorkspace()?.name||'N').slice(0,1).toUpperCase())}</div><div><strong>${esc(currentWorkspace()?.name||'Mein Unternehmen')}</strong><small>${esc(currentWorkspace()?.description||'Zentrale Arbeitsumgebung')}</small></div></div><div class="quick-grid"><button class="quick-action" data-go="products">＋ Produkt importieren</button><button class="quick-action" data-go="content">✦ Content erstellen</button><button class="quick-action" data-go="calendar">▦ Planung öffnen</button><button class="quick-action" data-go="analytics">⌁ Leistung prüfen</button></div></section>
 <section class="panel"><div class="panel-head"><div><h3>Letzte Aktivitäten</h3><p>Änderungen in diesem Arbeitsbereich</p></div></div>${activities.length?`<div class="activity-list">${activities.slice(0,5).map(a=>`<div class="activity"><span class="activity-dot"></span><div><strong>${esc(a.action)}</strong><small>${esc(a.detail)} · ${new Date(a.at).toLocaleString('de-DE')}</small></div></div>`).join('')}</div>`:empty('Noch keine Aktivitäten','Importe, Freigaben und Änderungen erscheinen hier.')}</section></div>
 <div class="notice"><strong>Technischer Status</strong><span>Dies ist das lokale Grundsystem. KI-Modelle, Affiliate-Schnittstellen, Veröffentlichung und automatische Finanzdaten werden erst nach Prüfung der jeweiligen kostenlosen und offiziell verfügbaren Integrationen ergänzt.</span></div>`;
}
const productStatuses = [
 'Neu','Analyse ausstehend','In Analyse','Analyse abgeschlossen',
 'Content geplant','In Produktion','Freigabe ausstehend','Veröffentlicht','Archiviert'
];
function productStatusOptions(current){
 return productStatuses.map(s=>`<option value="${esc(s)}" ${s===(current||'Neu')?'selected':''}>${esc(s)}</option>`).join('');
}
function productsPage(){
 header('Produkte','RECHERCHE & PRODUKTDATENBANK');
 const items=scoped(state.products).filter(p=>{
  const q=state.productSearch.trim().toLowerCase();
  return !q || [p.name,p.merchant,p.url,p.description,p.status].some(v=>String(v||'').toLowerCase().includes(q));
 });
 const selected=state.products.find(p=>p.id===state.selectedProductId && p.workspaceId===state.workspaceId);
 return `<div class="page-toolbar"><div><h2>Produktbibliothek</h2><p>Produkte erfassen, verwalten und durch den gesamten Content-Prozess führen.</p></div><button class="button button-primary" id="addProduct">＋ Produkt erfassen</button></div>
 <section class="panel link-import-panel" id="linkImportPanel">
   <div class="panel-head"><div><h3>Produkt per Link importieren</h3><p>TikTok, Amazon, eBay und weitere Shops erkennen.</p></div><span class="status-tag">Link-Import</span></div>
   <div class="link-import-controls">
     <input id="productImportUrl" type="url" inputmode="url" placeholder="Produktlink hier einfügen …" autocomplete="url">
     <button class="button button-primary" id="inspectProductLink" type="button">Link erkennen</button>
   </div>
   <div id="linkImportResult" class="link-import-result" aria-live="polite"><span>Füge einen Produktlink ein. Northstar erkennt Shop und Linktyp und übernimmt die Adresse in die Produktakte.</span></div>
   <p class="form-hint">Hinweis: Shop-Seiten blockieren häufig den automatischen Datenabruf. Die Linkerkennung funktioniert lokal; Produktname, Preis, Bilder und Merkmale werden nur übernommen, wenn sie tatsächlich aus einer zugänglichen Quelle ausgelesen werden können. In dieser Version erfolgt noch kein Live-Scraping.</p>
 </section>
 <section class="panel screenshot-import-panel" id="screenshotImportPanel">
   <div class="panel-head"><div><h3>Produkt per Screenshot erfassen</h3><p>TikTok-Shop- oder Shop-Screenshot vom iPhone auswählen.</p></div><span class="status-tag">Bild-Import</span></div>
   <label class="screenshot-file-label">Screenshots auswählen (bis zu 8)
     <input id="screenshotFile" type="file" accept="image/*" multiple>
   </label>
   <div id="screenshotPreview" class="screenshot-preview screenshot-preview-list" hidden></div>
   <div class="screenshot-actions"><button class="button button-secondary" id="runScreenshotOcr" type="button">Texterkennung starten</button></div>
   <label class="screenshot-text-label">Produkttext aus dem Screenshot (optional)
     <textarea id="screenshotText" rows="4" maxlength="5000" placeholder="Text aus dem Screenshot hier einfügen, falls du ihn kopiert oder per iPhone-Texterkennung ausgewählt hast."></textarea>
   </label>
   <div class="screenshot-actions">
     <button class="button button-primary" id="prepareScreenshotProduct" type="button">Angaben übernehmen</button>
     <button class="button button-secondary" id="clearScreenshotImport" type="button">Zurücksetzen</button>
   </div>
   <div id="screenshotImportStatus" class="form-hint" aria-live="polite">Bis zu 8 Screenshots auswählen. Deutsche und englische Texterkennung läuft lokal im Browser. Beim ersten Start werden OCR-Engine und Sprachdaten von einem CDN geladen; Bilder werden nicht hochgeladen.</div>
 </section>
 <section class="panel product-form-panel" id="productFormPanel" hidden>
   <div class="panel-head"><div><h3 id="productFormTitle">Neues Produkt erfassen</h3><p>Produktdaten bleiben lokal in diesem Arbeitsbereich gespeichert.</p></div><button class="icon-button" id="closeProductForm" type="button" aria-label="Formular schließen">✕</button></div>
   <form id="productForm" class="data-form">
     <input type="hidden" name="id">
     <input type="hidden" name="importPlatform">
     <input type="hidden" name="importProductId">
     <input type="hidden" name="importStatus">
     <label>Produktname *<input name="name" required maxlength="160" placeholder="z. B. Akku-Bohrschrauber"></label>
     <div class="form-grid">
       <label>Händler / Plattform<input name="merchant" maxlength="100" placeholder="z. B. Amazon"></label>
       <label>Aktueller Preis in EUR<input name="price" inputmode="decimal" placeholder="z. B. 49,99"></label>
     </div>
     <label>Produktlink<input name="url" type="url" placeholder="https://..."></label>
     <label>Quellenlink für Preis / Eigenschaften<input name="sourceUrl" type="url" placeholder="Herstellerseite oder Händlerquelle"></label>
     <label>Produktbeschreibung<textarea name="description" rows="3" maxlength="2000" placeholder="Bekannte Eigenschaften und Hinweise"></textarea></label>
     <label>Produktbild oder Screenshot<input name="productImage" type="file" accept="image/*"></label>
     <div id="productImagePreview" class="product-image-preview" hidden></div>
     <label>Bild-URL (falls aus einer zugänglichen Produktseite ausgelesen)<input name="imageUrl" type="url" placeholder="https://..."></label>
     <div class="form-actions"><button class="button button-secondary" id="cancelProductForm" type="button">Abbrechen</button><button class="button button-primary" type="submit" id="saveProductButton">Produkt lokal speichern</button></div>
     <p class="form-hint">Preis- und Produktangaben werden nicht automatisch verifiziert. Quellenlinks werden gespeichert; eine Live-Quellenprüfung ist noch nicht angebunden.</p>
   </form>
 </section>
 <div class="product-toolbar"><input id="productSearch" class="search-input" type="search" placeholder="Produkte suchen …" value="${esc(state.productSearch)}"><span class="result-count">${items.length} von ${scoped(state.products).length} Produkten</span></div>
 ${items.length?`<div class="product-list">${items.map(p=>`<article class="product-card">
   <div class="product-card-main">${p.imageDataUrl?`<img class="product-thumb" src="${p.imageDataUrl}" alt="Produktbild">`:p.imageUrl?`<img class="product-thumb" src="${esc(p.imageUrl)}" alt="Produktbild" loading="lazy">`:''}<div class="product-card-heading"><div><strong>${esc(p.name)}</strong><small>${esc(p.merchant||'Händler nicht angegeben')} · ${p.price!==null&&p.price!==undefined?money(p.price):'Preis nicht angegeben'}</small></div><span class="status-tag">${esc(p.status||'Neu')}</span></div>
   <small class="product-url">${p.url?esc(p.url):'Kein Produktlink hinterlegt'}</small></div>
   <div class="product-card-actions"><button class="button button-secondary" data-product-action="details" data-id="${p.id}">Öffnen</button><button class="button button-secondary" data-product-action="edit" data-id="${p.id}">Bearbeiten</button><button class="button button-danger" data-product-action="delete" data-id="${p.id}">Löschen</button></div>
 </article>`).join('')}</div>`:empty(state.productSearch?'Keine passenden Produkte':'Noch keine Produkte',state.productSearch?'Passe den Suchbegriff an.':'Erfasse dein erstes Produkt über das Formular.')}
 ${selected?productDetail(selected):''}
 <div class="notice"><strong>Produktprozess</strong><span>Nach dem Speichern erhält ein Produkt den Status „Neu“. Du kannst es bearbeiten, löschen, für eine spätere Analyse vormerken und daraus ein Content-Projekt anlegen. Automatische KI-Recherche ist in dieser Version noch nicht aktiv.</span></div>`;
}
function renderAnalysis(a){
 return `<div class="analysis-result">
  <div class="analysis-heading"><div><span class="subtle">LOKALE PRODUKT-BASISANALYSE</span><h3>Analyseergebnis</h3></div><strong class="analysis-score">${a.score}/100</strong></div>
  <div class="analysis-meter"><span style="width:${a.score}%"></span></div>
  <p class="analysis-summary">${esc(a.summary)}</p>
  <div class="analysis-columns">
   <div><strong>Erkannte Verkaufsansätze</strong><ul>${a.angles.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
   <div><strong>Noch zu prüfen</strong><ul>${a.gaps.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
  </div>
  <div class="detail-block"><span>Hook-Ideen – erste Arbeitsentwürfe</span><ol>${a.hooks.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>
  <small class="form-hint">Erstellt: ${new Date(a.createdAt).toLocaleString('de-DE')} · Bewertet Datenvollständigkeit, nicht Verkaufswahrscheinlichkeit.</small>
 </div>`;
}
function productDetail(p){
 const evidence=p.sourceUrl?`<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">Quellenlink öffnen ↗</a>`:'Keine Quelle hinterlegt';
 const priceState=p.priceVerified?'Als geprüft markiert':'Nicht verifiziert';
 return `<section class="panel product-detail" id="productDetail">
  <div class="panel-head"><div><h3>Produktdetails</h3><p>${esc(p.name)}</p></div><button class="icon-button" id="closeProductDetails" type="button" aria-label="Details schließen">✕</button></div>
  ${p.imageDataUrl?`<img class="product-detail-image" src="${p.imageDataUrl}" alt="Produktbild">`:p.imageUrl?`<img class="product-detail-image" src="${esc(p.imageUrl)}" alt="Produktbild" loading="lazy">`:''}
  <div class="detail-grid">
   <div><span>Händler</span><strong>${esc(p.merchant||'Nicht angegeben')}</strong></div>
   <div><span>Preis</span><strong>${p.price!==null&&p.price!==undefined?money(p.price):'Nicht angegeben'}</strong></div>
   <div><span>Preisstatus</span><strong>${priceState}</strong></div>
   <div><span>Erstellt</span><strong>${new Date(p.createdAt).toLocaleString('de-DE')}</strong></div>
  </div>
  <div class="detail-block"><span>Produktlink</span><p>${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)} ↗</a>`:'Kein Produktlink'}</p></div>
  <div class="detail-block"><span>Quelle</span><p>${evidence}</p></div>
  ${p.importStatus?`<div class="detail-block"><span>Importstatus</span><p>${esc(p.importStatus)}</p></div>`:''}
  <div class="detail-block"><span>Beschreibung</span><p>${esc(p.description||'Keine Beschreibung hinterlegt')}</p></div>
  <label class="status-editor">Arbeitsstatus<select id="productStatus" data-id="${p.id}">${productStatusOptions(p.status)}</select></label>
  <div class="detail-actions">
   <button class="button button-primary" id="prepareAnalysis" data-id="${p.id}">▶ Lokale Analyse starten</button>
   <button class="button button-secondary" id="createContentFromProduct" data-id="${p.id}">Content-Projekt anlegen</button>
   <button class="button button-secondary" id="editFromDetails" data-id="${p.id}">Bearbeiten</button>
  </div>
  ${p.analysis?renderAnalysis(p.analysis):''}
  <p class="form-hint">Die lokale Basisanalyse wertet nur deine gespeicherten Angaben aus. Sie nutzt noch kein externes KI-Modell und keine Live-Webrecherche.</p>
 </section>`;
}
function contentPage(){
 header('Content-Studio','CONTENT-STRATEGIE'); const items=scoped(state.posts);
 const linkedProduct=post=>state.products.find(x=>x.id===post.productId);
 const selected=items.find(x=>x.id===state.selectedPostId);
 return `<div class="page-toolbar"><div><h2>Content-Projekte</h2><p>Aus Produktdaten werden strukturierte Content-Entwürfe.</p></div><button class="button button-primary" id="addPost">＋ Entwurf anlegen</button></div>
 ${items.length?`<div class="project-list">${items.map(p=>{const product=linkedProduct(p);return `<article class="project-card"><div class="project-symbol">▤</div><div class="project-main"><strong>${esc(p.title)}</strong><small>${esc(p.channel||'TikTok')} · ${esc(p.strategy||'BOFU')} · ${new Date(p.createdAt).toLocaleDateString('de-DE')}</small>${product?`<small class="linked-product">Verknüpft mit: ${esc(product.name)}</small>`:''}${p.draft?`<small class="status-tag">Carousel-Entwurf vorhanden</small>`:''}<div class="project-actions"><button class="button button-secondary" data-post-action="open" data-id="${p.id}">Öffnen</button><button class="button button-danger" data-post-action="delete" data-id="${p.id}">Löschen</button></div></div><span class="status-tag">${esc(p.status||'Entwurf')}</span></article>`}).join('')}</div>`:empty('Noch keine Content-Entwürfe','Öffne ein Produkt und lege daraus ein Content-Projekt an.','<button class="button button-primary" id="addPostEmpty">＋ Ersten Entwurf anlegen</button>')}
 ${selected?contentDetail(selected,linkedProduct(selected)):''}
 <div class="notice"><strong>Produktionshinweis</strong><span>Der Carousel-Entwurf enthält Textstruktur und Dramaturgie. Bilder, Preisprüfung und Veröffentlichung sind separate Schritte und werden nicht automatisch vorgetäuscht.</span></div>`;
}
function contentDetail(post,product){
 const draft=post.draft;
 return `<section class="panel content-detail" id="contentDetail">
  <div class="panel-head"><div><h3>${esc(post.title)}</h3><p>${product?`Produkt: ${esc(product.name)}`:'Manueller Entwurf'} · ${esc(post.channel||'TikTok')}</p></div><button class="icon-button" id="closeContentDetail" type="button">✕</button></div>
  ${draft?`<div class="draft-meta"><span class="status-tag">${esc(draft.strategy||'BOFU')}</span><span class="subtle">3-Slide-BOFU-Paket · ${new Date(draft.createdAt).toLocaleString('de-DE')}</span></div>
  <div class="notice"><strong>Produktionsstatus</strong><span>${esc(draft.productionStatus||'Text- und Produktionsbrief erstellt. Bild-/Videodateien müssen noch generiert werden.')}</span></div>
  <div class="carousel-draft">${draft.slides.map((slide,i)=>`<article class="draft-slide"><div class="draft-slide-top"><strong>Slide ${i+1} von ${draft.slides.length}</strong><span>${esc(slide.role)}</span></div><h4>${esc(slide.headline)}</h4><p>${esc(slide.body)}</p><small>${esc(slide.visualNote)}</small><div class="detail-block"><span>Bildprompt / Produktionsanweisung</span><p>${esc(slide.imagePrompt||slide.visualNote)}</p></div></article>`).join('')}</div>
  <div class="detail-block"><span>Voiceover / Sprechtext</span><p>${esc(draft.videoScript||'')}</p></div>
  <div class="detail-block"><span>Videoplan · 9:16</span><p>${(draft.videoScenes||[]).map((scene,i)=>`${i+1}. ${scene.time} – ${scene.visual} | Text: ${scene.overlay}`).map(esc).join('<br>')}</p></div>
  <div class="detail-block"><span>Video-Generierungs-Prompt</span><p>${esc(draft.videoPrompt||'')}</p></div>
  <div class="detail-block"><span>Caption</span><p>${esc(draft.caption)}</p></div>
  <div class="detail-block"><span>Hashtags</span><p>${draft.hashtags.map(esc).join(' ')}</p></div>
  <section class="media-generation-panel">
   <div class="panel-head"><div><h3>KI-Bildproduktion</h3><p>Drei echte 8:9-Slides mit Produktreferenz erzeugen.</p></div><span class="status-tag">Cloudflare Workers AI · FLUX.2 Klein</span></div>
   <div class="media-connection-grid">
    <label>Cloudflare-Worker-Endpunkt<input id="mediaEndpoint" type="url" placeholder="https://northstar-image-generator.kibruder.workers.dev"></label>
    <label>Worker-Zugriffstoken<input id="mediaToken" type="password" autocomplete="off" placeholder="Zugriffstoken"></label>
   </div>
   <p class="form-hint">Kein OpenAI-API-Key erforderlich. Der Worker nutzt das kostenlose Cloudflare-AI-Tageskontingent; bei ausgeschöpftem Limit wird die Generierung gestoppt.</p>
   <div class="detail-actions"><button class="button button-secondary" id="saveMediaSettings">Verbindung speichern</button><button class="button button-primary" id="generateSlideImages" data-id="${post.id}">✦ 3 Slides jetzt generieren</button></div>
   <div id="mediaGenerationStatus" class="form-hint" aria-live="polite">${draft.generatedSlides?.length||0} von 3 Slides gespeichert.</div>
   ${generatedSlidesMarkup(draft)}
  </section>
  <div class="detail-actions"><button class="button button-secondary" id="copyContentDraft">Gesamtes Produktionspaket kopieren</button><button class="button button-primary" id="regenerateContentDraft" data-id="${post.id}">Paket neu erstellen</button></div>
  `:`<div class="empty-state compact"><h3>Noch kein Produktionspaket</h3><p>Erstelle aus dem Produkt einen BOFU-Beitrag mit drei Slides, Voiceover, Szenenplan, Bildprompts, Caption und Hashtags.</p><button class="button button-primary" id="generateContentDraft" data-id="${post.id}">✦ BOFU-Produktionspaket erstellen</button></div>`}
 </section>`;
}
function generatedSlidesMarkup(draft){
 const slides=draft.generatedSlides||[];
 if(!slides.length)return '';
 return '<div class="generated-slide-grid">'+slides.map((item,i)=>'<article class="generated-slide-card"><img src="'+item.dataUrl+'" alt="Generierter Slide '+(i+1)+'"><strong>Slide '+(i+1)+'</strong><a class="button button-secondary" href="'+item.dataUrl+'" download="northstar-slide-'+(i+1)+'.png">Bild speichern</a></article>').join('')+'</div>';
}
function saveMediaSettings(){
 const endpoint=$('#mediaEndpoint')?.value.trim()||'',token=$('#mediaToken')?.value.trim()||'';
 if(!/^https:\/\//i.test(endpoint)||!token){toast('Bitte HTTPS-Worker-Adresse und Zugriffstoken eintragen.');return;}
 localStorage.setItem('northstar_media_endpoint',endpoint);
 localStorage.setItem('northstar_media_token',token);
 toast('Generator-Verbindung lokal gespeichert.');
}
function prepareFluxReferenceImage(dataUrl){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{
   const maxEdge=510,scale=Math.min(1,maxEdge/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
   const width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d');if(!ctx){reject(new Error('Canvas für Referenzbild nicht verfügbar.'));return;}
   ctx.drawImage(img,0,0,width,height);
   resolve(canvas.toDataURL('image/jpeg',0.84));
  };img.onerror=()=>reject(new Error('Produkt-Referenzbild konnte nicht verkleinert werden.'));img.src=dataUrl;
 });
}
function cropImageToEightNinths(dataUrl,slide){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{
   const ratio=8/9,source=img.width/img.height;let sx=0,sy=0,sw=img.width,sh=img.height;
   if(source>ratio){sw=Math.round(img.height*ratio);sx=Math.round((img.width-sw)/2);}
   else{sh=Math.round(img.width/ratio);sy=Math.round((img.height-sh)/2);}
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1152;
   const ctx=canvas.getContext('2d');if(!ctx){reject(new Error('Canvas nicht verfügbar.'));return;}
   ctx.drawImage(img,sx,sy,sw,sh,0,0,1024,1152);
   const gradient=ctx.createLinearGradient(0,620,0,1152);gradient.addColorStop(0,'rgba(5,12,24,0)');gradient.addColorStop(.24,'rgba(5,12,24,.68)');gradient.addColorStop(1,'rgba(5,12,24,.92)');
   ctx.fillStyle=gradient;ctx.fillRect(0,620,1024,532);
   const wrap=(text,maxWidth,font)=>{ctx.font=font;const words=String(text||'').split(/\s+/);const lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
   const headline=String(slide?.headline||'').slice(0,110),body=String(slide?.body||'').slice(0,180);
   ctx.fillStyle='#8bbcff';ctx.font='700 22px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';ctx.fillText('KURZER PRODUKTCHECK',64,780);
   ctx.fillStyle='#ffffff';const titleLines=wrap(headline,896,'700 43px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif').slice(0,3);
   let y=842;for(const line of titleLines){ctx.font='700 43px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';ctx.fillText(line,64,y);y+=54;}
   ctx.fillStyle='#d7e2f2';const bodyLines=wrap(body,896,'400 27px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif').slice(0,3);
   y+=12;for(const line of bodyLines){ctx.font='400 27px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';ctx.fillText(line,64,y);y+=37;}
   resolve(canvas.toDataURL('image/png'));
  };img.onerror=()=>reject(new Error('Bild konnte nicht verarbeitet werden.'));img.src=dataUrl;
 });
}
async function generateSlideImages(postId){
 const post=state.posts.find(x=>x.id===postId&&x.workspaceId===state.workspaceId);
 const product=post&&state.products.find(x=>x.id===post.productId&&x.workspaceId===state.workspaceId);
 if(!post?.draft||!product){toast('Zuerst ein BOFU-Produktionspaket erstellen.');return;}
 const endpoint=String(localStorage.getItem('northstar_media_endpoint')||'').trim();
 const token=String(localStorage.getItem('northstar_media_token')||'').trim();
 if(!endpoint||!token){toast('Bitte zuerst Worker-Verbindung speichern.');return;}
 const referenceSource=[product.imageDataUrl,...(product.screenshotDataUrls||[])].find(x=>typeof x==='string'&&x.startsWith('data:image/'));
 if(!referenceSource){toast('Kein gespeichertes Produktbild gefunden.');return;}
 let referenceImage;
 try{referenceImage=await prepareFluxReferenceImage(referenceSource);}catch(error){toast(error.message||'Referenzbild konnte nicht vorbereitet werden.');return;}
 const button=$('#generateSlideImages'),status=$('#mediaGenerationStatus');
 if(button){button.disabled=true;button.textContent='Generierung läuft …';}
 post.draft.generatedSlides=post.draft.generatedSlides||[];
 try{
  for(let i=0;i<post.draft.slides.length;i++){
   if(status)status.textContent='Slide '+(i+1)+' von 3 wird generiert …';
   const slide=post.draft.slides[i];
   const prompt='Create one premium but authentic TikTok Shop product-slide image in portrait 8:9 composition. Treat all supplied photos as strict identity references for the exact product. Preserve its original shape, color, branding, seams, pockets, zippers and proportions. Product: '+product.name+'. Slide role: '+slide.role+'. Visual direction: '+slide.imagePrompt+' Style: clean iPhone product photography, realistic natural light, understated neutral background, product dominant. No collage, watermark, invented claims, price or text rendered inside the image.';
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({prompt,images:[referenceImage]})});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(payload.error||'Generator-Fehler ('+response.status+')');
   if(!payload.imageDataUrl)throw new Error('Worker hat keine Bilddatei zurückgegeben.');
   const finalImage=await cropImageToEightNinths(payload.imageDataUrl,slide);
   post.draft.generatedSlides[i]={dataUrl:finalImage,createdAt:new Date().toISOString(),model:payload.model||'@cf/black-forest-labs/flux-2-klein-4b',aspectRatio:'8:9'};
   await db.put('posts',post);
  }
  post.draft.productionStatus='Drei generierte 8:9-Bilddateien lokal gespeichert. Produktdetails und Preis vor Veröffentlichung weiterhin prüfen.';
  post.status='Bilder generiert – Freigabe offen';post.updatedAt=new Date().toISOString();
  await db.put('posts',post);log('Drei BOFU-Slides generiert',post.title);
  state.selectedPostId=post.id;renderPage();toast('Drei Slides in Northstar gespeichert.');
 }catch(error){if(status)status.textContent='Abbruch: '+error.message;toast('Bildgenerierung fehlgeschlagen: '+error.message);}
 finally{const current=$('#generateSlideImages');if(current){current.disabled=false;current.textContent='✦ 3 Slides jetzt generieren';}}
}
async function handlePostAction(action,id){
 const post=state.posts.find(x=>x.id===id && x.workspaceId===state.workspaceId);if(!post)return;
 if(action==='open'){state.selectedPostId=id;renderPage();$('#contentDetail')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(action==='delete'){
  if(!confirm(`Content-Entwurf „${post.title}“ wirklich löschen? Das verknüpfte Produkt bleibt erhalten.`))return;
  state.posts=state.posts.filter(x=>x.id!==id);await db.delete('posts',id);
  if(state.selectedPostId===id)state.selectedPostId=null;
  log('Content-Entwurf gelöscht',post.title);renderPage();toast('Content-Entwurf gelöscht.');
 }
}
async function generateContentDraft(postId){
 const post=state.posts.find(x=>x.id===postId && x.workspaceId===state.workspaceId);if(!post)return;
 const product=state.products.find(x=>x.id===post.productId && x.workspaceId===state.workspaceId);
 if(!product){toast('Für diesen Entwurf ist kein Produkt verknüpft.');return;}
 const panel=$('#contentDetail');
 if(panel){panel.insertAdjacentHTML('afterbegin',`<div class="generation-progress" id="generationProgress"><strong>BOFU-Produktionspaket wird erstellt</strong><div class="progress-track"><span id="generationBar" style="width:8%"></span></div><ol><li id="genStep1">Produktdaten und Beleglage prüfen</li><li id="genStep2">Drei-Slide-Dramaturgie aufbauen</li><li id="genStep3">Voiceover, Szenen und Medienprompts erstellen</li><li id="genStep4">Paket lokal speichern</li></ol></div>`);}
 const setStep=(n,width)=>{const bar=$('#generationBar');if(bar)bar.style.width=width+'%';const step=$(`#genStep${n}`);if(step)step.classList.add('step-done');};
 setStep(1,22);await new Promise(r=>setTimeout(r,100));
 const name=String(product.name||'Produkt').trim();
 const rawDescription=String(product.description||'').trim();
 const noisy=/(?:\\b5g\\b|\\b4g\\b|\\blte\\b|\\d{1,2}:\\d{2}|©|[<>]{1,}|\\b\\d{1,2}%\\b|kostenloser versand|lieferung bis|verlängerte rückgabe)/i.test(rawDescription)||rawDescription.length>900;
 const verifiedDescription=!noisy&&rawDescription.length>15?rawDescription:'';
 const priceVerified=product.price!==null&&product.price!==undefined&&product.price!==''&&String(product.priceStatus||'').toLowerCase()==='verified';
 const seller=String(product.merchant||'').trim();
 const source=String(product.sourceUrl||'').trim();
 const facts=verifiedDescription||'Produktmerkmale sind noch nicht ausreichend verifiziert. Vor der Veröffentlichung die tatsächlichen Eigenschaften direkt auf der Produktseite prüfen.';
 const priceText=priceVerified?`Preis laut geprüftem Datensatz: ${product.price} €.`:'Keinen Preis nennen: Preis fehlt oder ist nicht als verifiziert markiert.';
 const sourceText=source?'Quellenlink ist hinterlegt, aber nicht automatisch unabhängig geprüft.':'Noch keine Produktquelle hinterlegt.';
 const title=name.replace(/[.!?]+$/,'');
 const slides=[
  {role:'1 · Hook / Scroll-Stopper',headline:`Bevor du diese ${title} kaufst …`,body:'Ein konkreter Kaufcheck statt leerer Werbeversprechen. In den ersten Sekunden das Originalprodukt zeigen.',visualNote:'Vertikales 9:16-Standbild oder kurzer Reaktions-Clip als Einstieg; maximal eine kurze Textzeile.',imagePrompt:`Create a realistic 9:16 smartphone-style TikTok Shop opening visual for the exact product shown in the supplied reference image. Preserve the product design, color, proportions and details exactly. Natural handheld framing, authentic everyday environment, clear negative space for one short German hook. No invented logos, no fake claims, no price text.`},
  {role:'2 · Produkt / belegbare Information',headline:`Was du bei ${title} prüfen solltest`,body:facts,visualNote:'Originalprodukt groß und unverändert zeigen; nur verifizierte Eigenschaften als Text einblenden.',imagePrompt:`Create a clean 9:16 product-detail visual using the supplied original product photo as the identity reference. Keep the product unchanged and photorealistic. Show useful close-up framing and a simple uncluttered background. Do not add features, accessories, labels or specifications that are not visible or supplied.`},
  {role:'3 · BOFU / Kaufentscheidung',headline:'Passt das zu deinem Bedarf?',body:`${priceText} ${sourceText} Vor dem Kauf Varianten, Lieferumfang und Rückgabebedingungen prüfen.`,visualNote:'Ruhiger Abschluss mit Produktaufnahme und klarer Aufforderung, aktuelle Details beim Händler zu prüfen.',imagePrompt:`Create a minimal 9:16 final TikTok product frame using the exact supplied product reference. Product remains unchanged, centered and clearly visible, authentic smartphone photo aesthetic, clean space for a short German call to action. No fabricated discount, price, rating or urgency.`}
 ];
 setStep(2,48);await new Promise(r=>setTimeout(r,100));
 const videoScript=`Du überlegst, dir ${title} zu holen? Schau dir zuerst die Details an. ${verifiedDescription?facts:'Prüfe die tatsächlichen Eigenschaften und den Lieferumfang direkt beim Händler.'} Vergleiche Varianten und aktuelle Konditionen, bevor du entscheidest.`;
 const videoScenes=[
  {time:'0–3 s',visual:'Hook: Originalprodukt sofort im Bild, schneller Schnitt oder kurzer Reaction-Einstieg',overlay:`Vor dem Kauf von ${title} …`},
  {time:'3–10 s',visual:'Nahaufnahme des Originalprodukts; zwei bis drei echte Details zeigen',overlay:verifiedDescription?'Nur belegte Merkmale zeigen':'Eigenschaften und Lieferumfang prüfen'},
  {time:'10–15 s',visual:'Produkt im Alltag / ruhige Abschlussaufnahme',overlay:'Details und aktuelle Konditionen prüfen'}
 ];
 const videoPrompt=`Create a 15-second vertical 9:16 German TikTok Shop affiliate video for ${title}. Use the supplied product photo as a strict visual reference: do not alter product shape, branding, color or proportions. Style: authentic iPhone UGC, natural light, fast but clear edits, product visible in the first second, clean German on-screen captions, subtle sound design, no fake reviews, no fabricated specifications, no unverified price or discount. Voiceover: ${videoScript}`;
 setStep(3,76);await new Promise(r=>setTimeout(r,100));
 const caption=`${title}: Vor dem Kauf die Details prüfen und mit dem eigenen Bedarf abgleichen. ${seller?'Anbieter: '+seller+'. ':''}${source?'Produktquelle hinterlegt – bitte aktuelle Angaben dort kontrollieren.':'Aktuelle Produktdetails beim Händler prüfen.'}`;
 const hashtags=['#tiktokshop','#produkttipp','#musthave','#shopping','#affiliate'];
 post.draft={strategy:'BOFU',slides,caption,hashtags,videoScript,videoScenes,videoPrompt,createdAt:new Date().toISOString(),sourceType:'northstar-production-brief-v2',productionStatus:'Text, Szenenplan und Medienprompts erstellt. Bild-/Videodateien noch nicht generiert; Faktenprüfung vor Veröffentlichung erforderlich.',evidence:{descriptionVerified:Boolean(verifiedDescription),priceVerified:Boolean(priceVerified),sellerPresent:Boolean(seller),sourcePresent:Boolean(source)},notes:product.analysis?.angles||[]};
 post.status='Produktionspaket erstellt';post.updatedAt=new Date().toISOString();
 await db.put('posts',post);log('BOFU-Produktionspaket erstellt',`${post.title} · 3 Slides + Video-Brief`);
 setStep(4,100);await new Promise(r=>setTimeout(r,100));
 state.selectedPostId=post.id;renderPage();toast('BOFU-Produktionspaket gespeichert.');
}
function copyContentDraft(){
 const post=state.posts.find(x=>x.id===state.selectedPostId);if(!post?.draft)return;
 const d=post.draft;
 const text=[post.title,'',...d.slides.map((s,i)=>`SLIDE ${i+1} – ${s.role}\\n${s.headline}\\n${s.body}\\nBild: ${s.imagePrompt||s.visualNote}`),'',`VOICEOVER\\n${d.videoScript||''}`,'',`VIDEO-SZENEN\\n${(d.videoScenes||[]).map(s=>s.time+' – '+s.visual+' | Overlay: '+s.overlay).join('\\n')}`,'',`VIDEO-PROMPT\\n${d.videoPrompt||''}`,'',`CAPTION\\n${d.caption}`,'',d.hashtags.join(' ')].join('\\n\\n');
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(text).then(()=>toast('Vollständiges Produktionspaket kopiert.')).catch(()=>toast('Kopieren im Browser nicht verfügbar.'));}else toast('Kopieren im Browser nicht verfügbar.');
}
const simplePages = {
 production:['Produktion','PRODUKTIONSSTEUERUNG','Bild- und Videoaufträge, Qualitätskontrolle und Export werden hier zentral gesteuert.','Die Generatoren werden erst angebunden, wenn kostenlose oder ausdrücklich freigegebene Werkzeuge technisch geprüft sind.'],
 calendar:['Planung','PUBLISHING & KALENDER','Redaktionskalender, Veröffentlichungsstatus und kanalbezogene Planung.','Direktes Veröffentlichen wird nur über offiziell unterstützte Schnittstellen aktiviert.'],
 analytics:['Analysen','PERFORMANCE & LERNEN','Leistung von Produkten, Beiträgen, Kanälen und Kampagnen nachvollziehen.','Ohne verlässliche Datenimporte werden keine Kennzahlen oder Umsätze geschätzt.'],
 finance:['Finanzen','FINANZSTEUERUNG','Provisionen, Auszahlungen, Kosten, Cashflow und KI-Eigenfinanzierungsfonds.','Der KI-Fonds startet mit 0 €. Nur tatsächlich bestätigter Nettogewinn speist ihn gemäß der festgelegten Regel.'],
 partners:['Partnernetzwerk','BUSINESS NETWORK','Affiliate-Programme, Lieferanten, Plattformen und Kooperationspartner verwalten.','Kontakte und Verhandlungen können vorbereitet werden; Verträge und verbindliche Zusagen bleiben freigabepflichtig.'],
 agents:['KI-Agenten','AGENTENSTEUERUNG','Zentrale Orchestrierung, Spezialagenten, Aufgaben, Rechte und Qualitätskontrolle.','Noch keine Agenten sind aktiv. Modell- und API-Verbindungen werden nicht ohne Kosten- und Datenschutzprüfung aktiviert.'],
 documents:['Dokumente','DOCUMENT INTELLIGENCE','Unternehmensunterlagen, Belege, Fristen, Versionen und Prüfstatus organisieren.','Dokumente werden lokal verwaltet. OCR und automatische Analyse werden nach technischer Prüfung ergänzt.'],
 reports:['Managementberichte','MANAGEMENT & REPORTING','Tägliche und wöchentliche Berichte über Geschäftsbereiche, Risiken und Entscheidungen.','Berichte werden erst aussagekräftig, sobald echte Geschäftsdaten vorliegen.'],
 settings:['Einstellungen','SYSTEMKONFIGURATION','Arbeitsbereiche, lokale Datenhaltung, Export und Systempräferenzen.','Backups und Datenexport bleiben unter deiner Kontrolle.']
};
function simplePage(id){
 const [title,eyebrow,desc,note]=simplePages[id]; header(title,eyebrow);
 return `<div class="hero-panel"><div class="hero-icon">${sections.find(s=>s[0]===id)?.[2]||'•'}</div><div><h2>${title}</h2><p>${desc}</p></div></div><div class="panel"><h3>Modulstatus</h3><p class="muted">Grundstruktur angelegt · Fachfunktionen werden in den nächsten Entwicklungsstufen integriert.</p><div class="progress-track"><span style="width:12%"></span></div><small class="muted">Grundgerüst: Navigation und lokale Datenbasis vorhanden</small></div><div class="notice"><strong>Umsetzungsregel</strong><span>${note}</span></div>`;
}
function renderPage(){
 const el=$('#page'); el.innerHTML = active==='overview'?overview():active==='products'?productsPage():active==='content'?contentPage():simplePage(active);
 el.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
 $('#addProduct')?.addEventListener('click',()=>showProductForm());
 $('#inspectProductLink')?.addEventListener('click',inspectProductLink);
 $('#screenshotFile')?.addEventListener('change',previewScreenshotImport);
 $('#runScreenshotOcr')?.addEventListener('click',runScreenshotOcr);
 $('#prepareScreenshotProduct')?.addEventListener('click',prepareProductFromScreenshot);
 $('#clearScreenshotImport')?.addEventListener('click',clearScreenshotImport);

 $('#productImportUrl')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inspectProductLink();}});

 $('#closeProductForm')?.addEventListener('click',hideProductForm);
 $('#cancelProductForm')?.addEventListener('click',hideProductForm);
 $('#productForm')?.addEventListener('submit',saveProduct);
 $('#productForm [name="productImage"]')?.addEventListener('change',previewProductImage);

 $('#productSearch')?.addEventListener('input',e=>{state.productSearch=e.target.value;const pos=e.target.selectionStart;renderPage();const next=$('#productSearch');next?.focus();next?.setSelectionRange(pos,pos);});
 document.querySelectorAll('[data-product-action]').forEach(b=>b.addEventListener('click',()=>handleProductAction(b.dataset.productAction,b.dataset.id)));
 $('#closeProductDetails')?.addEventListener('click',()=>{state.selectedProductId=null;renderPage();});
 $('#productStatus')?.addEventListener('change',e=>updateProductStatus(e.target.dataset.id,e.target.value));
 $('#prepareAnalysis')?.addEventListener('click',()=>runLocalProductAnalysis(state.selectedProductId));
 $('#editFromDetails')?.addEventListener('click',()=>showProductForm(state.selectedProductId));
 $('#createContentFromProduct')?.addEventListener('click',()=>createContentFromProduct(state.selectedProductId));
 $('#addPost')?.addEventListener('click',addPost); $('#addPostEmpty')?.addEventListener('click',addPost);
 document.querySelectorAll('[data-post-action]').forEach(b=>b.addEventListener('click',()=>handlePostAction(b.dataset.postAction,b.dataset.id)));
 $('#closeContentDetail')?.addEventListener('click',()=>{state.selectedPostId=null;renderPage();});
 if($('#mediaEndpoint'))$('#mediaEndpoint').value=localStorage.getItem('northstar_media_endpoint')||'https://northstar-image-generator.kibruder.workers.dev';
 if($('#mediaToken'))$('#mediaToken').value=localStorage.getItem('northstar_media_token')||'';
 $('#generateContentDraft')?.addEventListener('click',()=>generateContentDraft(state.selectedPostId));
 $('#regenerateContentDraft')?.addEventListener('click',e=>generateContentDraft(e.currentTarget.dataset.id));
 $('#copyContentDraft')?.addEventListener('click',copyContentDraft);
 $('#saveMediaSettings')?.addEventListener('click',saveMediaSettings);
 $('#generateSlideImages')?.addEventListener('click',e=>generateSlideImages(e.currentTarget.dataset.id));
}
function classifyProductUrl(raw){
 let u;
 try{u=new URL(String(raw||'').trim());}catch{return {ok:false,message:'Bitte einen vollständigen Link mit https:// einfügen.'};}
 if(!['http:','https:'].includes(u.protocol))return {ok:false,message:'Nur http- und https-Links werden unterstützt.'};
 const host=u.hostname.toLowerCase().replace(/^www\./,'');
 let platform='Anderer Shop',merchant='Anderer Shop',shortLink=false,productId='';
 if(host==='vm.tiktok.com'||host==='vt.tiktok.com'||host==='tiktok.com'||host.endsWith('.tiktok.com')){
   platform='TikTok';merchant='TikTok Shop';shortLink=host==='vm.tiktok.com'||host==='vt.tiktok.com';
   productId=(u.pathname.match(/\/(?:view\/)?(\d{8,})/)||[])[1]||'';
 }else if(host==='amzn.to'||host.endsWith('.amazon.com')||host.endsWith('.amazon.de')||host.endsWith('.amazon.co.uk')||host==='amazon.de'||host==='amazon.com'){
   platform='Amazon';merchant='Amazon';shortLink=host==='amzn.to';
   productId=(u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)||[])[1]||'';
 }else if(host==='ebay.us'||host.endsWith('.ebay.de')||host.endsWith('.ebay.com')||host==='ebay.de'||host==='ebay.com'){
   platform='eBay';merchant='eBay';shortLink=host==='ebay.us';
   productId=(u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{8,})/)||[])[1]||'';
 }else if(host.endsWith('.aliexpress.com')||host==='aliexpress.com'){
   platform='AliExpress';merchant='AliExpress';
   productId=(u.pathname.match(/\/item\/(\d+)\.html/)||[])[1]||'';
 }else if(host.endsWith('.temu.com')||host==='temu.com'){
   platform='Temu';merchant='Temu';
 }else if(host.endsWith('.walmart.com')||host==='walmart.com'){
   platform='Walmart';merchant='Walmart';
 }else if(host.endsWith('.etsy.com')||host==='etsy.com'){
   platform='Etsy';merchant='Etsy';
 }else if(host.endsWith('.shopify.com')||host.includes('myshopify.com')){
   platform='Shopify-Shop';merchant=host;
 }
 return {ok:true,url:u.href,host,platform,merchant,shortLink,productId};
}
function inspectProductLink(){
 const input=$('#productImportUrl'), result=$('#linkImportResult');
 const detected=classifyProductUrl(input?.value||'');
 if(!detected.ok){if(result)result.innerHTML=`<span class="import-error">${esc(detected.message)}</span>`;return;}
 const form=$('#productForm');
 if(!form){toast('Produktformular konnte nicht geöffnet werden.');return;}
 form.reset();
 form.elements.id.value='';
 form.elements.url.value=detected.url;
 form.elements.sourceUrl.value=detected.url;
 form.elements.merchant.value=detected.merchant;
 form.elements.importPlatform.value=detected.platform;
 form.elements.importProductId.value=detected.productId;
 form.elements.importStatus.value='Link erkannt – Produktdaten noch nicht ausgelesen';
 form.elements.name.value='';
 $('#productFormTitle').textContent='Produktdaten ergänzen';
 $('#saveProductButton').textContent='Import lokal speichern';
 const notes=[];
 notes.push(`Shop erkannt: ${detected.platform}`);
 notes.push(detected.shortLink?'Kurzlink erkannt – Zieladresse kann wegen Shop-/Browser-Schutz nicht automatisch aufgelöst werden.':'Produktadresse erkannt.');
 if(detected.productId)notes.push(`Produktkennung erkannt: ${detected.productId}`);
 notes.push('Produktname, Preis, Bilder und Eigenschaften wurden noch nicht ausgelesen.');
 if(result)result.innerHTML=`<strong class="import-success">${esc(detected.platform)} erkannt</strong><ul>${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><button class="button button-secondary" id="fetchProductMetadata" type="button">Produktdatenabruf versuchen</button><span class="form-hint">Der Abruf funktioniert nur, wenn der Shop den Browserzugriff erlaubt. Bei einer Sperre kannst du Screenshot oder Angaben manuell ergänzen.</span>`;
 $('#fetchProductMetadata')?.addEventListener('click',()=>fetchProductMetadata(detected.url));
 const panel=$('#productFormPanel');panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});
 form.elements.name.focus();
}
async function previewScreenshotImport(event){
 const files=Array.from(event.target.files||[]),box=$('#screenshotPreview'),status=$('#screenshotImportStatus');
 pendingScreenshotImages=[];pendingScreenshotDataUrl='';
 if(!files.length){if(box){box.hidden=true;box.innerHTML='';}return;}
 if(files.length>8){toast('Maximal 8 Screenshots gleichzeitig.');event.target.value='';return;}
 const invalid=files.find(f=>!f.type.startsWith('image/')||f.size>5*1024*1024);
 if(invalid){toast('Nur Bilddateien bis maximal 5 MB pro Screenshot.');event.target.value='';return;}
 try{
  for(const file of files)pendingScreenshotImages.push({name:file.name,dataUrl:await compressScreenshot(file),ocrText:'',confidence:null});
  pendingScreenshotDataUrl=pendingScreenshotImages[0]?.dataUrl||'';
  renderScreenshotPreviews();
  if(status)status.textContent=pendingScreenshotImages.length+' Screenshot(s) lokal vorbereitet. Texterkennung startet automatisch …';
  await runScreenshotOcr();
 }catch(error){console.error(error);if(status)status.textContent='Screenshot konnte nicht vorbereitet werden: '+(error.message||'Unbekannter Fehler');toast('Mindestens ein Screenshot konnte nicht verarbeitet werden.');}
}
function compressScreenshot(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(reader.error||new Error('Datei nicht lesbar'));
  reader.onload=()=>{
   const image=new Image();
   image.onerror=()=>reject(new Error('Bild konnte nicht dekodiert werden'));
   image.onload=()=>{
    const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context){reject(new Error('Canvas nicht verfügbar'));return;}
    context.drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.92));
   };
   image.src=String(reader.result||'');
  };
  reader.readAsDataURL(file);
 });
}
function renderScreenshotPreviews(){
 const box=$('#screenshotPreview');if(!box)return;
 box.hidden=!pendingScreenshotImages.length;
 box.innerHTML=pendingScreenshotImages.map((item,index)=>'<div class="screenshot-preview-item"><img src="'+item.dataUrl+'" alt="Screenshot '+(index+1)+'"><div><strong>'+esc(item.name)+'</strong><small>'+(item.ocrText?'Texterkennung abgeschlossen':'Bereit zur Texterkennung')+'</small></div></div>').join('');
}
function loadTesseract(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(ocrWorkerPromise)return ocrWorkerPromise;
 ocrWorkerPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';script.async=true;
  script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR-Bibliothek nicht initialisiert.'));
  script.onerror=()=>reject(new Error('OCR-Bibliothek konnte nicht geladen werden. Internetverbindung prüfen.'));
  document.head.appendChild(script);
 }).catch(error=>{ocrWorkerPromise=null;throw error;});
 return ocrWorkerPromise;
}
async function runScreenshotOcr(){
 const status=$('#screenshotImportStatus'),button=$('#runScreenshotOcr'),textArea=$('#screenshotText');
 if(!pendingScreenshotImages.length){toast('Bitte zuerst Screenshots auswählen.');return;}
 if(button){button.disabled=true;button.textContent='Texterkennung läuft …';}
 let worker=null;
 try{
  const Tesseract=await loadTesseract();worker=await Tesseract.createWorker('deu+eng');
  const recognized=[];
  for(let i=0;i<pendingScreenshotImages.length;i++){
   const item=pendingScreenshotImages[i];
   if(status)status.textContent='Texterkennung: Screenshot '+(i+1)+' von '+pendingScreenshotImages.length+' – '+item.name;
   const result=await worker.recognize(item.dataUrl);
   item.ocrText=String(result.data?.text||'').trim();item.confidence=Number.isFinite(result.data?.confidence)?result.data.confidence:null;
   if(item.ocrText)recognized.push('--- '+item.name+' ---\n'+item.ocrText);
   renderScreenshotPreviews();
  }
  const combined=recognized.join('\n\n');
  if(textArea){const manualText=generatedScreenshotOcrText?textArea.value.replace(generatedScreenshotOcrText,'').trim():textArea.value.trim();generatedScreenshotOcrText=combined;textArea.value=[manualText,combined].filter(Boolean).join('\n\n').slice(0,5000);}
  if(status)status.textContent=combined?'Texterkennung abgeschlossen: Text aus '+recognized.length+' von '+pendingScreenshotImages.length+' Screenshot(s) übernommen. Namen und Preise bitte prüfen.':'Keine lesbaren Texte erkannt. Ergänze Angaben manuell oder verwende schärfere Screenshots.';
  toast(combined?'Texterkennung abgeschlossen.':'Kein Text erkannt.');
 }catch(error){
  console.error(error);if(status)status.textContent='Texterkennung fehlgeschlagen: '+(error.message||'Unbekannter Fehler')+' Du kannst weiterhin iPhone Live Text verwenden.';toast('OCR konnte nicht gestartet werden.');
 }finally{
  if(worker){try{await worker.terminate();}catch{}}
  if(button){button.disabled=false;button.textContent='Texterkennung erneut starten';}
 }
}
function clearScreenshotImport(){
 pendingScreenshotDataUrl='';pendingScreenshotImages=[];generatedScreenshotOcrText='';
 const file=$('#screenshotFile'),text=$('#screenshotText'),preview=$('#screenshotPreview'),status=$('#screenshotImportStatus');
 if(file)file.value='';if(text)text.value='';if(preview){preview.hidden=true;preview.innerHTML='';}
 if(status)status.textContent='Import zurückgesetzt. Du kannst bis zu 8 neue Screenshots auswählen.';
}
function parseScreenshotText(raw){
 const lines=String(raw||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>Boolean(x)&&!/^---\s.*\s---$/.test(x));
 const priceMatch=String(raw||'').match(/(?:€\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|EUR)(?![A-Za-z])|\bEUR\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
 let price=null;
 if(priceMatch){const token=priceMatch[1]||priceMatch[2];const n=Number(token.replace(',','.'));if(Number.isFinite(n))price=n;}
 const clean=x=>x.replace(/^\[?Black Friday\]?\s*/i,'').trim();
 const ignored=/^(?:\d{1,2}:\d{2}|inkl\.?\s*MwSt|kostenloser versand|lieferung|ähnliches finden|farbe:|verkauft von|warenkorb|kasse|einkaufswagen|versand|zurück|mehr)$/i;
 const useful=lines.map(clean).filter(x=>x.length>=18&&!ignored.test(x)&&!/(?:€|EUR)/i.test(x)&&!/^https?:\/\//i.test(x)&&!/^\d+(?:[.,]\d+)?\s*\(/.test(x));
 const titleCandidates=useful.filter(x=>/(jacke|fleece|hoodie|hose|shirt|schuhe|tasche|akku|bohrer|lampe|kopfhörer|sportjacke)/i.test(x));
 const title=(titleCandidates.sort((a,b)=>b.length-a.length)[0]||useful.sort((a,b)=>b.length-a.length)[0]||'').slice(0,160);
 const sellerMatch=String(raw||'').match(/(?:verkauft von|sold by|shop)\s*[:：]?\s*([^\n\r]+)/i);
 const merchant=sellerMatch? sellerMatch[1].replace(/\s+/g,' ').trim().slice(0,100) : (lines.find(x=>/^[A-Z0-9][A-Z0-9 ._-]{3,30}$/.test(x)&&!ignored.test(x))||'');
 const description=useful.filter(x=>x!==title).join('\n').slice(0,2000);
 return {title,price,description,merchant};
}
function prepareProductFromScreenshot(){
 if(!pendingScreenshotDataUrl){toast('Bitte zuerst einen Screenshot auswählen.');return;}
 const parsed=parseScreenshotText($('#screenshotText')?.value||'');
 showProductForm();
 const form=$('#productForm');
 if(parsed.title&&!form.elements.name.value)form.elements.name.value=parsed.title.slice(0,160);
 if(parsed.merchant&&!form.elements.merchant.value)form.elements.merchant.value=parsed.merchant;
 if(parsed.price!==null&&!form.elements.price.value)form.elements.price.value=String(parsed.price).replace('.',',');
 if(parsed.description&&!form.elements.description.value)form.elements.description.value=parsed.description;
 form.elements.importStatus.value='Screenshot lokal übernommen – Angaben manuell geprüft und zu bestätigen';
 const preview=$('#productImagePreview');
 if(preview){preview.hidden=false;preview.innerHTML=`<img src="${pendingScreenshotDataUrl}" alt="Screenshot für Produktakte"><span>Screenshot wird beim Speichern lokal am Produkt hinterlegt.</span>`;}
 const status=$('#screenshotImportStatus');
 if(status)status.textContent='Screenshot und Textangaben wurden in das Produktformular übertragen. Bitte Name, Preis und Beschreibung kontrollieren und anschließend speichern.';
 $('#productFormPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
 toast('Screenshotdaten zur Prüfung übernommen.');
}
function showProductForm(productId=null){
 const panel=$('#productFormPanel'), form=$('#productForm'); if(!panel||!form)return;
 form.reset();
 const p=productId?state.products.find(x=>x.id===productId):null;
 form.elements.id.value=p?.id||'';
 form.elements.importPlatform.value=p?.importPlatform||'';
 form.elements.importProductId.value=p?.importProductId||'';
 form.elements.importStatus.value=p?.importStatus||'';
 $('#productFormTitle').textContent=p?'Produkt bearbeiten':'Neues Produkt erfassen';
 $('#saveProductButton').textContent=p?'Änderungen speichern':'Produkt lokal speichern';
 if(p){
  form.elements.name.value=p.name||'';form.elements.merchant.value=p.merchant||'';
  form.elements.price.value=p.price??'';form.elements.url.value=p.url||'';
  form.elements.sourceUrl.value=p.sourceUrl||'';form.elements.description.value=p.description||'';form.elements.imageUrl.value=p.imageUrl||'';
  const preview=$('#productImagePreview');if(preview&&p.imageDataUrl){preview.hidden=false;preview.innerHTML=`<img src="${p.imageDataUrl}" alt="Aktuelles Produktbild">`;}
 }
 panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});panel.querySelector('[name="name"]')?.focus();
}
function hideProductForm(){const panel=$('#productFormPanel');if(panel)panel.hidden=true;}
function readFileAsDataUrl(file){
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('Datei konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
}
async function previewProductImage(event){
 const file=event.target.files?.[0],box=$('#productImagePreview');if(!box)return;
 if(!file){box.hidden=true;box.innerHTML='';return;}
 if(!file.type.startsWith('image/')){toast('Bitte eine Bilddatei auswählen.');event.target.value='';return;}
 if(file.size>5*1024*1024){toast('Bild ist zu groß. Maximal 5 MB.');event.target.value='';return;}
 try{const url=await readFileAsDataUrl(file);box.hidden=false;box.innerHTML=`<img src="${url}" alt="Bildvorschau"><span>${esc(file.name)} · ${(file.size/1024).toFixed(0)} KB</span>`;}catch{toast('Bildvorschau fehlgeschlagen.');}
}
function extractProductMetadata(html,baseUrl){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const meta=(...names)=>{for(const name of names){const el=doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`);if(el?.content?.trim())return el.content.trim();}return '';};
 let structured=null;
 for(const el of doc.querySelectorAll('script[type="application/ld+json"]')){
  try{const parsed=JSON.parse(el.textContent||'null');const queue=Array.isArray(parsed)?parsed:[parsed];for(const item of queue){const candidates=[item,...(item?.['@graph']||[])];structured=candidates.find(x=>String(x?.['@type']||'').toLowerCase().includes('product'))||structured;}}catch{}
 }
 const offers=structured?.offers?(Array.isArray(structured.offers)?structured.offers[0]:structured.offers):null;
 let image=meta('og:image','twitter:image');if(!image&&structured?.image)image=Array.isArray(structured.image)?(typeof structured.image[0]==='string'?structured.image[0]:structured.image[0]?.url):typeof structured.image==='string'?structured.image:structured.image?.url;
 try{if(image)image=new URL(image,baseUrl).href;}catch{image='';}
 const name=meta('og:title','twitter:title')||structured?.name||doc.title||'';
 const description=meta('og:description','description')||structured?.description||'';
 const rawPrice=meta('product:price:amount','og:price:amount')||offers?.price||'';
 const currency=meta('product:price:currency','og:price:currency')||offers?.priceCurrency||'';
 const price=Number(String(rawPrice).replace(',','.'));
 return {name:String(name).trim(),description:String(description).trim(),imageUrl:image,price:Number.isFinite(price)&&rawPrice!==''?price:null,currency,canonical:doc.querySelector('link[rel="canonical"]')?.href||baseUrl};
}
async function fetchProductMetadata(url){
 const button=$('#fetchProductMetadata'),result=$('#linkImportResult');if(button){button.disabled=true;button.textContent='Datenabruf läuft …';}
 if(result)result.insertAdjacentHTML('beforeend','<p id="metadataProgress" class="import-progress">Produktseite wird angefragt und auf strukturierte Produktdaten geprüft …</p>');
 try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  let response;try{response=await fetch(url,{method:'GET',redirect:'follow',signal:controller.signal,credentials:'omit',headers:{'Accept':'text/html,application/xhtml+xml'}});}finally{clearTimeout(timeout);}
  if(!response.ok)throw new Error(`Shop antwortet mit HTTP ${response.status}.`);
  const type=response.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))throw new Error('Die Zielseite liefert kein auslesbares HTML.');
  const html=await response.text();const data=extractProductMetadata(html,response.url||url);
  const form=$('#productForm');let filled=[];
  if(data.name&&!form.elements.name.value){form.elements.name.value=data.name;filled.push('Name');}
  if(data.description&&!form.elements.description.value){form.elements.description.value=data.description.slice(0,2000);filled.push('Beschreibung');}
  if(data.imageUrl&&!form.elements.imageUrl.value){form.elements.imageUrl.value=data.imageUrl;filled.push('Bild-URL');}
  if(data.price!==null&&!form.elements.price.value&&(!data.currency||data.currency.toUpperCase()==='EUR')){form.elements.price.value=String(data.price).replace('.',',');filled.push('Preis (unbestätigter Seitenwert)');}
  if(data.canonical)form.elements.sourceUrl.value=data.canonical;
  form.elements.importStatus.value=filled.length?'Metadaten aus zugänglicher Seite übernommen – noch zu prüfen':'Seite erreichbar, aber keine verwertbaren Produktmetadaten gefunden';
  const msg=filled.length?`Abruf erfolgreich. Übernommen: ${filled.join(', ')}. Angaben sind noch nicht unabhängig verifiziert.`:'Die Seite war erreichbar, enthielt aber keine verwertbaren Produktmetadaten.';
  if(result)result.insertAdjacentHTML('beforeend',`<p class="import-success">${esc(msg)}</p>`);
  toast(filled.length?'Produktmetadaten übernommen.':'Keine Produktdaten gefunden.');
 }catch(error){
  const reason=error.name==='AbortError'?'Zeitüberschreitung beim Abruf.':'Browserzugriff blockiert oder fehlgeschlagen (häufig CORS, Login- oder Bot-Schutz).';
  if(result)result.insertAdjacentHTML('beforeend',`<p class="import-error">${esc(reason)} Screenshot-Import oder manuelle Ergänzung verwenden.</p>`);
  toast('Automatischer Abruf nicht möglich.');
 }finally{if(button){button.disabled=false;button.textContent='Erneut versuchen';}$('#metadataProgress')?.remove();}
}
async function saveProduct(event){
 event.preventDefault();
 const form=event.currentTarget, data=new FormData(form);
 const id=String(data.get('id')||'').trim(), name=String(data.get('name')||'').trim();
 if(!name){toast('Bitte einen Produktnamen eingeben.');return;}
 const rawPrice=String(data.get('price')||'').trim().replace(',','.');
 let price=null;
 if(rawPrice){price=Number(rawPrice);if(!Number.isFinite(price)||price<0){toast('Bitte einen gültigen Preis eingeben.');return;}}
 const existing=id?state.products.find(x=>x.id===id):null;
 let imageDataUrl=existing?.imageDataUrl||'';
 const imageFile=form.elements.productImage.files?.[0];
 if(imageFile){if(!imageFile.type.startsWith('image/')||imageFile.size>5*1024*1024){toast('Bild muss ein Bildformat sein und darf höchstens 5 MB groß sein.');return;}imageDataUrl=await readFileAsDataUrl(imageFile);}
 if(pendingScreenshotDataUrl)imageDataUrl=pendingScreenshotDataUrl;
 const p={
  ...(existing||{}),id:id||crypto.randomUUID(),workspaceId:state.workspaceId,name,
  merchant:String(data.get('merchant')||'').trim(),url:String(data.get('url')||'').trim(),
  sourceUrl:String(data.get('sourceUrl')||'').trim(),price,
  description:String(data.get('description')||'').trim(),
  imageUrl:String(data.get('imageUrl')||'').trim(),imageDataUrl,
  screenshotDataUrls:pendingScreenshotImages.length?pendingScreenshotImages.map(x=>x.dataUrl):(existing?.screenshotDataUrls||[]),
  importPlatform:String(data.get('importPlatform')||existing?.importPlatform||'').trim(),
  importProductId:String(data.get('importProductId')||existing?.importProductId||'').trim(),
  importStatus:String(data.get('importStatus')||existing?.importStatus||'').trim(),
  priceVerified:existing?.price===price?Boolean(existing.priceVerified):false,
  sourceCheckedAt:existing?.sourceUrl===String(data.get('sourceUrl')||'').trim()?existing.sourceCheckedAt:null,
  status:existing?.status||'Neu',createdAt:existing?.createdAt||new Date().toISOString(),
  updatedAt:new Date().toISOString()
 };
 if(existing){state.products=state.products.map(x=>x.id===id?p:x);await db.put('products',p);log('Produkt bearbeitet',p.name);}
 else{state.products.push(p);await db.put('products',p);log('Produkt erfasst',p.name);}
 state.selectedProductId=p.id;pendingScreenshotDataUrl='';clearScreenshotImport();hideProductForm();renderPage();toast(existing?'Produkt aktualisiert.':'Produkt lokal gespeichert.');
}
async function runLocalProductAnalysis(id){
 const p=state.products.find(x=>x.id===id && x.workspaceId===state.workspaceId);if(!p)return;
 const analysis=analyzeProductLocally(p);
 p.analysis={
  ...analysis,createdAt:new Date().toISOString()
 };
 p.status='Analyse abgeschlossen';p.updatedAt=new Date().toISOString();
 await db.put('products',p);log('Lokale Produktanalyse abgeschlossen',`${p.name} · Datenvollständigkeit ${analysis.score}/100`);
 state.selectedProductId=p.id;renderPage();toast('Lokale Basisanalyse abgeschlossen.');
}
async function handleProductAction(action,id){
 const p=state.products.find(x=>x.id===id);if(!p)return;
 if(action==='details'){state.selectedProductId=id;renderPage();$('#productDetail')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(action==='edit'){showProductForm(id);return;}
 if(action==='delete'){
  const ok=confirm(`Produkt „${p.name}“ wirklich löschen? Zugehörige Content-Entwürfe werden nicht gelöscht.`);
  if(!ok)return;
  state.products=state.products.filter(x=>x.id!==id);
  await db.delete('products',id);
  if(state.selectedProductId===id)state.selectedProductId=null;
  log('Produkt gelöscht',p.name);renderPage();toast('Produkt gelöscht.');
 }
}
async function updateProductStatus(id,status){
 const p=state.products.find(x=>x.id===id && x.workspaceId===state.workspaceId);if(!p)return;
 p.status=status;p.updatedAt=new Date().toISOString();await db.put('products',p);
 log('Produktstatus geändert',`${p.name}: ${status}`);renderPage();toast(`Status: ${status}`);
}
async function createContentFromProduct(id){
 const p=state.products.find(x=>x.id===id && x.workspaceId===state.workspaceId);if(!p)return;
 const post={id:crypto.randomUUID(),workspaceId:state.workspaceId,productId:p.id,title:p.name,channel:'TikTok',strategy:'BOFU',status:'Entwurf',hooks:p.analysis?.hooks||[],angles:p.analysis?.angles||[],createdAt:new Date().toISOString()};
 state.posts.push(post);await db.put('posts',post);
 p.status='Content geplant';p.updatedAt=new Date().toISOString();await db.put('products',p);
 log('Content-Projekt aus Produkt erstellt',p.name);state.selectedPostId=post.id;
 go('content');toast('Content-Entwurf mit Produktverknüpfung erstellt.');
}
async function addPost(){
 const title=prompt('Titel des Content-Entwurfs:'); if(!title?.trim()) return;
 const channel=prompt('Kanal (z. B. TikTok, YouTube, Pinterest):')||'TikTok';
 const strategy=prompt('Strategie (BOFU, Viral, Problem-Lösung, Vergleich):')||'BOFU';
 const p={id:crypto.randomUUID(),workspaceId:state.workspaceId,title:title.trim(),channel,strategy,status:'Entwurf',createdAt:new Date().toISOString()};
 state.posts.push(p); await db.put('posts',p); log('Content-Entwurf angelegt',p.title); renderPage(); toast('Entwurf lokal gespeichert.');
}
async function addWorkspace(){
 const name=prompt('Name des neuen Arbeitsbereichs:'); if(!name?.trim()) return;
 const w={id:crypto.randomUUID(),name:name.trim(),description:'Eigener Geschäftsbereich',createdAt:new Date().toISOString()};
 state.workspaces.push(w); await db.put('workspaces',w); state.workspaceId=w.id; renderWorkspaceSelect(); renderPage(); log('Arbeitsbereich erstellt',w.name); toast('Arbeitsbereich erstellt.');
}
function renderWorkspaceSelect(){
 const s=$('#workspaceSelect'); s.innerHTML=state.workspaces.map(w=>`<option value="${w.id}" ${w.id===state.workspaceId?'selected':''}>${esc(w.name)}</option>`).join('');
 s.insertAdjacentHTML('beforeend','<option value="__new">＋ Arbeitsbereich erstellen</option>');
}
async function init(){
 await db.init();
 for(const store of ['workspaces','products','posts','activities']) state[store]=await db.all(store);
 if(!state.workspaces.length){const w={id:crypto.randomUUID(),name:'Affiliate Business',description:'Affiliate, Content und Monetarisierung',createdAt:new Date().toISOString()};state.workspaces=[w];await db.put('workspaces',w);}
 state.workspaceId=state.workspaces[0].id;
 renderWorkspaceSelect(); renderNav(); renderPage();
 $('#workspaceSelect').addEventListener('change',e=>{if(e.target.value==='__new'){addWorkspace();return;}state.workspaceId=e.target.value;renderPage();});
 $('#quickAdd').addEventListener('click',()=>{const choice=prompt('Was möchtest du anlegen?\\n1 = Produkt\\n2 = Content-Entwurf\\n3 = Arbeitsbereich'); if(choice==='1')addProduct();else if(choice==='2')addPost();else if(choice==='3')addWorkspace();});
 $('#settingsShortcut').addEventListener('click',()=>go('settings'));
 $('#mobileMenu').addEventListener('click',()=>$('#sideNav').classList.toggle('open'));
 if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
}
init().catch(err=>{console.error(err);$('#page').innerHTML='<div class="notice"><strong>Startfehler</strong><span>Die lokale Datenbank konnte nicht initialisiert werden. Bitte Browser-Speicher prüfen und Seite neu laden.</span></div>';});