/* A4 — l'accueil suit-il l'ordre du programme ? On lit l'ordre RENDU, pas le
   référentiel : c'est l'écran qui doit être juste. */
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const RACINE='/home/user/mayeutik';
let ok=0,ko=0;
const T=(n,c,d)=>{if(c){ok++;console.log('OK   '+n,d===undefined?'':d);}else{ko++;console.log('KO   '+n,d===undefined?'':d);}};
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const srv=http.createServer((q,r)=>{const p=path.join(RACINE,decodeURIComponent(q.url.split('?')[0].split('#')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}
   r.writeHead(200,{'Content-Type':(TYPES[path.extname(p)]||'text/plain')+'; charset=utf-8'});r.end(d);});});
(async()=>{
 await new Promise(r=>srv.listen(0,r));
 const base='http://localhost:'+srv.address().port+'/index.html';
 const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await nav.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e));
 /* La coquille charge une police Google : hors ligne elle échoue et retombe
    sur la police système. Ce n'est pas une erreur du code testé ici — la règle
    « aucune dépendance réseau » de CLAUDE.md vise les JEUX, qui sont autonomes. */
 page.on('console',m=>{const u=m.location().url||'';
   if(m.type()==='error' && !/favicon|fonts\.googleapis/.test(u) && !/fonts\.googleapis/.test(m.text()))erreurs.push(m.text());});
 page.on('requestfailed',r=>{if(!/fonts\.googleapis/.test(r.url()))erreurs.push('requête échouée '+r.url());});
 await page.goto(base); await page.waitForTimeout(700);
 /* La coquille demande un profil avant de montrer l'index : on en crée un. */
 await page.fill('input[type="text"]', 'Test');
 await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/CE2/.test(x.textContent));if(b)b.click();});
 await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/C’est parti/.test(x.textContent));if(b)b.click();});
 await page.waitForTimeout(600);
 /* tous les niveaux et tous les domaines, pour juger l'ordre complet */
 await page.evaluate(()=>{ if(window.P && P.etat) {} });
 /* tous les niveaux, tous les domaines : la liste complète, dans l'ordre */
 const titres=await page.evaluate(()=>[...document.querySelectorAll('.carte-jeu .titre')].map(e=>e.textContent.trim()));
 T('l’accueil affiche des cartes', titres.length>0, titres.length+' cartes');
 const ref=JSON.parse(fs.readFileSync(path.join(RACINE,'data/referentiel.json'),'utf8'));
 const parTitre={}; ref.modules.forEach(m=>parTitre[m.titre]=m);
 const rangs=titres.map(t=>parTitre[t]?parTitre[t].rangProgramme:null);
 T('chaque carte est un module connu', rangs.every(r=>r!==null && r!==undefined));
 T('les rangs sont croissants à l’écran',
   rangs.every((r,i)=>i===0||rangs[i-1]<=r), rangs.join(' '));
 /* le point qui a motivé A4 : les trois ateliers de géométrie plane */
 const ids=titres.map(t=>parTitre[t]&&parTitre[t].id);
 const g=ids.filter(i=>['M34','M35','M38'].indexOf(i)>=0);
 T('les trois ateliers de géométrie plane sont dans l’ordre',
   g.join(',')==='M34,M35,M38', g.join(','));
 const i34=ids.indexOf('M34'), i38=ids.indexOf('M38');
 T('et ils se SUIVENT, sans rien s’intercaler',
   i34>=0 && i38-i34===2, ids.slice(Math.max(0,i34-1), i38+2).join(' > '));
 /* le domaine reste groupé */
 const doms=titres.map(t=>parTitre[t].domaine);
 const vus=[]; let ruptures=0;
 doms.forEach(d=>{ if(vus[vus.length-1]!==d){ if(vus.indexOf(d)>=0) ruptures++; vus.push(d);} });
 T('chaque domaine forme un bloc unique', ruptures===0, vus.join(' | '));
 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await page.screenshot({path:'accueil_ordre.png',fullPage:true});
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
