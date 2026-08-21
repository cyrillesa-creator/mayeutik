const socle = require('./socle.js');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = socle.chargerPlaywright();

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : JSON.stringify(x)); if (!c) echecs++; };

const srv = http.createServer((q, r) => {
  const p = path.join(socle.RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(d); });
});

async function ouvrir(browser, port, niveau, params, bonus) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  const base = `http://localhost:${port}/jeux/M37-assemblages.html`;
  await page.goto(base);
  await page.evaluate(({ niveau, bonus }) => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.setItem('mayeutik-sessions', JSON.stringify([]));
    if (bonus) localStorage.setItem('mayeutik-m37-bonus-revele', JSON.stringify({ p1: bonus }));
    else localStorage.removeItem('mayeutik-m37-bonus-revele');
  }, { niveau, bonus });
  await page.goto(params ? `${base}?${params}` : base);
  await page.waitForTimeout(400);
  return { page, erreurs };
}

/* Joue l'assemblage courant PARFAITEMENT, en s'appuyant sur la cible : pour
   chaque étage, pose les pièces attendues aux positions du modèle (repère
   identité), puis laisse la vérification automatique enchaîner. */
async function jouerAssemblageParfait(page) {
  return page.evaluate(async () => {
    const journal = [];
    while (!assemblageFini) {
      const att = cibleEtage(etage);
      for (const p of att) {
        typeSel = p.type;
        orient = (p.type === 'pave' && p.dy === 2) ? 'v' : 'h';
        poser(p.x, p.y);
        await new Promise(r => setTimeout(r, 5));
      }
      journal.push({ etage, posees: posEtage(etage).length, attendu: att.length });
      if (journal.length > 6) break;   // garde-fou
    }
    return { journal, erreurs, fini: assemblageFini, ok: resultats[iAssemblage] };
  });
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });

  // ============ 1. Accueil, paliers, verrouillage ============
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CP');
    const etat = await page.evaluate(() => ({
      titre: document.getElementById('hdrTitle').textContent,
      cartes: Array.from(document.querySelectorAll('.card .nom')).map(n => n.textContent),
      puces: Array.from(document.querySelectorAll('.puce-palier')).map(p => ({
        t: p.textContent, verrouille: p.classList.contains('verrouille'), disabled: p.disabled, actif: p.classList.contains('actif')
      })),
      note: document.getElementById('note-palier').textContent
    }));
    ok(etat.puces.length === 2, 'Accueil : 2 onglets de palier (CP, CE1)', etat.puces.map(p => p.t));
    ok(etat.puces[0].actif && !etat.puces[0].verrouille, 'CP : onglet du profil actif et déverrouillé', etat.puces[0]);
    ok(etat.puces[1].verrouille && etat.puces[1].disabled && /🔒/.test(etat.puces[1].t),
      'CP : onglet CE1 verrouillé (🔒, disabled) — aucun bonus ouvert', etat.puces[1]);
    ok(etat.cartes.length === 1, 'Accueil : une carte de mini-jeu', etat.cartes);
    // clic sur onglet verrouillé : sans effet
    const avant = await page.evaluate(() => document.querySelector('.puce-palier.actif').textContent);
    await page.evaluate(() => document.querySelectorAll('.puce-palier')[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(120);
    const apres = await page.evaluate(() => document.querySelector('.puce-palier.actif').textContent);
    ok(avant === apres, 'Onglet verrouillé : clic ignoré silencieusement', { avant, apres });
    ok(erreurs.length === 0, 'Accueil : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }
  // Profil CE1 : les deux onglets ouverts ; bonus ouvert -> CE1 déverrouillé pour un profil CP
  {
    const { page } = await ouvrir(browser, port, 'CE1');
    const puces = await page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier')).map(p => p.classList.contains('verrouille')));
    ok(puces.every(v => !v), 'Profil CE1 : tous les onglets déverrouillés', puces);
    await page.close();
  }
  {
    const { page } = await ouvrir(browser, port, 'CP', null, { CE1: true });
    const puces = await page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier')).map(p => p.classList.contains('verrouille')));
    ok(puces.every(v => !v), 'Profil CP + paquet cadeau CE1 déjà ouvert : CE1 déverrouillé', puces);
    await page.close();
  }

  // ============ 2. Lancement paramétré (CHARTE §16) ============
  for (const [params, attendu] of [
    ['competence=cp-assemblages', 'cp-assemblages'],
    ['competence=ce1-assemblages&palier=ce1', 'ce1-assemblages']
  ]) {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', params);
    const etat = await page.evaluate(() => ({
      enJeu: !document.getElementById('game').hidden || !document.getElementById('regle').hidden,
      mj: miniJeuCourant && miniJeuCourant.cfg.id, palier: etatPalierAffiche
    }));
    ok(etat.enJeu && etat.mj === attendu, `§16 : ?${params} démarre directement sur ${attendu}`, etat);
    ok(erreurs.length === 0, `§16 : aucune erreur console/JS (${attendu})`, erreurs.slice(0, 3));
    await page.close();
  }
  {
    const { page } = await ouvrir(browser, port, 'CP', 'competence=nawak&palier=cm2');
    const etat = await page.evaluate(() => ({ accueil: !document.getElementById('home').hidden, palier: etatPalierAffiche }));
    ok(etat.accueil && etat.palier === 'CP', '§16 : paramètres inconnus ignorés en silence, retour à l\'accueil', etat);
    await page.close();
  }

  // ============ 3. Parcours parfait CP : 5 assemblages, 3 étoiles ============
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CP', 'competence=cp-assemblages');
    /* Le NOMBRE d’assemblages se lit sur le module, il ne se fige pas ici :
       une suite qui écrit « 5 » casse au premier niveau ajouté, sans que rien
       de visible ait empiré. */
    const nbCP = await page.evaluate(() => listeAssemblages().length);
    ok(nbCP === 7, 'CP : sept assemblages', nbCP);
    for (let i = 0; i < nbCP; i++) {
      const r = await jouerAssemblageParfait(page);
      ok(r.fini && r.ok === true && r.erreurs === 0,
        `CP assemblage ${i + 1} : terminé sans erreur`, r);
      await page.evaluate(() => { desarmerAutoSuivant(); document.getElementById('btnNext').click(); });
      await page.waitForTimeout(120);
    }
    const fin = await page.evaluate(() => ({
      fin: !document.getElementById('end').hidden,
      etoiles: document.getElementById('endStars').textContent.trim().length,
      session: JSON.parse(localStorage.getItem('mayeutik-sessions')).pop()
    }));
    ok(fin.fin && fin.etoiles === 3, 'CP parfait : écran de fin, 3 étoiles', fin);
    ok(fin.session && fin.session.module === 'M37' && fin.session.competence === 'cp-assemblages'
       && fin.session.score === nbCP && fin.session.total === nbCP,
      `CP parfait : session M37/cp-assemblages ${nbCP}/${nbCP} enregistrée`, fin.session);
    ok(erreurs.length === 0, 'CP parfait : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ============ 4. Validation invariante par translation ET rotation ============
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CP', 'competence=cp-assemblages');
    // Décale toute la construction : doit rester juste.
    const decale = await page.evaluate(async () => {
      const att = cibleEtage(0);
      for (const p of att) { typeSel = p.type; orient = p.dy === 2 ? 'v' : 'h'; poser(p.x + 1, p.y + 1); }
      await new Promise(r => setTimeout(r, 40));
      return { etage, msg: document.getElementById('msg').className };
    });
    ok(decale.etage === 1, 'Translation : la même forme posée ailleurs sur le plateau est acceptée', decale);
    await page.close();

    const { page: p2 } = await ouvrir(browser, port, 'CP', 'competence=cp-assemblages');
    // Tourne la construction d'un quart de tour : doit rester juste.
    const tourne = await p2.evaluate(async () => {
      const att = cibleEtage(0);
      for (const p of att) {
        typeSel = p.type;
        // rotation k=1 : (x,y) -> (-y,x), puis translation pour rester sur le plateau
        orient = (p.type === 'pave') ? (p.dx === 2 ? 'v' : 'h') : 'h';
        poser(3 - p.y - (p.type === 'pave' && p.dx === 2 ? 0 : 0), p.x);
      }
      await new Promise(r => setTimeout(r, 40));
      return { etage, posees: posees.length };
    });
    ok(tourne.etage === 1, 'Rotation : la construction tournée d\'un quart de tour est acceptée', tourne);
    await p2.close();
    ok(erreurs.length === 0, 'Invariance : aucune erreur console/JS', erreurs.slice(0, 3));
  }

  // ============ 5. Base symétrique : plusieurs repères conservés ============
  {
    const { page } = await ouvrir(browser, port, 'CE1', 'competence=ce1-assemblages&palier=ce1');
    const res = await page.evaluate(async () => {
      // « La tour sur socle » : base 3×3, symétrique -> 4 repères possibles.
      iAssemblage = 3; regleCacheVue = true; reinitAssemblage();
      await new Promise(r => setTimeout(r, 30));
      for (const p of cibleEtage(0)) { typeSel = p.type; poser(p.x, p.y); }
      await new Promise(r => setTimeout(r, 40));
      const nbReperes = reperes.length;
      // étage 1 : une rangée. On la pose PERPENDICULAIREMENT au modèle —
      // c'est une rotation globale valable, elle doit être acceptée.
      const att1 = cibleEtage(1);
      const cx = 1, cy = 1;
      for (const p of att1) { typeSel = p.type; poser(cx + (p.y - cy), cy - (p.x - cx)); }
      await new Promise(r => setTimeout(r, 40));
      return { nbReperes, etage, msg: document.getElementById('msg').className };
    });
    ok(res.nbReperes === 4, 'Socle 3×3 symétrique : les 4 repères sont conservés', res);
    ok(res.etage === 2, 'Étage supérieur posé selon une AUTRE rotation valable : accepté', res);
    await page.close();
  }

  // ============ 6. Règle d'appui et refus des poses invalides ============
  {
    const { page } = await ouvrir(browser, port, 'CP', 'competence=cp-assemblages');
    const r = await page.evaluate(async () => {
      const out = {};
      // pose l'étage 0 correctement
      for (const p of cibleEtage(0)) { typeSel = p.type; orient = 'h'; poser(p.x, p.y); }
      await new Promise(r => setTimeout(r, 40));
      out.etage = etage;
      // tente une pièce en l'air (case sans appui)
      const dessous = occSet(etage - 1);
      let libre = null;
      for (let c = 0; c < 4 && !libre; c++) for (let r2 = 0; r2 < 4 && !libre; r2++)
        if (!dessous.has(c + ',' + r2)) libre = [c, r2];
      const avant = posees.length;
      poser(libre[0], libre[1]);
      out.flottante = { refusee: posees.length === avant, msg: document.getElementById('msg').textContent };
      // les cases sans appui ne sont pas proposées du tout
      out.cellulesProposees = Array.from(document.querySelectorAll('.cell'))
        .every(el => dessous.has(el.dataset.c + ',' + el.dataset.r));
      return out;
    });
    ok(r.flottante.refusee && /flotter/.test(r.flottante.msg),
      'Règle d\'appui : une pièce sans appui est refusée avec un message clair', r.flottante);
    ok(r.cellulesProposees, 'Règle d\'appui : seules les cases avec appui sont proposées');
    await page.close();
  }

  // ============ 7. Écran d'explication des cubes cachés (CE1) ============
  {
    const { page, erreurs } = await ouvrir(browser, port, 'CE1', 'competence=ce1-assemblages&palier=ce1');
    const av = await page.evaluate(() => ({ regle: !document.getElementById('regle').hidden, i: iAssemblage }));
    ok(!av.regle, 'CE1 : pas d\'écran « cube caché » sur le 1er assemblage (sans cube caché)', av);
    const ap = await page.evaluate(async () => {
      iAssemblage = 2; demarrerAssemblage();   // « La croix » : 1er à cube caché
      await new Promise(r => setTimeout(r, 60));
      return {
        regle: !document.getElementById('regle').hidden,
        figures: document.querySelectorAll('#regle-vues figure').length,
        svgNonVides: Array.from(document.querySelectorAll('#regle-vues svg')).every(s => s.innerHTML.length > 50),
        vu: regleCacheVue
      };
    });
    ok(ap.regle && ap.figures === 2 && ap.svgNonVides,
      'CE1 : l\'écran « cube caché » s\'ouvre avec ses 2 vues (normale + écorchée)', ap);
    await page.evaluate(() => document.getElementById('btnRegleOk').click());
    await page.waitForTimeout(120);
    const apres = await page.evaluate(() => ({ jeu: !document.getElementById('game').hidden, i: iAssemblage }));
    ok(apres.jeu, '« J\'ai compris » enchaîne sur l\'assemblage', apres);
    // Ne se rouvre pas pour le suivant
    const encore = await page.evaluate(async () => {
      iAssemblage = 3; demarrerAssemblage();
      await new Promise(r => setTimeout(r, 60));
      return !document.getElementById('regle').hidden;
    });
    ok(!encore, 'L\'écran d\'explication ne se rouvre pas aux assemblages suivants');
    ok(erreurs.length === 0, 'Écran cube caché : aucune erreur console/JS', erreurs.slice(0, 3));
    await page.close();
  }

  // ============ 8. Auto-avance (CHARTE §20) ============
  {
    const { page } = await ouvrir(browser, port, 'CP', 'competence=cp-assemblages');
    await jouerAssemblageParfait(page);
    const avant = await page.evaluate(() => ({
      i: iAssemblage, btn: document.getElementById('btnNext').style.display
    }));
    ok(avant.btn === 'block', '§20 : le bouton Suivant s\'affiche en fin d\'assemblage', avant);
    await page.waitForTimeout(2600);
    const apres = await page.evaluate(() => ({ i: iAssemblage }));
    ok(apres.i === avant.i + 1, '§20 : passage automatique à l\'assemblage suivant après 2 s', { avant: avant.i, apres: apres.i });
    await page.close();
  }

  // ============ 9. Protections tactiles (§19) et défilement ============
  {
    const { page } = await ouvrir(browser, port, 'CP', 'competence=cp-assemblages');
    const styles = await page.evaluate(() => ({
      viewport: document.querySelector('meta[name=viewport]').content,
      universel: getComputedStyle(document.querySelector('.actions button')).touchAction,
      body: getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect,
      aire: getComputedStyle(document.getElementById('aire')).touchAction
    }));
    ok(/maximum-scale=1/.test(styles.viewport) && /user-scalable=no/.test(styles.viewport),
      '§19 : meta viewport conforme', styles.viewport);
    ok(styles.universel === 'manipulation', '§19 : touch-action manipulation sur l\'interface', styles.universel);
    ok(styles.body === 'none', '§19 : sélection native neutralisée sur body', styles.body);
    ok(styles.aire === 'pan-y',
      '§19 : le plateau laisse le défilement vertical (pan-y), la rotation ne lit que l\'horizontal', styles.aire);
    await page.close();
  }

  // ============ 10. Remontée en haut au changement d'écran (§17) ============
  {
    const { page } = await ouvrir(browser, port, 'CP');
    const r = await page.evaluate(async () => {
      window.scrollTo(0, 400);
      const avant = window.scrollY;
      document.querySelector('.card').click();
      await new Promise(r => setTimeout(r, 120));
      return { avant, apres: window.scrollY };
    });
    ok(r.apres === 0, '§17 : on remonte en haut au changement d\'écran', r);
    await page.close();
  }

  // ============ 11. Référentiel et backlog ============
  {
    const ref = JSON.parse(fs.readFileSync('/home/user/mayeutik/data/referentiel.json', 'utf8'));
    const m = ref.modules.find(x => x.id === 'M37');
    ok(!!m, 'Référentiel : entrée M37 présente');
    ok(m.fichier === 'jeux/M37-assemblages.html', 'Référentiel : bon fichier', m.fichier);
    ok(JSON.stringify(m.niveaux) === '["CP","CE1"]', 'Référentiel : niveaux CP/CE1', m.niveaux);
    ok(m.competences.map(c => c.id).join(',') === 'cp-assemblages,ce1-assemblages',
      'Référentiel : compétences cp-assemblages et ce1-assemblages', m.competences.map(c => c.id));
    ok(m.domaine === 'Espace et géométrie', 'Référentiel : domaine Espace et géométrie', m.domaine);

    const bl = JSON.parse(fs.readFileSync('/home/user/mayeutik/pilotage/backlog.json', 'utf8'));
    const b = bl.find(x => x && x.id === 'M37');
    ok(b.sousTheme === 'Le repérage dans l\'espace',
      'Backlog : sous-thème corrigé en « Le repérage dans l\'espace »', b.sousTheme);
    ok(b.statut === 'Terminé' && b.effortReel > 0, 'Backlog : statut Terminé et effortReel renseigné',
      { statut: b.statut, effortReel: b.effortReel });
    ok(!/RESTE À FAIRE/.test(b.notes), 'Backlog : pas de « RESTE À FAIRE » résiduel');
  }

  // ============ 12. Aucune dépendance réseau (fichier autonome) ============
  {
    const html = fs.readFileSync('/home/user/mayeutik/jeux/M37-assemblages.html', 'utf8');
    const externes = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)]
      .map(m => m[1]).filter(u => /^(https?:)?\/\//.test(u));
    ok(externes.length === 0, 'Fichier autonome : aucune URL externe', externes);
    ok(!/@import|fonts\.googleapis/.test(html), 'Fichier autonome : aucun import de police distante');
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);

  // ============ Stock fermé et ORDONNÉ (hors CHARTE §13 bis) ============
  {
    const { page } = await ouvrir(browser, port, 'CE1', 'competence=ce1-assemblages');
    const decl = await page.evaluate(() => typeof TIRAGE_ASSEMBLAGES === 'undefined'
      ? null : TIRAGE_ASSEMBLAGES);
    ok(decl && decl.ordonne === true,
      '§13 bis : le module DÉCLARE ses assemblages comme stock ordonné', decl);
    ok(decl && typeof decl.raison === 'string' && decl.raison.length > 40,
      '§13 bis : la dispense est justifiée en toutes lettres', decl && decl.raison);

    /* La déclaration s’engage sur quelque chose de vérifiable : on JOUE la
       partie et on relit l’ordre effectivement servi. Une déclaration qu’aucun
       test ne confronte au jeu ne vaut pas mieux qu’un commentaire. */
    const attendu = await page.evaluate(() =>
      listeAssemblages().map(a => a.nom));
    const joues = [];
    for (let i = 0; i < attendu.length; i++) {
      joues.push(await page.evaluate(() => assemblageCourant().nom));
      await jouerAssemblageParfait(page);
      await page.evaluate(() => { desarmerAutoSuivant(); document.getElementById('btnNext').click(); });
      await page.waitForTimeout(110);
    }
    ok(JSON.stringify(joues) === JSON.stringify(attendu),
      '§13 bis : l’ordre annoncé est l’ordre joué, sans tirage ni omission',
      { attendu, joues });
    await page.close();
  }

  // ============ L’écran des cubes cachés tombe au bon endroit ============
  {
    const { page } = await ouvrir(browser, port, 'CE1', 'competence=ce1-assemblages');
    const liste = await page.evaluate(() => listeAssemblages().map(a => ({nom:a.nom, cache:!!a.cache})));
    const premier = liste.findIndex(a => a.cache);
    const vus = [];
    for (let i = 0; i < liste.length; i++) {
      vus.push(await page.evaluate(() => !document.getElementById('regle').hidden));
      await page.evaluate(() => {
        if (!document.getElementById('regle').hidden) document.getElementById('btnRegleOk').click();
      });
      await page.waitForTimeout(80);
      await jouerAssemblageParfait(page);
      await page.evaluate(() => { desarmerAutoSuivant(); document.getElementById('btnNext').click(); });
      await page.waitForTimeout(110);
    }
    ok(vus.filter(Boolean).length === 1,
      'L’écran des cubes cachés s’ouvre UNE SEULE FOIS dans la partie', vus);
    ok(vus[premier] === true,
      'et il s’ouvre devant le PREMIER assemblage à cube caché',
      { premier, nom: liste[premier] && liste[premier].nom, vus });
    await page.close();
  }

  // ============ Le pavé en profondeur sert vraiment ============
  {
    const { page } = await ouvrir(browser, port, 'CP');
    const bouton = await page.evaluate(() => {
      const tourner = (pieces, k) => pieces.map(p => {
        const cs = cellules(p).map(c => tourneCell(c, k));
        const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
        return {dx:Math.max(...xs)-Math.min(...xs)+1, dy:Math.max(...ys)-Math.min(...ys)+1};
      });
      const res = {};
      Object.entries(CONTENU.paliers).forEach(([nom, pal]) => {
        res[nom] = pal.miniJeux[0].assemblages.filter(a => {
          const paves = a.pieces.filter(p => p.type === 'pave');
          /* Le bouton n’est NÉCESSAIRE que si aucune rotation globale ne
             ramène tous les pavés à l’horizontale — la validation étant
             invariante par rotation, un pavé vertical seul ne prouve rien. */
          return paves.length > 0 && ![0,1,2,3].some(k => tourner(paves, k).every(p => p.dy === 1));
        }).map(a => a.nom);
      });
      return res;
    });
    ok(bouton.CP.length >= 1,
      'Le bouton « posé en profondeur » est indispensable à au moins un assemblage CP', bouton.CP);
    ok(bouton.CP.length + (bouton.CE1 || []).length >= 2,
      'Deux assemblages au moins portent deux pavés à angle droit', bouton);
    await page.close();
  }

  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
