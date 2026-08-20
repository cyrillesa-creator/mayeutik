const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const ROOT='/home/user/mayeutik';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});

(async()=>{
  await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  let echecs=0;
  // On teste les DEUX largeurs extrêmes visées (petit mobile et mobile standard).
  for (const largeur of [320, 390]) {
    const page=await browser.newPage({viewport:{width:largeur,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    await page.goto(`http://localhost:${port}/jeux/M17-fractions-ce2.html`);
    await page.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE2'}]));localStorage.setItem('mayeutik-profil-actif','p1');});
    await page.reload(); await page.waitForSelector('#grille-jeux');
    await page.evaluate(()=>document.querySelector('[data-jeu="droite"]').click());
    await page.waitForTimeout(300);
    // On rejoue jusqu'à avoir vu chaque dénominateur au moins une fois.
    const vus={};
    for(let q=0;q<80;q++){
      const m=await page.evaluate(()=>{
        const piste=document.querySelector('.piste-graduation'); if(!piste) return null;
        const ticks=Array.from(document.querySelectorAll('.tick-interactive'));
        const reperes=ticks.length?ticks:Array.from(document.querySelectorAll('.graduation'));
        const bornes=reperes.map(t=>t.getBoundingClientRect());
        const labels=Array.from(document.querySelectorAll('.graduation-label,.tick-pastille')).map(t=>t.getBoundingClientRect());
        const toutes=bornes.concat(labels);
        const larg=document.documentElement.clientWidth;
        // Espacement minimal entre deux repères consécutifs (cible tactile).
        let espMin=Infinity;
        for(let i=1;i<bornes.length;i++) espMin=Math.min(espMin,bornes[i].left-bornes[i-1].left);
        return {
          d: ticks.length ? ticks.length-1 : document.querySelectorAll('.graduation').length-1,
          interactif: ticks.length>0,
          scrollPage: document.documentElement.scrollWidth-larg,
          hors: toutes.filter(r=>r.left<-0.5||r.right>larg+0.5).length,
          espMin: espMin===Infinity?null:espMin,
          largeurBande: ticks.length?ticks[0].getBoundingClientRect().width:null
        };
      });
      if(m){
        const cle=m.d+(m.interactif?'i':'l');
        if(!vus[cle]){
          vus[cle]=m;
          if(m.scrollPage>1||m.hors>0){echecs++;console.log(`  ✗ ${largeur}px d=${m.d} ${m.interactif?'interactif':'lecture'} :`,m);}
        }
      }
      const c=await page.$('.tick-interactive:not([disabled]), .bouton-option:not([disabled])');
      if(!c) break; await c.click(); await page.waitForTimeout(80);
      const s=await page.$('#bouton-suivant:not([hidden])');
      if(s){await s.click();await page.waitForTimeout(150);}
      else { // fin de partie : on relance
        const rej=await page.$('button:has-text("Rejouer")');
        if(rej){await rej.click();await page.waitForTimeout(250);} else break;
      }
    }
    const cles=Object.keys(vus).sort();
    console.log(`${largeur}px — ${cles.length} configurations vues : ` + cles.map(k=>{
      const v=vus[k]; return k+(v.interactif?` (bande ${v.largeurBande.toFixed(0)}px)`:'');
    }).join(', '));
    await page.close();
  }
  console.log(echecs===0?'DROITE GRADUÉE : OK — tient à l\'écran pour tous les dénominateurs':`${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
})();
