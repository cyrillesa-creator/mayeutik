const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : JSON.stringify(x)); if (!c) echecs++; };

const srv = http.createServer((q, r) => {
  const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(d);
  });
});

async function ouvrir(browser, port, niveau, competence) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  const base = `http://localhost:${port}/jeux/M36-solides.html`;
  await page.goto(base);
  await page.evaluate((niveau) => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.setItem('mayeutik-sessions', JSON.stringify([]));
    localStorage.removeItem('mayeutik-m36-bonus-revele');
  }, niveau);
  await page.goto(competence ? `${base}?competence=${competence}` : base);
  await page.waitForTimeout(500);
  return { page, erreurs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ================= 1. Cartes par palier : polyèdre retiré du CE1 =================
  for (const [niveau, attendus, interdits] of [
    ['CP',  ['Qui suis-je ?', 'Je compte', 'Construction', 'Devinettes'], ['Polyèdre ?']],
    ['CE1', ['Qui suis-je ?', 'Je compte', "J’explore", 'Construction', 'Devinettes'], ['Polyèdre ?']],
    ['CE2', ['Qui suis-je ?', 'Je compte', 'Polyèdre ?', "J’explore", 'Devinettes', 'Les patrons', 'Perspective cavalière'], ['Construction']]
  ]) {
    const { page, erreurs } = await ouvrir(browser, port, niveau);
    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('.card .nom')).map(n => n.textContent));
    attendus.forEach(a => ok(cartes.includes(a), `${niveau} : carte « ${a} » présente`));
    interdits.forEach(i => ok(!cartes.includes(i), `${niveau} : carte « ${i} » ABSENTE`, cartes));
    ok(erreurs.length === 0, `${niveau} : aucune erreur console/JS`, erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 2. Devinettes : plus de « On me trouve dans », pas de polyèdre au CE1 =================
  {
    const { page } = await ouvrir(browser, port, 'CE2');
    const banque = await page.evaluate(() => CONTENU.devinettes.map(d => ({ q: d.q, niveau: d.niveau })));
    const onMeTrouve = banque.filter(d => /^On me trouve dans/i.test(d.q));
    ok(onMeTrouve.length === 0, 'Devinettes : plus aucun énoncé « On me trouve dans… »', onMeTrouve.map(d => d.q));
    const maForme = banque.filter(d => /(est de ma forme|a souvent ma forme)/i.test(d.q));
    ok(maForme.length === 0, 'Devinettes : plus aucun énoncé « … est/a ma forme »', maForme.map(d => d.q));
    const attendues = [
      'Quelle forme a un ballon ?',
      'Quelle forme a une boîte de conserve ?',
      'Quelle forme a un cornet de glace ?',
      'Quelle forme a une boîte à chaussures ?'
    ];
    attendues.forEach(a => ok(banque.some(d => d.q === a), `Devinettes : nouvel énoncé présent — « ${a} »`));
    const polyCE1 = banque.filter(d => /polyèdre/i.test(d.q) && (d.niveau === 'CP' || d.niveau === 'CE1'));
    ok(polyCE1.length === 0, 'Devinettes : aucune devinette « polyèdre » aux paliers CP/CE1', polyCE1);
    ok(banque.some(d => /polyèdre/i.test(d.q) && d.niveau === 'CE2'), 'Devinettes : la devinette « polyèdre » subsiste au CE2');
    await page.close();
  }

  // ================= 3. Vocabulaire des paliers =================
  {
    const { page } = await ouvrir(browser, port, 'CE2');
    const voc = await page.evaluate(() => ({
      CP: CONTENU.paliers.CP.vocabulaire,
      CE1: CONTENU.paliers.CE1.vocabulaire,
      CE2: CONTENU.paliers.CE2.vocabulaire
    }));
    ok(!voc.CE1.includes('polyedre'), 'Vocabulaire CE1 : « polyedre » retiré', voc.CE1);
    ok(voc.CE2.includes('polyedre'), 'Vocabulaire CE2 : « polyedre » conservé', voc.CE2);
    await page.close();
  }

  // ================= 4. Parties modélisées des solides ronds =================
  {
    const { page } = await ouvrir(browser, port, 'CE2');
    for (const [k, nbFaces, nbSommets, nbAretes] of [
      ['cube', 6, 8, 12], ['pave', 6, 8, 12], ['pyramide', 5, 5, 8],
      ['cylindre', 2, 0, 0], ['cone', 1, 1, 0], ['boule', 0, 0, 0]
    ]) {
      const parties = await page.evaluate((k) => {
        montrerSolide(k);
        return { f: partiesC.faces.length, s: partiesC.sommets.length, a: partiesC.aretes.length };
      }, k);
      ok(parties.f === nbFaces && parties.s === nbSommets && parties.a === nbAretes,
        `Moteur 3D : ${k} modélise ${nbFaces} face(s), ${nbSommets} sommet(s), ${nbAretes} arête(s)`, parties);
      // Cohérence avec la donnée pédagogique facesPlates (base du comptage).
      const declare = await page.evaluate((k) => CONTENU.solides[k].facesPlates, k);
      ok(declare === nbFaces, `Cohérence : facesPlates(${k}) = ${declare} = nb de faces modélisées`);
    }
    await page.close();
  }

  // ================= 5. Découverte : boutons actifs selon les parties réelles =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE2');
    await page.locator('.card', { hasText: 'Découvre les solides' }).click();
    await page.waitForTimeout(400);
    for (const [nom, attendu] of [
      ['Cube', { faces: true, aretes: true, sommets: true }],
      ['Cylindre', { faces: true, aretes: false, sommets: false }],
      ['Cône', { faces: true, aretes: false, sommets: true }],
      ['Boule', { faces: false, aretes: false, sommets: false }]
    ]) {
      await page.locator('.chip', { hasText: new RegExp(`^${nom}$`) }).click();
      await page.waitForTimeout(250);
      const etat = await page.evaluate(() => {
        const r = {};
        document.querySelectorAll('.tog').forEach(t => { r[t.dataset.t] = !t.disabled; });
        return r;
      });
      ok(etat.faces === attendu.faces && etat.aretes === attendu.aretes && etat.sommets === attendu.sommets,
        `Découverte CE2 — ${nom} : boutons actifs conformes`, { obtenu: etat, attendu });
    }

    // Le bouton actif doit réellement surligner : cône -> sommet
    await page.locator('.chip', { hasText: /^Cône$/ }).click();
    await page.waitForTimeout(250);
    await page.locator('.tog[data-t="sommets"]').click();
    await page.waitForTimeout(200);
    const opacite = await page.evaluate(() => partiesC.sommets.map(s => s.material.opacity));
    ok(opacite.length === 1 && opacite[0] > 0, 'Découverte — Cône : le bouton Sommets allume bien la pointe', opacite);
    ok(erreurs.length === 0, 'Découverte : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 6. Découverte au CP : seul le bouton Faces est visible =================
  {
    const { page } = await ouvrir(browser, port, 'CP');
    await page.locator('.card', { hasText: 'Découvre les solides' }).click();
    await page.waitForTimeout(400);
    const visibles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tog')).filter(t => !t.hidden).map(t => t.dataset.t));
    ok(visibles.length === 1 && visibles[0] === 'faces', 'Découverte CP : seul le bouton Faces est visible', visibles);
    // Cylindre au CP : Faces doit être ACTIF (2 disques).
    await page.locator('.chip', { hasText: /^Cylindre$/ }).click();
    await page.waitForTimeout(250);
    const actif = await page.evaluate(() => !document.querySelector('.tog[data-t="faces"]').disabled);
    ok(actif, 'Découverte CP — Cylindre : le bouton Faces est actif');
    const badge = await page.evaluate(() => document.querySelectorAll('#infoCard .badge').length);
    ok(badge === 0, 'Découverte CP : aucun badge polyèdre');
    await page.close();
  }

  // ================= 7. Découverte au CE1 : pas de badge polyèdre =================
  {
    const { page } = await ouvrir(browser, port, 'CE1');
    await page.locator('.card', { hasText: 'Découvre les solides' }).click();
    await page.waitForTimeout(400);
    const badge = await page.evaluate(() => document.querySelectorAll('#infoCard .badge').length);
    ok(badge === 0, 'Découverte CE1 : aucun badge polyèdre (notion réservée au CE2)');
    const texte = await page.evaluate(() => document.getElementById('infoCard').textContent);
    ok(!/polyèdre/i.test(texte), 'Découverte CE1 : le mot « polyèdre » n\'apparaît pas', texte.slice(0, 120));
    await page.close();
  }

  // ================= 8. « Je compte » : pas de bouton Montre-moi avant réponse =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', 'ce1-compter');
    await page.waitForTimeout(400);
    const avant = await page.evaluate(() => ({
      btnShow: document.getElementById('btnShow'),
      q: document.getElementById('qText').textContent
    }));
    ok(avant.btnShow === null, '« Je compte » : le bouton 👀 Montre-moi n\'existe plus du tout (code mort retiré)', avant);

    // --- bonne réponse : pas d'animation, auto-avance conservée ---
    const infoBonne = await page.evaluate(() => {
      const b = document.querySelector('.rep[data-correct]');
      b.click();
      return { feedback: document.getElementById('feedback').className };
    });
    ok(infoBonne.feedback === 'bon', '« Je compte » : bonne réponse -> feedback bon', infoBonne);
    const posAvant = await page.evaluate(() => document.querySelectorAll('.dot.cur').length);
    await page.waitForTimeout(2600); // > DELAI_AUTO_SUIVANT
    const aAvance = await page.evaluate(() => document.getElementById('feedback').textContent === '');
    ok(aAvance, '« Je compte » : bonne réponse -> auto-avance TOUJOURS active (question suivante)');
    ok(erreurs.length === 0, '« Je compte » : aucune erreur console/JS (bonne réponse)', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 9. « Je compte » : mauvaise réponse -> comptage animé, pas d'auto-avance =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', 'ce1-compter');
    await page.waitForTimeout(400);
    const q = await page.evaluate(() => ({ texte: document.getElementById('qText').textContent }));
    await page.evaluate(() => {
      const faux = Array.from(document.querySelectorAll('.rep')).find(b => !b.dataset.correct);
      faux.click();
    });
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({
      feedback: document.getElementById('feedback').className,
      texte: document.getElementById('feedback').textContent,
      bulleVisible: getComputedStyle(document.getElementById('counterBubble')).display !== 'none',
      seqActive: typeof seqTimer !== 'undefined' && seqTimer !== null
    }));
    ok(apres.feedback === 'mauvais', '« Je compte » : mauvaise réponse -> feedback mauvais', apres.texte);
    ok(/La bonne réponse était \d+/.test(apres.texte), '« Je compte » : la correction annonce le bon nombre', apres.texte);
    ok(!/Appuie sur/.test(apres.texte), '« Je compte » : la correction ne renvoie plus au bouton 👀', apres.texte);
    ok(apres.bulleVisible && apres.seqActive, '« Je compte » : le comptage animé démarre tout seul', apres);

    // Auto-avance neutralisée : après largement plus que 2 s, on est toujours sur la même question.
    await page.waitForTimeout(3200);
    const toujoursLa = await page.evaluate(() => ({
      memeQuestion: document.getElementById('qText').textContent,
      feedbackEncore: document.getElementById('feedback').className
    }));
    ok(toujoursLa.memeQuestion === q.texte && toujoursLa.feedbackEncore === 'mauvais',
      '« Je compte » : mauvaise réponse -> AUCUN passage automatique (l\'enfant regarde le comptage)', toujoursLa);

    // Le bouton Suivant fonctionne toujours manuellement.
    await page.locator('#btnNext').click();
    await page.waitForTimeout(300);
    const suite = await page.evaluate(() => document.getElementById('feedback').className);
    ok(suite === '', '« Je compte » : « Suivant » manuel enchaîne bien', suite);
    ok(erreurs.length === 0, '« Je compte » : aucune erreur console/JS (mauvaise réponse)', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 10. Comptage animé sur un solide ROND (cylindre/cône) =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CP', 'cp-compter-faces');
    await page.waitForTimeout(400);
    // Force une question sur le cylindre pour valider l'animation des disques.
    const res = await page.evaluate(async () => {
      file = [{ mode: 'compte', solide: 'cylindre', kind: 'faces', ans: 2,
                q: 'Combien de faces plates a le cylindre ?', opts: [2, 3, 4, 5], fmt: x => String(x) }];
      pos = 0; score = 0;
      question();
      await new Promise(r => setTimeout(r, 200));
      const faux = Array.from(document.querySelectorAll('.rep')).find(b => !b.dataset.correct);
      faux.click();
      await new Promise(r => setTimeout(r, 250));
      return {
        nbFacesModelisees: partiesC.faces.length,
        bulle: document.getElementById('counterBubble').textContent,
        bulleVisible: getComputedStyle(document.getElementById('counterBubble')).display !== 'none',
        feedback: document.getElementById('feedback').textContent
      };
    });
    ok(res.nbFacesModelisees === 2, 'Comptage rond — cylindre : 2 disques modélisés à compter', res);
    ok(res.bulleVisible, 'Comptage rond — cylindre : la bulle de comptage s\'affiche', res);
    ok(/La bonne réponse était 2/.test(res.feedback), 'Comptage rond — cylindre : le bon nombre est annoncé', res.feedback);
    // Laisse la séquence dérouler et vérifie qu'elle atteint bien 2.
    await page.waitForTimeout(1500);
    const compte = await page.evaluate(() => document.getElementById('counterBubble').textContent);
    ok(compte === '2', 'Comptage rond — cylindre : la bulle atteint bien 2', compte);
    ok(erreurs.length === 0, 'Comptage rond : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
