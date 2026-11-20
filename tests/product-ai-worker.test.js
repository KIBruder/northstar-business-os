import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker/src/index.js';

const token='test-secret';
const image='data:image/jpeg;base64,aGVsbG8=';
const analysis={
 productName:'Sample item',category:'home & living',summary:'Visual product analysis',
 visibleIdentity:'Exact visible shape and finish',visibleFeatures:'Visible front panel',
 unknowns:['Hidden specifications'],audience:'Potential buyers',
 hooks:['Hook','Detail','Question'],
 slideScenes:['Product-first hook scene','Close-up detail scene','Everyday use scene'],
 negativePrompt:'No altered branding'
};

function makeEnv(){
 const calls=[];
 return {
  calls,
  AI:{run:async(model,input)=>{
   calls.push({model,input});
   if(model.includes('moondream'))return {answer:'Produkt: Beispielprodukt; Kategorie: Haushalt; Sichtbare Identität: exakte Form.'};
   if(model.includes('llama'))return {response:JSON.stringify(analysis)};
   if(model.includes('flux'))return {image:'AAAA'};
   throw new Error('Unexpected model '+model);
  }},
  NORTHSTAR_ACCESS_TOKEN:token,
  ALLOWED_ORIGIN:'https://kibruder.github.io'
 };
}
function request(path,body,auth='Bearer '+token){
 return new Request('https://worker.example'+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':auth,'Origin':'https://kibruder.github.io'},body:JSON.stringify(body)});
}

test('universal product analysis calls vision and language models',async()=>{
 const env=makeEnv();
 const response=await worker.fetch(request('/api/analyze-product',{product:{name:'Sample item'},images:[image,image]}),env);
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.analysis.category,'home & living');
 assert.equal(payload.analysis.slideScenes.length,3);
 assert.equal(env.calls.filter(x=>x.model.includes('moondream')).length,2);
 assert.equal(env.calls.filter(x=>x.model.includes('llama')).length,1);
});

test('analysis rejects missing reference images',async()=>{
 const env=makeEnv();
 const response=await worker.fetch(request('/api/analyze-product',{product:{name:'Sample item'},images:[]}),env);
 assert.equal(response.status,400);
});

test('analysis requires the configured access token',async()=>{
 const env=makeEnv();
 const response=await worker.fetch(request('/api/analyze-product',{product:{},images:[image]},'Bearer wrong'),env);
 assert.equal(response.status,401);
});

test('image generation route remains available',async()=>{
 const env=makeEnv();
 const response=await worker.fetch(request('/api/generate-image',{prompt:'A product-first photo',images:[image,image,image]}),env);
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.model,'@cf/black-forest-labs/flux-2-klein-4b');
 assert.equal(env.calls.filter(x=>x.model.includes('flux')).length,1);
});
