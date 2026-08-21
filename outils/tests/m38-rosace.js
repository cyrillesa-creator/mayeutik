/* Étape 3 du prompt compas-rosace : la rosace construite au compas. */
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
 const base='http://localhost:'+srv.address().port+'/jeux/M38-reproduire-construire.html';
 const nav=await chromium.launch({executablePath:socle.EXEC_CHROMIUM});
 const page=await nav.newPage({viewport:{width:390,height:860},deviceScaleFactor:2});
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.location().url||''))erreurs.push(m.text());});
 const svgPt=async(x,y)=>page.evaluate(([x,y])=>{const s=document.getElementById('scene');
   const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y];},[x,y]);
 const glisser=async(de,vers)=>{await page.mouse.move(de[0],de[1]);await page.mouse.down();
   for(let i=1;i<=8;i++)await page.mouse.move(de[0]+(vers[0]-de[0])*i/8, de[1]+(vers[1]-de[1])*i/8);
   await page.mouse.up();};
 const ouvrir=async()=>{await page.goto(base+'?competence=ce2-rosace');await page.waitForTimeout(380);};
 const premierCercle=async(frac)=>{
   const O=await page.evaluate(()=>file[pos]._O);
   const rMax=await page.evaluate(()=>rayonMaxRosace());
   const r=Math.round(rMax*(frac||0.7));
   await glisser(await svgPt(O[0],O[1]), await svgPt(O[0]+r,O[1]));
   await page.waitForTimeout(1500);
   return {O, R:await page.evaluate(()=>file[pos]._r)};
 };
 const planter=async(O,R,th)=>{
   const p=await svgPt(O[0]+Math.cos(th)*R, O[1]+Math.sin(th)*R);
   await page.mouse.move(p[0],p[1]); await page.mouse.down(); await page.mouse.up();
   await page.waitForTimeout(1350);
 };

 /* ---- 1. Le nombre six n'est écrit NULLE PART : il doit se découvrir ---- */
 await ouvrir();
 const textes=await page.evaluate(()=>{
   const q=file[pos];
   return [q.q, q.enonce, q.sous, document.getElementById('qText').textContent].join(' | ');
 });
 T('le nombre six n’est annoncé ni par la consigne ni par l’énoncé',
   !/\b(six|6)\b/i.test(textes), textes.slice(0,90));
 T('la manche ne déclare aucun nombre de points attendu',
   await page.evaluate(()=>file[pos].nbPointsAttendu===undefined && file[pos].solutions.length===0));

 /* ---- 2. Le premier cercle verrouille l'écartement ---- */
 const {O,R}=await premierCercle(0.7);
 const apres1=await page.evaluate(()=>({r:file[pos]._r, n:file[pos]._centres.length}));
 T('le premier cercle fixe l’écartement', apres1.r>0 && apres1.n===0, 'r='+Math.round(apres1.r));
 /* on tente d'ouvrir davantage : le rayon ne doit plus bouger */
 const p1=await svgPt(O[0]+R, O[1]);
 await page.mouse.move(p1[0],p1[1]); await page.mouse.down();
 const loin=await svgPt(O[0]+R*1.8, O[1]);
 await page.mouse.move(loin[0],loin[1]);
 const pendant=await page.evaluate(()=>document.querySelector('#scene').ownerDocument &&
   (window._r||0));
 await page.mouse.up(); await page.waitForTimeout(1400);
 T('l’écartement ne bouge plus : c’est ce qui rend la fermeture possible',
   Math.abs(await page.evaluate(()=>file[pos]._r) - R) < 0.01);

 /* ---- 3. Le rayon est borné pour que la rosace tienne dans le panneau ---- */
 await ouvrir();
 const O2=await page.evaluate(()=>file[pos]._O);
 const tresLoin=await svgPt(O2[0]+900, O2[1]);
 await glisser(await svgPt(O2[0],O2[1]), tresLoin); await page.waitForTimeout(1500);
 const borne=await page.evaluate(()=>({r:file[pos]._r, max:rayonMaxRosace(),
   z:{x0:ZONE_PLEINE.x0,y0:ZONE_PLEINE.y0,l:ZONE_PLEINE.l,h:ZONE_PLEINE.h}, O:file[pos]._O}));
 T('le premier rayon est borné', borne.r<=borne.max+0.01, borne.r+' ≤ '+borne.max);
 T('et la rosace entière (rayon 2r) tient dans le panneau',
   borne.O[0]-2*borne.r>=borne.z.x0 && borne.O[0]+2*borne.r<=borne.z.x0+borne.z.l
   && borne.O[1]-2*borne.r>=borne.z.y0 && borne.O[1]+2*borne.r<=borne.z.y0+borne.z.h,
   'rayon utile '+(2*borne.r).toFixed(0));

 /* ---- 4. Six pétales réguliers puis retour au départ : la rosace se ferme ---- */
 await ouvrir();
 const a=await premierCercle(0.7);
 for(let i=0;i<6;i++) await planter(a.O, a.R, -Math.PI/2 + i*Math.PI/3);
 const avantFermeture=await page.evaluate(()=>({ok:file[pos]._ok, n:file[pos]._centres.length}));
 T('six arcs posés, la manche n’est pas encore conclue',
   avantFermeture.ok===undefined && avantFermeture.n===6, JSON.stringify(avantFermeture));
 await planter(a.O, a.R, -Math.PI/2);
 await page.waitForTimeout(400);
 const ferme=await page.evaluate(()=>({ok:file[pos]._ok,
   hex:document.querySelectorAll('.hexagone-final').length,
   petales:document.querySelectorAll('.petale').length,
   fb:document.getElementById('feedback').textContent,
   compas:document.querySelectorAll('#scene .compas').length}));
 T('le septième appui retombe sur le départ et referme la rosace', ferme.ok===true);
 T('les six pétales et l’hexagone apparaissent',
   ferme.petales===6 && ferme.hex===1, JSON.stringify({p:ferme.petales,h:ferme.hex}));
 T('l’hexagone est NOMMÉ, pour information', /hexagone/i.test(ferme.fb), ferme.fb);
 T('l’instrument se retire de la figure achevée', ferme.compas===0);

 /* ---- 5. LE POINT CRITIQUE : revenir au départ ne suffit pas ----
    La pointe peut se poser n'importe où sur le cercle de base. Six points
    au hasard puis un retour au depart ne doivent PAS valoir rosace. */
 await ouvrir();
 const b=await premierCercle(0.7);
 const anglesTordus=[-Math.PI/2, -1.2, -0.55, 0.2, 1.4, 2.6];
 for(const th of anglesTordus) await planter(b.O, b.R, th);
 await planter(b.O, b.R, -Math.PI/2);
 await page.waitForTimeout(400);
 const tordu=await page.evaluate(()=>({ok:file[pos]._ok, n:file[pos]._centres.length}));
 T('six centres IRRÉGULIERS ne referment pas la rosace',
   tordu.ok===false, JSON.stringify(tordu));
 await page.waitForTimeout(1200);
 T('et la construction juste est montrée (§18)',
   (await page.evaluate(()=>document.querySelectorAll('.attendu').length))>=6);

 /* ---- 6. La pointe se pose SUR le cercle, pas n'importe où ---- */
 await ouvrir();
 const c=await premierCercle(0.7);
 const dedans=await svgPt(c.O[0]+c.R*0.4, c.O[1]);
 await page.mouse.move(dedans[0],dedans[1]); await page.mouse.down(); await page.mouse.up();
 await page.waitForTimeout(1350);
 const proj=await page.evaluate(()=>file[pos]._centres.map(p=>p.slice()));
 T('un appui à l’intérieur se projette sur le cercle de base',
   proj.length===1 && Math.abs(Math.hypot(proj[0][0]-c.O[0], proj[0][1]-c.O[1]) - c.R) < 0.5,
   proj.length ? Math.hypot(proj[0][0]-c.O[0], proj[0][1]-c.O[1]).toFixed(1)+' pour R='+c.R.toFixed(1) : 'aucun');

 /* ---- 7. POSER LA POINTE EST UN GESTE, PAS UN TAP ----
    Tant que l'ecartement est fige, le glissement deplace la POINTE : l'enfant
    appuie, regarde dans la loupe, ajuste, et relache quand c'est juste. Sans
    cela la loupe montrait un endroit deja arrete, donc inutile. */
 await ouvrir();
 const d=await premierCercle(0.7);
 const depart=await svgPt(d.O[0]+d.R, d.O[1]);          // à droite du centre
 await page.mouse.move(depart[0], depart[1]); await page.mouse.down();
 await page.waitForTimeout(60);
 const vu1=await page.evaluate(()=>({loupe:document.querySelector('.compas-loupe').getAttribute('display'),
   }));
 T('la loupe s’ouvre à l’appui, avant tout tracé', vu1.loupe==='inline');
 /* on glisse jusqu'en haut du cercle sans relâcher */
 const haut=await svgPt(d.O[0], d.O[1]-d.R);
 for(let i=1;i<=8;i++) await page.mouse.move(depart[0]+(haut[0]-depart[0])*i/8,
                                             depart[1]+(haut[1]-depart[1])*i/8);
 await page.waitForTimeout(60);
 await page.screenshot({path:socle.capture('m38-rosace-pointe-ajustee.png')});
 await page.mouse.up(); await page.waitForTimeout(1400);
 const pose=await page.evaluate(()=>file[pos]._centres.map(p=>p.slice()));
 T('la pointe suit le doigt tant qu’on n’a pas relâché',
   pose.length===1 && Math.abs(pose[0][1]-(d.O[1]-d.R))<1.5 && Math.abs(pose[0][0]-d.O[0])<1.5,
   pose.length ? pose[0].map(v=>v.toFixed(0)).join(',') + ' pour ' + [d.O[0], d.O[1]-d.R].map(v=>v.toFixed(0)).join(',') : 'aucun');
 T('et la loupe se referme au relâchement',
   (await page.evaluate(()=>document.querySelector('.compas-loupe').getAttribute('display')))==='none');

 /* ---- 7. « J'AI FINI » DEMANDE LE VERDICT, IL NE LE DÉCRÈTE PAS ----
    Le bouton appelait `juger(false)` : quoi que l'enfant ait construit, la
    manche était perdue. Une rosace parfaite — six pétales pile à soixante
    degrés — rendait « Presque ! ». Et c'est le SEUL bouton visible : celui
    qui se croit arrivé au bout appuie dessus, forcément. */
 const fini=async()=>{
   await page.evaluate(()=>[...document.querySelectorAll('#barreOutils .outil')]
     .find(x=>/fini/i.test(x.textContent)).click());
   await page.waitForTimeout(400);
   return page.evaluate(()=>({ok:file[pos]._ok,
     fb:document.getElementById('feedback').textContent.trim(),
     hex:document.querySelectorAll('.hexagone-final').length}));
 };
 await ouvrir();
 const q1=await premierCercle(0.7);
 for(let i=0;i<6;i++) await planter(q1.O, q1.R, -Math.PI/2 + i*Math.PI/3);
 const parfaite=await fini();
 T('« j\u2019ai fini » sur une rosace parfaite : la manche est RÉUSSIE',
   parfaite.ok===true, JSON.stringify({ok:parfaite.ok, fb:parfaite.fb.slice(0,60)}));
 T('et le retour dit ce qui a été construit, pas « presque »',
   /hexagone/i.test(parfaite.fb) && !/Presque/.test(parfaite.fb), parfaite.fb.slice(0,70));

 await ouvrir();
 const q2=await premierCercle(0.7);
 for(let i=0;i<3;i++) await planter(q2.O, q2.R, -Math.PI/2 + i*Math.PI/3);
 const troisPetales=await fini();
 T('« j\u2019ai fini » à trois pétales : la rosace n\u2019est pas faite',
   troisPetales.ok===false, JSON.stringify({ok:troisPetales.ok}));

 await ouvrir();
 const q3=await premierCercle(0.7);
 for(const th of [-Math.PI/2, -1.2, -0.55, 0.2, 1.4, 2.6]) await planter(q3.O, q3.R, th);
 const tordue=await fini();
 T('« j\u2019ai fini » sur six pétales IRRÉGULIERS : refusé',
   tordue.ok===false, JSON.stringify({ok:tordue.ok}));

 /* Six justes ET deux de plus : les pétales en trop comptent, comme les
    traits en trop comptent partout ailleurs dans ce module. */
 await ouvrir();
 const q4=await premierCercle(0.7);
 for(let i=0;i<6;i++) await planter(q4.O, q4.R, -Math.PI/2 + i*Math.PI/3);
 await planter(q4.O, q4.R, -Math.PI/2 + 0.42);
 const nb=await page.evaluate(()=>file[pos]._centres.length);
 const enTrop=await fini();
 T('un pétale en trop est bien venu s\u2019ajouter', nb===7, nb+' centres');
 T('sept pétales dont six justes : refusé, les pétales en trop comptent',
   enTrop.ok===false, JSON.stringify({ok:enTrop.ok, n:nb}));

 /* ---- 8. LA TOLÉRANCE, MESURÉE PLUTÔT QUE DÉCLARÉE ----
    Chaque croisement construit est un aimant : une pointe posée à sa portée
    y tombe EXACTEMENT. La tolérance utile est donc celle de l'aimant, et le
    jugement se règle dessus — ni plus sévère (il refuserait un placement que
    l'instrument venait d'accepter), ni plus large (il accepterait un point
    que personne n'a construit). On balaie l'écart angulaire du DERNIER
    pétale pour lire où l'acceptation s'arrête. */
 const bornes={accepte:[], refuse:[]};
 for(const deg of [0, 4, 8, 11, 20, 30]){
   await ouvrir();
   const qq=await premierCercle(0.7);
   for(let i=0;i<5;i++) await planter(qq.O, qq.R, -Math.PI/2 + i*Math.PI/3);
   await planter(qq.O, qq.R, -Math.PI/2 + 5*Math.PI/3 + deg*Math.PI/180);
   const r=await fini();
   (r.ok ? bornes.accepte : bornes.refuse).push(deg);
 }
 T('tolérance — viser juste, ou à quelques degrés près, est accepté',
   bornes.accepte.includes(0) && bornes.accepte.includes(4) && bornes.accepte.includes(8),
   'acceptés : ' + bornes.accepte.join('°, ') + '°');
 T('tolérance — mais un pétale posé à 30° de sa place est refusé',
   bornes.refuse.includes(30), 'refusés : ' + bornes.refuse.join('°, ') + '°');
 /* ET CE QUI EST ACCEPTÉ EST EXACT. Il n'existe pas de pétale « presque
    juste » : l'aimant décide avant la tolérance. On relit donc les angles
    des six centres après un tir volontairement dévié de 11 degrés. */
 await ouvrir();
 const qe=await premierCercle(0.7);
 for(let i=0;i<5;i++) await planter(qe.O, qe.R, -Math.PI/2 + i*Math.PI/3);
 await planter(qe.O, qe.R, -Math.PI/2 + 5*Math.PI/3 + 11*Math.PI/180);
 const ecarts=await page.evaluate(()=>{
   const q=file[pos], O=q._O;
   const a=q._centres.map(c=>Math.atan2(c[1]-O[1], c[0]-O[0])).map(x=>(x+TAU)%TAU).sort((x,y)=>x-y);
   return a.map((x,i)=>+(((a[(i+1)%6]-x+TAU)%TAU)*180/Math.PI - 60).toFixed(2));
 });
 T('tolérance — un pétale accepté est un pétale EXACT : l\u2019aimant décide avant la tolérance',
   ecarts.every(e=>Math.abs(e)<0.01), 'écarts au 60° : ' + ecarts.join('°, ') + '°');

 T('tolérance — la frontière est unique : tout ce qui est accepté est sous ce qui est refusé',
   Math.max(...bornes.accepte) < Math.min(...bornes.refuse),
   'accepté jusqu\u2019à ' + Math.max(...bornes.accepte) + '°, refusé dès '
     + Math.min(...bornes.refuse) + '°');

 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
