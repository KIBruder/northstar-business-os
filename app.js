import { db } from './db.js';

const sections = [
  ['overview','Übersicht','▦'],['products','Produkte','◇'],['content','Content-Studio','▤'],
  ['production','Produktion','✦'],['calendar','Planung','▦'],['analytics','Analysen','⌁'],
  ['finance','Finanzen','€'],['partners','Partnernetzwerk','◎'],['agents','KI-Agenten','⌘'],
  ['documents','Dokumente','▧'],['reports','Managementberichte','▥'],['settings','Einstellungen','⚙']
];
let active = 'overview';
let state = { workspaceId: null, workspaces: [], products: [], posts: [], activities: [] };

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
function productsPage(){
 header('Produkte','RECHERCHE & PRODUKTDATENBANK'); const items=scoped(state.products);
 return `<div class="page-toolbar"><div><h2>Produktbibliothek</h2><p>Produkte erfassen, strukturieren und für Content-Projekte vorbereiten.</p></div><button class="button button-primary" id="addProduct">＋ Produkt erfassen</button></div>
 <section class="panel product-form-panel" id="productFormPanel" hidden>
   <div class="panel-head"><div><h3>Neues Produkt erfassen</h3><p>Pflichtfeld: Produktname. Nicht bestätigte Angaben bleiben entsprechend gekennzeichnet.</p></div><button class="icon-button" id="closeProductForm" type="button" aria-label="Formular schließen">✕</button></div>
   <form id="productForm" class="data-form">
     <label>Produktname *<input name="name" required maxlength="160" placeholder="z. B. Akku-Bohrschrauber"></label>
     <div class="form-grid">
       <label>Händler / Plattform<input name="merchant" maxlength="100" placeholder="z. B. Amazon"></label>
       <label>Aktueller Preis in EUR<input name="price" inputmode="decimal" placeholder="z. B. 49,99"></label>
     </div>
     <label>Produktlink<input name="url" type="url" placeholder="https://..."></label>
     <label>Quellenlink für Preis / Eigenschaften<input name="sourceUrl" type="url" placeholder="Herstellerseite oder Händlerquelle"></label>
     <label>Produktbeschreibung<textarea name="description" rows="3" maxlength="2000" placeholder="Bekannte Eigenschaften und Hinweise"></textarea></label>
     <div class="form-actions"><button class="button button-secondary" id="cancelProductForm" type="button">Abbrechen</button><button class="button button-primary" type="submit">Produkt lokal speichern</button></div>
     <p class="form-hint">Ein eingetragener Preis ist zunächst nicht verifiziert. Quellenlink und Erfassungszeitpunkt werden mitgespeichert; eine automatische Quellenprüfung ist noch nicht angebunden.</p>
   </form>
 </section>
 ${items.length?`<div class="table-wrap"><table><thead><tr><th>Produkt</th><th>Händler</th><th>Preis</th><th>Status</th><th>Erfasst</th></tr></thead><tbody>${items.map(p=>`<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.url||'Kein Produktlink')}</small></td><td>${esc(p.merchant||'—')}</td><td>${p.price!==null&&p.price!==undefined?money(p.price):'Nicht angegeben'}</td><td><span class="status-tag">${esc(p.status||'Neu')}</span></td><td>${new Date(p.createdAt).toLocaleDateString('de-DE')}</td></tr>`).join('')}</tbody></table></div>`:empty('Noch keine Produkte','Erfasse ein Produkt über das Formular. Quellen und Preise werden getrennt als bestätigt oder ungeprüft behandelt.')}
 <div class="notice"><strong>Wichtig</strong><span>Preise und Produkteigenschaften gelten erst dann als verifiziert, wenn eine belastbare Quelle geprüft und mit Abrufdatum dokumentiert wurde.</span></div>`;
}
function contentPage(){
 header('Content-Studio','CONTENT-STRATEGIE'); const items=scoped(state.posts);
 return `<div class="page-toolbar"><div><h2>Content-Projekte</h2><p>Entwürfe für TikTok, YouTube, Pinterest und weitere Kanäle.</p></div><button class="button button-primary" id="addPost">＋ Entwurf anlegen</button></div>
 ${items.length?`<div class="project-list">${items.map(p=>`<article class="project-card"><div class="project-symbol">▤</div><div class="project-main"><strong>${esc(p.title)}</strong><small>${esc(p.channel)} · ${esc(p.strategy)} · ${new Date(p.createdAt).toLocaleDateString('de-DE')}</small></div><span class="status-tag">${esc(p.status)}</span></article>`).join('')}</div>`:empty('Noch keine Content-Entwürfe','Lege einen Entwurf an. Die spätere KI-Erstellung erhält eigene Prüf- und Freigabeschritte.','<button class="button button-primary" id="addPostEmpty">＋ Ersten Entwurf anlegen</button>')}`;
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
 $('#addProduct')?.addEventListener('click',showProductForm);
 $('#closeProductForm')?.addEventListener('click',hideProductForm);
 $('#cancelProductForm')?.addEventListener('click',hideProductForm);
 $('#productForm')?.addEventListener('submit',saveProduct);
 $('#addPost')?.addEventListener('click',addPost); $('#addPostEmpty')?.addEventListener('click',addPost);
}
function showProductForm(){
 const panel=$('#productFormPanel'); if(panel){panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});panel.querySelector('[name="name"]')?.focus();}
}
function hideProductForm(){const panel=$('#productFormPanel');if(panel)panel.hidden=true;}
async function saveProduct(event){
 event.preventDefault();
 const form=event.currentTarget, data=new FormData(form);
 const name=String(data.get('name')||'').trim();
 if(!name){toast('Bitte einen Produktnamen eingeben.');return;}
 const rawPrice=String(data.get('price')||'').trim().replace(',','.');
 let price=null;
 if(rawPrice){price=Number(rawPrice);if(!Number.isFinite(price)||price<0){toast('Bitte einen gültigen Preis eingeben.');return;}}
 const url=String(data.get('url')||'').trim(), sourceUrl=String(data.get('sourceUrl')||'').trim();
 const p={
  id:crypto.randomUUID(),workspaceId:state.workspaceId,name,
  merchant:String(data.get('merchant')||'').trim(),url,sourceUrl,
  price,description:String(data.get('description')||'').trim(),
  priceVerified:false,sourceCheckedAt:null,status:'Neu',
  createdAt:new Date().toISOString()
 };
 state.products.push(p);await db.put('products',p);log('Produkt erfasst',p.name);
 renderPage();toast('Produkt lokal gespeichert.');
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
