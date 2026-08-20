/* Le convoyeur — on pilote le tapis comme un enfant, à la souris. */
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const RACINE='/home/user/mayeutik';
let ok=0,ko=0;
const T=(n,c,d)=>{if(c){ok++;console.log('OK   '+n,d===undefined?'':d);}else{ko++;console.log('KO   '+n,d===undefined?'':d);}};
const srv=http.createServer((q,r)=>{const p=path.join(RACINE,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d);});});
(async()=>{
 await new Promise(r=>srv.listen(0,r));
 const base='http://localhost:'+srv.address().port+'/jeux/M34-formes-planes.html';
 const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await nav.newPage({viewport:{width:390,height:800},deviceScaleFactor:2});
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.location().url||''))erreurs.push(m.text());});

 /* ---- 1. Génération du flux : le fond du sujet ---- */
 await page.goto(base+'?competence=cp-convoyeur'); await page.waitForTimeout(300);
 const gen=await page.evaluate(()=>{
   const r={phases:0, cibles:[], bannisVus:0, etiquettesFausses:0, pb:0, mots:[], N:CONVOYEUR_N};
   for (let t=0;t<60;t++){
     ['CP','CE1','CE2'].forEach(nom=>{
       const pal=CONTENU.paliers[nom];
       const f=construireFile(pal.miniJeux[0], pal);
       r.pb += verifierFile(f).length;
       if (t===0) r.phases=f.length;
       f.forEach(q=>{
         const noms=q.flux.map(p=>p._nomCalcule);
         r.cibles.push(noms.filter(n=>q.consigne.accepte.indexOf(n)>=0).length);
         noms.forEach((n,i)=>{
           if (q.consigne.bannis.indexOf(n)>=0) r.bannisVus++;
           if (q.flux[i]._cible !== (q.consigne.accepte.indexOf(n)>=0)) r.etiquettesFausses++;
         });
         if (t===0 && nom==='CE2') r.mots.push(q.consigne.mot);
       });
     });
   }
   return r;
 });
 T('chaque phase porte exactement N pièces cibles',
   gen.cibles.every(c=>c===gen.N), [...new Set(gen.cibles)].join(','));
 T('aucune forme bannie n’atteint le tapis', gen.bannisVus===0, gen.bannisVus);
 T('l’étiquette de cible ne contredit jamais la géométrie', gen.etiquettesFausses===0);
 T('aucune file refusée par le validateur', gen.pb===0, gen.pb);
 T('le CE2 demande bien six catégories, une fois chacune',
   gen.mots.length===6 && new Set(gen.mots).size===6, gen.mots.join(','));

 /* ---- 2. Le piège d’inclusion, dans les deux sens ---- */
 const incl=await page.evaluate(()=>{
   const r={carreAvecRectangle:0, carreAvecLosange:0, triRectRefuseComme:0, triRectAccepteComme:0, n:0};
   ['CP','CE1','CE2'].forEach(nom=>{
     const pal=CONTENU.paliers[nom];
     for(let t=0;t<40;t++){
       construireFile(pal.miniJeux[0], pal).forEach(q=>{
         const noms=q.flux.map(p=>p._nomCalcule);
         if (q.consigne.mot==='rectangle' && noms.indexOf('carre')>=0) r.carreAvecRectangle++;
         if (q.consigne.mot==='losange'   && noms.indexOf('carre')>=0) r.carreAvecLosange++;
         if (q.consigne.mot==='triangle')
           noms.forEach(n=>{ if(n==='triangleRect'){ r.n++;
             if(q.consigne.accepte.indexOf(n)>=0) r.triRectAccepteComme++; else r.triRectRefuseComme++; }});
         if (q.consigne.mot==='triangleRect')
           noms.forEach(n=>{ if(n==='triangle' && q.consigne.accepte.indexOf(n)>=0) r.triRectRefuseComme++; });
       });
     }
   });
   return r;
 });
 T('jamais de carré quand on demande les rectangles', incl.carreAvecRectangle===0, incl.carreAvecRectangle);
 T('jamais de carré quand on demande les losanges', incl.carreAvecLosange===0, incl.carreAvecLosange);
 T('un triangle rectangle EST un triangle et compte comme tel',
   incl.n>0 && incl.triRectRefuseComme===0, incl.n+' rencontrés, '+incl.triRectRefuseComme+' refusés à tort');

 /* ---- 3. Le tapis tourne, et le toucher attrape ---- */
 await page.goto(base+'?competence=cp-convoyeur'); await page.waitForTimeout(400);
 const depart=await page.evaluate(()=>convoyeur.etat());
 T('le tapis démarre au cran le plus LENT (garde-fou §2)', depart.cran===0, 'cran '+depart.cran);
 await page.waitForTimeout(1200);
 const apres=await page.evaluate(()=>convoyeur.etat());
 T('des pièces sont émises et avancent', apres.vivantes>0, apres.vivantes+' sur le tapis');
 const bouge=await page.evaluate(async()=>{
   const t=document.querySelector('#tapisPieces g');
   const a=t.getAttribute('transform');
   await new Promise(r=>setTimeout(r,300));
   return {a, b:t.getAttribute('transform')};
 });
 T('les pièces se déplacent réellement', bouge.a!==bouge.b, bouge.a+' → '+bouge.b);

 /* toucher une cible : on résout sa position à l'instant du clic */
 const prise=await page.evaluate(async()=>{
   const svg=document.getElementById('scene')||document.getElementById('svgScene');
   for(let essai=0;essai<400;essai++){
     const gs=[...document.querySelectorAll('#tapisPieces g')];
     for(const g of gs){
       const b=g.getBoundingClientRect();
       if (b.width<5) continue;
       const av=convoyeur.etat().prises;
       g.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,
         clientX:b.x+b.width/2, clientY:b.y+b.height/2}));
       await new Promise(r=>setTimeout(r,30));
       const ap=convoyeur.etat();
       if (ap.prises>av) return {ok:true, prises:ap.prises};
       if (ap.erreurs>0) return {ok:false, erreurs:ap.erreurs};
     }
     await new Promise(r=>setTimeout(r,60));
   }
   return {ok:null};
 });
 T('toucher une pièce est pris en compte (prise ou erreur)',
   prise.ok===true || prise.ok===false, JSON.stringify(prise));

 /* ---- 4. Pause franche ---- */
 await page.goto(base+'?competence=cp-convoyeur'); await page.waitForTimeout(900);
 await page.click('.btn-pause'); await page.waitForTimeout(50);
 const p1=await page.evaluate(()=>({e:convoyeur.etat(),
   t:document.querySelector('#tapisPieces g').getAttribute('transform')}));
 await page.waitForTimeout(500);
 const p2=await page.evaluate(()=>document.querySelector('#tapisPieces g').getAttribute('transform'));
 T('la pause arrête franchement le tapis', p1.e.enPause===true && p1.t===p2, p1.t+' / '+p2);
 await page.click('.btn-pause'); await page.waitForTimeout(300);
 T('reprendre relance le tapis',
   (await page.evaluate(()=>document.querySelector('#tapisPieces g').getAttribute('transform')))!==p2);

 /* ---- 5. Vitesse indépendante de la fréquence d’écran ---- */
 const dist=await page.evaluate(async()=>{
   const g=document.querySelector('#tapisPieces g');
   const lire=()=>parseFloat(g.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]);
   const x0=lire(), t0=performance.now();
   await new Promise(r=>setTimeout(r,700));
   return {dx:x0-lire(), dt:(performance.now()-t0)/1000, v:CONTENU.paliers.CP.vitesses[0]};
 });
 T('la vitesse est bien celle annoncée, calculée en temps écoulé',
   Math.abs(dist.dx/dist.dt - dist.v) < dist.v*0.12,
   (dist.dx/dist.dt).toFixed(1)+' unités/s pour '+dist.v+' attendu');

 /* ---- 6. Le levier de vitesse est mémorisé par profil ---- */
 await page.evaluate(()=>{document.querySelectorAll('.cran')[2].click();});
 await page.waitForTimeout(80);
 const memo=await page.evaluate(()=>JSON.parse(localStorage.getItem('mayeutik-m34-convoyeur-vitesse')));
 T('le cran choisi est mémorisé par profil', memo && Object.values(memo)[0]===2, JSON.stringify(memo));
 await page.goto(base+'?competence=cp-convoyeur'); await page.waitForTimeout(350);
 T('il est retrouvé à la partie suivante',
   (await page.evaluate(()=>convoyeur.etat().cran))===2);

 /* ---- 7. Aucune pénalité d’oubli au CP, mais bien au CE1/CE2 ---- */
 const malus=await page.evaluate(()=>MALUS_OUBLI);
 T('aucune pénalité d’oubli au CP (contrainte impérative)', malus.CP===0, JSON.stringify(malus));
 T('l’oubli est pénalisé au CE1 et au CE2, moins que l’erreur',
   malus.CE1===0.25 && malus.CE2===0.25 && malus.CE1 < 1);

 /* ---- 8. Le convoyeur arrive en tête de chaque palier ---- */
 const places=await page.evaluate(()=>['CP','CE1','CE2'].map(n=>CONTENU.paliers[n].miniJeux[0].id));
 T('le convoyeur est le premier mini-jeu des trois paliers',
   places.every(id=>/convoyeur$/.test(id)), places.join(', '));

 /* ---- 9. La rosace ne recouvre plus le classement par catégorie ---- */
 const voc=await page.evaluate(()=>{
   const f=construireFile(CONTENU.paliers.CE2.miniJeux.find(m=>m.mode==='vocabulaire'), CONTENU.paliers.CE2);
   return f.map(q=>q.notion);});
 T('la rosace ne porte plus que des ÉLÉMENTS de figure',
   voc.every(n=>['centre','rayon','diametre','diagonale','longueur','largeur'].includes(n)), voc.join(','));

 /* ---- 10. Une partie entière : phases enchaînées, bilan par forme ---- */
 await page.goto(base+'?competence=cp-convoyeur');
 await page.evaluate(()=>localStorage.removeItem('mayeutik-m34-convoyeur-vitesse'));
 await page.goto(base+'?competence=cp-convoyeur'); await page.waitForTimeout(400);
 /* Au cran rapide, pour que la partie tienne dans la durée du test — et parce
    que le coefficient favorable doit rester BORNÉ par le total. */
 await page.evaluate(()=>{document.querySelectorAll('.cran')[2].click();});
 const partie=await page.evaluate(async()=>{
   const svg=document.getElementById('svgScene');
   const motsVus=[];
   const versEcran=(x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;
     const q=p.matrixTransform(svg.getScreenCTM());return [q.x,q.y];};
   for (let garde=0; garde<3000; garde++){
     if (!document.getElementById('end').hidden) break;
     const mot = file[pos] && file[pos].consigne && file[pos].consigne.mot;
     if (mot && motsVus[motsVus.length-1]!==mot) motsVus.push(mot);
     if (convoyeur){
       /* on n'attrape QUE les cibles : un joueur parfait */
       convoyeur.etat().pieces.forEach(pc=>{
         if (!pc.cible || pc.touchee) return;
         if (pc.x < 10 || pc.x > 330) return;
         const [cx,cy]=versEcran(pc.x, pc.y);
         svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:cx,clientY:cy}));
       });
     }
     await new Promise(r=>setTimeout(r,60));
   }
   return {fin:!document.getElementById('end').hidden, motsVus,
     score:document.getElementById('endScore').textContent,
     bilan:document.getElementById('endBilan').textContent,
     lignes:document.querySelectorAll('#endBilan tr').length};
 });
 T('une partie entière s’enchaîne toute seule jusqu’à la fin',
   partie.fin===true, JSON.stringify(partie.motsVus));
 T('les quatre consignes du CP passent, une fois chacune',
   partie.motsVus.length===4 && new Set(partie.motsVus).size===4, partie.motsVus.join(','));
 T('un joueur parfait fait le score maximum',
   /^12 points sur 12\.$/.test(partie.score), partie.score);
 T('le bilan par forme est affiché, une ligne par consigne',
   partie.lignes===5, partie.lignes+' lignes (en-tête comprise)');

 /* ---- 11. Le tapis NE BOUGE PAS d'une consigne a l'autre ----
    C'etait mesure a 52 px d'ecart au CE1 : sur un jeu ou l'enfant vise une
    cible en mouvement, un tapis qui se deplace sous le doigt entre deux
    phases est inacceptable. On releve sa position pour CHAQUE consigne, sur
    deux largeurs d'ecran. */
 for (const L of [320, 390]) {
   const p2 = await nav.newPage({viewport:{width:L,height:820},deviceScaleFactor:2});
   for (const comp of ['cp-convoyeur','ce1-convoyeur','ce2-convoyeur']) {
     await p2.goto(base+'?competence='+comp); await p2.waitForTimeout(260);
     const tops = await p2.evaluate(async()=>{
       const r=[];
       for (let i=0;i<file.length;i++){
         pos=i; question(); await new Promise(x=>setTimeout(x,60));
         r.push(Math.round(document.getElementById('vitrail').getBoundingClientRect().top));
       }
       return r;
     });
     const amp = Math.max(...tops) - Math.min(...tops);
     T(`${comp} @${L}px : le tapis reste exactement en place`, amp===0, amp+' px d’écart');
   }
   await p2.close();
 }

 /* ---- 12. Le changement de consigne se remarque ---- */
 await page.goto(base+'?competence=ce2-convoyeur'); await page.waitForTimeout(320);
 const annonce = await page.evaluate(()=>({
   qText:document.getElementById('qText').classList.contains('annonce'),
   etiq:document.getElementById('etiquetteTapis').classList.contains('annonce')}));
 T('à l’arrivée d’une consigne, l’en-tête ET l’étiquette s’annoncent',
   annonce.qText && annonce.etiq, JSON.stringify(annonce));
 await page.waitForTimeout(1600);
 T('l’annonce s’éteint ensuite',
   (await page.evaluate(()=>document.getElementById('qText').classList.contains('annonce')))===false);
 const etiq = await page.evaluate(()=>({
   texte:document.querySelector('.etiquette-texte').textContent,
   attendu:'les '+plurDe(file[pos].consigne.mot),
   /* le cartouche est dimensionné sur le texte rendu, pas estimé */
   large:+document.querySelector('.etiquette-tapis').getAttribute('width'),
   texteLarge:document.querySelector('.etiquette-texte').getBBox().width}));
 T('l’étiquette du tapis porte la consigne courte', etiq.texte===etiq.attendu, etiq.texte);
 T('son cartouche est ajusté au texte réellement rendu',
   Math.abs(etiq.large - (etiq.texteLarge+52)) <= 1, etiq.large+' pour '+etiq.texteLarge.toFixed(0)+' de texte');
 /* la consigne ne grossit plus : elle deborderait de l'ecran sur 375 px */
 T('l’en-tête change de couleur sans grossir (sinon il déborde)',
   (await page.evaluate(()=>{
      const t=document.getElementById('qText'); t.classList.add('annonce');
      return getComputedStyle(t).animationName;}))==='none');

 /* ---- 13. Les commandes portent des repères visuels ---- */
 await page.goto(base+'?competence=cp-convoyeur'); await page.waitForTimeout(300);
 /* On CLIQUE chaque cran au lieu de lui poser la classe a la main : muter le
    DOM puis lire le style dans la meme passe rend une valeur perimee, et
    surtout c'est le chemin de l'enfant qu'on veut eprouver. */
 const couleurs=[];
 for (let i=0;i<3;i++){
   await page.evaluate((i)=>document.querySelectorAll('.cran')[i].click(), i);
   await page.waitForTimeout(60);
   couleurs.push(await page.evaluate((i)=>
     getComputedStyle(document.querySelectorAll('.cran')[i]).backgroundColor, i));
 }
 const cmd = await page.evaluate(()=>{
   const crans=[...document.querySelectorAll('.cran')];
   return {emos:crans.map(c=>c.querySelector('.emo')?c.querySelector('.emo').textContent:''),
     couleurs:null,
     aria:crans.map(c=>c.getAttribute('aria-label')),
     pause:document.querySelector('.btn-pause').textContent,
     pauseEmo:!!document.querySelector('.btn-pause .emo'),
     compteurEmo:!!document.querySelector('.compteur-prises .emo')};
 });
 cmd.couleurs = couleurs;
 T('chaque cran de vitesse porte un pictogramme',
   cmd.emos.every(e=>e.length>0), cmd.emos.join(' '));
 T('les trois crans ont trois couleurs distinctes',
   new Set(cmd.couleurs).size===3, cmd.couleurs.join(' | '));
 T('chaque cran reste nommé pour les lecteurs d’écran',
   cmd.aria.every(a=>a && /vitesse/i.test(a)), cmd.aria.join(' | '));
 T('la pause et le compteur portent aussi un pictogramme',
   cmd.pauseEmo && cmd.compteurEmo);
 await page.click('.btn-pause'); await page.waitForTimeout(60);
 const enPause = await page.evaluate(()=>({
   texte:document.querySelector('.btn-pause').textContent,
   classe:document.querySelector('.btn-pause').classList.contains('reprend'),
   fond:getComputedStyle(document.querySelector('.btn-pause')).backgroundColor}));
 T('en pause, le bouton change de mot ET de couleur',
   /Reprendre/.test(enPause.texte) && enPause.classe, JSON.stringify(enPause));

 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
