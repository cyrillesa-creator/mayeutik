/* Vérification par l'INTERFACE RÉELLE : on ouvre les mini-jeux concernés et
   on relit ce que l'enfant voit à l'écran, plutôt que d'introspecter des
   variables enfermées dans des closures.

   VINGT MINUTES (1209 s mesurées), et c'est le prix de ce qu'elle prouve : un
   tirage, une navigation. `outils/lint-elision.js` balaie les chaînes en une
   seconde et `outils/verif-elision-gabarits.js` applique les gabarits aux
   vraies données ; seule celle-ci lit l'ÉCRAN. Réduire l'échantillon la
   viderait de sa force, elle est donc mise de côté par `lancer.js` (voir la
   liste LENTES) et se joue par son nom : `node outils/tests/lancer.js langue`. */
const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();
const { violations } = require('../lint-elision.js');

const srv = http.createServer((q, r) => {
  const p = path.join(socle.RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(d); });
});

let echecs = 0;
function verifier(jeu, textes) {
  const uniques = [...new Set(textes.filter(t => typeof t === 'string' && t.trim()))];
  const mauvais = [];
  uniques.forEach(t => violations(t, jeu).forEach(v => mauvais.push(v.extrait + '  ->  ' + t)));
  console.log(`\n--- ${jeu} : ${uniques.length} textes lus à l'écran, ${mauvais.length} problème(s)`);
  uniques.slice(0, 8).forEach(t => console.log('      « ' + t + ' »'));
  mauvais.forEach(m => console.log('   ✗ ' + m));
  echecs += mauvais.length;
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });

  async function ouvrir(fichier, niveau) {
    const p = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const url = `http://localhost:${port}/jeux/${fichier}`;
    await p.goto(url);
    await p.evaluate((n) => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: n }]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
      localStorage.setItem('mayeutik-sessions', JSON.stringify([]));
    }, niveau);
    await p.goto(url);
    await p.waitForTimeout(500);
    return p;
  }

  // ===== M39 : « Combien d'escargots/d'abeilles … as-tu comptées ? » =====
  {
    const p = await ouvrir('M39-tableaux-diagrammes.html', 'CP');
    const textes = [];
    // On entre dans les mini-jeux du palier et on relève toutes les invites.
    const cartes = await p.$$('.card, [data-jeu]');
    for (let i = 0; i < cartes.length; i++) {
      const c = (await p.$$('.card, [data-jeu]'))[i];
      if (!c) continue;
      try { await c.click({ timeout: 1500 }); } catch (e) { continue; }
      await p.waitForTimeout(700);
      // toutes les cases cliquables d'un tableau tally changent l'invite
      const cases = await p.$$('.a-saisir, .tally-total, td');
      for (let j = 0; j < Math.min(cases.length, 12); j++) {
        try { await cases[j].click({ timeout: 400 }); } catch (e) {}
        await p.waitForTimeout(80);
        textes.push(...await p.evaluate(() =>
          Array.from(document.querySelectorAll('p, .invite, .consigne, h2, h3, .enonce, #qText, .msg'))
            .map(e => e.textContent)));
      }
      textes.push(...await p.evaluate(() =>
        Array.from(document.querySelectorAll('p, .invite, .consigne, h2, h3, .enonce, #qText, .msg'))
          .map(e => e.textContent)));
      // retour accueil
      const back = await p.$('#btnBack, .retour, [aria-label="Retour"]');
      if (back) { try { await back.click({ timeout: 800 }); } catch (e) {} }
      await p.waitForTimeout(400);
    }
    verifier('M39 (interface)', textes);
    await p.close();
  }

  // ===== M01 : « … qui a AUTANT de bonbons … » =====
  {
    const p = await ouvrir('M01-nombres-jusqu-9-cp.html', 'CP');
    const textes = [];
    for (let tour = 0; tour < 12; tour++) {
      const cartes = await p.$$('.card, [data-jeu]');
      for (const c of cartes) {
        try { await c.click({ timeout: 1200 }); } catch (e) { continue; }
        await p.waitForTimeout(500);
        textes.push(...await p.evaluate(() =>
          Array.from(document.querySelectorAll('p, .invite, .consigne, h2, h3, .enonce, .bloc-consigne'))
            .map(e => e.textContent)));
        const back = await p.$('#btnBack, .retour, [aria-label="Retour"]');
        if (back) { try { await back.click({ timeout: 800 }); } catch (e) {} }
        await p.waitForTimeout(300);
      }
    }
    verifier('M01 (interface)', textes);
    await p.close();
  }

  // ===== M36 : le mini-jeu « Je compte », aux trois paliers =====
  {
    for (const [comp, niveau] of [['cp-compter-faces', 'CP'], ['ce1-compter', 'CE1'], ['ce2-compter', 'CE2']]) {
      const p = await ouvrir('M36-solides.html', niveau);
      const textes = [];
      for (let i = 0; i < 25; i++) {
        await p.goto(`http://localhost:${port}/jeux/M36-solides.html?competence=${comp}`);
        await p.waitForTimeout(220);
        textes.push(await p.evaluate(() => document.getElementById('qText').textContent));
      }
      verifier(`M36 « Je compte » ${niveau} (interface)`, textes);
      await p.close();
    }
  }

  console.log(echecs === 0 ? '\n>>> AUCUNE ÉLISION MANQUANTE À L\'ÉCRAN' : `\n>>> ${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
