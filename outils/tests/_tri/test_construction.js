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

async function ouvrir(browser, port, niveau, params) {
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
  await page.goto(params ? `${base}?${params}` : base);
  await page.waitForTimeout(500);
  return { page, erreurs };
}

// Passe l'écran découverte si présent, joue le tour de pose courant SANS
// erreur (bonne pièce, puis bonne arête via q._accroches), clique Suivant.
async function jouerTourParfait(page) {
  await page.evaluate(async () => {
    const q = file[pos];
    if (q.decouverte && !q._decouverteVue) {
      // saute l'attente d'auto-éclatement : découverte vue, on re-rend
      clearTimeout(minuteurEclate);
      q._decouverteVue = true;
      question();
      await new Promise(r => setTimeout(r, 80));
    }
  });
  await page.evaluate(async () => {
    const q = file[pos];
    const b = document.querySelector('.forme[data-correct]');
    const sig = b.dataset.sig;
    b.click();
    await new Promise(r => setTimeout(r, 60));
    if (q.tour > 0) tapHandler.cb({ index: q._posables.get(sig)[0] });
  });
  await page.waitForTimeout(120);
  const etat = await page.evaluate(() => ({
    ok: file[pos]._ok, feedback: document.getElementById('feedback').className
  }));
  await page.evaluate(() => { desarmerAutoSuivant(); document.getElementById('btnNext').click(); });
  await page.waitForTimeout(100);
  return etat;
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ================= 1. Présence par palier =================
  for (const [niveau, doit, nePasAvoir] of [
    ['CP', true, null], ['CE1', true, null], ['CE2', false, 'Les patrons']
  ]) {
    const { page, erreurs } = await ouvrir(browser, port, niveau);
    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('.card .nom')).map(n => n.textContent));
    ok(cartes.includes('Construction') === doit,
      `${niveau} : carte Construction ${doit ? 'présente' : 'ABSENTE'}`, cartes);
    if (nePasAvoir) ok(cartes.includes(nePasAvoir), `${niveau} : « ${nePasAvoir} » toujours là`);
    ok(erreurs.length === 0, `${niveau} : aucune erreur console/JS`, erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 2. Structure des files =================
  {
    const { page } = await ouvrir(browser, port, 'CE1');
    const structures = await page.evaluate(() => {
      const r = {};
      for (const id of ['cp-construction', 'ce1-construction']) {
        const t = trouverMiniJeu(id);
        const f = construireFile(t.cfg, t.palier, t.palierNom);
        r[id] = {
          total: f.length,
          solides: [...new Set(f.map(x => x.solide))],
          poses: f.filter(x => x.etape === 'pose').length,
          filaires: f.filter(x => x.etape === 'filaire').length,
          decouvertes: f.filter(x => x.decouverte).length
        };
      }
      return r;
    });
    ok(structures['cp-construction'].total === 12 &&
       structures['cp-construction'].filaires === 0 &&
       String(structures['cp-construction'].solides) === 'cube,pave' &&
       structures['cp-construction'].decouvertes === 2,
      'CP : 12 tours de pose (6+6), 2 découvertes, cube+pavé, PAS de fil de fer', structures['cp-construction']);
    ok(structures['ce1-construction'].total === 20 &&
       structures['ce1-construction'].poses === 17 &&
       structures['ce1-construction'].filaires === 3 &&
       String(structures['ce1-construction'].solides) === 'cube,pave,pyramide',
      'CE1 : 17 poses (6+6+5) + 3 fils de fer, cube+pavé+pyramide', structures['ce1-construction']);
    await page.close();
  }

  // ================= 3. Découverte : éclatement, non noté =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CP');
    await page.locator('.card', { hasText: 'Construction' }).click();
    await page.waitForTimeout(300);
    const dec = await page.evaluate(() => ({
      texte: document.getElementById('qText').textContent,
      boutons: Array.from(document.querySelectorAll('#answers .rep')).map(b => ({ t: b.textContent, cache: b.hidden })),
      score: score
    }));
    ok(/Voici le cube/.test(dec.texte), 'Découverte : le cube se présente', dec.texte);
    ok(dec.boutons.length === 2 && /Éclate/.test(dec.boutons[0].t) && dec.boutons[1].cache,
      'Découverte : bouton Éclate visible, bouton Construire caché avant l\'animation', dec.boutons);
    await page.locator('#answers .rep', { hasText: 'Éclate' }).click();
    await page.waitForTimeout(400);
    const pendant = await page.evaluate(() => ({
      anim: animEclate !== null && animEclate.actif,
      revoir: document.querySelectorAll('#answers .rep')[0].textContent,
      construire: !document.querySelectorAll('#answers .rep')[1].hidden
    }));
    ok(pendant.anim, 'Découverte : l\'animation d\'éclatement tourne', pendant);
    ok(/Revoir/.test(pendant.revoir) && pendant.construire,
      'Découverte : Revoir + À moi de construire disponibles', pendant);
    await page.evaluate(() => { animEclate.t = 0.999; avancerEclatement(1); });
    const fini = await page.evaluate(() => ({ actif: animEclate.actif, score, pos }));
    ok(!fini.actif && fini.score === 0 && fini.pos === 0,
      'Découverte : animation finie, RIEN de noté (score 0, toujours tour 0)', fini);
    ok(erreurs.length === 0, 'Découverte : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 4. Parcours parfait CP complet -> 3 étoiles =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CP', 'competence=cp-construction');
    await page.waitForTimeout(400);
    const enJeu = await page.evaluate(() => !document.getElementById('game').hidden);
    ok(enJeu, 'CHARTE §16 : ?competence=cp-construction démarre direct en jeu');
    for (let i = 0; i < 12; i++) {
      const etat = await jouerTourParfait(page);
      if (!etat.ok) { ok(false, `CP parfait : tour ${i} aurait dû réussir`, etat); break; }
    }
    const finEcran = await page.evaluate(() => ({
      fin: !document.getElementById('end').hidden,
      etoiles: document.getElementById('endStars').textContent.trim().length,
      score: score, total: file.length
    }));
    ok(finEcran.fin && finEcran.score === 12 && finEcran.total === 12,
      'CP parfait : 12/12, écran de fin atteint', finEcran);
    ok(finEcran.etoiles === 3, 'CP parfait : 3 étoiles', finEcran.etoiles);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions')).pop());
    ok(session && session.competence === 'cp-construction' && session.score === 12 && session.total === 12,
      'CP parfait : session enregistrée sous cp-construction', session);
    ok(erreurs.length === 0, 'CP parfait : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 5. Erreurs de l'étape 2 =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', 'competence=ce1-construction');
    await page.waitForTimeout(400);
    // 5a. mauvaise PIÈCE au tour 0 (intrus)
    await page.evaluate(async () => {
      clearTimeout(minuteurEclate);
      file[pos]._decouverteVue = true; question();
      await new Promise(r => setTimeout(r, 80));
      Array.from(document.querySelectorAll('.forme')).find(b => !b.dataset.correct).click();
    });
    await page.waitForTimeout(150);
    const e1 = await page.evaluate(() => ({
      ok: file[pos]._ok,
      feedback: document.getElementById('feedback').className,
      texte: document.getElementById('feedback').textContent,
      verte: !!document.querySelector('.forme[data-correct].ok'),
      posee: etatChantier.posees.size
    }));
    ok(e1.ok === false && e1.feedback === 'mauvais', 'Mauvaise pièce : tour raté, feedback mauvais', e1.texte);
    ok(/n’est pas une face du cube/.test(e1.texte), 'Mauvaise pièce : correction disant que la forme n\'est pas du solide', e1.texte);
    ok(e1.verte, 'Mauvaise pièce : la bonne pièce passe en vert (CHARTE §18)');
    ok(e1.posee === 1, 'Mauvaise pièce : la face est posée quand même, le chantier avance');
    // 5b. mauvaise ARÊTE : sur le PAVÉ (le cube n'a que des faces
    //     superposables, donc aucune arête libre n'y est jamais fausse).
    const e2 = await page.evaluate(async () => {
      pos = file.findIndex(x => x.solide === 'pave' && x.tour === 1);
      file[pos]._decouverteVue = true;
      etatChantier = null;
      question();
      await new Promise(r => setTimeout(r, 80));
      const q = file[pos], S = CONTENU.solides.pave;
      // Choisit une pièce, puis tape une arête libre dont la face au bout
      // a une AUTRE signature que celle choisie.
      const b = document.querySelector('.forme[data-correct]');
      const sig = b.dataset.sig;
      b.click();
      await new Promise(r => setTimeout(r, 60));
      const bonnes = q._posables.get(sig);
      const fausse = aretesLibres(S, etatChantier.posees).find(e => !bonnes.includes(e));
      tapHandler.cb({ index: fausse });
      await new Promise(r => setTimeout(r, 60));
      return { ok: q._ok, texte: document.getElementById('feedback').textContent,
               posees: etatChantier.posees.size, avaitUneFausse: fausse !== undefined };
    });
    ok(e2.avaitUneFausse, 'Pavé : il existe bien des arêtes libres invalides pour une pièce donnée');
    ok(e2.ok === false && /arête verte/.test(e2.texte),
      'Mauvaise arête : tour raté, les bonnes arêtes désignées en vert', e2.texte);
    ok(e2.posees === 2, 'Mauvaise arête : la face est posée quand même');
    // 5c. taper une arête éteinte (0 face posée) est IGNORÉ
    await page.evaluate(() => { desarmerAutoSuivant(); document.getElementById('btnNext').click(); });
    await page.waitForTimeout(150);
    const e3 = await page.evaluate(async () => {
      const q = file[pos];
      document.querySelector('.forme[data-correct]').click();
      await new Promise(r => setTimeout(r, 60));
      const S = CONTENU.solides[q.solide];
      const eteinte = S.e.map((_, e) => e).find(e =>
        facesDeLArete(S, e).filter(i => etatChantier.posees.has(i)).length === 0);
      if (eteinte !== undefined) tapHandler.cb({ index: eteinte });
      await new Promise(r => setTimeout(r, 60));
      return { fini: !!q._fini, encoreLa: tapHandler !== null };
    });
    ok(!e3.fini && e3.encoreLa, 'Arête éteinte : tap ignoré silencieusement, le tour continue', e3);
    ok(erreurs.length === 0, 'Erreurs étape 2 : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 6. Fil de fer (CE1) =================
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', 'competence=ce1-construction');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      pos = file.findIndex(x => x.etape === 'filaire'); // le cube
      question();
    });
    await page.waitForTimeout(250);
    const depart = await page.evaluate(() => ({
      bulle: document.getElementById('counterBubble').textContent,
      sommetsVisibles: partiesC.sommets.every(s => s.material.opacity === 1),
      vignette: !document.getElementById('modeleRef').hidden
    }));
    ok(depart.bulle === '0 / 12' && depart.sommetsVisibles,
      'Fil de fer : nuage de 8 sommets visible, compteur 0 / 12', depart);
    ok(depart.vignette, 'Fil de fer : vignette modèle affichée');
    // une DIAGONALE de face (0-2) : refusée
    const diag = await page.evaluate(async () => {
      tapHandler.cb({ index: 0 }); tapHandler.cb({ index: 2 });
      await new Promise(r => setTimeout(r, 60));
      return {
        texte: document.getElementById('feedback').textContent,
        bulle: document.getElementById('counterBubble').textContent
      };
    });
    ok(/pas voisins/.test(diag.texte) && diag.bulle === '0 / 12',
      'Fil de fer : la diagonale 0-2 est refusée, rien n\'est posé', diag);
    // re-taper le même sommet désélectionne
    const desel = await page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1400)); // fin du message transitoire
      tapHandler.cb({ index: 5 });
      const apres1 = partiesC.sommets[5].scale.x;
      tapHandler.cb({ index: 5 });
      return { selectionne: apres1 > 1, relache: partiesC.sommets[5].scale.x === 1 };
    });
    ok(desel.selectionne && desel.relache, 'Fil de fer : re-taper un sommet le désélectionne', desel);
    // pose des 12 arêtes -> tour réussi (1 seule erreur commise)
    const fin = await page.evaluate(async () => {
      const S = CONTENU.solides[file[pos].solide];
      for (const [a, b] of S.e) { tapHandler.cb({ index: a }); tapHandler.cb({ index: b }); }
      await new Promise(r => setTimeout(r, 120));
      return {
        ok: file[pos]._ok,
        bulle: document.getElementById('counterBubble').textContent,
        feedback: document.getElementById('feedback').className
      };
    });
    ok(fin.ok === true && fin.bulle === '12 / 12' && fin.feedback === 'bon',
      'Fil de fer : 12 arêtes posées, tour réussi malgré 1 essai raté (seuil bienveillant)', fin);
    ok(erreurs.length === 0, 'Fil de fer : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 7. Fil de fer : 3 erreurs -> tour raté =================
  {
    const { page } = await ouvrir(browser, port, 'CE1', 'competence=ce1-construction');
    await page.waitForTimeout(400);
    const res = await page.evaluate(async () => {
      pos = file.findIndex(x => x.etape === 'filaire');
      question();
      await new Promise(r => setTimeout(r, 150));
      // 3 diagonales fausses : 0-2, 1-3, 4-6
      for (const [a, b] of [[0, 2], [1, 3], [4, 6]]) {
        tapHandler.cb({ index: a }); tapHandler.cb({ index: b });
        await new Promise(r => setTimeout(r, 30));
      }
      const S = CONTENU.solides[file[pos].solide];
      for (const [a, b] of S.e) { tapHandler.cb({ index: a }); tapHandler.cb({ index: b }); }
      await new Promise(r => setTimeout(r, 120));
      return { ok: file[pos]._ok, texte: document.getElementById('feedback').textContent };
    });
    ok(res.ok === false && /3 essais ratés/.test(res.texte),
      'Fil de fer : 3 erreurs -> tour raté avec correction explicative', res.texte);
    await page.close();
  }

  // ===== 8. Signatures : toutes les poses correctes sont acceptées =====
  // (bug corrigé : une seule face-cible était imposée par tour)
  {
    const { page } = await ouvrir(browser, port, 'CE1');
    const geo = await page.evaluate(() => {
      const r = {};
      for (const k of CONSTRUCTIBLES) {
        const S = CONTENU.solides[k], G = geometrieConstruction(k);
        const groupes = {};
        G.signatures.forEach((s, i) => { (groupes[s] = groupes[s] || []).push(i); });
        r[k] = {
          nbFaces: S.f.length, nbAretes: S.e.length,
          nbSignatures: Object.keys(groupes).length,
          tailles: Object.values(groupes).map(f => f.length).sort(),
          libelles: Object.keys(groupes).map(libelleSignature).sort(),
          // Un intrus ne doit jamais être superposable à une face du solide.
          intrusEtrangers: G.intrus.every(x => !G.signatures.includes(x.sig.replace(/^intrus:/, ''))),
          intrusLibelles: G.intrus.map(x => x.libelle)
        };
      }
      return r;
    });
    ok(geo.cube.nbSignatures === 1 && geo.cube.tailles[0] === 6,
      'Cube : 6 faces superposables -> UNE seule signature (toutes interchangeables)', geo.cube);
    ok(geo.pave.nbSignatures === 3 && String(geo.pave.tailles) === '2,2,2',
      'Pavé : 3 formes distinctes, 2 faces chacune', geo.pave);
    ok(geo.pyramide.nbSignatures === 2 && String(geo.pyramide.libelles) === 'un carré,un triangle' &&
       geo.pyramide.nbAretes === 8,
      'Pyramide : 1 carré + 4 triangles, 8 arêtes', geo.pyramide);
    ok(!geo.pave.libelles.includes('un carré'),
      'Pavé : AUCUNE face carrée (distinction cube/pavé du programme)', geo.pave.libelles);
    ok(geo.pave.intrusLibelles.includes('un carré'),
      'Pavé : le carré du cube sert d\'intrus — la distinction est travaillée', geo.pave.intrusLibelles);
    ok(geo.cube.intrusEtrangers && geo.pave.intrusEtrangers && geo.pyramide.intrusEtrangers,
      'Les intrus ne sont jamais superposables à une face du solide');

    // Discriminabilité : deux formes d'un même solide diffèrent nettement.
    const ecarts = await page.evaluate(() => {
      const S = CONTENU.solides.pave, G = geometrieConstruction('pave');
      const dims = [...new Set(G.signatures)].map(sig => {
        const i = G.signatures.indexOf(sig);
        const pts = contourFace2D(S, i);
        const w = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]));
        const h = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
        return { w: +w.toFixed(2), h: +h.toFixed(2), ratio: +(w / h).toFixed(2) };
      });
      let minEcart = Infinity;
      for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) {
        minEcart = Math.min(minEcart, Math.abs(dims[i].ratio - dims[j].ratio));
      }
      return { dims, minEcart: +minEcart.toFixed(2) };
    });
    ok(ecarts.minEcart >= 0.8,
      'Pavé : les proportions des 3 rectangles sont franchement séparées (écart de ratio >= 0,8)', ecarts);
    await page.close();
  }

  // ===== 8bis. Simulation : aucune impasse, toutes les arêtes valides acceptées =====
  {
    const { page } = await ouvrir(browser, port, 'CE1');
    const sim = await page.evaluate(() => {
      const rapport = {};
      for (const k of CONSTRUCTIBLES) {
        const S = CONTENU.solides[k], G = geometrieConstruction(k);
        let impasses = 0, maxAretes = 0, partiesCompletes = 0;
        for (let essai = 0; essai < 200; essai++) {
          const posees = new Set();
          for (let tour = 0; tour < S.f.length; tour++) {
            const posables = new Map();
            if (tour === 0) G.signatures.forEach(s => { if (!posables.has(s)) posables.set(s, []); });
            else aretesLibres(S, posees).forEach(e => {
              const sig = G.signatures[faceAuBout(S, e, posees)];
              if (!posables.has(sig)) posables.set(sig, []);
              posables.get(sig).push(e);
            });
            if (posables.size === 0) { impasses++; break; }
            const sigs = [...posables.keys()];
            const choix = sigs[Math.floor(Math.random() * sigs.length)];
            if (tour === 0) { posees.add(G.signatures.indexOf(choix)); continue; }
            const aretes = posables.get(choix);
            if (!aretes.length) { impasses++; break; }
            maxAretes = Math.max(maxAretes, aretes.length);
            posees.add(faceAuBout(S, aretes[Math.floor(Math.random() * aretes.length)], posees));
          }
          if (posees.size === S.f.length) partiesCompletes++;
        }
        rapport[k] = { impasses, partiesCompletes, maxAretesAcceptees: maxAretes };
      }
      return rapport;
    });
    for (const k of ['cube', 'pave', 'pyramide']) {
      ok(sim[k].impasses === 0 && sim[k].partiesCompletes === 200,
        `${k} : 200/200 parties menées au bout par choix libres, aucune impasse`, sim[k]);
    }
    ok(sim.cube.maxAretesAcceptees > 1 && sim.pave.maxAretesAcceptees > 1,
      'Plusieurs arêtes sont acceptées quand plusieurs poses sont correctes (bug corrigé)',
      { cube: sim.cube.maxAretesAcceptees, pave: sim.pave.maxAretesAcceptees });
    await page.close();
  }

  // ===== 8ter. Chaque arête valide est réellement acceptée en jeu =====
  {
    const { page } = await ouvrir(browser, port, 'CE1', 'competence=ce1-construction');
    await page.waitForTimeout(400);
    const res = await page.evaluate(async () => {
      // Sur le cube au tour 2, plusieurs arêtes conviennent : on rejoue le
      // tour pour CHACUNE et on vérifie qu'elles sont toutes acceptées.
      const resultats = [];
      const prep = async () => {
        pos = file.findIndex(x => x.solide === 'cube' && x.tour === 2);
        file[pos]._decouverteVue = true; file[pos]._fini = false; file[pos]._ok = undefined;
        etatChantier = null;
        question();
        await new Promise(r => setTimeout(r, 80));
      };
      await prep();
      const b0 = document.querySelector('.forme[data-correct]');
      const sig = b0.dataset.sig;
      b0.click();
      await new Promise(r => setTimeout(r, 60));
      const candidates = [...file[pos]._posables.get(sig)];
      for (const e of candidates) {
        await prep();
        const b = document.querySelector(`.forme[data-sig="${sig}"]`);
        b.click();
        await new Promise(r => setTimeout(r, 60));
        tapHandler.cb({ index: e });
        await new Promise(r => setTimeout(r, 60));
        resultats.push({ arete: e, accepte: file[pos]._ok === true });
      }
      return { nbCandidates: candidates.length, resultats };
    });
    ok(res.nbCandidates > 1, 'Cube tour 2 : plusieurs arêtes d\'accroche possibles', res.nbCandidates);
    ok(res.resultats.every(r => r.accepte),
      'Chacune de ces arêtes est acceptée comme bonne réponse', res.resultats);
    await page.close();
  }

  // ===== 8quater. La réserve ne contient JAMAIS deux pièces du même nom =====
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', 'competence=ce1-construction');
    await page.waitForTimeout(400);
    const rapport = await page.evaluate(async () => {
      const anomalies = [], vus = [];
      for (let i = 0; i < file.length; i++) {
        if (file[i].etape !== 'pose') continue;
        pos = i;
        file[i]._decouverteVue = true; file[i]._fini = false;
        if (file[i].tour === 0) etatChantier = null;
        question();
        await new Promise(r => setTimeout(r, 40));
        const noms = Array.from(document.querySelectorAll('.forme'))
          .map(b => b.dataset.correct ? libelleSignature(b.dataset.sig)
                                      : libelleSignature(b.dataset.sig.replace(/^intrus:/, '')));
        vus.push({ solide: file[i].solide, tour: file[i].tour, noms });
        const doublons = noms.filter((n, j) => noms.indexOf(n) !== j);
        if (doublons.length) anomalies.push({ solide: file[i].solide, tour: file[i].tour, noms, doublons });
        // Une seule pièce correcte par nom, et au moins une pièce correcte.
        const correctes = Array.from(document.querySelectorAll('.forme[data-correct]'));
        if (!correctes.length) anomalies.push({ solide: file[i].solide, tour: file[i].tour, souci: 'aucune pièce correcte' });
      }
      return { anomalies, exemples: vus.slice(0, 3), nbTours: vus.length };
    });
    ok(rapport.anomalies.length === 0,
      `Réserve : sur les ${rapport.nbTours} tours de pose, jamais deux pièces du même nom`, rapport.anomalies.slice(0, 4));
    ok(rapport.exemples.every(e => e.noms.length >= 3),
      'Réserve : au moins 3 pièces proposées à chaque tour', rapport.exemples);
    ok(erreurs.length === 0, 'Réserve : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ================= 9. Référentiel =================
  {
    const ref = JSON.parse(fs.readFileSync('/home/user/mayeutik/data/referentiel.json', 'utf8'));
    const m36 = ref.modules.find(m => m.id === 'M36');
    const ids = m36.competences.map(c => c.id);
    ok(ids.includes('cp-construction') && ids.includes('ce1-construction'),
      'Référentiel : cp-construction et ce1-construction déclarés', ids.length + ' compétences');
    ok(!ids.includes('ce1-polyedre'),
      'Référentiel : ce1-polyedre retiré (mini-jeu supprimé du CE1 au commit précédent)');
    ok(ids.length === 16, 'Référentiel : 16 compétences, comme le jeu', ids.length);
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
