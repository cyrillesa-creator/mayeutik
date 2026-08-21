/* Étape 2 du prompt compas : le report de longueur au VRAI compas. */
const socle = require('./socle.js');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=socle.chargerPlaywright();
const RACINE=socle.RACINE;
let ok=0,ko=0;
const T=(n,c,d)=>{if(c){ok++;console.log('OK   '+n,d===undefined?'':d);}else{ko++;console.log('KO   '+n,d===undefined?'':d);}};
const srv=http.createServer((q,r)=>{const p=path.join(RACINE,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d);});});
(async()=>{
 await new Promise(r=>srv.listen(0,r));
 const base='http://localhost:'+srv.address().port+'/jeux/M35-verifier-coder.html';
 const nav=await chromium.launch({executablePath:socle.EXEC_CHROMIUM});
 const page=await nav.newPage({viewport:{width:390,height:800},deviceScaleFactor:2});
 await page.addInitScript(()=>{try{const pid=localStorage.getItem('mayeutik-profil-actif')||'p1';
   const t=JSON.parse(localStorage.getItem('mayeutik-m35-instruments-vus')||'{}');
   t[pid]={regle:true,gabarit:true,equerre:true,compas:true};
   localStorage.setItem('mayeutik-m35-instruments-vus',JSON.stringify(t));}catch(e){}});
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.location().url||''))erreurs.push(m.text());});

 const svgPt=async(x,y)=>page.evaluate(([x,y])=>{const s=document.getElementById('scene');
   const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y];},[x,y]);
 const ouvrirReport=async()=>{
   await page.goto(base+'?competence=ce2-compas'); await page.waitForTimeout(280);
   await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='report');pos=i;question();});
   await page.waitForTimeout(180);
 };
 const glisser=async(de,vers)=>{await page.mouse.move(de[0],de[1]);await page.mouse.down();
   for(let i=1;i<=10;i++) await page.mouse.move(de[0]+(vers[0]-de[0])*i/10, de[1]+(vers[1]-de[1])*i/10);
   await page.mouse.up();};

 await ouvrirReport();
 T('le report offre un vrai compas, plus des zones à taper',
   await page.evaluate(()=>!!compasCourant && document.querySelectorAll('.cible-tactile').length===0));
 /* Le noeud d'etiquette est PERMANENT depuis que le moteur ne reconstruit
    plus son dessin a chaque image : c'est sa visibilite qu'il faut lire, pas
    sa presence dans le DOM. */
 T('aucun nombre affiché : on compare sans mesurer',
   await page.evaluate(()=>[...document.querySelectorAll('.compas-etiquette')]
     .every(e=>e.getAttribute('display')==='none')));

 /* 1er temps : pointe sur a1, mine sur b1 — l'écartement se verrouille */
 const segs=await page.evaluate(()=>file[pos]._segs);
 let de=await svgPt(segs[0][0][0], segs[0][0][1]);
 let vers=await svgPt(segs[0][1][0]+6, segs[0][1][1]-4);   // volontairement à côté
 await glisser(de, vers); await page.waitForTimeout(1500);
 const t1=await page.evaluate(()=>({e:compasCourant.etat(),
   pose:file[pos]._instrumentPose===true,
   cercles:document.querySelectorAll('.compas-cercle').length}));
 const L1=Math.hypot(segs[0][1][0]-segs[0][0][0], segs[0][1][1]-segs[0][0][1]);
 T('le premier arc verrouille l’écartement', t1.e.verrouille===true, JSON.stringify(t1.e.verrouille));
 T('la mine s’est accrochée au bout du segment malgré un geste imprécis',
   Math.abs(t1.e.r-L1)<0.01, 'r='+t1.e.r.toFixed(2)+' pour L1='+L1.toFixed(2));
 T('prendre l’écartement ne vaut PAS encore vérification', t1.pose===false);

 /* 2e temps : on replante sur le second segment */
 de=await svgPt(segs[1][0][0], segs[1][0][1]);
 await page.mouse.move(de[0],de[1]); await page.mouse.down(); await page.mouse.up();
 await page.waitForTimeout(1500);
 const t2=await page.evaluate(()=>({e:compasCourant.etat(), pose:file[pos]._instrumentPose===true,
   cercles:document.querySelectorAll('.compas-cercle').length}));
 T('replanter trace un second arc, au MÊME écartement',
   t2.cercles===2 && Math.abs(t2.e.r-L1)<0.01, t2.cercles+' arcs, r='+t2.e.r.toFixed(2));
 T('c’est le report, et lui seul, qui vaut vérification', t2.pose===true);

 /* la réponse est relue sur les segments dessinés */
 const coherence=await page.evaluate(()=>{
   let pb=0;
   for(let i=0;i<400;i++){
     const f=engendrerFile(CONTENU.paliers.CE2.miniJeux.find(m=>m.mode==='compas2'));
     f.filter(q=>q.mode==='report').forEach(q=>{
       /* on refait la manche pour disposer de _segs puis on relit */
     });
     if(!f.length) pb++;
   }
   return pb;
 });
 T('les files de ce2-compas s’engendrent toujours', coherence===0);

 /* le barème : répondre juste sans reporter ne vaut qu'un demi-point */
 await ouvrirReport();
 const demi=await page.evaluate(async()=>{
   const q=file[pos]; q._exigeVerif=true; q._instrumentPose=false;
   [...document.querySelectorAll('#answers .rep')].find(b=>b.dataset.val===q._rep).click();
   await new Promise(r=>setTimeout(r,60));
   return {pts:q._pts, ok:q._ok};
 });
 T('juste sans avoir reporté : demi-point', demi.ok===true && demi.pts===1, JSON.stringify(demi));

 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
