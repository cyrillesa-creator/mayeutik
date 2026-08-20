const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const srv=http.createServer((q,r)=>{const p=path.join('/home/user/mayeutik',decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':/\.js$/.test(p)?'text/javascript':/\.json$/.test(p)?'application/json':'text/html'});r.end(d);});});
let echecs=0; const ok=(c,m,x)=>{console.log((c?'OK   ':'✗    ')+m,x===undefined?'':x); if(!c)echecs++;};
(async()=>{
  await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))erreurs.push(m.text());});
  const url=`http://localhost:${port}/jeux/M39-tableaux-diagrammes.html`;
  await page.goto(url);
  await page.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE1'}]));
    localStorage.setItem('mayeutik-profil-actif','p1');});
  const totaux=[];
  for(let i=0;i<20;i++){
    await page.goto(url); await page.waitForSelector('#grille-jeux');
    await page.evaluate(()=>document.querySelector('[data-jeu="ce1-recueil-diagramme"]').click());
    await page.waitForSelector('.bete-population'); await page.waitForTimeout(80);
    const e=await page.evaluate(()=>({n:document.querySelectorAll('.bete-population').length,
      c:(document.querySelector('.consigne')||{}).textContent||''}));
    totaux.push(e.n);
    const m=e.c.match(/classe de (\d+) élèves/);
    if(!m||Number(m[1])!==e.n){echecs++;console.log('  ✗ consigne incohérente :',e.c.slice(0,60),'vs',e.n);}
  }
  ok(Math.max(...totaux)<=24, `CE1 « Le grand sondage » : plafond 24 respecté sur 20 tirages (max ${Math.max(...totaux)}, min ${Math.min(...totaux)})`);
  ok(Math.max(...totaux)>15, 'CE1 reste PLUS ambitieux que le CP (au-delà de 15)', `max ${Math.max(...totaux)}`);
  ok(erreurs.length===0,'Aucune erreur console / JS',erreurs.slice(0,4));
  console.log(echecs===0?'TOUT OK':`${echecs} PROBLÈME(S)`);
  await b.close();srv.close();process.exit(echecs===0?0:1);
})();
