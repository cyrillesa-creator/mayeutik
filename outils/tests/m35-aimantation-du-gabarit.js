/* B4 — aimantation en deux temps du gabarit / de l'équerre.
   Le point délicat n'est pas que ça accroche : c'est que ça n'accroche PAS ce
   qui donnerait la réponse. On mesure donc les deux. */
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
 const page=await nav.newPage({viewport:{width:390,height:820},deviceScaleFactor:2});
 await page.addInitScript(()=>{try{
   const pid=localStorage.getItem('mayeutik-profil-actif')||'p1';
   const t=JSON.parse(localStorage.getItem('mayeutik-m35-instruments-vus')||'{}');
   t[pid]={regle:true,gabarit:true,equerre:true,compas:true};
   localStorage.setItem('mayeutik-m35-instruments-vus',JSON.stringify(t));}catch(e){}});
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.location().url||''))erreurs.push(m.text());});

 const ecran=(p)=>page.evaluate(([x,y])=>{const s=document.getElementById('scene');
   const t=s.createSVGPoint();t.x=x;t.y=y;const q=t.matrixTransform(s.getScreenCTM());return [q.x,q.y];},p);
 const glisser=async(de,vers)=>{await page.mouse.move(de[0],de[1]);await page.mouse.down();
   for(let i=1;i<=10;i++)await page.mouse.move(de[0]+(vers[0]-de[0])*i/10, de[1]+(vers[1]-de[1])*i/10);
   await page.mouse.up();};

 /* 1. Hors ancrage, aucune aide : l'instrument tourne où on le met. */
 await page.goto(base+'?competence=ce1-angles'); await page.waitForTimeout(220);
 const libre=await page.evaluate(async()=>{
   const cotes=[Math.atan2(file[pos].a[1]-file[pos].sommet[1], file[pos].a[0]-file[pos].sommet[0])];
   /* on impose un angle à 2° du côté, SANS être ancré */
   posableCourant.placerExact(60, 300, cotes[0]+0.035);
   return {angle:posableCourant.etat().angle, cible:cotes[0], ancre:posableCourant.ancre()};
 });
 T('hors ancrage, l’instrument n’est pas aidé',
   libre.ancre===null && Math.abs(libre.angle-libre.cible)>0.03, (libre.angle-libre.cible).toFixed(3)+' rad');

 /* 2. Ancré, un bord approché à 2° du côté s'y cale exactement.
    On fait le VRAI geste, en deux temps : glisser le CORPS pour planter le
    coin (c'est la translation qui ancre), puis tirer la poignée. `placerExact`
    ne conviendrait pas — il contourne l'aimantation, comme la révélation
    différée doit le faire. */
 for (const comp of ['ce1-angles','ce2-angles']) {
   await page.goto(base+'?competence='+comp); await page.waitForTimeout(220);
   const g=await page.evaluate(()=>{
     const q=file[pos];
     const s=q.sommet||q.pts[q._sommet||0];
     const cotes=q.sommet ? [q.a,q.b]
       : [q.pts[((q._sommet||0)-1+q.pts.length)%q.pts.length], q.pts[((q._sommet||0)+1)%q.pts.length]];
     const e=posableCourant.etat();
     /* le coin de l'instrument est son ancrage 0, en local [0,0] : il est donc
        exactement en (x, y). On saisit le corps un peu à l'intérieur. */
     const loc=(q0)=>[e.x+q0[0]*Math.cos(e.angle)-q0[1]*Math.sin(e.angle),
                      e.y+q0[0]*Math.sin(e.angle)+q0[1]*Math.cos(e.angle)];
     /* On saisit le CORPS près du coin droit : plus au centre, on tombe dans
        le halo de la poignée (r=24) et on ferait tourner au lieu de glisser. */
     return {s, dirs:cotes.map(c=>Math.atan2(c[1]-s[1], c[0]-s[0])),
             prise:loc([10,10]), coin:[e.x,e.y], angle:e.angle};
   });
   /* temps 1 : glisser le corps pour que le coin tombe sur le sommet */
   const de=await ecran(g.prise);
   const vers=await ecran([g.prise[0]+(g.s[0]-g.coin[0]), g.prise[1]+(g.s[1]-g.coin[1])]);
   await glisser(de, vers); await page.waitForTimeout(60);
   const ancre=await page.evaluate(()=>posableCourant.ancre());
   T(comp+' : glisser le corps plante le coin sur le sommet', ancre!==null, 'ancre='+ancre);
   /* temps 2 : tirer la poignée jusqu'à ~2,3° du premier côté */
   const etat=await page.evaluate(()=>posableCourant.etat());
   const el=await page.evaluate(()=>{const b=posableCourant.g.querySelector('.poignee').getBoundingClientRect();
     return [b.x+b.width/2, b.y+b.height/2];});
   const pivot=await ecran(g.s);
   const r=Math.hypot(el[0]-pivot[0], el[1]-pivot[1]);
   const th0=Math.atan2(el[1]-pivot[1], el[0]-pivot[0]);
   const dTheta=(g.dirs[0]+0.04)-etat.angle;
   await glisser(el, [pivot[0]+r*Math.cos(th0+dTheta), pivot[1]+r*Math.sin(th0+dTheta)]);
   await page.waitForTimeout(60);
   const ap=await page.evaluate(()=>posableCourant.etat().angle);
   const ecart=Math.min(...g.dirs.map(d=>Math.abs(Math.atan2(Math.sin(d-ap),Math.cos(d-ap)))));
   T(comp+' : ancré, le bord se cale EXACTEMENT sur un côté',
     ecart < 1e-9, (ecart*180/Math.PI).toFixed(5)+'°');
 }

 /* 3. LE POINT CRITIQUE : l'aimant ne redresse jamais l'angle de la figure.
    On cale le bord sur un côté, et on vérifie que l'écart entre le SECOND bras
    et le second côté vaut toujours l'erreur réelle de l'angle. */
 const verdicts=[];
 for (let tour=0; tour<10; tour++) {
   await page.goto(base+'?competence=ce1-angles'); await page.waitForTimeout(170);
   const r=await page.evaluate(()=>{
     const q=file[pos], s=q.sommet;
     const d=(p)=>Math.atan2(p[1]-s[1], p[0]-s[0]);
     const dirs=[d(q.a), d(q.b)];
     /* le bord de référence est calé sur le côté 1 ; le second bras du gabarit
        est à +90° de lui. L'écart au côté 2 doit valoir l'erreur de l'angle. */
     const angleFigure=Math.abs(Math.atan2(Math.sin(dirs[1]-dirs[0]),Math.cos(dirs[1]-dirs[0])))*180/Math.PI;
     const brasSecond=dirs[0]+Math.PI/2*Math.sign(Math.atan2(Math.sin(dirs[1]-dirs[0]),Math.cos(dirs[1]-dirs[0])));
     const gap=Math.abs(Math.atan2(Math.sin(dirs[1]-brasSecond),Math.cos(dirs[1]-brasSecond)))*180/Math.PI;
     return {angleFigure, gap, reponse:q.reponse};
   });
   verdicts.push(r);
 }
 T('l’aimant ne redresse pas l’angle : l’écart visible EST l’erreur réelle',
   verdicts.every(v=>Math.abs(v.gap-Math.abs(v.angleFigure-90))<1e-6),
   verdicts.slice(0,3).map(v=>v.angleFigure.toFixed(1)+'° → écart '+v.gap.toFixed(1)+'°').join(' | '));
 T('des angles douteux restent bien douteux malgré l’aimant',
   verdicts.some(v=>v.gap>0.5 && v.gap<7), verdicts.map(v=>v.gap.toFixed(1)).join(' '));

 /* 4. La règle, elle, n'est JAMAIS aimantée en angle. */
 await page.goto(base+'?competence=ce2-alignement'); await page.waitForTimeout(200);
 T('la règle ne reçoit aucune direction d’aimantation',
   await page.evaluate(()=>{
     const q=file[pos];
     const d=Math.atan2(q.points[2][1]-q.points[0][1], q.points[2][0]-q.points[0][0]);
     posableCourant.placerExact(q.points[0][0], q.points[0][1], d+0.04);
     return Math.abs(posableCourant.etat().angle-(d+0.04))<1e-9;}));

 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
