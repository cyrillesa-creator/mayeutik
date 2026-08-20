const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const ROOT='/home/user/mayeutik';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'});r.end(d);});});

const MENTHE='rgb(78, 205, 196)', CORAIL='rgb(255, 107, 107)', SOLEIL='rgb(255, 217, 61)';
let echecs=0;
const ok=(c,m,x)=>{console.log((c?'OK   ':'✗    ')+m,x===undefined?'':x);if(!c)echecs++;};

(async()=>{
  await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  const err=[];
  page.on('pageerror',e=>err.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))err.push(m.text());});
  await page.goto(`http://localhost:${port}/jeux/M17-fractions-ce2.html`);
  await page.evaluate(()=>{localStorage.setItem('mayeutik-profils',JSON.stringify([{id:'p1',prenom:'T',niveau:'CE2'}]));
    localStorage.setItem('mayeutik-profil-actif','p1');localStorage.removeItem('mayeutik-sessions');});
  await page.reload(); await page.waitForSelector('#grille-jeux');

  let erreursTestees=0, justesTestees=0;
  for (const jeu of ['calculer-facile','calculer-difficile']) {
    await page.evaluate(j=>document.querySelector(`[data-jeu="${j}"]`).click(), jeu);
    await page.waitForTimeout(300);
    for (let q=0;q<14 && (erreursTestees<6 || justesTestees<2);q++){
      if (await page.locator('.bloc-resultats').count()) {
        const rej=await page.$('button:has-text("Rejouer")');
        if(rej){await rej.click();await page.waitForTimeout(300);} else break;
      }
      const n = await page.locator('.cellule-interactive').count();
      if(!n) break;
      const attendu = await page.evaluate(()=>{
        const t=(document.querySelector('.bloc-calcul-consigne')||{}).textContent||'';
        return t;
      });
      // On vise une erreur d'un nombre de cases DIFFÉRENT à chaque manche.
      const viserJuste = justesTestees < 2 && erreursTestees >= 3;
      const remplisAvant = await page.locator('.cellule-interactive.rempli').count();
      let clics;
      if (viserJuste) clics = 0; // on laisse la bande telle quelle : parfois juste
      else clics = 1 + (erreursTestees % Math.max(1, n - 1)); // varie l'erreur
      for (let k=0;k<clics;k++) await page.locator('.cellule-interactive').nth(k % n).click();
      await page.locator('.bouton-principal:visible').first().click();
      await page.waitForTimeout(250);

      const etat = await page.evaluate(()=>{
        const bande=document.querySelector('.forme-bande-interactive');
        const remplies=Array.from(bande.querySelectorAll('.cellule-interactive.rempli'));
        const correction=document.querySelector('.bande-correction');
        return {
          classes: bande.className,
          couleursJoueur: [...new Set(remplies.map(c=>getComputedStyle(c).backgroundColor))],
          nbRemplies: remplies.length,
          bordure: getComputedStyle(bande).borderTopColor,
          couleursCorrection: correction ? [...new Set(Array.from(correction.querySelectorAll('.segment-bande.rempli')).map(s=>getComputedStyle(s).backgroundColor))] : null,
          feedback: document.getElementById('zone-feedback').className,
          texteCorrection: correction ? correction.textContent : null
        };
      });
      const estErreur = /feedback-erreur/.test(etat.feedback);
      if (estErreur) {
        erreursTestees++;
        ok(!etat.couleursJoueur.includes(MENTHE),
          `erreur ${erreursTestees} (${etat.nbRemplies} cases) : la réponse du joueur n'est PAS en vert`, etat.couleursJoueur);
        // Bande vidée par l'enfant (réponse « 0/d », toujours fausse ici) : il
        // n'y a aucune case à colorer, c'est le CADRE qui doit virer au rouge.
        if (etat.nbRemplies === 0) {
          ok(etat.bordure===CORAIL,
            `erreur ${erreursTestees} : bande vidée — le cadre est en ROUGE`, etat.bordure);
        } else {
          ok(etat.couleursJoueur.length===1 && etat.couleursJoueur[0]===CORAIL,
            `erreur ${erreursTestees} : la réponse du joueur est en ROUGE`, etat.couleursJoueur);
          ok(etat.bordure===CORAIL, `erreur ${erreursTestees} : le cadre est en ROUGE`, etat.bordure);
        }
        ok(etat.couleursCorrection && etat.couleursCorrection.length===1 && etat.couleursCorrection[0]===MENTHE,
          `erreur ${erreursTestees} : la bonne réponse est en VERT`, etat.couleursCorrection);
      } else if (/feedback-succes/.test(etat.feedback)) {
        justesTestees++;
        ok(etat.couleursJoueur.length===1 && etat.couleursJoueur[0]===MENTHE,
          `réussite ${justesTestees} : la bonne réponse du joueur reste en VERT`, etat.couleursJoueur);
        ok(etat.couleursCorrection===null, `réussite ${justesTestees} : aucune bande de correction superflue`);
      }
      const s=await page.$('#bouton-suivant:not([hidden])');
      if(s){await s.click();await page.waitForTimeout(250);}
    }
    await page.evaluate(()=>{const x=document.getElementById('bouton-retour');if(x)x.click();});
    await page.waitForTimeout(250);
  }
  ok(erreursTestees>=6, `${erreursTestees} erreurs différentes éprouvées`, '');
  ok(justesTestees>=1, `${justesTestees} réussite(s) éprouvée(s)`, '');
  ok(err.length===0,'Aucune erreur console / JS',err.slice(0,4));
  console.log(echecs===0?'\nTOUT OK':`\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs===0?0:1);
})();
