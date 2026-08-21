const socle = require('./socle.js');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=socle.chargerPlaywright();
const ROOT=socle.RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'});r.end(d);});});

(async()=>{
  await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
  const b=await chromium.launch({executablePath:socle.EXEC_CHROMIUM});
  const page=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  const err=[];
  page.on('pageerror',e=>err.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))err.push(m.text());});
  await page.goto(`http://localhost:${port}/jeux/M17-fractions-ce2.html`);
  await page.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE2'}]));
    localStorage.setItem('mayeutik-profil-actif','p1');localStorage.removeItem('mayeutik-sessions');});
  await page.reload(); await page.waitForSelector('#grille-jeux');
  let echecs=0;
  const jeux=await page.$$eval('[data-jeu]',n=>n.map(e=>e.dataset.jeu));
  for(const id of jeux){
    await page.evaluate(i=>document.querySelector(`[data-jeu="${i}"]`).click(),id);
    await page.waitForTimeout(300);
    for(let q=0;q<10;q++){
      // L'écran de résultats porte lui aussi des .bouton-principal (Rejouer /
      // Menu) : on s'arrête AVANT de relancer une partie par mégarde.
      if(await page.locator('.bloc-resultats').count()) break;
      // Cartes « Comparer » : on remplit toutes les cases puis on valide.
      let n=await page.locator('.carte-comparaison:not([disabled])').count();
      while(n>0){await page.locator('.carte-comparaison:not([disabled])').first().click();await page.waitForTimeout(60);
        n=await page.locator('.carte-comparaison:not([disabled])').count();}
      const cell=await page.locator('.cellule-interactive').count();
      if(cell) await page.locator('.cellule-interactive').first().click();
      const opt=await page.$('.bouton-option:not([disabled]), .tick-interactive:not([disabled])');
      if(opt) await opt.click();
      const val=await page.$('.bouton-principal:visible:not([disabled])');
      if(val) await val.click();
      await page.waitForTimeout(200);
      const s=await page.$('#bouton-suivant:not([hidden])');
      if(s){await s.click();await page.waitForTimeout(250);} else break;
    }
    const fini=await page.evaluate(()=>!!document.querySelector('.bloc-resultats'));
    if(!fini){echecs++;console.log('  ✗ '+id+" : la partie ne s'est pas terminée");}
    else console.log('OK   '+id+' : partie menée jusqu\'aux résultats');
    await page.evaluate(()=>document.getElementById('bouton-retour').click());
    await page.waitForTimeout(250);
  }
  const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('mayeutik-sessions')||'[]').length);
  console.log('  sessions enregistrées : '+sessions+' / '+jeux.length);
  if(sessions!==jeux.length) echecs++;
  if(err.length){echecs++;console.log('  ✗ erreurs :',err.slice(0,5));} else console.log('OK   Aucune erreur console / JS');
  console.log(echecs===0?'TOUT OK':echecs+' PROBLÈME(S)');
  await b.close(); srv.close();
})();
