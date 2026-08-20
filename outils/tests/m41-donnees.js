const http=require('http'),fs=require('fs'),path=require('path');
const socle = require('./socle.js');
const { chromium } = socle.chargerPlaywright();
let echecs=0;
const ok=(c,m,x)=>{console.log((c?'OK   ':'✗    ')+m,x===undefined?'':JSON.stringify(x)); if(!c)echecs++;};
const srv=http.createServer((q,r)=>{const p=path.join(socle.RACINE,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{'Content-Type':'text/html'});r.end(d);}});});
(async()=>{await new Promise(r=>srv.listen(0,r));
 const nav=await chromium.launch({executablePath:socle.EXEC_CHROMIUM});
 const page=await nav.newPage();
 const erreurs=[]; page.on('pageerror',e=>erreurs.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))erreurs.push(m.text());});
 await page.goto('http://localhost:'+srv.address().port+'/jeux/M41-symetrie.html');
 await page.waitForTimeout(400);
 const r = await page.evaluate(() => {
   const connexe = (T) => {
     const segs = [...T].map(k => k.split('|'));
     if (!segs.length) return false;
     const adj = new Map();
     segs.forEach(([a,b]) => { (adj.get(a)||adj.set(a,[]).get(a)).push(b); (adj.get(b)||adj.set(b,[]).get(b)).push(a); });
     const vus = new Set([segs[0][0]]), pile = [segs[0][0]];
     while (pile.length) { const n = pile.pop();
       (adj.get(n)||[]).forEach(v => { if (!vus.has(v)) { vus.add(v); pile.push(v); } }); }
     return adj.size === vus.size;
   };
   return FIGURES.map(fig => {
     const soucis = [];
     fig.demi.forEach(([a,b,c,d]) => {
       const k = cle([a,b],[c,d]);
       if (!EST_LEGAL.has(k)) soucis.push('segment illégal (ni maille ni diagonale) : ' + k);
       const bonCote = fig.axe === 'v' ? (a <= AXE_V && c <= AXE_V) : (b <= AXE_H && d <= AXE_H);
       if (!bonCote) soucis.push('segment hors de la moitié de référence : ' + k);
     });
     const T = cibleDe(fig);
     const {paires, surAxe} = pairesDe(fig, T);
     if (!connexe(T)) soucis.push('figure complète non connexe');
     if (T.size < 8) soucis.push('figure trop pauvre : ' + T.size + ' segments');
     if (paires.length < 2) soucis.push('moins de deux paires miroir : la fusion est impossible');
     /* Les DEUX traitements doivent être jouables, et la fusion doit
        vraiment demander des ajouts des DEUX côtés. */
     const mesures = {};
     ['report','fusion'].forEach(mode => {
       let gaucheManque = 0, droiteManque = 0, perdus = 0;
       for (let essai = 0; essai < 60; essai++) {
         const m = construireManche(fig, mode);
         /* Rien ne doit être irrécupérable : l’union des deux moitiés
            rabattues doit redonner exactement la cible. */
         const union = new Set();
         m.pre.forEach(k => { union.add(k); union.add(reflechirSeg(k, fig.axe)); });
         if (union.size !== m.cible.size) perdus++;
         [...m.aTracer].forEach(k => {
           if (estDuCoteReference(k, fig.axe)) gaucheManque++; else droiteManque++;
         });
       }
       mesures[mode] = {gaucheManque, droiteManque, perdus};
     });
     if (mesures.fusion.perdus) soucis.push('fusion : des segments irrécupérables (paire effacée des deux côtés)');
     if (mesures.report.perdus) soucis.push('report : des segments irrécupérables');
     if (!mesures.fusion.gaucheManque || !mesures.fusion.droiteManque)
       soucis.push('fusion : les ajouts ne sont pas des DEUX côtés');
     if (mesures.report.gaucheManque && mesures.report.droiteManque)
       soucis.push('report : une moitié devrait être complète');
     return {nom:fig.nom, axe:fig.axe, demi:fig.demi.length, total:T.size,
             paires:paires.length, surAxe:surAxe.length, mesures, soucis};
   });
 });
 r.forEach(f => {
   console.log('\n--- ' + f.nom + ' (axe ' + f.axe + ') : ' + f.demi + ' demi-segments, '
     + f.total + ' au total, ' + f.paires + ' paires, ' + f.surAxe + ' sur l’axe');
   console.log('    report : ' + JSON.stringify(f.mesures.report)
     + '   fusion : ' + JSON.stringify(f.mesures.fusion));
   ok(f.soucis.length === 0, f.nom + ' : figure saine', f.soucis);
 });
 const nb = await page.evaluate(() => ({stock:FIGURES.length,
   file:CONTENU.miniJeux[0].nbQuestions}));
 ok(nb.stock > nb.file, '§13 bis : stock strictement plus grand que la file', nb);
 ok(erreurs.length === 0, 'Aucune erreur JS au chargement', erreurs.slice(0,3));
 console.log(echecs===0 ? '\nTOUT OK' : '\n'+echecs+' PROBLÈME(S)');
 await nav.close(); srv.close(); process.exit(echecs===0?0:1);
})();
