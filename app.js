import { db } from './db.js';
import { calculateFinancePolicy } from './finance-policy.js';
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

let state = { workspaceId: null, workspaces: [], products: [], posts: [], activities: [], agentTasks: [], financeTransactions: [], settings: [], selectedProductId: null, selectedPostId: null, productSearch: '' };

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
  $('#mobileNav').innerHTML = navMarkup([sections[0],sections[1],sections[2],sections[6],sections[5],sections[11]]);
  document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.nav)));
}
function go(id){active=id;renderNav();renderPage();$('.sidebar')?.classList.remove('open');document.body.classList.remove('menu-open');$('#mobileMenu')?.setAttribute('aria-expanded','false');$('#mobileMenu')?.setAttribute('aria-label','Menü öffnen');}
function header(title,sub){$('#pageTitle').textContent=title;$('#sectionEyebrow').textContent=sub;}
function card(label,value,meta,icon='•'){return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><strong>${value}</strong><small>${meta}</small></article>`;}
function empty(title,desc,action=''){return `<div class="empty-state"><div class="empty-icon">◇</div><h3>${title}</h3><p>${desc}</p>${action}</div>`;}
function overview(){
 const products=scoped(state.products), posts=scoped(state.posts), activities=scoped(state.activities);
 const finance=financeTotals();
 const confirmed=finance.profit, fund=finance.maxNewGrowthSpend;
 header('Übersicht','UNTERNEHMENSSTEUERUNG');
 return `<div class="welcome-row"><div><h2>Guten Tag.</h2><p>Hier laufen deine Geschäftsbereiche und Produktionsprozesse zusammen.</p></div><span class="status-tag">● Lokale Datenhaltung aktiv</span></div>
 <div class="metric-grid">${card('Produkte',products.length,'im aktuellen Arbeitsbereich','◇')}${card('Content-Entwürfe',posts.length,'gespeicherte Beiträge','▤')}${card('Bestätigter Gewinn',money(confirmed),'noch keine Finanzdaten erfasst','€')}${card('KI-Budget',money(fund),'2 % bestätigter Auszahlungen','✦')}</div>
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
     <label>Produktbilder / Referenzen (bis zu 8)<input name="productImage" type="file" accept="image/*" multiple></label><p class="form-hint">Bis zu 8 Ansichten auswählen: Gesamtansicht, Details, Rückseite, Etikett usw. Neue Bilder werden zu den vorhandenen Referenzen ergänzt.</p>
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
   <div class="panel-head"><div><h3>KI-generierte UGC-Slides</h3><p>Drei authentische 8:9-iPhone-Slides mit Swipe-Dramaturgie generieren.</p></div><span class="status-tag">FLUX KI · iPhone-12-Look</span></div>
   <p class="form-hint">Standard ist FLUX: Aus deinen Produktreferenzen entstehen drei unterschiedliche 8:9-Lifestyle-Szenen. Northstar setzt Hook und BOFU-Text separat darüber. Prüfe vor Freigabe, ob das generierte Produkt exakt dem Original entspricht. Der Originalfoto-Modus bleibt als kostenlose Alternative verfügbar.</p>
   <div class="media-connection-grid"><label>Cloudflare-Worker-Endpunkt<input id="mediaEndpoint" type="url" placeholder="https://northstar-image-generator.kibruder.workers.dev/api/generate-image"></label><label>Worker-Zugriffstoken<input id="mediaToken" type="password" autocomplete="off" placeholder="Zugriffstoken"></label></div>
   <div class="detail-actions"><button class="button button-primary" id="generateSlideImages" data-id="${post.id}">✦ 3 KI-Szenen mit FLUX generieren</button><button class="button button-secondary" id="generateOriginalSlides" data-id="${post.id}">Originalfotos + BOFU-Text (ohne KI)</button></div>
   <div class="form-hint"><strong>Originalfoto-Modus:</strong> Kein KI-Repainting, keine neue Produktdarstellung. Northstar verwendet deine gespeicherten Produktfotos, beschneidet sie für 8:9 und setzt nur den BOFU-Text als Overlay darüber. Das ist die sichere Standardvariante für Produkt-Treue.</div>
   <div class="detail-actions"><button class="button button-secondary" id="saveMediaSettings">FLUX-Verbindung speichern</button></div>
   <div id="mediaGenerationStatus" class="form-hint" aria-live="polite">${draft.generatedSlides?.length||0} von 3 Slides gespeichert. FLUX benötigt eine gespeicherte Worker-Verbindung und kann Credits verbrauchen. Originalfoto-Modus bleibt kostenlos verfügbar.</div>
   ${generatedSlidesMarkup(draft)}
  </section>
  <div class="detail-actions"><button class="button button-secondary" id="copyContentDraft">Gesamtes Produktionspaket kopieren</button><button class="button button-primary" id="regenerateContentDraft" data-id="${post.id}">Paket neu erstellen</button></div>
  `:`<div class="empty-state compact"><h3>Noch kein Produktionspaket</h3><p>Erstelle aus dem Produkt einen BOFU-Beitrag mit drei Slides, Voiceover, Szenenplan, Bildprompts, Caption und Hashtags.</p><button class="button button-primary" id="generateContentDraft" data-id="${post.id}">✦ BOFU-Produktionspaket erstellen</button></div>`}
 </section>`;
}
function generatedSlidesMarkup(draft){
 const slides=draft.generatedSlides||[];
 if(!slides.length)return '';
 return '<div class="detail-actions"><button class="button button-primary" id="saveAllSlidesToPhotos" type="button">Alle 3 Bilder in Fotos sichern</button></div><p class="form-hint">Auf dem iPhone im Teilen-Menü „Bild sichern“ auswählen. Northstar kann nicht ohne Bestätigung direkt auf deine Fotos zugreifen.</p><div class="generated-slide-grid">'+slides.map((item,i)=>'<article class="generated-slide-card"><img src="'+item.dataUrl+'" alt="Generierter Slide '+(i+1)+'"><strong>Slide '+(i+1)+'</strong><button class="button button-secondary" type="button" data-save-slide="'+i+'">In Fotos sichern</button><a class="button button-secondary" href="'+item.dataUrl+'" download="northstar-slide-'+(i+1)+'.png">Datei laden</a></article>').join('')+'</div>';
}
function dataUrlToImageFile(dataUrl,index){
 const match=String(dataUrl||'').match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
 if(!match)throw new Error('Bilddatei ist ungültig.');
 const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new File([bytes],'northstar-slide-'+(index+1)+'.png',{type:match[1]});
}
async function shareGeneratedSlides(postId,index=null){
 const post=state.posts.find(x=>x.id===postId&&x.workspaceId===state.workspaceId);
 const slides=post?.draft?.generatedSlides||[];
 const chosen=index===null?slides.map((item,i)=>({item,i})):slides[index]?[{item:slides[index],i:index}]:[];
 if(!chosen.length){toast('Keine generierten Bilder vorhanden.');return;}
 try{
  const files=chosen.map(({item,i})=>dataUrlToImageFile(item.dataUrl,i));
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files}))){
   await navigator.share({files,title:chosen.length===1?'Northstar Slide':'Northstar BOFU Slides'});
   toast('Teilen-Menü geöffnet. Wähle „Bild sichern“, um die Bilder in Fotos abzulegen.');
  }else{
   for(const file of files){const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();URL.revokeObjectURL(url);}
   toast('Bilddatei(en) heruntergeladen. Auf dem iPhone über Teilen > Bild sichern ablegen.');
  }
 }catch(error){if(error.name!=='AbortError')toast('Teilen nicht möglich: '+(error.message||'Bitte Datei laden verwenden.'));}
}
function normalizeMediaEndpoint(value){
 const raw=String(value||'').trim().replace(/\/+$/,'');
 if(!raw)return '';
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:')return '';
  if(!/\/api\/generate-image$/i.test(url.pathname))url.pathname=url.pathname.replace(/\/$/,'')+'/api/generate-image';
  return url.toString().replace(/\/$/,'');
 }catch{return '';}
}
function saveMediaSettings(){
 const endpoint=normalizeMediaEndpoint($('#mediaEndpoint')?.value||''),token=$('#mediaToken')?.value.trim()||'';
 if(!endpoint||!token){toast('Bitte eine gültige HTTPS-Worker-Adresse und das Zugriffstoken eintragen.');return;}
 localStorage.setItem('northstar_media_endpoint',endpoint);
 if($('#mediaEndpoint'))$('#mediaEndpoint').value=endpoint;
 localStorage.setItem('northstar_media_token',token);
 toast('Generator-Verbindung lokal gespeichert.');
}
function prepareFluxReferenceImage(dataUrl){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{
   const maxEdge=1024,scale=Math.min(1,maxEdge/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
   const width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d');if(!ctx){reject(new Error('Canvas für Referenzbild nicht verfügbar.'));return;}
   ctx.drawImage(img,0,0,width,height);
   resolve(canvas.toDataURL('image/jpeg',0.9));
  };img.onerror=()=>reject(new Error('Produkt-Referenzbild konnte nicht verkleinert werden.'));img.src=dataUrl;
 });
}
async function requestProductAIAnalysis(product,referenceSources=null){
 const endpoint=normalizeMediaEndpoint(localStorage.getItem('northstar_media_endpoint')||'');
 const token=String(localStorage.getItem('northstar_media_token')||'').trim();
 if(!endpoint||!token)throw new Error('Für die Produkt-KI fehlt die Cloudflare-Worker-Verbindung.');
 const sources=(referenceSources||[
  ...(Array.isArray(product?.referenceImagesDataUrls)?product.referenceImagesDataUrls:[]),
  product?.imageDataUrl,...(product?.screenshotDataUrls||[])
 ]).filter((x,i,all)=>typeof x==='string'&&x.startsWith('data:image/')&&all.indexOf(x)===i).slice(0,3);
 if(!sources.length)throw new Error('Die Produkt-KI benötigt mindestens ein hochgeladenes Produktbild.');
 const images=await Promise.all(sources.map(prepareFluxReferenceImage));
 const analyzeUrl=endpoint.replace(/\/api\/generate-image$/i,'/api/analyze-product');
 const response=await fetch(analyzeUrl,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({
  product:{name:String(product?.name||''),description:String(product?.description||''),merchant:String(product?.merchant||'')},
  images
 })});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error||'Produkt-KI fehlgeschlagen ('+response.status+').');
 if(!payload.analysis||!Array.isArray(payload.analysis.slideScenes)||payload.analysis.slideScenes.length<3)throw new Error('Die Produkt-KI lieferte keinen vollständigen Drei-Slide-Plan.');
 product.aiCreative={...payload.analysis,model:payload.model||'Cloudflare Workers AI vision + language',analyzedAt:new Date().toISOString(),referenceCount:images.length};
 product.analysis={...(product.analysis||{}),type:'cloudflare-vision-ai',summary:payload.analysis.summary||'Produkt mit KI-Bildanalyse ausgewertet.',createdAt:new Date().toISOString(),angles:payload.analysis.slideScenes};
 await db.put('products',product);
 return product.aiCreative;
}
function buildProductCreative(product){
 const ai=product?.aiCreative||{};
 const name=String(ai.productName||product?.name||'dieses Produkt').trim();
 const facts=String(ai.visibleFeatures||product?.description||'').trim().slice(0,700);
 const scenes=Array.isArray(ai.slideScenes)&&ai.slideScenes.length>=3?ai.slideScenes.slice(0,3):[
  'Authentisches Smartphone-Foto: Das exakte Originalprodukt ist sofort groß und klar erkennbar, in einer plausiblen Alltagssituation passend zu seiner tatsächlichen Verwendung.',
  'Produktdetail-Aufnahme des exakten Originalprodukts. Zeige die wichtigsten tatsächlich sichtbaren Merkmale und die reale Bauform aus den Referenzbildern.',
  'Natürliches UGC-Abschlussmotiv mit demselben Originalprodukt im passenden Nutzungskontext. Produkt bleibt vollständig und unverdeckt sichtbar.'
 ];
 const hooks=Array.isArray(ai.hooks)&&ai.hooks.length>=3?ai.hooks.slice(0,3):[
  'Das solltest du vor dem Kauf wissen',
  'Schau dir diese Produktdetails an',
  'Wäre das für deinen Alltag interessant?'
 ];
 return {
  name,category:String(ai.category||'KI-erkanntes Produkt'),hook:String(hooks[0]),benefit:String(hooks[1]),
  bridge:String(hooks[1]),question:String(hooks[2]),scenes,
  facts,visibleCue:String(ai.visibleIdentity||'exakte sichtbare Produktform, Farben, Materialien, Komponenten und Markenmerkmale aus den Originalreferenzen'),
  cta:'Link öffnen und Details prüfen',aiSummary:String(ai.summary||'')
 };
}
function composeGeneratedSlide(dataUrl,slide,index,product,verifiedPrice,creative){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1152;
   const ctx=canvas.getContext('2d');if(!ctx){reject(new Error('Canvas nicht verfügbar.'));return;}
   const ratio=8/9,source=img.width/img.height;let sx=0,sy=0,sw=img.width,sh=img.height;
   if(source>ratio){sw=Math.round(img.height*ratio);sx=Math.round((img.width-sw)/2);}
   else{sh=Math.round(img.width/ratio);sy=Math.round((img.height-sh)/2);}
   ctx.drawImage(img,sx,sy,sw,sh,0,0,1024,1152);
   const headline=[creative.hook,creative.benefit,creative.question][index];
    const priceLine=verifiedPrice!==null?'Preis: '+money(verifiedPrice):'Preis beim Händler prüfen';
    const body=['Wisch weiter – das Detail kommt jetzt',creative.facts||'Nur sichtbare Produktdetails bewerten',priceLine+' · '+creative.cta][index];
    const drawText=(text,x,y,font)=>{
    ctx.save();ctx.font=font;ctx.textAlign='center';ctx.textBaseline='alphabetic';
    ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=1;ctx.shadowOffsetX=3;ctx.shadowOffsetY=3;ctx.lineJoin='round';ctx.strokeStyle='rgba(0,0,0,.98)';ctx.lineWidth=7;ctx.strokeText(text,x,y);
    ctx.fillStyle='#fff';ctx.fillText(text,x,y);ctx.restore();
   };
   const wrap=(text,maxWidth,font,maxLines)=>{
    ctx.font=font;const words=String(text||'').replace(/\s+/g,' ').trim().split(' ');const lines=[];let line='';
    for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);
    if(lines.length>maxLines){lines.length=maxLines;let last=lines[maxLines-1];while(last&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);lines[maxLines-1]=last.trim()+'…';}
    return lines;
   };
   // Minimal white Snapchat-style copy; no cards, stickers or decorative badges.
   const headlineFont='800 52px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
   const bodyFont='700 34px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
   const headlineLines=wrap(headline,900,headlineFont,2);
   let y=545;
   headlineLines.forEach(line=>{drawText(line,512,y,headlineFont);y+=57;});
   const bodyLines=wrap(body,900,bodyFont,2);y+=14;
   bodyLines.forEach(line=>{drawText(line,512,y,bodyFont);y+=40;});
      resolve(canvas.toDataURL('image/png'));
  };img.onerror=()=>reject(new Error('KI-Bild konnte nicht verarbeitet werden.'));img.src=dataUrl;
 });
}
async function generateOriginalPhotoSlides(postId){
 const post=state.posts.find(x=>x.id===postId&&x.workspaceId===state.workspaceId);
 const product=post&&state.products.find(x=>x.id===post.productId&&x.workspaceId===state.workspaceId);
 if(!post?.draft||!product){toast('Zuerst ein BOFU-Produktionspaket erstellen.');return;}

 const referenceSources=[...(Array.isArray(product.referenceImagesDataUrls)?product.referenceImagesDataUrls:[]),product.imageDataUrl,...(product.screenshotDataUrls||[])].filter((x,i,all)=>typeof x==='string'&&x.startsWith('data:image/')&&all.indexOf(x)===i).slice(0,8);
 if(!referenceSources.length){toast('Kein gespeichertes Produktfoto gefunden. Bitte zuerst Produktbilder hochladen.');return;}
 const button=$('#generateOriginalSlides'),status=$('#mediaGenerationStatus');
 if(button){button.disabled=true;button.textContent='Original-Slides werden erstellt …';}
 const verifiedPrice=product.price!==null&&product.price!==undefined&&product.price!==''&&Boolean(product.priceVerified);
 const creative=buildProductCreative(product);
 post.draft.generatedSlides=post.draft.generatedSlides||[];
 try{
  for(let i=0;i<3;i++){
   if(status)status.textContent='Original-Slide '+(i+1)+' von 3 wird ohne KI-Repainting aufgebaut …';
   const selectedIndex=Math.min(i,referenceSources.length-1);
   const source=referenceSources[selectedIndex];
   const slide=post.draft.slides[i]||{};
   const finalImage=await composeGeneratedSlide(source,slide,i,product,verifiedPrice?Number(product.price):null,creative);
   post.draft.generatedSlides[i]={dataUrl:finalImage,createdAt:new Date().toISOString(),model:'Originalfoto + Textoverlay (kein KI-Repainting)',aspectRatio:'8:9',sourceReferenceIndex:selectedIndex,referenceCount:referenceSources.length,identityMode:'original-photo'};
   await db.put('posts',post);
  }
  post.draft.productionStatus='Drei BOFU-Slides aus Originalproduktfotos erstellt. Kein KI-Repainting; nur Zuschnitt auf 8:9 und Textoverlay. Produktdetails visuell prüfen, da Bildausschnitt und Overlay das Motiv beeinflussen können.';
  post.status='Originalfoto-Slides erstellt – Freigabe offen';post.updatedAt=new Date().toISOString();
  await db.put('posts',post);log('Drei Originalfoto-BOFU-Slides erstellt',post.title);
  state.selectedPostId=post.id;renderPage();toast('Drei Originalfoto-Slides ohne KI-Repainting gespeichert.');
 }catch(error){if(status)status.textContent='Abbruch: '+error.message;toast('Originalfoto-Slides fehlgeschlagen: '+error.message);}
 finally{const current=$('#generateOriginalSlides');if(current){current.disabled=false;current.textContent='Originalfotos + BOFU-Text erstellen';}}
}
async function generateSlideImages(postId){
 const post=state.posts.find(x=>x.id===postId&&x.workspaceId===state.workspaceId);
 const product=post&&state.products.find(x=>x.id===post.productId&&x.workspaceId===state.workspaceId);
 if(!post?.draft||!product){toast('Zuerst ein BOFU-Produktionspaket erstellen.');return;}
 const endpoint=normalizeMediaEndpoint(localStorage.getItem('northstar_media_endpoint')||'');
 const token=String(localStorage.getItem('northstar_media_token')||'').trim();
 if(!endpoint||!token){toast('Die gespeicherte Cloudflare-Worker-Verbindung fehlt. Bitte Verbindung in den Einstellungen erneut hinterlegen.');return;}
 const referenceSources=[...(Array.isArray(product.referenceImagesDataUrls)?product.referenceImagesDataUrls:[]),product.imageDataUrl,...(product.screenshotDataUrls||[])].filter((x,i,all)=>typeof x==='string'&&x.startsWith('data:image/')&&all.indexOf(x)===i).slice(0,8);
 if(!referenceSources.length){toast('Kein gespeichertes Produktfoto gefunden.');return;}
 const button=$('#generateSlideImages'),status=$('#mediaGenerationStatus');
 if(button){button.disabled=true;button.textContent='KI generiert Slides …';}
 post.draft.generatedSlides=post.draft.generatedSlides||[];
 const verifiedPrice=product.price!==null&&product.price!==undefined&&product.price!==''&&Boolean(product.priceVerified);
 try{
  if(!product.aiCreative?.analyzedAt||!Array.isArray(product.aiCreative.slideScenes)||product.aiCreative.slideScenes.length<3)await requestProductAIAnalysis(product,referenceSources);
  const creative=buildProductCreative(product);
  const productReferences=await Promise.all(referenceSources.slice(0,3).map(prepareFluxReferenceImage));
  for(let i=0;i<3;i++){
   if(status)status.textContent='KI-Bild '+(i+1)+' von 3 wird generiert – Originalreferenz wird einzeln geschützt …';
   const slide=post.draft.slides[i]||{};
   const selectedIndex=0; // The vision model and FLUX receive up to three views of the same product.
   const base='Create an authentic photorealistic iPhone 12 UGC product photograph for a TikTok carousel, vertical 8:9. The reference images show the exact product and are the only visual source of truth. First identify the physical product from the images, then preserve its exact silhouette, dimensions, colors, materials, construction, labels, logos, controls, included parts and all visible details. Do not redesign, substitute, stylize, merge variants, add fictional features or change brand marks. The product itself must be the clear hero and remain prominently visible, sharp, unobstructed and large enough to recognize. The environment, person, camera angle and props must be chosen to suit THIS product and its real use; never force a generic portrait or unrelated lifestyle scene. If the product is clothing, show the garment; if it is a device, show the device; if it is furniture, show the furniture; if it is food, show the food; if it is a tool, show the tool. This is guidance, not a hard-coded category list: infer the actual category from the reference images. Prefer a product-only composition whenever a lifestyle scene risks hiding or altering the item. Do not reproduce shopping UI, screenshot borders, black bars, price panels or promotional graphics. No added text, no graphic elements, no watermark. Product: '+creative.name+'. AI-identified category: '+creative.category+'. AI-identified visible identity: '+creative.visibleCue+'. Only evidence-backed details: '+(creative.facts||'No verified technical specifications; do not invent claims.')+'. '+(creative.aiSummary||'')+' ';
   const directions=[
     'SLIDE 1 / HOOK: '+creative.scenes[0]+' Product must match the reference exactly, not approximately. Do not invent product details.',
     'SLIDE 2 / PRODUCT DETAIL: '+creative.scenes[1]+' Product must match the reference exactly. Prioritize a faithful, clear product view over a dramatic composition.',
     'SLIDE 3 / CTA LIFESTYLE: '+creative.scenes[2]+' Product must be the same exact item as slide 1 and slide 2. New setting is allowed; product redesign is forbidden.'
    ];
   // The image model may change the scene, but the reference product identity must remain exact.
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({prompt:base+directions[i],images:productReferences})});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(payload.error||'Generator-Fehler ('+response.status+')');
   if(!payload.imageDataUrl)throw new Error('Worker hat keine Bilddatei zurückgegeben.');
   const finalImage=await composeGeneratedSlide(payload.imageDataUrl,slide,i,product,verifiedPrice?Number(product.price):null,creative);
   post.draft.generatedSlides[i]={dataUrl:finalImage,createdAt:new Date().toISOString(),model:payload.model||'@cf/black-forest-labs/flux-2-klein-4b',aspectRatio:'8:9',sourceReferenceIndex:selectedIndex,referenceCount:productReferences.length};
   await db.put('posts',post);
  }
  post.draft.productionStatus='Drei neu generierte 8:9-UGC-Szenen erstellt. Die universelle Produkt-KI analysiert bis zu drei Referenzbilder und steuert Kategorie, Motive und Drei-Slide-Dramaturgie. Bilddetails vor Veröffentlichung visuell gegen das Original prüfen.';
  post.status='KI-Slides erstellt – Freigabe offen';post.updatedAt=new Date().toISOString();
  await db.put('posts',post);log('Drei KI-UGC-Slides generiert',post.title);
  state.selectedPostId=post.id;renderPage();toast('Drei KI-Slides mit produktbezogenen Texten gespeichert.');
 }catch(error){if(status)status.textContent='Abbruch: '+error.message;toast('Bildgenerierung fehlgeschlagen: '+error.message);}
 finally{const current=$('#generateSlideImages');if(current){current.disabled=false;current.textContent='✦ 3 KI-Slides generieren';}}
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
 const hasProductImages=[...(Array.isArray(product.referenceImagesDataUrls)?product.referenceImagesDataUrls:[]),product.imageDataUrl,...(product.screenshotDataUrls||[])].some(x=>typeof x==='string'&&x.startsWith('data:image/'));
 let productAIWarning='';
 if(hasProductImages&&(!product.aiCreative?.analyzedAt||!Array.isArray(product.aiCreative.slideScenes)||product.aiCreative.slideScenes.length<3)){
  const progress=$('#contentDetail');if(progress)progress.insertAdjacentHTML('afterbegin','<p id="productAIProgress" class="import-progress">Produkt-KI analysiert Bilder, Produktart und passende Verkaufswinkel …</p>');
  try{await requestProductAIAnalysis(product);}
  catch(error){productAIWarning=String(error?.message||'Produkt-KI derzeit nicht erreichbar.');}
  finally{$('#productAIProgress')?.remove();}
 }
 const panel=$('#contentDetail');
 if(panel){panel.insertAdjacentHTML('afterbegin',`<div class="generation-progress" id="generationProgress"><strong>BOFU-Produktionspaket wird erstellt</strong><div class="progress-track"><span id="generationBar" style="width:8%"></span></div><ol><li id="genStep1">Produktdaten und Beleglage prüfen</li><li id="genStep2">Drei-Slide-Dramaturgie aufbauen</li><li id="genStep3">Voiceover, Szenen und Medienprompts erstellen</li><li id="genStep4">Paket lokal speichern</li></ol></div>`);}
 const setStep=(n,width)=>{const bar=$('#generationBar');if(bar)bar.style.width=width+'%';const step=$(`#genStep${n}`);if(step)step.classList.add('step-done');};
 setStep(1,22);await new Promise(r=>setTimeout(r,100));
 const name=String(product.name||'Produkt').trim();
 const rawDescription=String(product.description||'').trim();
 const noisy=/(?:\\b5g\\b|\\b4g\\b|\\blte\\b|\\d{1,2}:\\d{2}|©|[<>]{1,}|\\b\\d{1,2}%\\b|kostenloser versand|lieferung bis|verlängerte rückgabe)/i.test(rawDescription)||rawDescription.length>900;
 const verifiedDescription=!noisy&&rawDescription.length>15?rawDescription:'';
 const priceVerified=product.price!==null&&product.price!==undefined&&product.price!==''&&(Boolean(product.priceVerified)||String(product.priceStatus||'').toLowerCase()==='verified');
 const seller=String(product.merchant||'').trim();
 const source=String(product.sourceUrl||'').trim();
 const facts=verifiedDescription||'Produktmerkmale sind noch nicht ausreichend verifiziert. Vor der Veröffentlichung die tatsächlichen Eigenschaften direkt auf der Produktseite prüfen.';
 const priceText=priceVerified?`Preis laut geprüftem Datensatz: ${product.price} €.`:'Keinen Preis nennen: Preis fehlt oder ist nicht als verifiziert markiert.';
 const sourceText=source?'Quellenlink ist hinterlegt, aber nicht automatisch unabhängig geprüft.':'Noch keine Produktquelle hinterlegt.';
 const title=name.replace(/[.!?]+$/,'');
 const creative=buildProductCreative(product);
 const slides=[
  {role:'1 · Hook / Scroll-Stopper',headline:creative.hook,body:'Wisch weiter – im nächsten Bild siehst du die relevanten Produktdetails.',visualNote:creative.scenes[0],imagePrompt:'Strict image-to-image reference edit. Preserve the exact product identity, construction, colors, logos, dimensions and visible details. Candid iPhone 12 photo, 8:9, no text, no invented parts.'},
  {role:'2 · Produkt / Nutzen',headline:creative.benefit,body:creative.facts||creative.bridge+' '+(verifiedDescription?facts:'Keine technischen Eigenschaften als gesichert darstellen; sichtbare Details und Lieferumfang prüfen.'),visualNote:creative.scenes[1],imagePrompt:'Strict image-to-image reference edit. Show the exact product in a plausible everyday context without changing its physical details or inventing features.'},
  {role:'3 · BOFU / Kommentar-CTA',headline:creative.question,body:priceText+' '+sourceText+' '+creative.cta,visualNote:creative.scenes[2],imagePrompt:'Strict image-to-image reference edit. Keep exact product unchanged, authentic smartphone photo, clean space for short CTA. No fabricated price, discount or specifications.'}
 ];
 setStep(2,48);await new Promise(r=>setTimeout(r,100));
 const videoScript=`Du überlegst, dir ${title} zu holen? Schau dir zuerst die Details an. ${verifiedDescription?facts:'Prüfe die tatsächlichen Eigenschaften und den Lieferumfang direkt beim Händler.'} Vergleiche Varianten und aktuelle Konditionen, bevor du entscheidest.`;
 const videoScenes=[
  {time:'0–3 s',visual:creative.scenes[0],overlay:creative.hook},
  {time:'3–10 s',visual:creative.scenes[1],overlay:creative.benefit},
  {time:'10–15 s',visual:creative.scenes[2],overlay:creative.question}
 ];
 const videoPrompt=`Create a 15-second vertical 9:16 German TikTok Shop affiliate video for ${title}. Use the supplied product photo as a strict visual reference: do not alter product shape, branding, color or proportions. Use these AI-selected scenes: ${creative.scenes.join(' | ')}. Style: authentic iPhone UGC, natural light, fast but clear edits, product visible in the first second, clean German on-screen captions, subtle sound design, no fake reviews, no fabricated specifications, no unverified price or discount. Voiceover: ${videoScript}`;
 setStep(3,76);await new Promise(r=>setTimeout(r,100));
 const caption=`${title}: Vor dem Kauf die Details prüfen und mit dem eigenen Bedarf abgleichen. ${seller?'Anbieter: '+seller+'. ':''}${source?'Produktquelle hinterlegt – bitte aktuelle Angaben dort kontrollieren.':'Aktuelle Produktdetails beim Händler prüfen.'}`;
 const hashtags=['#tiktokshop','#produkttipp','#musthave','#shopping','#affiliate'];
 post.draft={strategy:'BOFU',slides,caption,hashtags,videoScript,videoScenes,videoPrompt,createdAt:new Date().toISOString(),sourceType:'northstar-production-brief-v2',productionStatus:productAIWarning?'Lokales BOFU-Paket erstellt. Produkt-KI-Analyse noch offen: '+productAIWarning:'Text, Szenenplan und Medienprompts erstellt. Bild-/Videodateien noch nicht generiert; Faktenprüfung vor Veröffentlichung erforderlich.',evidence:{descriptionVerified:Boolean(verifiedDescription),priceVerified:Boolean(priceVerified),sellerPresent:Boolean(seller),sourcePresent:Boolean(source)},notes:product.analysis?.angles||[]};
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

