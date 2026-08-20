const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const srv=http.createServer((q,r)=>{const p=path.join('/home/user/mayeutik',decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200);r.end(d);}});});
(async()=>{await new Promise(r=>srv.listen(0,r));
 const base='http://localhost:'+srv.address().port+'/jeux/M37-assemblages.html';
 const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await nav.newPage();
 /* On sème une étoile et une session gagnées AVANT l'extension, comme si la
    partie précédente avait eu 5 assemblages. */
 await page.addInitScript(() => {
   localStorage.setItem('mayeutik-m37-assemblages-etoiles', JSON.stringify({'cp-assemblages':3}));
   localStorage.setItem('mayeutik-profils', JSON.stringify([{id:'p1',prenom:'T',niveau:'CP'}]));
   localStorage.setItem('mayeutik-profil-actif','p1');
   localStorage.setItem('mayeutik-sessions', JSON.stringify([
     {profilId:'p1', module:'M37', competence:'cp-assemblages', score:5, total:5,
      date:new Date().toISOString(), duree:200}]));
 });
 await page.goto(base); await page.waitForTimeout(350);
 console.log(JSON.stringify(await page.evaluate(() => {
   const etoile = lireEtoiles()['cp-assemblages'];
   const totaux = {};
   Object.entries(CONTENU.paliers).forEach(([n, p]) => {
     miniJeuCourant = {cfg:p.miniJeux[0], palier:p, palierNom:n};
     totaux[n] = listeAssemblages().length;
   });
   /* Le seuil d'étoiles : combien de réussites faut-il pour 3 étoiles, hier
      sur 5 assemblages et aujourd'hui sur 7 ? */
   const etoilesPour = (score, total) => { const r = total ? score/total : 0;
     return r >= 0.85 ? 3 : r >= 0.6 ? 2 : 1; };
   const seuil = (total) => { for (let s = 0; s <= total; s++) if (etoilesPour(s, total) === 3) return s; };
   return {etoileConservee:etoile, totaux,
     seuil3etoiles:{sur5:seuil(5), sur7:seuil(7)},
     echecsTolereesPour3:{sur5:5-seuil(5), sur7:7-seuil(7)},
     maitriseSeuil:SEUIL_MAITRISE_LOCALE,
     echecsTolereesPourMaitrise:{sur5:5-Math.ceil(0.8*5), sur7:7-Math.ceil(0.8*7)}};
 }), null, 1));
 await nav.close(); srv.close();})();
