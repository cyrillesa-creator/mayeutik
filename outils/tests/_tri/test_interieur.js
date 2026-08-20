const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const srv=http.createServer((q,r)=>{const p=path.join('/home/user/mayeutik',decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200);r.end(d);}});});
(async()=>{await new Promise(r=>srv.listen(0,r));
 const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await nav.newPage();
 await page.goto('http://localhost:'+srv.address().port+'/jeux/M41-symetrie.html');
 await page.waitForTimeout(400);
 console.log(await page.evaluate(()=>{
   const out=[];
   FIGURES.forEach(f=>{
     const T=cibleDe(f);
     const tri=trianglesInterieurs(T);
     /* Aire de l'intérieur : chaque quart vaut 1/4 de maille. */
     out.push({figure:f.nom, quarts:tri.length, aire:+(tri.length/4).toFixed(2)});
   });
   /* Contrôle : un carré 2×2 fermé doit avoir exactement 4 mailles dedans. */
   const carre=new Set();
   [[2,2],[3,2],[4,2],[4,3],[4,4],[3,4],[2,4],[2,3]].forEach((p,i,a)=>{
     const q=a[(i+1)%a.length]; carre.add(cle(p,q));
   });
   out.push({figure:'CONTRÔLE carré 2×2', quarts:trianglesInterieurs(carre).length,
             aire:trianglesInterieurs(carre).length/4});
   /* Et une figure OUVERTE ne doit rien enfermer. */
   const ouvert=new Set([cle([2,2],[3,2]), cle([3,2],[4,2])]);
   out.push({figure:'CONTRÔLE trait ouvert', quarts:trianglesInterieurs(ouvert).length, aire:0});
   return out;
 }));
 await nav.close(); srv.close();})();
