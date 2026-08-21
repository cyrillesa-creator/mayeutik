/* A2 — la manche d'essai : une fois par instrument et par profil. */
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
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(''+e));
 page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.location().url||''))erreurs.push(m.text());});

 const OUTILS={'cp-alignement':'regle','cp-tracer-droite':'regle','ce1-alignement':'regle',
   'ce2-alignement':'regle','ce1-angles':'gabarit','ce2-angles':'equerre',
   'ce1-compas':'compas','ce2-compas':'compas'};
 const SANS={'ce1-codage':1,'ce2-codage':1};

 /* 1. Première rencontre : la manche d'essai est là, en tête, non notée. */
 for (const [comp, outil] of Object.entries(OUTILS)) {
   await page.goto(base+'?competence='+comp);
   await page.evaluate(()=>localStorage.removeItem('mayeutik-m35-instruments-vus'));
   await page.goto(base+'?competence='+comp); await page.waitForTimeout(170);
   const r=await page.evaluate(()=>({m0:file[0].mode, outil:file[0].outil, note:file[0].note,
     essai:file[0].essai, total, notees:file.filter(q=>q.note!==false).length,
     dots:document.querySelectorAll('#dots .dot').length,
     btn:document.getElementById('btnNext').textContent,
     visible:document.getElementById('btnNext').style.display}));
   T(comp+' : s’ouvre sur la prise en main de « '+outil+' »',
     r.m0==='priseEnMain' && r.outil===outil, r.m0+'/'+r.outil);
   T(comp+' : la manche d’essai ne compte pas',
     r.note===false && r.total===2*r.notees, 'total '+r.total+' pour '+r.notees+' notées');
   T(comp+' : elle ne prend pas de pastille', r.dots===r.notees, r.dots+' pastilles / '+r.notees+' notées');
   T(comp+' : on peut en sortir tout de suite',
     r.visible!=='none' && /compris/.test(r.btn), JSON.stringify(r.btn));
 }
 /* 2. Un mini-jeu sans instrument n'en a pas. */
 for (const comp of Object.keys(SANS)) {
   await page.goto(base+'?competence='+comp);
   await page.evaluate(()=>localStorage.removeItem('mayeutik-m35-instruments-vus'));
   await page.goto(base+'?competence='+comp); await page.waitForTimeout(150);
   T(comp+' : aucun instrument, aucune manche d’essai',
     (await page.evaluate(()=>file.some(q=>q.mode==='priseEnMain')))===false);
 }
 /* 3. Une fois sortie, elle ne revient plus — et l'indicateur est par PROFIL. */
 await page.goto(base+'?competence=ce1-alignement');
 await page.evaluate(()=>{localStorage.removeItem('mayeutik-m35-instruments-vus');
   localStorage.setItem('mayeutik-profil-actif','pA');});
 await page.goto(base+'?competence=ce1-alignement'); await page.waitForTimeout(160);
 T('profil A : la règle est à découvrir', await page.evaluate(()=>file[0].mode==='priseEnMain'));
 await page.click('#btnNext'); await page.waitForTimeout(150);
 const stock=await page.evaluate(()=>JSON.parse(localStorage.getItem('mayeutik-m35-instruments-vus')));
 T('sortir de l’essai note l’instrument comme découvert',
   stock && stock.pA && stock.pA.regle===true, JSON.stringify(stock));
 await page.goto(base+'?competence=ce1-alignement'); await page.waitForTimeout(160);
 T('profil A : la règle ne se redécouvre pas',
   await page.evaluate(()=>file[0].mode!=='priseEnMain'));
 T('profil A : mais l’équerre, si',
   await page.evaluate(async()=>{const u=new URL(location.href);return true;}) &&
   await (async()=>{await page.goto(base+'?competence=ce2-angles');await page.waitForTimeout(160);
     return page.evaluate(()=>file[0].mode==='priseEnMain');})());
 await page.evaluate(()=>localStorage.setItem('mayeutik-profil-actif','pB'));
 await page.goto(base+'?competence=ce1-alignement'); await page.waitForTimeout(160);
 T('profil B : il redécouvre la règle pour son propre compte',
   await page.evaluate(()=>file[0].mode==='priseEnMain'));

 /* 4. L'écran d'essai manipule vraiment : instrument présent, rien à valider. */
 await page.goto(base+'?competence=ce1-alignement');
 await page.evaluate(()=>{localStorage.removeItem('mayeutik-m35-instruments-vus');
   localStorage.setItem('mayeutik-profil-actif','pC');});
 await page.goto(base+'?competence=ce1-alignement'); await page.waitForTimeout(180);
 T('l’essai pose un instrument manipulable',
   await page.evaluate(()=>!!posableCourant && document.querySelectorAll('.poignee').length===2));
 T('l’essai n’offre aucun bouton de validation',
   await page.evaluate(()=>document.getElementById('btnValider').style.display==='none'));
 T('l’essai ne passe pas tout seul (§20 neutralisé)',
   await (async()=>{await page.waitForTimeout(2600);
     return page.evaluate(()=>file[pos].mode==='priseEnMain');})());
 await page.goto(base+'?competence=ce1-compas');
 await page.evaluate(()=>{localStorage.removeItem('mayeutik-m35-instruments-vus');
   localStorage.setItem('mayeutik-profil-actif','pD');});
 await page.goto(base+'?competence=ce1-compas'); await page.waitForTimeout(180);
 T('l’essai du compas pose un compas', await page.evaluate(()=>!!compasCourant));

 console.log('\nErreurs JS/console :', erreurs.length?erreurs:'aucune');
 if(erreurs.length) ko+=erreurs.length;
 console.log(`\n${ok} OK, ${ko} KO`);
 console.log('EXIT:'+(ko===0?'SUCCES':'ECHEC'));
 await nav.close(); srv.close();
})().catch(e=>{console.log('CRASH',e);console.log('EXIT:ECHEC');process.exit(1);});
