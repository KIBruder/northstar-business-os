const DB_NAME='northstar-business-os'; const VERSION=2;
class LocalDB{
 constructor(){this.db=null;}
 init(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{const db=req.result;for(const name of ['workspaces','products','posts','activities','agentTasks','financeTransactions','settings'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});};req.onsuccess=()=>{this.db=req.result;resolve();};req.onerror=()=>reject(req.error);});}
 all(store){return new Promise((resolve,reject)=>{const req=this.db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
 put(store,value){return new Promise((resolve,reject)=>{const req=this.db.transaction(store,'readwrite').objectStore(store).put(value);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 delete(store,id){return new Promise((resolve,reject)=>{const req=this.db.transaction(store,'readwrite').objectStore(store).delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);});}
}
export const db=new LocalDB();
