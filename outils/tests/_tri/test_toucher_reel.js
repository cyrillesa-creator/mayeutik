/* Pilote les figures par de VRAIS clics de souris, aux coordonnées écran
   lues sur le DOM (getBoundingClientRect), jamais recalculées à partir des
   coordonnées SVG. C'est ce qui manquait : la suite précédente calculait le
   point de clic dans le même repère erroné que le code testé, et validait
   donc le bug. */
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const RACINE='/home/user/mayeutik';
let ok=0,ko=0;
const T=(n,c,d)=>{if(c){ok++;console.log('OK   '+n,d===undefined?'':d);}else{ko++;console.log('KO   '+n,d===undefined?'':d);}};
const srv=http.createServer((q,r)=>{const p=path.join(RACINE,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d);});});
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await nav.newPage({viewport:{width:390,height:780}});
 const err=[];page.on('pageerror',e=>err.push(e.message));
 const M34=`http://localhost:${port}/jeux/M34-formes-planes.html`;
 await page.goto(M34);
 await page.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE2'}]));
  localStorage.setItem('mayeutik-profil-actif','p1');localStorage.setItem('mayeutik-sessions','[]');});

 /* ---- M34 ce2-litige : le toucher doit répondre ---- */
 await page.goto(M34+'?competence=ce2-litige');await page.waitForTimeout(300);
 const cibles=await page.evaluate(()=>{
   const q=file[pos];
   return q.exigences.map(e=>e.parmi[0]);
 });
 /* On clique au CENTRE ÉCRAN du repère visible de chaque cible. */
 for(const id of cibles){
   const box=await page.evaluate(i=>{const e=document.querySelector(`[data-c="${i}"]`);
     if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};},id);
   T(`le repère ${id} existe à l’écran`, !!box, JSON.stringify(box));
   if(box) await page.mouse.click(box.x,box.y);
   await page.waitForTimeout(60);
 }
 const sel=await page.evaluate(()=>[...selection]);
 T('M34 ce2-litige : un vrai clic sélectionne bien la cible visée',
   sel.length===cibles.length && cibles.every(c=>sel.includes(c)),
   `cliqué ${JSON.stringify(cibles)} → sélectionné ${JSON.stringify(sel)}`);
 await page.click('#btnValider');
 await page.waitForTimeout(120);
 await page.evaluate(()=>desarmerAutoSuivant());
 T('M34 ce2-litige : la désignation est acceptée',
   await page.evaluate(()=>file[pos]._ok1===true));

 /* ---- M34 ce2-vocabulaire : toujours bon (pas de transform là-bas) ---- */
 await page.goto(M34+'?competence=ce2-vocabulaire');await page.waitForTimeout(300);
 const voc=await page.evaluate(async()=>{
   file[0]=Object.assign({},file[0],{notion:'centre',q:consigneVocabulaire('centre')});
   pos=0;verrouille=false;question();
   await new Promise(r=>setTimeout(r,80));
   const e=document.querySelector('[data-c="centre"]');
   const b=e.getBoundingClientRect();
   return {x:b.x+b.width/2,y:b.y+b.height/2};
 });
 await page.mouse.click(voc.x,voc.y);
 await page.waitForTimeout(100);
 await page.evaluate(()=>desarmerAutoSuivant());
 T('M34 ce2-vocabulaire : un vrai clic sur le centre répond',
   await page.evaluate(()=>file[0]._ok===true));

 console.log('\nErreurs JS :',err.length?err.slice(0,4):'aucune');
 if(err.length)ko+=err.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close();srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
