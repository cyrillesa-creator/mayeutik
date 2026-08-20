/* B8 / B9 / B10 — on pilote les trois mini-jeux comme un enfant le ferait. */
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const RACINE='/home/user/mayeutik';
let ok=0,ko=0;
const T=(n,c,d)=>{if(c){ok++;console.log('OK   '+n,d===undefined?'':d);}else{ko++;console.log('KO   '+n,d===undefined?'':d);}};
const srv=http.createServer((q,r)=>{const p=path.join(RACINE,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d);});});
(async()=>{
 await new Promise(r=>srv.listen(0,r));
 const base='http://localhost:'+srv.address().port+'/jeux/M35-verifier-coder.html';
 const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await nav.newPage({viewport:{width:390,height:780},deviceScaleFactor:2});
 /* A2 : on teste ici les TACHES, pas la prise en main (test_a2.js s'en charge).
    Les quatre instruments sont declares deja decouverts avant chaque chargement. */
 await page.addInitScript(()=>{try{
   const pid=localStorage.getItem('mayeutik-profil-actif')||'p1';
   const t=JSON.parse(localStorage.getItem('mayeutik-m35-instruments-vus')||'{}');
   t[pid]={regle:true,gabarit:true,equerre:true,compas:true};
   localStorage.setItem('mayeutik-m35-instruments-vus',JSON.stringify(t));
 }catch(e){}});
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e)); page.on('console',m=>{if(m.type()==='error' && !/favicon/.test(m.location().url||''))erreurs.push(m.text());});
 const svgPt=async(x,y)=>page.evaluate(([x,y])=>{const s=document.getElementById('scene');
   const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y];},[x,y]);

 /* ---------- B8 : trois figures de 4 ou 5 angles ---------- */
 const b8=[];
 for(let t=0;t<12;t++){
   await page.goto(base+'?competence=ce2-angles'); await page.waitForTimeout(140);
   b8.push(await page.evaluate(()=>({n:file.length, cotes:file.map(q=>q.pts.length),
     sommes:file.map(q=>Math.round(q.angles.reduce((a,b)=>a+b,0))),
     douteux:file.map(q=>q.douteux.filter(Boolean).length),
     pb:verifierFile(file).length})));
 }
 T('B8 — trois figures par manche', b8.every(x=>x.n===3), [...new Set(b8.map(x=>x.n))].join(','));
 const cotes=[].concat(...b8.map(x=>x.cotes));
 T('B8 — chaque figure a 4 ou 5 angles', cotes.every(c=>c===4||c===5), [...new Set(cotes)].sort().join(','));
 T('B8 — les deux tailles sortent bien', new Set(cotes).size===2, [...new Set(cotes)].join(','));
 T('B8 — 12 à 15 jugements par manche',
   b8.every(x=>{const s=x.cotes.reduce((a,b)=>a+b,0);return s>=12&&s<=15;}),
   [...new Set(b8.map(x=>x.cotes.reduce((a,b)=>a+b,0)))].sort().join(','));
 T('B8 — les angles somment à (n-2)×180',
   [].concat(...b8.map(x=>x.sommes.map((s,i)=>s===(x.cotes[i]-2)*180))).every(Boolean));
 T('B8 — aucun item refusé par le validateur', b8.every(x=>x.pb===0));

 /* ---------- B9 : régler l'écartement, PUIS planter ---------- */
 await page.goto(base+'?competence=ce2-compas'); await page.waitForTimeout(200);
 await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='compasRayon');pos=i;question();});
 await page.waitForTimeout(180);
 T('B9 — plus aucun bouton d’écartement',
   (await page.evaluate(()=>document.querySelectorAll('#barreOutils .outil').length))===0);
 const rayonUnites=await page.evaluate(()=>file[pos].rayonUnites);
 /* 1. planter la pointe sur le 0 de la règle et ouvrir jusqu'au bon repère */
 /* La règle est CENTRÉE sur le plan et son unité vient du moteur : on les
    relit au lieu de les figer, sinon le test casse au premier réglage. */
 const U=await page.evaluate(()=>PX_PAR_UNITE);
 const CM_MAX=6, X0=200-CM_MAX*U/2, YR=344;
 let a=await svgPt(X0,YR), b=await svgPt(X0+rayonUnites*U, YR);
 await page.mouse.move(a[0],a[1]); await page.mouse.down();
 for(let i=1;i<=10;i++) await page.mouse.move(a[0]+(b[0]-a[0])*i/10, a[1]+(b[1]-a[1])*i/10);
 await page.mouse.up(); await page.waitForTimeout(120);
 const apresReglage=await page.evaluate(()=>({verr:compasCourant.estVerrouille(),
   ecart:file[pos]._ecartUnites, cercles:document.querySelectorAll('.compas-cercle').length,
   /* La mesure prise se lit dans la sous-consigne : une étiquette posée dans
      le plan chevauchait les branches du compas. */
   lbl:document.getElementById('sousConsigne').textContent}));
 T('B9 — le relâchement RÈGLE l’écartement au lieu de tracer',
   apresReglage.verr===true && apresReglage.cercles===0, JSON.stringify(apresReglage));
 T('B9 — l’écartement lu est celui demandé', apresReglage.ecart===rayonUnites, apresReglage.ecart+' vs '+rayonUnites);
 T('B9 — la mesure prise est annoncée hors du plan',
   /Écartement pris : \d+/.test(apresReglage.lbl), apresReglage.lbl);
 /* 2. planter la pointe au centre : le tracé part tout seul */
 const c=await page.evaluate(()=>file[pos]._c);
 const cc=await svgPt(c[0],c[1]);
 await page.mouse.move(cc[0],cc[1]); await page.mouse.down(); await page.mouse.up();
 await page.waitForTimeout(1500);
 const fin=await page.evaluate(()=>({ok:file[pos]._ok, pts:file[pos]._pts,
   cercles:document.querySelectorAll('.compas-cercle').length}));
 T('B9 — poser la pointe au centre déclenche le tracé', fin.cercles>=1, JSON.stringify(fin));
 T('B9 — écartement juste + bon centre = point plein', fin.ok===true && fin.pts===2, JSON.stringify(fin));

 /* LE CRANTAGE. Regler une petite longueur etait le point dur : avec une
    simple aimantation de 6 px autour de chaque unite, moins de la moitie des
    positions accrochaient et l'enfant lisait « 2,4 » sans pouvoir atteindre 2.
    On balaie donc la regle et on verifie qu'AUCUNE position ne donne autre
    chose qu'un entier — et que l'afficheur suit. */
 {
   await page.goto(base+'?competence=ce2-compas'); await page.waitForTimeout(280);
   await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='compasRayon');pos=i;question();});
   await page.waitForTimeout(180);
   const dep=await svgPt(X0, YR);
   await page.mouse.move(dep[0], dep[1]); await page.mouse.down();
   const valeurs=[], afficheur=[];
   for (let dx=4; dx<=CM_MAX*U; dx+=4){
     const q=await svgPt(X0+dx, YR);
     await page.mouse.move(q[0], q[1]);
     const l=await page.evaluate(()=>({r:compasCourant.etat().r,
       aff:document.getElementById('valEcart').textContent}));
     valeurs.push(l.r/U); afficheur.push(l.aff);
   }
   await page.mouse.up(); await page.waitForTimeout(80);
   const entiers = valeurs.every(v=>Math.abs(v-Math.round(v))<1e-9);
   T('B9 — l’écartement est TOUJOURS un nombre entier d’unités',
     entiers, [...new Set(valeurs.map(v=>+v.toFixed(2)))].sort((a,b)=>a-b).join(' '));
   T('B9 — la petite longueur 2 est atteignable comme les autres',
     valeurs.includes(2) && valeurs.includes(3) && valeurs.includes(4));
   T('B9 — un afficheur donne la valeur ailleurs que sous le doigt',
     afficheur.every((a,i)=>a===String(Math.round(valeurs[i]))), afficheur.slice(0,6).join(' '));
 }

 await page.goto(base+'?competence=ce2-compas'); await page.waitForTimeout(280);
 await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='compasRayon');pos=i;question();});
 await page.waitForTimeout(180);

 /* ---------- B10 : figure annoncée, compas posable ---------- */
 await page.goto(base+'?competence=ce2-codage'); await page.waitForTimeout(200);
 const noms=await page.evaluate(async()=>{
   const r=[];
   for(let i=0;i<file.length;i++){pos=i;question();await new Promise(s=>setTimeout(s,40));
     r.push({type:file[i].type, consigne:document.getElementById('qText').textContent});}
   return r;});
 T('B10 — chaque manche annonce la figure représentée',
   noms.every(n=>/^Voici un /.test(n.consigne)), noms.map(n=>n.consigne.slice(0,26)).join(' | '));
 T('B10 — le nom annoncé est celui de la figure',
   noms.every(n=>({carre:'carré',rectangle:'rectangle',losange:'losange',
     triangleRect:'triangle rectangle',isocele:'triangle isocèle'}[n.type]
     && n.consigne.includes({carre:'carré',rectangle:'rectangle',losange:'losange',
     triangleRect:'triangle rectangle',isocele:'triangle isocèle'}[n.type]))));
 await page.evaluate(()=>{const i=file.findIndex(q=>q.type==='rectangle');pos=i;question();});
 await page.waitForTimeout(120);
 T('B10 — le bouton ne s’appelle plus « reporter »',
   !/reporter/i.test(await page.evaluate(()=>document.getElementById('btnCompas').textContent)));
 const avant=await page.evaluate(()=>({pose:file[pos]._instrumentPose===true,
   compas:!!compasCourant}));
 T('B10 — le compas n’existe pas tant qu’on ne l’a pas pris', !avant.compas && !avant.pose);
 await page.click('#btnCompas'); await page.waitForTimeout(100);
 T('B10 — le bouton fait apparaître un vrai compas',
   await page.evaluate(()=>!!compasCourant && !!document.querySelector('#scene .compas')));
 const posePasEncore=await page.evaluate(()=>file[pos]._instrumentPose===true);
 T('B10 — le prendre ne suffit pas à déclarer la vérification faite', posePasEncore===false);
 /* on reporte vraiment : pointe sur le sommet 0, ouverture jusqu'au sommet 1 */
 const pts=await page.evaluate(()=>file[pos].pts);
 const s0=await svgPt(pts[0][0],pts[0][1]), s1=await svgPt(pts[1][0],pts[1][1]);
 await page.mouse.move(s0[0],s0[1]); await page.mouse.down();
 for(let i=1;i<=10;i++) await page.mouse.move(s0[0]+(s1[0]-s0[0])*i/10, s0[1]+(s1[1]-s0[1])*i/10);
 await page.mouse.up(); await page.waitForTimeout(1500);
 const apresReport=await page.evaluate(()=>({pose:file[pos]._instrumentPose===true,
   verr:compasCourant.estVerrouille(), cercles:document.querySelectorAll('.compas-cercle').length}));
 T('B10 — reporter pour de vrai vaut vérification', apresReport.pose===true, JSON.stringify(apresReport));
 T('B10 — l’écartement se verrouille après le premier report', apresReport.verr===true);
 T('B10 — l’arc de report est tracé', apresReport.cercles>=1, apresReport.cercles);
 /* tampons neutralisés tant que le compas est en main */
 const marquesAvant=await page.evaluate(()=>document.querySelectorAll('#marques *').length);
 const som=await svgPt(pts[0][0],pts[0][1]);
 await page.mouse.click(som[0],som[1]); await page.waitForTimeout(80);
 T('B10 — compas en main, les tampons ne se posent pas',
   (await page.evaluate(()=>document.querySelectorAll('#marques *').length))===marquesAvant);
 await page.click('#btnCompas'); await page.waitForTimeout(100);
 T('B10 — reposer le compas le fait disparaître',
   await page.evaluate(()=>!compasCourant && !document.querySelector('#scene .compas')));

 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