const agentRoles=[
 ['orchestrator','Haupt-KI / Orchestrierung'],
 ['product','Produkt-Agent'],
 ['research','Recherche-Agent'],
 ['content','Content-Agent'],
 ['media','Media-Agent'],
 ['quality','Qualitäts-Agent'],
 ['analytics','Analyse-Agent'],
 ['finance','Finanz-Agent']
];
function financeConfig(){
 return state.settings.find(x=>x.id==='finance-'+state.workspaceId)||{id:'finance-'+state.workspaceId,workspaceId:state.workspaceId,seedCapital:20,protectedReserve:3};
}
function financeTotals(){
 const rows=state.financeTransactions.filter(x=>x.workspaceId===state.workspaceId);
 return calculateFinancePolicy({transactions:rows,seedCapital:financeConfig().seedCapital,protectedReserve:financeConfig().protectedReserve});
}
function queueAgentTask({title,description='',role='orchestrator',priority='normal',relatedType='',relatedId=''}){
 const task={id:crypto.randomUUID(),workspaceId:state.workspaceId,title,description,role,priority,status:'queued',relatedType,relatedId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),source:'workflow'};
 state.agentTasks.unshift(task);db.put('agentTasks',task);log('Agent-Aufgabe eingereiht',title);return task;
}
function agentsPage(){
 header('KI-Agenten','ORCHESTRIERUNG & AUFGABENSTEUERUNG');
 const tasks=state.agentTasks.filter(x=>x.workspaceId===state.workspaceId);
 const open=tasks.filter(x=>!['done','cancelled'].includes(x.status));
 const running=tasks.filter(x=>x.status==='in_progress');
 return `<div class="page-toolbar"><div><h2>Agenten-Leitstand</h2><p>Aufgaben werden Rollen zugeordnet und durch Freigabe- und Statusschritte geführt.</p></div><span class="status-tag">Orchestrierung v1 · lokal</span></div>
 <div class="metric-grid">${card('Offene Aufgaben',open.length,'Warteschlange','⌘')}${card('In Bearbeitung',running.length,'manuell gestartet','↻')}${card('Abgeschlossen',tasks.filter(x=>x.status==='done').length,'protokolliert','✓')}${card('Agentenrollen',agentRoles.length,'definierte Zuständigkeiten','◎')}</div>
 <section class="panel"><div class="panel-head"><div><h3>Neue Aufgabe</h3><p>Auftrag an eine Agentenrolle geben.</p></div></div>
 <form id="agentTaskForm" class="data-form"><label>Aufgabe *<input name="title" required maxlength="160" placeholder="z. B. Produktdaten und Händlerquelle prüfen"></label><label>Beschreibung<textarea name="description" rows="2" maxlength="1200" placeholder="Erwartetes Ergebnis und Prüfkriterien"></textarea></label><div class="form-grid"><label>Zuständiger Agent<select name="role">${agentRoles.map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('')}</select></label><label>Priorität<select name="priority"><option value="normal">Normal</option><option value="high">Hoch</option><option value="urgent">Dringend</option></select></label></div><button class="button button-primary" type="submit">Aufgabe einreihen</button></form></section>
 <section class="panel"><div class="panel-head"><div><h3>Aufgabenwarteschlange</h3><p>${tasks.length} gespeicherte Aufgaben in diesem Arbeitsbereich.</p></div></div>
 ${tasks.length?`<div class="agent-task-list">${tasks.map(t=>`<article class="agent-task"><div><strong>${esc(t.title)}</strong><p>${esc(t.description||'Keine Zusatzbeschreibung')}</p><small>${esc(agentRoles.find(x=>x[0]===t.role)?.[1]||t.role)} · ${new Date(t.createdAt).toLocaleString('de-DE')} · ${esc(t.priority)}</small></div><div class="agent-task-controls"><span class="status-tag">${esc(t.status)}</span><select data-task-status="${t.id}" aria-label="Aufgabenstatus"><option value="queued" ${t.status==='queued'?'selected':''}>Wartend</option><option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Bearbeitung</option><option value="review" ${t.status==='review'?'selected':''}>Prüfung</option><option value="done" ${t.status==='done'?'selected':''}>Abgeschlossen</option><option value="cancelled" ${t.status==='cancelled'?'selected':''}>Abgebrochen</option></select></div></article>`).join('')}</div>`:empty('Noch keine Aufgaben','Neue Produkte und Content-Projekte können automatisch Aufgaben erzeugen.')}</section>
 <div class="notice"><strong>Transparenter Status</strong><span>Diese Stufe verwaltet Rollen, Aufgaben und Übergaben. Die Rollen sind noch keine autonom laufenden KI-Modelle. Externe Modellaufrufe, Zeitpläne und Hintergrundausführung werden erst mit gesicherter Backend-Orchestrierung aktiviert.</span></div>`;
}
function financePage(){
 header('Finanzen','EINNAHMEN · KOSTEN · KI-FONDS');
 const t=financeTotals(),rows=state.financeTransactions.filter(x=>x.workspaceId===state.workspaceId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 return `<div class="page-toolbar"><div><h2>Finanzleitstand</h2><p>Nur bestätigte Buchungen zählen zu Gewinn und Fonds.</p></div><span class="status-tag">Ledger · lokal</span></div>
 <div class="metric-grid">${card('Bestätigte Einnahmen',money(t.income),'Affiliate-Provisionen usw.','€')}${card('Bestätigte Kosten',money(t.expenses),'erfasste Ausgaben','−')}${card('Nettosaldo',money(t.profit),'Einnahmen minus Kosten','∑')}${card('KI-Fonds',money(t.fund),'tatsächlich gebuchte Beiträge','✦')}</div>
 <section class="panel"><div class="panel-head"><div><h3>2-%-KI-Wachstumsbudget</h3><p>Nur bestätigte, tatsächlich ausgezahlte Affiliate-Provisionen speisen das Budget.</p></div><span class="status-tag">Fix 2 %</span></div><div class="metric-grid"><div class="detail-block"><span>Ausgezahlte Affiliate-Einnahmen</span><strong>${money(t.affiliateRevenue)}</strong></div><div class="detail-block"><span>2-%-Budget gesamt</span><strong>${money(t.growthBudgetTotal)}</strong></div><div class="detail-block"><span>Bereits verwendetes Budget</span><strong>${money(t.growthSpend)}</strong></div><div class="detail-block"><span>Jetzt maximal freigabefähig</span><strong>${money(t.maxNewGrowthSpend)}</strong></div></div><p class="form-hint">Nicht ausgegebenes Budget bleibt rechnerisch erhalten. Seed-Kapital und andere Einnahmen erzeugen kein KI-Wachstumsbudget.</p></section>
 <section class="panel"><div class="panel-head"><div><h3>Liquiditäts- und Ausgabesperre</h3><p>Kein bezahlter Einsatz darf die geschützte Reserve unterschreiten.</p></div></div><div class="form-grid"><label>Einmaliges Startkapital (€)<input id="seedCapital" type="number" min="0" step="0.01" value="${t.seedCapital}"></label><label>Geschützte Mindestreserve (€)<input id="protectedReserve" type="number" min="0" step="0.01" value="${t.protectedReserve}"></label></div><div class="metric-grid"><div class="detail-block"><span>Rechnerischer Kassenbestand</span><strong>${money(t.cashBalance)}</strong></div><div class="detail-block"><span>Nach Reserve frei</span><strong>${money(t.spendableCash)}</strong></div><div class="detail-block"><span>Maximaler neuer KI-Einsatz</span><strong>${money(t.maxNewGrowthSpend)}</strong></div></div><p class="form-hint">${t.reserveProtected?'Reserve ist gedeckt.':'WARNUNG: Der Kassenbestand liegt unter der geschützten Reserve. Bezahlte Ausgaben sind gesperrt.'} Diese Prüfung ist eine lokale Ledger-Kontrolle, keine Bankbestätigung oder echte Zahlungsfreigabe.</p><button class="button button-secondary" id="saveFinancePolicy">Finanzregeln speichern</button></section>
 <section class="panel"><div class="panel-head"><div><h3>Buchung erfassen</h3><p>Einnahmen und Kosten manuell dokumentieren.</p></div></div><form id="financeEntryForm" class="data-form"><div class="form-grid"><label>Typ<select name="type"><option value="income">Einnahme</option><option value="expense">Kosten</option></select></label><label>Betrag in EUR<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00"></label></div><label>Einnahmeart (nur bei Einnahme)<select name="incomeKind"><option value="other">Sonstige Einnahme</option><option value="affiliate_payout">Affiliate-Auszahlung tatsächlich erhalten</option></select></label><label>Kostenart (nur bei Kosten)<select name="costKind"><option value="operating">Betriebskosten</option><option value="growth">KI-/Wachstumsausgaben</option></select></label><label>Quelle / Kategorie<input name="source" required maxlength="120" placeholder="z. B. Amazon PartnerNet Auszahlung"></label><label>Beleg / Referenz (optional)<input name="evidence" maxlength="300" placeholder="Abrechnungs-ID, Exportname oder Notiz"></label><label class="inline-check"><input type="checkbox" name="confirmed"> Buchung ist durch Abrechnung oder Beleg bestätigt</label><button class="button button-primary" type="submit">Buchung speichern</button></form></section>
 <section class="panel"><div class="panel-head"><div><h3>Buchungsjournal</h3><p>${rows.length} Einträge · ausstehende Buchungen zählen nicht zum Nettosaldo.</p></div></div>${rows.length?`<div class="agent-task-list">${rows.map(x=>`<article class="agent-task"><div><strong>${x.type==='income'?'Einnahme':x.type==='expense'?'Kosten':'KI-Fonds-Zuweisung'} · ${money(x.amount)}</strong><p>${esc(x.source||'Fondsbeitrag')} · ${esc(x.evidence||'Kein Belegverweis')}</p><small>${new Date(x.createdAt).toLocaleString('de-DE')} · ${x.confirmed?'Bestätigt':'Ausstehend'}</small></div><span class="status-tag">${x.type==='fund_contribution'?'Gebucht':x.confirmed?'Bestätigt':'Offen'}</span></article>`).join('')}</div>`:empty('Noch keine Finanzbuchungen','Erfasse bestätigte Provisionen und tatsächlich angefallene Kosten.')}</section>
 <div class="notice"><strong>Finanzkontrolle</strong><span>Northstar liest noch keine Affiliate-Konten automatisch aus. Bis eine offizielle Schnittstelle eingerichtet ist, müssen Provisionen anhand deiner echten Abrechnungen eingetragen werden. Der Fonds ist eine interne Rücklage, kein Bankkonto.</span></div>`;
}
async function saveAgentTask(event){
 event.preventDefault();const d=new FormData(event.currentTarget),title=String(d.get('title')||'').trim();if(!title)return;
 const task=queueAgentTask({title,description:String(d.get('description')||'').trim(),role:String(d.get('role')||'orchestrator'),priority:String(d.get('priority')||'normal')});
 await db.put('agentTasks',task);renderPage();toast('Agent-Aufgabe eingereiht.');
}
async function updateAgentTask(id,status){
 const t=state.agentTasks.find(x=>x.id===id&&x.workspaceId===state.workspaceId);if(!t)return;
 t.status=status;t.updatedAt=new Date().toISOString();await db.put('agentTasks',t);log('Agent-Aufgabenstatus geändert',t.title+' · '+status);renderPage();
}
async function saveFinanceEntry(event){
 event.preventDefault();const d=new FormData(event.currentTarget),amount=Number(d.get('amount'));if(!Number.isFinite(amount)||amount<=0){toast('Bitte einen gültigen Betrag eingeben.');return;}
 const type=String(d.get('type'));const row={id:crypto.randomUUID(),workspaceId:state.workspaceId,type,amount:Number(amount.toFixed(2)),incomeKind:type==='income'?String(d.get('incomeKind')||'other'):'',costKind:type==='expense'?String(d.get('costKind')||'operating'):'',source:String(d.get('source')||'').trim(),evidence:String(d.get('evidence')||'').trim(),confirmed:d.get('confirmed')==='on',createdAt:new Date().toISOString()};
 state.financeTransactions.unshift(row);await db.put('financeTransactions',row);log('Finanzbuchung erfasst',(type==='income'?'Einnahme':'Kosten')+' · '+money(amount));renderPage();toast('Finanzbuchung gespeichert.');
}
async function saveFinancePolicy(){
 const seedCapital=Number($('#seedCapital')?.value),protectedReserve=Number($('#protectedReserve')?.value);
 if(!Number.isFinite(seedCapital)||seedCapital<0||!Number.isFinite(protectedReserve)||protectedReserve<0){toast('Startkapital und Reserve müssen gültige positive Werte sein.');return;}
 const cfg={...financeConfig(),seedCapital:Number(seedCapital.toFixed(2)),protectedReserve:Number(protectedReserve.toFixed(2)),updatedAt:new Date().toISOString()};
 state.settings=state.settings.filter(x=>x.id!==cfg.id);state.settings.push(cfg);await db.put('settings',cfg);log('Finanzregeln geändert','Startkapital '+money(cfg.seedCapital)+' · Reserve '+money(cfg.protectedReserve));renderPage();toast('Finanzregeln gespeichert.');
}


function settingsPage(){
 header('Einstellungen','KONTO · CLOUD-SYNCHRONISIERUNG');
 const email=localStorage.getItem('northstar_account_email')||'';
 const token=localStorage.getItem('northstar_session_token')||'';
 const base=localStorage.getItem('northstar_sync_endpoint')||'https://northstar-image-generator.kibruder.workers.dev';
 return `<div class="page-toolbar"><div><h2>Northstar-Konto</h2><p>Eigenes Konto statt Cloudflare Zero Trust. Deine Daten bleiben zusätzlich lokal auf diesem Gerät.</p></div><span class="status-tag">${token?'Sitzung gespeichert':'Nicht angemeldet'}</span></div>
 <section class="panel"><div class="panel-head"><div><h3>${token?'Angemeldet':'Konto erstellen oder anmelden'}</h3><p>${token?esc(email):'E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen verwenden.'}</p></div></div>
 <form id="accountForm" class="data-form" ${token?'hidden':''}><label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Passwort<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label><div class="form-actions"><button class="button button-secondary" type="button" id="accountLogin">Anmelden</button><button class="button button-primary" type="submit">Konto erstellen</button></div></form>
 <div class="detail-actions" ${token?'':'hidden'}><button class="button button-secondary" id="accountLogout">Abmelden</button></div>
 <p class="form-hint">Hinweis: Das Passwort wird nicht lokal gespeichert. Northstar speichert serverseitig nur einen PBKDF2-Hash. Die Sitzung läuft nach 7 Tagen ab.</p></section>
 <section class="panel"><div class="panel-head"><div><h3>Cloud-Synchronisierung</h3><p>Überträgt deine Arbeitsbereiche und Geschäftsdaten in deine private D1-Datenbank.</p></div><span class="status-tag">D1 · verschlüsselte HTTPS-Verbindung</span></div>
 <label class="data-form">Worker-Adresse<input id="syncEndpoint" type="url" value="${esc(base)}" placeholder="https://…workers.dev"></label>
 <div class="detail-actions"><button class="button button-primary" id="saveSyncEndpoint">Adresse speichern</button><button class="button button-secondary" id="syncNow" ${token?'':'disabled'}>Jetzt synchronisieren</button></div><div id="syncStatus" class="form-hint" aria-live="polite">${token?'Bereit zur Synchronisierung.':'Bitte zuerst anmelden.'}</div></section>
 <section class="panel"><div class="panel-head"><div><h3>Awin-Affiliate-Verbindung</h3><p>Serverseitiger Verbindungstest für dein Awin-Publisher-Konto.</p></div><span class="status-tag">API · nur lesend</span></div>
 <p class="form-hint">Der Awin Personal Access Token bleibt ausschließlich als Cloudflare-Worker-Secret gespeichert. Er wird nicht in diesem Browser abgelegt.</p>
 <div class="detail-actions"><button class="button button-primary" id="checkAwinConnection" ${token?'':'disabled'}>Awin-Verbindung prüfen</button></div>
 <div id="awinConnectionStatus" class="form-hint" aria-live="polite">${token?'Noch nicht geprüft.':'Bitte zuerst bei Northstar anmelden.'}</div>
 <div id="awinPublisherResult"></div>
 <hr class="panel-divider"><div class="panel-head"><div><h3>Produktfeeds entdecken</h3><p>Advertiser und verfügbare Produktkataloge aus deinem Awin-Konto laden.</p></div><span class="status-tag">Feed-Import</span></div>
 <p class="form-hint">Benötigt zusätzlich den separaten Awin Data Feed Key als Cloudflare-Secret AWIN_DATAFEED_KEY. Der Publisher-API-Token allein reicht dafür nicht.</p>
 <div class="detail-actions"><button class="button button-secondary" id="loadAwinFeeds" ${token?'':'disabled'}>Produktfeeds abrufen</button></div>
 <div id="awinFeedStatus" class="form-hint" aria-live="polite"></div><div id="awinFeedResult"></div></section>
 <div class="notice"><strong>Datenschutz</strong><span>Die Synchronisierung startet nur auf Knopfdruck. Vor dem ersten Einsatz müssen die Authentifizierungs-Migration und das geheime Signaturschlüssel-Setting im Cloudflare Worker eingerichtet sein. Teile dein Passwort oder den Sitzungstoken niemals.</span></div>`;
}
async function accountRequest(path,body){
 const base=(localStorage.getItem('northstar_sync_endpoint')||'https://northstar-image-generator.kibruder.workers.dev').replace(/\/$/,'');
 const response=await fetch(base+'/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok){
  const detail=payload.detail?(' · '+String(payload.detail).slice(0,240)):'';
  throw new Error((payload.error||'Anmeldung fehlgeschlagen.')+detail);
 }
 return payload;
}
async function loginAccount(){
 const form=$('#accountForm');const data=new FormData(form);
 try{const payload=await accountRequest('login',{email:data.get('email'),password:data.get('password')});storeAccount(payload);renderPage();toast('Angemeldet.');}
 catch(error){toast(error.message);}
}
function storeAccount(payload){localStorage.setItem('northstar_session_token',payload.token);localStorage.setItem('northstar_account_email',payload.user.email);localStorage.setItem('northstar_account_id',payload.user.id);}
async function registerAccount(event){
 event.preventDefault();const data=new FormData(event.currentTarget);
 try{const payload=await accountRequest('register',{email:data.get('email'),password:data.get('password')});storeAccount(payload);renderPage();toast('Konto erstellt und angemeldet.');}
 catch(error){toast(error.message);}
}
function logoutAccount(){localStorage.removeItem('northstar_session_token');localStorage.removeItem('northstar_account_email');localStorage.removeItem('northstar_account_id');renderPage();toast('Abgemeldet.');}
async function loadAwinFeeds(){
 const status=$('#awinFeedStatus'),result=$('#awinFeedResult');
 const token=localStorage.getItem('northstar_session_token');
 if(!token){if(status)status.textContent='Bitte zuerst bei Northstar anmelden.';return;}
 const base=(localStorage.getItem('northstar_sync_endpoint')||'https://northstar-image-generator.kibruder.workers.dev').replace(/\/$/,'');
 if(status)status.textContent='Awin-Produktfeeds werden abgerufen …';
 if(result)result.innerHTML='';
 try{
  const response=await fetch(base+'/api/awin/feeds',{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error((payload.error||'Feedliste konnte nicht geladen werden.')+(payload.status?' · HTTP '+payload.status:'')+(payload.detail?' · '+String(payload.detail).slice(0,250):''));
  const feeds=Array.isArray(payload.feeds)?payload.feeds:[];
  const deFeeds=feeds.filter(f=>String(f.region||'').toUpperCase()==='DE');
  const joined=deFeeds.filter(f=>/active|joined/i.test(String(f.membershipStatus||'')));
  const focus=deFeeds.filter(f=>/home|garden|sport|outdoor|tool|electronics|house|wohnen|garten/i.test(String(f.vertical||'')));
  if(status)status.textContent='Feedliste geladen: '+feeds.length+' Feeds · '+deFeeds.length+' Deutschland · '+joined.length+' aktiv beigetreten · '+focus.length+' thematisch passende DE-Feeds.';
  const ranked=[...deFeeds].sort((a,b)=>{
   const aj=/active|joined/i.test(String(a.membershipStatus||''))?1:0,bj=/active|joined/i.test(String(b.membershipStatus||''))?1:0;
   return bj-aj || Number(b.productCount||0)-Number(a.productCount||0);
  });
  const candidates=ranked.filter(f=>f.feedId&&Number(f.productCount)>0);
  const recommended=candidates.filter(f=>/active|joined/i.test(String(f.membershipStatus||''))).sort((a,b)=>{
   const score=f=>((/garden|home|outdoor|tool|sport|electronics/i.test(String(f.vertical||''))?100:0)+Math.min(Number(f.productCount||0),50000)/1000);
   return score(b)-score(a);
  }).slice(0,8);
  const selected=recommended;
  if(result)result.innerHTML=feeds.length?'<div class="detail-block"><span>Deutschland-Fokus · Ai.Boxx</span><p class="form-hint">Importiert werden ausschließlich Feeds aus Programmen mit bestätigter aktiver Partnerschaft. Nicht beigetretene Programme bleiben im Bewerbungsprozess und werden nicht als bewerbbar oder importierbar ausgegeben.</p><div class="metric-grid"><div class="metric-card"><span>DE-Feeds</span><strong>'+deFeeds.length+'</strong></div><div class="metric-card"><span>Aktive Partnerschaften</span><strong>'+joined.length+'</strong></div><div class="metric-card"><span>Importauswahl</span><strong>'+selected.length+'</strong></div></div>'+(selected.length?'<ul>'+selected.map(f=>'<li><strong>'+esc(f.advertiserName||'Advertiser')+'</strong>'+(f.vertical?' · '+esc(f.vertical):'')+' · '+Number(f.productCount||0).toLocaleString('de-DE')+' Produkte · '+esc(f.membershipStatus||'Aktiv')+'</li>').join('')+'</ul><button class="button button-primary" id="importRecommendedAwinFeeds" data-feed-ids="'+selected.map(f=>esc(f.feedId)).join(',')+'">Aktive DE-Feeds importieren</button>':'<p class="form-hint">Aktuell wurde kein deutscher Produktfeed mit bestätigter aktiver Partnerschaft gefunden. Es werden bewusst keine Feeds nicht beigetretener Advertiser importiert.</p>')+'<div id="awinImportStatus" class="form-hint" aria-live="polite"></div></div>':'<p class="form-hint">Awin hat aktuell keine Produktfeeds für diesen Publisher zurückgegeben.</p>';
  $('#importRecommendedAwinFeeds')?.addEventListener('click',importRecommendedAwinFeeds);
  log('Awin-Produktfeeds abgerufen','Verfügbare Feeds: '+feeds.length+'; DE: '+deFeeds.length+'; aktive DE: '+joined.length+'; Importauswahl: '+selected.length);
 }catch(error){if(status)status.textContent='Produktfeeds nicht verfügbar: '+String(error.message||error);}
}

async function importRecommendedAwinFeeds(event){
 const button=event.currentTarget,status=$('#awinImportStatus'),token=localStorage.getItem('northstar_session_token');
 const rawBase=localStorage.getItem('northstar_sync_endpoint')||'https://northstar-image-generator.kibruder.workers.dev';const base=rawBase.endsWith('/')?rawBase.slice(0,-1):rawBase;
 const ids=String(button.dataset.feedIds||'').split(',').filter(x=>/^\d+$/.test(x));
 if(!token||!ids.length)return;
 button.disabled=true;let total=0,failed=[];
 for(let i=0;i<ids.length;i++){
  if(status)status.textContent='Importiere Feed '+(i+1)+' von '+ids.length+' …';
  try{
   const r=await fetch(base+'/api/awin/catalog/import-feed',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({feedId:ids[i]})});
   const p=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(p.error||'HTTP '+r.status);
   total+=Number(p.imported||0);
  }catch(e){failed.push('Feed '+ids[i]+': '+String(e.message||e));}
 }
 if(status)status.textContent='Import abgeschlossen: '+total.toLocaleString('de-DE')+' Produkte gespeichert.'+(failed.length?' Fehler: '+failed.join(' · '):'');
 button.disabled=false;toast('Awin-Import: '+total.toLocaleString('de-DE')+' Produkte.');
}

async function checkAwinConnection(){
 const status=$('#awinConnectionStatus'),result=$('#awinPublisherResult');
 const token=localStorage.getItem('northstar_session_token');
 if(!token){if(status)status.textContent='Bitte zuerst bei Northstar anmelden.';return;}
 const base=(localStorage.getItem('northstar_sync_endpoint')||'https://northstar-image-generator.kibruder.workers.dev').replace(/\/$/,'');
 if(status)status.textContent='Awin-Verbindung wird geprüft …';
 if(result)result.innerHTML='';
 try{
  const response=await fetch(base+'/api/awin/publishers',{method:'GET',headers:{'Authorization':'Bearer '+token,'Accept':'application/json'}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
   const upstream=payload.status?' Awin-HTTP-Status: '+payload.status+'.':'';
   const detail=payload.detail?' Antwort: '+String(payload.detail).slice(0,500):'';
   throw new Error((payload.error||'Verbindung fehlgeschlagen.')+upstream+detail);
  }
  const accountPayload=payload.accounts;
  const accounts=Array.isArray(accountPayload)?accountPayload:(Array.isArray(accountPayload?.accounts)?accountPayload.accounts:(accountPayload?[accountPayload]:[]));
  if(status)status.textContent='Awin-Verbindung erfolgreich. Awin hat die Kontenliste zurückgegeben.';
  if(result)result.innerHTML=accounts.length?'<div class="detail-block"><span>Gefundene Awin-Konten</span><ul>'+accounts.map(a=>'<li><strong>'+esc(a.accountName||'Awin-Konto')+'</strong>'+(a.accountId?' · ID '+esc(a.accountId):'')+(a.accountType?' · '+esc(a.accountType):'')+'</li>').join('')+'</ul></div>':'<p class="form-hint">Awin hat die Verbindung bestätigt, aber keine Konten zurückgegeben.</p>';
  log('Awin-Verbindung geprüft','Awin-Konten: '+accounts.length);
 }catch(error){
  if(status)status.textContent='Awin-Verbindung nicht bestätigt: '+String(error.message||error);
 }
}
async function syncAllData(){
 const token=localStorage.getItem('northstar_session_token');if(!token)throw new Error('Bitte zuerst anmelden.');
 const base=(localStorage.getItem('northstar_sync_endpoint')||'https://northstar-image-generator.kibruder.workers.dev').replace(/\/$/,'');
 const headers={'Content-Type':'application/json','Authorization':'Bearer '+token};
 const stores=['workspaces','products','posts','activities','agentTasks','financeTransactions','settings'];
 const local={};for(const store of stores)local[store]=await db.all(store);
 const listResponse=await fetch(base+'/api/sync',{headers});
 const listPayload=await listResponse.json();
 if(!listResponse.ok)throw new Error(listPayload.error||'Arbeitsbereiche konnten nicht geladen werden.');
 const workspaceMap=new Map();
 const stamp=x=>Date.parse(x.updatedAt||x.createdAt||'1970-01-01')||0;
 for(const item of [...(listPayload.stores?.workspaces||[]),...local.workspaces]){
  const prior=workspaceMap.get(item.id);if(!prior||stamp(item)>=stamp(prior))workspaceMap.set(item.id,item);
 }
 const workspaces=[...workspaceMap.values()];
 if(!workspaces.length)throw new Error('Kein Arbeitsbereich vorhanden. Bitte zuerst einen Arbeitsbereich anlegen.');
 for(const item of workspaces)await db.put('workspaces',item);
 for(let offset=0;offset<workspaces.length;offset+=500){
  const records=workspaces.slice(offset,offset+500).map(item=>({store:'workspaces',item}));
  const saved=await fetch(base+'/api/sync',{method:'POST',headers,body:JSON.stringify({records})});
  const result=await saved.json();if(!saved.ok)throw new Error(result.error||'Arbeitsbereiche konnten nicht gespeichert werden.');
 }
 for(const workspace of workspaces){
  const response=await fetch(base+'/api/sync?workspaceId='+encodeURIComponent(workspace.id),{headers});
  const remote=await response.json();if(!response.ok)throw new Error(remote.error||'Cloud-Daten konnten nicht geladen werden.');
  for(const store of stores.slice(1)){
   const remoteRows=remote.stores?.[store]||[];
   const localRows=local[store].filter(item=>item.workspaceId===workspace.id);
   const merged=new Map();
   for(const item of [...remoteRows,...localRows]){
    const prior=merged.get(item.id);if(!prior||stamp(item)>=stamp(prior))merged.set(item.id,item);
   }
   const rows=[...merged.values()];
   for(const item of rows)await db.put(store,item);
   for(let offset=0;offset<rows.length;offset+=500){
    const records=rows.slice(offset,offset+500).map(item=>({store,item}));
    const saved=await fetch(base+'/api/sync',{method:'POST',headers,body:JSON.stringify({records})});
    const result=await saved.json();if(!saved.ok)throw new Error(result.error||'Cloud-Speicherung fehlgeschlagen.');
   }
  }
 }
 for(const store of stores)state[store]=await db.all(store);
 state.workspaceId=state.workspaces[0]?.id||state.workspaceId;
 renderWorkspaceSelect();renderPage();
 return 'Synchronisierung abgeschlossen. '+stores.reduce((sum,store)=>sum+state[store].length,0)+' Datensätze in '+workspaces.length+' Arbeitsbereichen abgeglichen.';
}

function simplePage(id){
 if(id==='agents')return agentsPage();if(id==='finance')return financePage();
 const [title,eyebrow,desc,note]=simplePages[id]; header(title,eyebrow);
 return `<div class="hero-panel"><div class="hero-icon">${sections.find(s=>s[0]===id)?.[2]||'•'}</div><div><h2>${title}</h2><p>${desc}</p></div></div><div class="panel"><h3>Modulstatus</h3><p class="muted">Grundstruktur angelegt · Fachfunktionen werden in den nächsten Entwicklungsstufen integriert.</p><div class="progress-track"><span style="width:12%"></span></div><small class="muted">Grundgerüst: Navigation und lokale Datenbasis vorhanden</small></div><div class="notice"><strong>Umsetzungsregel</strong><span>${note}</span></div>`;
}
function renderPage(){
 const el=$('#page'); el.innerHTML = active==='overview'?overview():active==='products'?productsPage():active==='content'?contentPage():active==='settings'?settingsPage():simplePage(active);
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
 if($('#mediaEndpoint'))$('#mediaEndpoint').value=normalizeMediaEndpoint(localStorage.getItem('northstar_media_endpoint')||'https://northstar-image-generator.kibruder.workers.dev');
 if($('#mediaToken'))$('#mediaToken').value=localStorage.getItem('northstar_media_token')||'';
 $('#accountForm')?.addEventListener('submit',registerAccount);
 $('#accountLogin')?.addEventListener('click',loginAccount);
 $('#accountLogout')?.addEventListener('click',logoutAccount);
 $('#saveSyncEndpoint')?.addEventListener('click',()=>{const value=String($('#syncEndpoint')?.value||'').trim().replace(/\/$/,'');try{const url=new URL(value);if(url.protocol!=='https:')throw new Error();localStorage.setItem('northstar_sync_endpoint',value);toast('Worker-Adresse gespeichert.');}catch{toast('Bitte eine gültige HTTPS-Worker-Adresse eingeben.');}});
 $('#syncNow')?.addEventListener('click',async()=>{const status=$('#syncStatus');status.textContent='Synchronisierung läuft …';try{status.textContent=await syncAllData();toast('Daten synchronisiert.');}catch(error){status.textContent=error.message;toast(error.message);}});
 $('#checkAwinConnection')?.addEventListener('click',checkAwinConnection);
 $('#loadAwinFeeds')?.addEventListener('click',loadAwinFeeds);
 $('#agentTaskForm')?.addEventListener('submit',saveAgentTask);
 document.querySelectorAll('[data-task-status]').forEach(s=>s.addEventListener('change',()=>updateAgentTask(s.dataset.taskStatus,s.value)));
 $('#financeEntryForm')?.addEventListener('submit',saveFinanceEntry);$('#saveFinancePolicy')?.addEventListener('click',saveFinancePolicy);
 $('#generateContentDraft')?.addEventListener('click',()=>generateContentDraft(state.selectedPostId));
 $('#regenerateContentDraft')?.addEventListener('click',e=>generateContentDraft(e.currentTarget.dataset.id));
 $('#copyContentDraft')?.addEventListener('click',copyContentDraft);
 $('#saveMediaSettings')?.addEventListener('click',saveMediaSettings);
 $('#generateOriginalSlides')?.addEventListener('click',e=>generateOriginalPhotoSlides(e.currentTarget.dataset.id));
 $('#generateSlideImages')?.addEventListener('click',e=>generateSlideImages(e.currentTarget.dataset.id));
 $('#saveAllSlidesToPhotos')?.addEventListener('click',()=>shareGeneratedSlides(state.selectedPostId));
 document.querySelectorAll('[data-save-slide]').forEach(button=>button.addEventListener('click',()=>shareGeneratedSlides(state.selectedPostId,Number(button.dataset.saveSlide))));
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
 if(status)status.textContent='Screenshotdaten übernommen. Bitte Produktname und erkannte Angaben kurz prüfen. Nach dem Speichern startet Northstar automatisch den BOFU-Entwurf und erstellt drei Slides aus deinen Originalfotos.';
 $('#saveProductButton').textContent='Produkt speichern + BOFU starten';
 $('#productFormPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
 toast('Screenshotdaten übernommen – nach dem Speichern startet die Produktion automatisch.');
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
 const files=Array.from(event.target.files||[]),box=$('#productImagePreview');if(!box)return;
 if(!files.length){box.hidden=true;box.innerHTML='';return;}
 if(files.length>8){toast('Maximal 8 Produktbilder gleichzeitig.');event.target.value='';return;}
 const invalid=files.find(file=>!file.type.startsWith('image/')||file.size>5*1024*1024);
 if(invalid){toast('Bitte nur Bilddateien bis maximal 5 MB pro Bild auswählen.');event.target.value='';return;}
 try{const previews=await Promise.all(files.map(async file=>({file,url:await readFileAsDataUrl(file)})));
 box.hidden=false;box.innerHTML=previews.map(({file,url})=>'<div class="product-reference-preview"><img src="'+url+'" alt="Produktreferenz"><span>'+esc(file.name)+' · '+(file.size/1024).toFixed(0)+' KB</span></div>').join('');
 }catch{toast('Bildvorschau fehlgeschlagen.');}
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
 const autoProduceFromScreenshot=!existing&&pendingScreenshotImages.length>0;
 let imageDataUrl=existing?.imageDataUrl||'';
 const selectedImageFiles=Array.from(form.elements.productImage.files||[]);
 if(selectedImageFiles.length>8){toast('Maximal 8 Produktbilder auswählen.');return;}
 if(selectedImageFiles.some(file=>!file.type.startsWith('image/')||file.size>5*1024*1024)){toast('Jedes Produktbild muss ein Bildformat sein und darf höchstens 5 MB groß sein.');return;}
 const uploadedImages=await Promise.all(selectedImageFiles.map(readFileAsDataUrl));
 if(uploadedImages.length&&!imageDataUrl)imageDataUrl=uploadedImages[0];
 if(pendingScreenshotDataUrl)imageDataUrl=pendingScreenshotDataUrl;
 const previousRefs=Array.isArray(existing?.referenceImagesDataUrls)?existing.referenceImagesDataUrls:[existing?.imageDataUrl,...(existing?.screenshotDataUrls||[])].filter(Boolean);
 const referenceImagesDataUrls=[...new Set([...previousRefs,...uploadedImages,...pendingScreenshotImages.map(x=>x.dataUrl)])].slice(0,8);
 if(!imageDataUrl&&referenceImagesDataUrls.length)imageDataUrl=referenceImagesDataUrls[0];
 const p={
  ...(existing||{}),id:id||crypto.randomUUID(),workspaceId:state.workspaceId,name,
  merchant:String(data.get('merchant')||'').trim(),url:String(data.get('url')||'').trim(),
  sourceUrl:String(data.get('sourceUrl')||'').trim(),price,
  description:String(data.get('description')||'').trim(),
  imageUrl:String(data.get('imageUrl')||'').trim(),imageDataUrl,referenceImagesDataUrls,
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
 else{state.products.push(p);await db.put('products',p);log('Produkt erfasst',p.name);queueAgentTask({title:'Produktdaten und Quellen prüfen: '+p.name,description:'Produktangaben, sichtbare Merkmale, Händlerlink und Preisbeleg prüfen. Keine Eigenschaften ohne Nachweis freigeben.',role:'product',priority:'high',relatedType:'product',relatedId:p.id});}
 state.selectedProductId=p.id;pendingScreenshotDataUrl='';clearScreenshotImport();hideProductForm();renderPage();
 if(autoProduceFromScreenshot){
  toast('Produkt gespeichert. BOFU-Produktion startet automatisch …');
  try{
   await createContentFromProduct(p.id);
   const postId=state.selectedPostId;
   if(!postId)throw new Error('Content-Projekt konnte nicht angelegt werden.');
   await generateContentDraft(postId);
   await generateSlideImages(postId);
   toast('Automatik abgeschlossen: BOFU-Entwurf und drei FLUX-KI-Szenen erstellt. Produktidentität prüfen und freigeben.');
  }catch(error){
   console.error(error);
   toast('Produkt ist gespeichert. Automatik wurde unterbrochen: '+(error.message||'Unbekannter Fehler'));
  }
  return;
 }
 toast(existing?'Produkt aktualisiert.':'Produkt lokal gespeichert.');
}
async function runLocalProductAnalysis(id){
 const p=state.products.find(x=>x.id===id && x.workspaceId===state.workspaceId);if(!p)return;
 const hasImages=[...(Array.isArray(p.referenceImagesDataUrls)?p.referenceImagesDataUrls:[]),p.imageDataUrl,...(p.screenshotDataUrls||[])].some(x=>typeof x==='string'&&x.startsWith('data:image/'));
 try{
  if(hasImages){
   await requestProductAIAnalysis(p);
   p.status='KI-Produktanalyse abgeschlossen';p.updatedAt=new Date().toISOString();
   await db.put('products',p);log('KI-Produktanalyse abgeschlossen',p.name);
   toast('KI hat das Produkt und passende Content-Winkel analysiert.');
  }else{
   const analysis=analyzeProductLocally(p);
   p.analysis={...analysis,createdAt:new Date().toISOString()};
   p.status='Lokale Basisanalyse abgeschlossen';p.updatedAt=new Date().toISOString();
   await db.put('products',p);log('Lokale Produktanalyse abgeschlossen',`${p.name} · Datenvollständigkeit ${analysis.score}/100`);
   toast('Keine Produktbilder vorhanden. Lokale Basisanalyse abgeschlossen.');
  }
 }catch(error){toast('KI-Produktanalyse fehlgeschlagen: '+(error.message||'Unbekannter Fehler'));}
 state.selectedProductId=p.id;renderPage();
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
 queueAgentTask({title:'BOFU-Content vorbereiten: '+p.name,description:'Auf Basis bestätigter Produktdaten eine natürliche 3-Slide-Dramaturgie und passende Medienplanung erstellen.',role:'content',priority:'normal',relatedType:'post',relatedId:post.id});
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
 for(const store of ['workspaces','products','posts','activities','agentTasks','financeTransactions','settings']) state[store]=await db.all(store);
 if(!state.workspaces.length&&!localStorage.getItem('northstar_session_token')){const w={id:crypto.randomUUID(),name:'Affiliate Business',description:'Affiliate, Content und Monetarisierung',createdAt:new Date().toISOString()};state.workspaces=[w];await db.put('workspaces',w);}
 state.workspaceId=state.workspaces[0]?.id||null;
 renderWorkspaceSelect(); renderNav(); renderPage();
 $('#workspaceSelect').addEventListener('change',e=>{if(e.target.value==='__new'){addWorkspace();return;}state.workspaceId=e.target.value;renderPage();});
 $('#quickAdd').addEventListener('click',()=>{const choice=prompt('Was möchtest du anlegen?\\n1 = Produkt\\n2 = Content-Entwurf\\n3 = Arbeitsbereich'); if(choice==='1')addProduct();else if(choice==='2')addPost();else if(choice==='3')addWorkspace();});
 $('#settingsShortcut').addEventListener('click',()=>go('settings'));
 $('#mobileMenu')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const sidebar=$('.sidebar');if(!sidebar)return;const open=sidebar.classList.toggle('open');document.body.classList.toggle('menu-open',open);e.currentTarget.setAttribute('aria-expanded',String(open));e.currentTarget.setAttribute('aria-label',open?'Menü schließen':'Menü öffnen');});
 if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
}
init().catch(err=>{console.error(err);$('#page').innerHTML='<div class="notice"><strong>Startfehler</strong><span>Die lokale Datenbank konnte nicht initialisiert werden. Bitte Browser-Speicher prüfen und Seite neu laden.</span></div>';});