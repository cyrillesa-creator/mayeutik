const socle = require('./socle.js');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=socle.chargerPlaywright();
const RACINE=socle.RACINE;
let ok=0,ko=0;
const T=(n,c,d)=>{if(c){ok++;console.log('OK   '+n,d===undefined?'':d);}else{ko++;console.log('KO   '+n,d===undefined?'':d);}};
const srv=http.createServer((q,r)=>{const p=path.join(RACINE,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d);});});
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
 const base=`http://localhost:${port}/jeux/M35-verifier-coder.html`;
 const nav=await chromium.launch({executablePath:socle.EXEC_CHROMIUM});
 const page=await nav.newPage({viewport:{width:390,height:780}});
 const err=[];page.on('pageerror',e=>err.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))err.push(m.text());});
 await page.goto(base);
 await page.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE2'}]));
  localStorage.setItem('mayeutik-profil-actif','p1');localStorage.setItem('mayeutik-sessions','[]');});

 /* --- Géométrie pure : hystérésis, plafond, hauteur de charnière --- */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(250);
 const geo=await page.evaluate(()=>{
   const B=MoteurCompas.BRANCHE, U=MoteurCompas.UNITE;
   return {B,U,rmax:MoteurCompas.R_MAX,
     branchesEnUnites:B/U, plafondEnUnites:MoteurCompas.R_MAX/U};
 });
 /* On ne fige plus les NOMBRES — ils ont changé quand la règle graduée a
    grandi, et un test qui recopie une constante transforme chaque reglage en
    faux echec. On fige la PROPRIÉTÉ : les branches doivent etre assez longues
    pour tous les rayons demandes par le module, et assez courtes pour que le
    compas soit franchement ouvert. Trop longues, il reste presque ferme et sa
    charniere monte hors du plan — c'est le risque que le prototype signalait. */
 T('l’unité est une longueur positive, partagée avec M38', geo.U > 0, geo.U + ' px');
 T('le rayon plafonne à 2 × branche', geo.rmax===2*geo.B, `${geo.plafondEnUnites} unités`);
 const rayons = await page.evaluate(()=>{
   const cfg = CONTENU.paliers.CE2.miniJeux.find(m=>m.mode==='compas2');
   return engendrerFile(cfg).filter(q=>q.mode==='compasRayon').map(q=>q.rayonUnites);
 });
 const rMaxDemande = Math.max(...rayons) * geo.U;
 const ouverture = 2 * Math.asin(rMaxDemande / (2 * geo.B)) * 180 / Math.PI;
 T('les branches couvrent tous les rayons demandés, avec de la marge',
   rMaxDemande < geo.rmax * 0.9, `plus grand rayon ${rMaxDemande}, plafond ${geo.rmax}`);
 T('et le compas s’ouvre franchement au plus grand rayon',
   ouverture >= 30, ouverture.toFixed(0) + '° d’ouverture');

 const svgPt=async(x,y)=>page.evaluate(([x,y])=>{const s=document.getElementById('scene');
   const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y];},[x,y]);
 const glisser=async(de,vers,pas)=>{
   const a=await svgPt(de[0],de[1]), b=await svgPt(vers[0],vers[1]);
   await page.mouse.move(a[0],a[1]); await page.mouse.down();
   const n=pas||10;
   for(let i=1;i<=n;i++) await page.mouse.move(a[0]+(b[0]-a[0])*i/n, a[1]+(b[1]-a[1])*i/n);
   await page.mouse.up();
 };

 /* --- Le geste : un doigt, du plantage au tracé --- */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(280);
 await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='priseEnMain');pos=i;question();});
 await page.waitForTimeout(200);
 const c0=[200,300];
 const a=await svgPt(c0[0],c0[1]);
 await page.mouse.move(a[0],a[1]); await page.mouse.down();
 const b1=await svgPt(260,300);
 await page.mouse.move(b1[0],b1[1]);
 const pendant=await page.evaluate(()=>({e:compasCourant.etat(),
   rayonPointille:!!document.querySelector('.compas-rayon'),
   branches:document.querySelectorAll('.compas .branche').length}));
 T('pointerdown plante la pointe', pendant.e.centre!==null && Math.abs(pendant.e.centre[0]-200)<1);
 T('le glissement ouvre le compas', Math.abs(pendant.e.r-60)<2, pendant.e.r.toFixed(1));
 T('un rayon en pointillé suit le doigt', pendant.rayonPointille);
 T('le compas a bien deux branches', pendant.branches===2);
 await page.mouse.up();
 await page.waitForTimeout(1400);
 const apres=await page.evaluate(()=>({e:compasCourant.etat(),
   cercle:!!document.querySelector('.compas-cercle'),
   fin:!document.getElementById('btnNext').style.display.includes('none')}));
 T('pointerup trace le cercle', apres.cercle && apres.e.phase==='pose');
 T('la manche se conclut', apres.fin);

 /* --- Le bug du glissement VERTICAL : la charnière ne doit pas sauter --- */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(280);
 await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='priseEnMain');pos=i;question();});
 await page.waitForTimeout(200);
 const dep=await svgPt(200,250);
 await page.mouse.move(dep[0],dep[1]); await page.mouse.down();
 const positions=[];
 for(let k=1;k<=24;k++){
   /* on descend tout droit, avec un tremblement de ±1,5 px comme un vrai doigt */
   const dx=(k%2?1.5:-1.5), dy=k*4;
   const q=await svgPt(200+dx,250+dy);
   await page.mouse.move(q[0],q[1]);
   /* La charnière est un noeud PERMANENT, masque tant que le compas est
      ferme : « absente » se lit desormais sur display, pas sur le DOM. */
   positions.push(await page.evaluate(()=>{const c=document.querySelector('.compas .charniere');
     return (c && c.getAttribute('display')!=='none')?[+c.getAttribute('cx'),+c.getAttribute('cy')]:null;}));
 }
 await page.mouse.up();
 let sauts=0, pireSaut=0;
 for(let i=1;i<positions.length;i++){
   if(!positions[i]||!positions[i-1])continue;
   const d=Math.hypot(positions[i][0]-positions[i-1][0],positions[i][1]-positions[i-1][1]);
   pireSaut=Math.max(pireSaut,d);
   if(d>40) sauts++;
 }
 T('glissement vertical vers le bas : la charnière ne bascule pas',
   sauts===0, `${sauts} sauts, pire écart ${pireSaut.toFixed(1)} px`);
 /* La charnière n'existe qu'à partir d'une ouverture franche : avant, le
    compas est fermé et n'a pas d'orientation. Une fois apparue, elle ne doit
    plus jamais disparaître ni devenir NaN. */
 const premier=positions.findIndex(p=>p);
 T('la charnière apparaît puis reste définie',
   premier>=0 && positions.slice(premier).every(p=>p&&isFinite(p[0])&&isFinite(p[1])),
   `apparue au relevé ${premier+1}/${positions.length}`);

 /* --- Le plafond d'ouverture --- */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(280);
 await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='priseEnMain');pos=i;question();});
 await page.waitForTimeout(200);
 const plaf=await page.evaluate(()=>{
   /* On force un rayon absurde par l'API : la hauteur de charnière doit
      rester finie et le rayon se borner. */
   compasCourant.placer([200,300], 4000);
   const e=compasCourant.etat();
   const c=document.querySelector('.compas .charniere');
   return {r:e.r, grandOuvert:compasCourant.grandOuvert(),
     charniere:(c && c.getAttribute('display')!=='none')?[+c.getAttribute('cx'),+c.getAttribute('cy')]:null};
 });
 T('un rayon démesuré est plafonné', plaf.r===MoteurCompasRMAX(geo), plaf.r);
 T('le compas signale qu’il est grand ouvert', plaf.grandOuvert);
 T('la charnière reste un nombre fini au plafond',
   plaf.charniere && isFinite(plaf.charniere[0]) && isFinite(plaf.charniere[1]), JSON.stringify(plaf.charniere));

 /* --- Cercle passant par un point donné --- */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(280);
 const passant=await page.evaluate(async()=>{
   const i=file.findIndex(q=>q.mode==='compasPassant');pos=i;question();
   await new Promise(r=>setTimeout(r,120));
   return {c:file[pos]._c,p:file[pos]._p};
 });
 const rAtt=Math.hypot(passant.p[0]-passant.c[0],passant.p[1]-passant.c[1]);
 await glisser(passant.c,passant.p,14);
 await page.waitForTimeout(1400);
 const rp=await page.evaluate(()=>({ok:file[pos]._ok,pts:file[pos]._pts,e:compasCourant.etat()}));
 T('planter sur le point noir et glisser jusqu’à l’orange est juste',
   rp.ok===true && rp.pts>0, `r=${rp.e.r.toFixed(1)} attendu ${rAtt.toFixed(1)}`);

 /* Une erreur : révélation différée en vert, et plus rien ne bouge (§18) */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(280);
 const pas2=await page.evaluate(async()=>{const i=file.findIndex(q=>q.mode==='compasPassant');pos=i;question();
   await new Promise(r=>setTimeout(r,120));return {c:file[pos]._c,p:file[pos]._p};});
 const loin=[pas2.c[0]+(pas2.p[0]-pas2.c[0])*1.7, pas2.c[1]+(pas2.p[1]-pas2.c[1])*1.7];
 await glisser(pas2.c,loin,14);
 /* Le tracé dure ~1,15 s ; la révélation vient 900 ms APRÈS lui, et le
    passage automatique 2 s après. On échantillonne entre les deux. */
 await page.waitForTimeout(1350);
 await page.evaluate(()=>{clearTimeout(minuteurAuto);});
 const avantRev=await page.evaluate(()=>document.querySelectorAll('.compas-cercle.attendu').length);
 await page.waitForTimeout(900);
 const err18=await page.evaluate(async()=>{
   desarmerAutoSuivant();
   const av=compasCourant.etat();
   /* On tente de retracer après validation : rien ne doit bouger. */
   const s=document.getElementById('scene');
   const ev=(t,x,y)=>s.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:1}));
   const b=s.getBoundingClientRect();
   ev('pointerdown',b.x+40,b.y+b.height-40); ev('pointermove',b.x+90,b.y+b.height-40); ev('pointerup',b.x+90,b.y+b.height-40);
   return {ok:file[pos]._ok, attendu:document.querySelectorAll('.compas-cercle.attendu').length,
     rouge:document.querySelectorAll('.compas-cercle.attendu[stroke="red"]').length,
     apres:compasCourant.etat(), av, fb:document.getElementById('feedback').textContent};
 });
 T('une erreur est comptée comme telle', err18.ok===false);
 T('§18 la correction est différée (~900 ms)', avantRev===0 && err18.attendu===1, `${avantRev} → ${err18.attendu}`);
 T('§18 le cercle attendu est en vert, jamais en rouge', err18.rouge===0);
 const teintes=await page.evaluate(()=>({
   faux:document.querySelectorAll('.compas-cercle.faux').length,
   attenduRouge:document.querySelectorAll('.compas-cercle.attendu.faux').length}));
 T('§18 le cercle tracé par l’enfant est distingué du cercle attendu',
   teintes.faux===1 && teintes.attenduRouge===0, JSON.stringify(teintes));
 T('pas d’essai-erreur sur place après validation',
   err18.apres.centre[0]===err18.av.centre[0] && err18.apres.r===err18.av.r);

 /* --- prefers-reduced-motion : le cercle apparaît d'un trait --- */
 const page2=await nav.newPage({viewport:{width:390,height:780},reducedMotion:'reduce'});
 await page2.goto(base);
 await page2.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE2'}]));
  localStorage.setItem('mayeutik-profil-actif','p1');localStorage.setItem('mayeutik-sessions','[]');});
 await page2.goto(base+'?competence=ce1-compas');await page2.waitForTimeout(280);
 await page2.evaluate(()=>{const i=file.findIndex(q=>q.mode==='priseEnMain');pos=i;question();});
 await page2.waitForTimeout(200);
 const r2=await page2.evaluate(()=>{const s=document.getElementById('scene');
   const p=s.createSVGPoint();p.x=200;p.y=300;const q=p.matrixTransform(s.getScreenCTM());
   const p2=s.createSVGPoint();p2.x=260;p2.y=300;const q2=p2.matrixTransform(s.getScreenCTM());
   const ev=(t,x,y)=>s.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:1}));
   ev('pointerdown',q.x,q.y); ev('pointermove',q2.x,q2.y); ev('pointerup',q2.x,q2.y);
   return {phase:compasCourant.etat().phase, cercle:!!document.querySelector('.compas-cercle')};
 });
 T('prefers-reduced-motion : le cercle apparaît sans animation',
   r2.phase==='pose' && r2.cercle, JSON.stringify(r2));
 await page2.close();

 /* --- Tactile : none sur la zone de tracé seulement --- */
 const tact=await page.evaluate(()=>({
   scene:getComputedStyle(document.getElementById('scene')).touchAction,
   corps:getComputedStyle(document.body).touchAction
 }));
 T('§19 touch-action:none sur la seule zone de tracé',
   tact.scene==='none' && tact.corps==='pan-y', JSON.stringify(tact));

 /* --- Les écouteurs ne s'empilent pas --- */
 await page.goto(base+'?competence=ce1-compas');await page.waitForTimeout(280);
 const empil=await page.evaluate(async()=>{
   for(let i=0;i<5;i++){pos=i%file.length;question();await new Promise(r=>setTimeout(r,60));}
   const i=file.findIndex(q=>q.mode==='priseEnMain');pos=i;question();
   await new Promise(r=>setTimeout(r,80));
   return document.querySelectorAll('#scene .compas').length;
 });
 T('un seul compas vit à la fois', empil===1, empil);

 /* ---------- LA LOUPE ----------
    Au moment ou l'enfant plante la pointe, son doigt couvre l'endroit vise. */
 await page.goto(base+'?competence=ce1-compas'); await page.waitForTimeout(280);
 await page.evaluate(()=>{const i=file.findIndex(q=>q.mode==='compasPassant');pos=i;question();});
 await page.waitForTimeout(200);
 T('la loupe reste cachée tant qu’aucun doigt n’appuie',
   (await page.evaluate(()=>document.querySelector('.compas-loupe').getAttribute('display')))==='none');
 const cL = await page.evaluate(()=>file[pos]._c);
 const eL = await svgPt(cL[0], cL[1]);
 await page.mouse.move(eL[0], eL[1]); await page.mouse.down(); await page.waitForTimeout(90);
 const loupeVue = await page.evaluate((c)=>{
   const g=document.querySelector('.compas-loupe');
   const m=(g.getAttribute('transform')||'').match(/translate\(([-\d.]+),([-\d.]+)\)/);
   return {vu:g.getAttribute('display'), x:+m[1], y:+m[2],
     use:g.querySelector('use').getAttribute('transform'), cible:c,
     evts:getComputedStyle(g).pointerEvents};
 }, cL);
 T('elle apparaît dès que la pointe se plante', loupeVue.vu==='inline');
 T('elle se décale du doigt au lieu de se poser dessus',
   Math.abs(loupeVue.y-loupeVue.cible[1])>40, 'loupe y='+loupeVue.y+', doigt y='+loupeVue.cible[1].toFixed(0));
 T('elle reste dans le plan',
   loupeVue.x>=0&&loupeVue.x<=400&&loupeVue.y>=0&&loupeVue.y<=400, loupeVue.x+','+loupeVue.y);
 T('son contenu est recentré sur le point observé et agrandi',
   /scale\(2\)/.test(loupeVue.use)&&loupeVue.use.includes((-loupeVue.cible[0]).toFixed(2)), loupeVue.use);
 T('elle n’intercepte aucun toucher', loupeVue.evts==='none', loupeVue.evts);
 T('elle ne montre ni le compas ni elle-même',
   await page.evaluate(()=>{const m=document.querySelector('.compas-monde');
     return !m.querySelector('.compas-loupe') && !m.querySelector('.compas');}));
 await page.mouse.up(); await page.waitForTimeout(1500);
 T('elle disparaît quand le doigt se lève',
   (await page.evaluate(()=>document.querySelector('.compas-loupe').getAttribute('display')))==='none');
 /* La loupe EMPRUNTE les enfants du SVG : elle doit les rendre intacts. */
 const dom = await page.evaluate(()=>{
   const svg=document.getElementById('scene');
   compasCourant.detruire();
   return {apres:[...svg.children].map(e=>e.tagName),
     resteMonde:!!svg.querySelector('.compas-monde'),
     resteLoupe:!!svg.querySelector('.compas-loupe')};
 });
 T('détruire le compas rend au SVG sa structure d’origine',
   !dom.resteMonde && !dom.resteLoupe && dom.apres.length>0, dom.apres.join(','));

 console.log('\nErreurs JS/console :',err.length?err.slice(0,5):'aucune');
 if(err.length)ko+=err.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close();srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
function MoteurCompasRMAX(geo){return geo.rmax;}
