const http = require('http'), fs = require('fs'), path = require('path');
const socle = require('./socle.js');
const { chromium } = socle.chargerPlaywright();

const RACINE = socle.RACINE;
const JEU = '/jeux/M38-reproduire-construire.html';
let ok = 0, ko = 0;
const T = (nom, cond, det) => { if (cond) { ok++; console.log('OK   ' + nom, det === undefined ? '' : det); }
  else { ko++; console.log('KO   ' + nom, det === undefined ? '' : det); } };

const srv = http.createServer((q, r) => {
  const p = path.join(RACINE, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
});

const JEUX = ['cp-reproduire','cp-completer','cp-assembler',
              'ce1-reproduire','ce1-completer','ce1-construire',
              'ce2-reproduire','ce2-construire-uni','ce2-rosace'];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const base = `http://localhost:${port}${JEU}`;
  const nav = await chromium.launch({ executablePath: socle.EXEC_CHROMIUM });
  const page = await nav.newPage({ viewport: { width: 390, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(`http://localhost:${port}`) && !u.startsWith('data:')) erreurs.push('réseau: ' + u); });

  const profil = async (niveau) => { await page.evaluate(n => {
      localStorage.setItem('mayeutik-profils', JSON.stringify([{id:'p1', prenom:'T', niveau:n}]));
      localStorage.setItem('mayeutik-profil-actif', 'p1');
    }, niveau); };

  await page.goto(base);
  await profil('CE2');
  await page.evaluate(() => { localStorage.setItem('mayeutik-sessions', '[]');
    localStorage.removeItem('mayeutik-m38-montage-etoiles'); localStorage.removeItem('mayeutik-m38-bonus-revele'); });

  /* ---------- 1. Autonomie et charte statique ---------- */
  const brut = fs.readFileSync(RACINE + JEU, 'utf8');
  T('aucune URL externe', !/(src|href)\s*=\s*["']https?:/i.test(brut));
  T('aucun fetch/XHR/import distant', !/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(brut));
  T('§7 modale de confirmation présente', /id="modale-menu"/.test(brut));
  T('§4 conteneur à confettis présent', /id="confettis-conteneur"/.test(brut));
  T('§19 touch-action pan-y universel', /\*\s*\{[^}]*touch-action:\s*pan-y/.test(brut.replace(/\n/g, ' ')));
  T('§19 posables en touch-action:none, enfants compris',
    /\.posable,\s*\.posable\s*\*\s*\{[^}]*touch-action:\s*none/.test(brut.replace(/\n/g, ' ')));
  T('typographie : aucune apostrophe droite dans un mot', !/[a-zà-ÿA-ZÀ-Ÿ]'[a-zà-ÿ]/.test(brut));
  /* Les commentaires expliquent justement pourquoi l’unité est virtuelle :
     seul le texte AFFICHÉ est contraint. */
  const affiche = brut.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  T('§3 aucune grandeur réelle affirmée dans un texte affiché',
    !/\d+\s*cm\b/.test(affiche), (affiche.match(/\d+\s*cm\b/g)||[]).slice(0,4));
  /* L'unite ne se fige pas dans le test : elle est definie UNE FOIS dans
     outils/moteur-compas.js, et M38 doit s'y conformer. Un nombre recopie ici
     transformerait chaque changement d'echelle en faux echec. */
  const uniteMoteur = (require('fs').readFileSync(RACINE + '/outils/moteur-compas.js', 'utf8')
    .match(/const UNITE = (\d+)/) || [])[1];
  /* Elle n'est plus RECOPIÉE depuis le moteur, elle en VIENT : le jeu porte
     desormais le moteur entre ses sentinelles, donc plus aucun nombre a tenir
     synchronise a la main. */
  T('l’unité vient du moteur, elle n’est pas redéclarée',
    /const PX_PAR_UNITE = MoteurCompas\.UNITE;/.test(brut), 'moteur ' + uniteMoteur);
  T('M38 porte bien le moteur de compas', /MOTEUR-COMPAS — copie de/.test(brut));

  /* ---------- 2. Les neuf mini-jeux se lancent ---------- */
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(220);
    const r = await page.evaluate(() => ({
      ecran: document.getElementById('game').hidden ? 'home' : 'game',
      n: file.length, total, titre: document.getElementById('hdrTitle').textContent,
      consigne: document.getElementById('qText').textContent.trim(),
      supports: file.map(q => q.support), modes: file.map(q => q.mode)
    }));
    T(`${id} : démarre sur l’écran de jeu`, r.ecran === 'game', r.titre);
    /* La rosace est une manche de SYNTHÈSE : une construction d'un seul
       tenant, pas une serie d'exercices. */
    /* Les deux mini-jeux de COMPLÉTION jouent six manches : leur file était la
       même à chaque partie, et six laisse la place aux compositions qui
       n’existaient pas à cinq. */
    const attendu = id === 'ce2-rosace' ? 1
      : ['ce1-construire','ce2-construire-uni'].includes(id) ? 3
      : ['cp-completer','ce1-completer'].includes(id) ? 6 : 5;
    T(`${id} : nombre de manches attendu`, r.n === attendu, `${r.n} manches (attendu ${attendu})`);
    T(`${id} : total = 1 point par manche (§11)`, r.total === r.n, r.total);
    T(`${id} : une consigne est posée`, r.consigne.length > 8, r.consigne.slice(0, 48));
  }

  /* ---------- 3. Progression des supports ---------- */
  const sup = {};
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(180);
    sup[id] = await page.evaluate(() => file.map(q => q.support));
  }
  T('CP : jamais de papier uni', !sup['cp-reproduire'].concat(sup['cp-completer'], sup['cp-assembler']).includes('uni'),
    JSON.stringify(sup['cp-completer']));
  T('CP : le papier pointé apparaît', sup['cp-reproduire'].includes('pointe') || sup['cp-assembler'].includes('pointe'));
  T('CE1 : le papier uni fait son entrée', sup['ce1-completer'].includes('uni'), JSON.stringify(sup['ce1-completer']));
  T('CE1 construire : uni partout', sup['ce1-construire'].every(s => s === 'uni'));
  T('CE2 construire : uni partout', sup['ce2-construire-uni'].every(s => s === 'uni'));

  /* ---------- 4. Le moteur : aimantation, pose, fermeture, retour arrière ----------
     Sur `ce2-reproduire`, resté au modèle de POSE : le CP et `ce1-reproduire`
     sont passés au tracé au doigt, et ces propriétés-là sont celles de la
     pose de sommets. */
  await page.goto(base + '?competence=ce2-reproduire');
  await page.waitForTimeout(220);
  const moteur = await page.evaluate(() => {
    pos = 0; manche();
    const z = chantier.z;
    const noeud = versScene(z, 3, 2);
    /* Un point posé n’importe où entre deux nœuds s’aimante au plus proche. */
    poserSommet([noeud[0] + 7, noeud[1] - 5]);
    const a = chantier.sommets[0].slice();
    poserSommet(versScene(z, 6, 2));
    poserSommet(versScene(z, 6, 5));
    const avantRetrait = chantier.sommets.length;
    /* Retoucher le DERNIER sommet le retire. */
    poserSommet(versScene(z, 6, 5));
    const apresRetrait = chantier.sommets.length;
    poserSommet(versScene(z, 6, 5));
    poserSommet(versScene(z, 3, 5));
    /* Retoucher le PREMIER ferme le contour. */
    poserSommet(a);
    return {aimante:a, noeud, avantRetrait, apresRetrait,
            contours:chantier.contours.length, restants:chantier.sommets.length,
            valideActif: !document.getElementById('btnValider').disabled};
  });
  T('aimantation au nœud le plus proche',
    Math.abs(moteur.aimante[0]-moteur.noeud[0]) < 0.01 && Math.abs(moteur.aimante[1]-moteur.noeud[1]) < 0.01,
    JSON.stringify(moteur.aimante) + ' vs ' + JSON.stringify(moteur.noeud));
  T('retoucher le dernier sommet le retire', moteur.avantRetrait === 3 && moteur.apresRetrait === 2);
  T('retoucher le premier sommet ferme le contour', moteur.contours === 1 && moteur.restants === 0);
  T('le bouton Vérifier s’active une fois la pièce fermée', moteur.valideActif);

  /* ---------- 5. Validation : invariance par translation, et par rien d’autre ---------- */
  const valid = await page.evaluate(() => {
    const sol = [[[0,0],[40,0],[40,40],[0,40]]];
    const dec = [[[100,60],[140,60],[140,100],[100,100]]];              // translaté
    const tourne = [[[0,0],[28,28],[0,56],[-28,28]]];                   // tourné de 45°
    const autreDepart = [[[40,0],[40,40],[0,40],[0,0]]];                // même carré, autre départ
    const inverse = [[[0,0],[0,40],[40,40],[40,0]]];                    // parcouru à l’envers
    const faux = [[[0,0],[40,0],[40,52],[0,52]]];                       // rectangle
    return {
      translate: figureAcceptee(dec, [sol], 2, true),
      translateInterdit: figureAcceptee(dec, [sol], 2, false),
      tourne: figureAcceptee(tourne, [sol], 2, true),
      autreDepart: figureAcceptee(autreDepart, [sol], 2, true),
      inverse: figureAcceptee(inverse, [sol], 2, true),
      faux: figureAcceptee(faux, [sol], 2, true)
    };
  });
  T('invariance par translation quand elle est permise', valid.translate);
  T('… et refusée quand la position est imposée', !valid.translateInterdit);
  T('AUCUNE invariance par rotation (côtés suivant le quadrillage)', !valid.tourne);
  T('invariance par sommet de départ', valid.autreDepart);
  T('invariance par sens de parcours', valid.inverse);
  T('un rectangle n’est pas accepté pour un carré', !valid.faux);

  /* ---------- 6. Le carré à un seul côté tracé : DEUX solutions ---------- */
  await page.goto(base + '?competence=cp-completer');
  await page.waitForTimeout(220);
  const deuxSol = await page.evaluate(() => {
    const i = file.findIndex(q => q.solutions.length === 2);
    if (i < 0) return null;
    pos = i; manche();
    const q = file[pos];
    const res = q.solutions.map(sol => {
      chantier = nouveauChantier(q);
      chantier.contours = [sol[0].slice()];
      return figureAcceptee(chantier.contours, q.solutions, chantier.tol, q.libre);
    });
    const dif = Math.hypot(q.solutions[0][0][2][0]-q.solutions[1][0][2][0],
                           q.solutions[0][0][2][1]-q.solutions[1][0][2][1]);
    return {res, dif, amorce:q.amorce[0].length, fixes:q.sommetsFixes.length};
  });
  T('cp-completer contient bien le carré à un côté tracé', deuxSol !== null);
  T('les DEUX carrés symétriques sont acceptés', deuxSol && deuxSol.res.every(Boolean), JSON.stringify(deuxSol && deuxSol.res));
  T('les deux solutions sont réellement distinctes', deuxSol && deuxSol.dif > 20, deuxSol && deuxSol.dif);
  T('l’amorce ne trace qu’un seul côté', deuxSol && deuxSol.amorce === 2 && deuxSol.fixes === 2);
  T('le feedback ne mentionne pas l’autre solution',
    !/deux réponses|autre solution|deux possibilités/i.test(brut));

  /* ---------- 7. Le rectangle à deux côtés consécutifs ---------- */
  const rectAmorce = await page.evaluate(() => {
    const i = file.findIndex(q => q.solutions.length === 1 && q.sommetsFixes && q.sommetsFixes.length === 3);
    if (i < 0) return null;
    const q = file[i];
    const c = q.solutions[0][0];
    const cotes = c.map((p, k) => Math.hypot(c[(k+1)%4][0]-p[0], c[(k+1)%4][1]-p[1]));
    return {fixes:q.sommetsFixes.length, libre:q.libre,
            rect: Math.abs(cotes[0]-cotes[2]) < .01 && Math.abs(cotes[1]-cotes[3]) < .01 && Math.abs(cotes[0]-cotes[1]) > 1};
  });
  T('deux côtés consécutifs sont tracés, un seul coin manque', rectAmorce && rectAmorce.fixes === 3);
  T('la complétion n’est PAS invariante par translation', rectAmorce && rectAmorce.libre === false);
  T('la figure attendue est bien un rectangle non carré', rectAmorce && rectAmorce.rect);

  /* ---------- 8. AUCUNE MANCHE N’EST INFAILLIBLE ---------- */
  /* Les trois manches au POCHOIR du CP l’étaient : la forme venait du carton,
     l’orientation était figée, et la position n’était pas jugée — une pièce
     déposée une maille à côté était validée. Rien dans la suite ne le disait,
     parce qu’aucun test ne demandait « existe-t-il une réponse REFUSÉE ? ».
     C’est cette question qu’on pose désormais, à chaque mini-jeu. */
  const infaillible = [];
  for (const c of ['cp-reproduire','cp-completer','cp-assembler','ce1-reproduire',
                   'ce1-completer','ce2-reproduire']) {
    await page.goto(base + '?competence=' + c);
    await page.waitForTimeout(220);
    const r = await page.evaluate(() => {
      const q = file[0];
      const sol = q.solutions[0];
      /* Une figure FAUSSE, obtenue en déplaçant UN sommet d’une maille : elle
         garde le bon nombre de sommets, donc rien ne la disqualifie d’avance. */
      const faux = sol.map((ct, i) => ct.map((p, j) =>
        (i === 0 && j === 0) ? [p[0] + MAILLE, p[1]] : p.slice()));
      const tol = q.support === 'uni' ? TOL_UNI * 100 : TOL_GRILLE;
      return {refuse: !figureAcceptee(faux, q.solutions, tol, q.libre),
              accepteLaBonne: figureAcceptee(sol.map(ct => ct.map(p => p.slice())),
                                             q.solutions, tol, q.libre)};
    });
    T('aucune manche infaillible — ' + c + ' : un sommet d’une maille à côté est REFUSÉ',
      r.refuse === true && r.accepteLaBonne === true, JSON.stringify(r));
    if (!r.refuse) infaillible.push(c);
  }
  /* Et le mode qui portait le défaut n’existe plus nulle part. */
  await page.goto(base + '?competence=cp-reproduire');
  await page.waitForTimeout(220);
  const cp = await page.evaluate(() => ({
    n: file.length,
    modes: [...new Set(file.map(q => q.mode))],
    supports: file.map(q => q.support)
  }));
  T('« La même pièce » : cinq manches où l’enfant TRACE la figure au doigt',
    cp.n === 5 && cp.modes.length === 1 && cp.modes[0] === 'tracer', JSON.stringify(cp.modes));
  T('la progression du support est conservée (quadrillé puis pointé)',
    cp.supports.join() === 'quadrille,quadrille,quadrille,pointe,pointe', cp.supports.join());


  /* ============================================================
     UNE PARTIE ENTIÈRE SE JOUE, PAS SEULEMENT LA PREMIÈRE MANCHE
     ------------------------------------------------------------
     Le trou de cette suite, et il était béant : TOUT y commençait par
     `pos = 0`. Or `#scene` est permanent et chaque manche y rebranchait ses
     écouteurs sans retirer les précédents ; un tap appelait `poserSommet`
     autant de fois qu’il y avait de manches jouées, et comme revenir sur le
     dernier sommet le RETIRE, le deuxième appel défaisait le premier. Dès la
     deuxième manche l’enfant tapait dans le vide. On joue donc désormais la
     partie jusqu’au bout, aux vrais taps, mini-jeu par mini-jeu.
     ============================================================ */
  {
    /* Le compte des écouteurs est MESURÉ, pas déduit d’un drapeau que le code
       pose lui-même : un drapeau dirait ce que le code croit, pas ce que le
       navigateur a enregistré. */
    await page.addInitScript(() => {
      window.__nEcouteurs = 0;
      const vise = (el, t) => el instanceof SVGElement && el.id === 'scene' && t === 'pointerup';
      const ajoute = EventTarget.prototype.addEventListener;
      const retire = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function(t, f, o){
        if (vise(this, t)) window.__nEcouteurs++;
        return ajoute.apply(this, arguments);
      };
      EventTarget.prototype.removeEventListener = function(t, f, o){
        if (vise(this, t)) window.__nEcouteurs--;
        return retire.apply(this, arguments);
      };
    });
    const jouable = ['cp-reproduire', 'cp-completer', 'cp-assembler',
                     'ce1-reproduire', 'ce1-completer', 'ce2-reproduire'];
    for (const comp of jouable) {
      await page.goto(base + '?competence=' + comp);
      await page.waitForTimeout(400);
      const total = await page.evaluate(() => file.length);
      const bilan = [];
      let ecouteursMax = 0;
      for (let m = 0; m < total; m++) {
        const info = await page.evaluate(() => ({
          mode: file[pos].mode, support: file[pos].support, index: pos,
          ecouteurs: window.__nEcouteurs
        }));
        ecouteursMax = Math.max(ecouteursMax, info.ecouteurs);
        if (info.mode === 'tracer') {
          /* On TRACE la solution au doigt, nœud à nœud, comme l’enfant :
             échantillonné assez fin pour ne manquer aucun passage. */
          const contours = await page.evaluate(() => {
            const t = chantier.trace;
            return file[pos].solutions[0].map(ct => ct.map(p => t.versGrille(p).map(Math.round)));
          });
          for (const ct of contours) {
            await page.evaluate(async (chemin) => {
              const t = chantier.trace, svg = document.getElementById('scene');
              const env = (type, g) => {
                const sc = t.versScene(g), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
                pt.x = sc[0]; pt.y = sc[1];
                const e = pt.matrixTransform(m);
                svg.dispatchEvent(new PointerEvent(type, {clientX:e.x, clientY:e.y, pointerId:1, bubbles:true}));
              };
              env('pointerdown', chemin[0]);
              for (let i = 0; i < chemin.length - 1; i++) {
                const a = chemin[i], b = chemin[i+1];
                const n = Math.max(1, Math.round(Math.max(Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1])) * 6));
                for (let k = 1; k <= n; k++)
                  env('pointermove', [a[0] + (b[0]-a[0])*k/n, a[1] + (b[1]-a[1])*k/n]);
              }
              env('pointerup', chemin[chemin.length - 1]);
            }, ct.concat([ct[0]]));
            await page.waitForTimeout(45);
          }
          const pret = await page.evaluate(() => !document.getElementById('btnValider').disabled);
          bilan.push(pret ? '✔' : '✘');
        }
        else if (info.mode !== 'poser' || info.support === 'uni') { bilan.push('—'); }
        else {
          /* Les contours attendus, tapés sommet par sommet puis refermés. */
          const cibles = await page.evaluate(() => {
            const sol = file[pos].solutions[0], deja = chantier.sommets.slice();
            return sol.map(ct => {
              const reste = ct.filter(p => !deja.some(x => Math.hypot(x[0]-p[0], x[1]-p[1]) < 1));
              const premier = deja.length ? deja[0] : ct[0];
              return {reste, fermeture: premier};
            });
          });
          for (const ct of cibles) {
            for (const p of ct.reste.concat([ct.fermeture])) {
              const e = await page.evaluate((pt) => {
                const svg = document.getElementById('scene'), r = svg.getBoundingClientRect();
                const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number), ech = r.width / vb[2];
                return {x:r.left + pt[0]*ech, y:r.top + pt[1]*ech};
              }, p);
              await page.mouse.move(e.x, e.y);
              await page.mouse.down(); await page.mouse.up();
              await page.waitForTimeout(35);
            }
          }
          const pret = await page.evaluate(() => !document.getElementById('btnValider').disabled);
          bilan.push(pret ? '✔' : '✘');
        }
        /* On avance comme l’enfant : on valide, puis « Suivant ». */
        await page.evaluate(() => {
          const v = document.getElementById('btnValider');
          if (!v.disabled && v.style.display !== 'none') v.click();
        });
        await page.waitForTimeout(1150);
        if (m < total - 1) {
          await page.evaluate(() => {
            desarmerAutoSuivant();
            const b = document.getElementById('btnNext');
            if (b && b.style.display !== 'none') b.click(); else { pos++; manche(); }
          });
          await page.waitForTimeout(260);
        }
      }
      const joue = bilan.filter(x => x !== '—');
      T('partie entière — ' + comp + ' : chaque manche répond au doigt, pas seulement la première',
        joue.length > 0 && joue.every(x => x === '✔'), bilan.join(' '));
      T('partie entière — ' + comp + ' : un seul jeu d’écouteurs sur la scène, du début à la fin',
        ecouteursMax === 1, ecouteursMax + ' écouteur(s) pointerup');
    }

    /* Le geste ne se transmet pas d’un mini-jeu à l’autre. Depuis le menu on
       peut enchaîner sans recharger la page : la rosace ouverte après un
       mini-jeu de pose hériterait de son tap, et un appui sur le panneau y
       poserait des sommets. */
    await page.goto(base + '?competence=ce2-reproduire');
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('btnBack').click());
    await page.waitForTimeout(250);
    const bascule = await page.evaluate(() => {
      const c = document.querySelector('[data-jeu="ce2-rosace"]');
      if (!c) return false;
      c.click(); return true;
    });
    await page.waitForTimeout(400);
    const fuite = bascule ? await page.evaluate(async () => {
      const svg = document.getElementById('scene'), r = svg.getBoundingClientRect();
      const avant = chantier.sommets.length;
      const x = r.left + r.width * 0.35, y = r.top + r.height * 0.35;
      ['pointerdown', 'pointerup'].forEach(t =>
        svg.dispatchEvent(new PointerEvent(t, {clientX:x, clientY:y, pointerId:1, bubbles:true})));
      await new Promise(res => setTimeout(res, 60));
      return {mode:file[pos].mode, avant, apres:chantier.sommets.length};
    }) : null;
    T('le geste d’un mini-jeu ne se transmet pas au suivant ouvert depuis le menu',
      !!fuite && fuite.mode === 'rosace' && fuite.apres === fuite.avant,
      fuite ? JSON.stringify(fuite) : 'carte rosace introuvable');
  }


  /* ---------- La banque du CP est TRAÇABLE AU GLISSEMENT ----------
     Se contrôle sur la BANQUE et non sur une partie : elle compte six
     figures pour cinq manches, si bien qu’une figure fautive échappe à une
     partie sur six. Une mutation qui remettait la pente 2/1 est passée
     inaperçue exactement pour cette raison. */
  await page.goto(base + '?competence=cp-reproduire');
  await page.waitForTimeout(300);
  const pentes = await page.evaluate(() => {
    const pgcd = (a, b) => b ? pgcd(b, a % b) : a;
    const examiner = (nom, contours) => {
      const mauvais = [];
      contours.forEach(ct => {
        for (let k = 0; k < ct.length; k++) {
          const a = ct[k], b = ct[(k + 1) % ct.length];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const g = pgcd(Math.abs(dx), Math.abs(dy)) || 1;
          if (Math.abs(dx / g) > 1 || Math.abs(dy / g) > 1) mauvais.push(nom + ' ' + dx + '/' + dy);
        }
      });
      return mauvais;
    };
    let fautifs = [];
    FIGURES_CP.forEach((f, i) => { fautifs = fautifs.concat(examiner('figure ' + i, [f()])); });
    MODELES_ASSEMBLAGE.forEach((f, i) => { fautifs = fautifs.concat(examiner('assemblage ' + i, f())); });
    return {n:FIGURES_CP.length, nA:MODELES_ASSEMBLAGE.length, fautifs};
  });
  T('CP — chaque côté des DEUX banques relie deux nœuds VOISINS : le glissement suffit',
    pentes.fautifs.length === 0,
    pentes.fautifs.join(', ') || (pentes.n + ' figures + ' + pentes.nA + ' assemblages'));
  T('CP — les deux banques restent plus grandes que leur file (§13 bis)',
    pentes.n > 5 && pentes.nA > 5, pentes.n + ' / ' + pentes.nA);


  /* ---------- L’écran de résultat ne promet pas un objet non monté ----------
     « Vitrail terminé » et « Beau panneau » désignaient l’ASSEMBLAGE, que
     l’enfant n’a pas monté : il a produit des PIÈCES, une par manche. */
  await page.goto(base + '?competence=cp-reproduire');
  await page.waitForTimeout(250);
  const resultats = await page.evaluate(() => {
    const out = [];
    for (let sc = 0; sc <= 5; sc++) {
      score = sc; total = 5; fin();
      out.push({sc, etoiles:document.getElementById('endStars').textContent.length,
        msg:document.getElementById('endMsg').textContent,
        compte:document.getElementById('endScore').textContent});
    }
    return out;
  });
  T('résultat — aucun message ne déclare le vitrail ou le panneau terminé',
    resultats.every(r => !/vitrail\s+termin|panneau\s*!/i.test(r.msg)),
    resultats.map(r => r.msg).filter((v, i, a) => a.indexOf(v) === i).join(' | '));
  T('résultat — le compte parle des PIÈCES du vitrail',
    resultats.every(r => /pièces? du vitrail terminées? sur \d+\./.test(r.compte)),
    resultats[5].compte);
  /* Accord calculé, pas figé : la faute n’apparaît qu’à une valeur. */
  T('résultat — l’accord suit le nombre au singulier comme au pluriel',
    resultats[0].compte.startsWith('0 pièce du vitrail terminée sur')
    && resultats[1].compte.startsWith('1 pièce du vitrail terminée sur')
    && resultats[2].compte.startsWith('2 pièces du vitrail terminées sur'),
    resultats.slice(0, 3).map(r => r.compte).join(' / '));
  T('résultat — les trois étoiles restent trois étoiles',
    resultats[5].etoiles === 3 && resultats[0].etoiles === 1, resultats.map(r => r.etoiles).join());


  /* Le geste est le MÊME dans les trois mini-jeux du CP : c’est ce qui rend
     le palier cohérent, et ce qu’un modèle à pente casserait en silence. */
  const gestesCP = {};
  for (const c of ['cp-reproduire', 'cp-completer', 'cp-assembler']) {
    await page.goto(base + '?competence=' + c);
    await page.waitForTimeout(250);
    gestesCP[c] = await page.evaluate(() => [...new Set(file.map(q => q.mode))]);
  }
  T('CP — les trois mini-jeux se jouent du même geste, le tracé au doigt',
    Object.values(gestesCP).every(m => m.length === 1 && m[0] === 'tracer'),
    JSON.stringify(gestesCP));


  /* ---------- LA MÊME PARTIE NE SE REJOUE PAS ----------
     Signalé au test : « j’ai eu plusieurs fois la même série ». Mesuré, les
     deux mini-jeux de complétion ne produisaient QU’UNE SEULE série sur 300
     parties. Rien ne le voyait : le §13 bis ne regarde que les répétitions à
     l’INTÉRIEUR d’une partie, jamais la ressemblance d’une partie à l’autre.

     Le contrôle porte sur une ATTENTE NOMMÉE par mini-jeu plutôt que sur un
     seuil unique, parce qu’une seule série n’est pas toujours un défaut : la
     file de `ce1-reproduire` EST la progression des pentes, écrite et voulue.
     Ce qui doit être impossible, c’est qu’une file se fige sans que personne
     l’ait décidé — et toute dérive de ces nombres oblige à trancher. */
  await page.goto(base);
  await page.waitForTimeout(300);
  const ATTENDU = {
    'cp-reproduire':{series:80, figures:6, pourquoi:'six figures pour cinq manches, tirées sans remise'},
    'cp-completer':{series:80, figures:16, pourquoi:'dix-sept formats de rectangle et quatre côtés de carré'},
    'cp-assembler':{series:80, figures:6, pourquoi:'six assemblages pour cinq manches'},
    'ce1-reproduire':{series:1, figures:5, pourquoi:'UNE SEULE SÉRIE VOULUE : la file est la progression des pentes'},
    'ce1-completer':{series:80, figures:16, pourquoi:'l’ordre est écrit, mais les figures se tirent sans remise'},
    'ce2-reproduire':{series:80, figures:6, pourquoi:'six figures pour cinq manches'}
  };
  const varietes = await page.evaluate(() => {
    const out = {};
    const gens = {'cp-reproduire':qCpReproduire, 'cp-completer':qCpCompleter,
                  'cp-assembler':qCpAssembler, 'ce1-reproduire':qCe1Reproduire,
                  'ce1-completer':qCe1Completer, 'ce2-reproduire':qCe2Reproduire};
    for (const [nom, gen] of Object.entries(gens)) {
      const parties = {}, figures = new Set();
      for (let n = 0; n < 200; n++) {
        const l = gen();
        /* Une PARTIE, c’est la suite des figures montrées : c’est elle que
           l’enfant reconnaît d’une fois sur l’autre. */
        const cle = l.map(q => signatureFigure(q.solutions[0])).join(' ~ ');
        parties[cle] = (parties[cle] || 0) + 1;
        l.forEach(q => figures.add(signatureFigure(q.solutions[0])));
      }
      out[nom] = {series:Object.keys(parties).length, figures:figures.size};
    }
    return out;
  });
  Object.entries(ATTENDU).forEach(([nom, att]) => {
    const v = varietes[nom];
    T('variété — ' + nom + ' : autant de parties distinctes qu’annoncé (' + att.pourquoi.slice(0, 44) + ')',
      v.series >= att.series, v.series + ' séries sur 200, attendu ≥ ' + att.series);
    T('variété — ' + nom + ' : autant de figures distinctes qu’annoncé',
      v.figures >= att.figures, v.figures + ' figures, attendu ≥ ' + att.figures);
  });

  /* LE RYTHME DES CONSIGNES DOIT VARIER LUI AUSSI. La suite des FIGURES ne
     suffit pas à le dire : avec trois rectangles et trois carrés, un
     réordonnancement sur le TEXTE de la consigne impose l’alternance stricte,
     et les figures varieraient pourtant. C’est ce rythme figé qui se
     reconnaît d’une partie à l’autre — une mutation l’a montré invisible
     autrement. */
  const rythmes = await page.evaluate(() => {
    const vus = {};
    for (let n = 0; n < 200; n++) {
      const cle = qCpCompleter().map(q => q.q).join('|');
      vus[cle] = (vus[cle] || 0) + 1;
    }
    return Object.keys(vus).length;
  });
  T('variété — cp-completer : le rythme des consignes varie, pas seulement les figures',
    rythmes >= 6, rythmes + ' rythmes distincts sur 200 parties');

  /* LA FIGURE SUR PAPIER UNI NE SE POSE PLUS TOUJOURS AU MÊME ENDROIT. La
     position n’est pas une dimension de contenu (§13 bis l’exclut), donc rien
     ne la surveillait — mais une figure clouée au même pixel à chaque partie
     se reconnaît autant qu’une figure répétée. */
  const places = await page.evaluate(() => {
    const vus = new Set();
    for (let n = 0; n < 120; n++)
      qCe1Completer().filter(q => q.support === 'uni')
        .forEach(q => { const c = q.solutions[0][0][0];
                        vus.add(Math.round(c[0]) + ',' + Math.round(c[1])); });
    return vus.size;
  });
  T('variété — ce1-completer : le rectangle sur papier uni n’est pas cloué au même endroit',
    places >= 20, places + ' positions distinctes sur 240 manches');


  /* ---------- LE VOCABULAIRE, LES TITRES, ET CE QUE L’ÉNONCÉ DEMANDE ----------
     Des décisions PRODUIT que rien ne surveillait : deux mutations sont
     restées aveugles en les défaisant. Un mot hors programme peut revenir par
     une manche ajoutée six mois plus tard, et personne ne le verrait. */
  await page.goto(base);
  await page.waitForTimeout(300);
  const dits = await page.evaluate(() => {
    /* HORS PROGRAMME AU CYCLE 2 : nommer ce qu’on ne sait pas nommer ne fait
       pas apprendre. On dit « le grand côté opposé à l’angle droit ». */
    const interdits = ['hypoténuse', 'hypothénuse'];
    const gens = {'cp-reproduire':qCpReproduire, 'cp-completer':qCpCompleter,
                  'cp-assembler':qCpAssembler, 'ce1-reproduire':qCe1Reproduire,
                  'ce1-completer':qCe1Completer, 'ce1-construire':qCe1Construire,
                  'ce2-reproduire':qCe2Reproduire, 'ce2-construire-uni':qCe2ConstruireUni,
                  'ce2-rosace':qCe2Rosace};
    const fautes = [], uniCE1 = [];
    for (const [nom, gen] of Object.entries(gens))
      for (let n = 0; n < 30; n++)
        gen().forEach(q => {
          const dit = [q.q, q.sous, q.enonce].filter(Boolean).join(' ');
          interdits.forEach(m => { if (dit.toLowerCase().indexOf(m) >= 0) fautes.push(nom + ' : ' + m); });
          if (nom === 'ce1-completer' && q.support === 'uni')
            uniCE1.push({q:q.q, sous:q.sous,
                         manque:q.solutions[0][0].length - (q.sommetsFixes || []).length});
        });
    const surEcran = [...document.querySelectorAll('#grille-jeux .card')].map(c => c.textContent.toLowerCase());
    interdits.forEach(m => surEcran.forEach(t => { if (t.indexOf(m) >= 0) fautes.push('accueil : ' + m); }));
    return {fautes:[...new Set(fautes)], uniCE1};
  });
  T('vocabulaire — le mot « hypoténuse », hors programme au cycle 2, ne paraît dans aucun énoncé',
    dits.fautes.length === 0, dits.fautes.join(' | ') || 'neuf mini-jeux, trente files chacun');

  /* L’ÉNONCÉ DU PAPIER UNI, là où les repères disparaissent : il nomme ce
     qu’il faut FAIRE — placer les sommets — et renvoie aux INSTRUMENTS, seuls
     moyens d’être exact quand le support ne donne plus rien. */
  T('énoncé — sur papier uni, la consigne demande de placer les sommets manquants',
    dits.uniCE1.length > 0
    && dits.uniCE1.every(m => /pla[çc]ant le sommet manquant|pla[çc]ant les \d+ sommets manquants/.test(m.q)),
    (dits.uniCE1[0] || {}).q);
  T('énoncé — et elle renvoie à la règle ET à l’équerre',
    dits.uniCE1.every(m => /règle/.test(m.sous) && /équerre/.test(m.sous)),
    (dits.uniCE1[0] || {}).sous);
  /* L’ACCORD EST CALCULÉ SUR LA DONNÉE, jamais figé (règle de langue du
     dépôt) : « le ou les sommets manquants » esquive la question au lieu de
     la résoudre. Il en manque un aujourd’hui, l’énoncé le dit au singulier ;
     s’il en manquait deux demain, il le dirait au pluriel. */
  T('énoncé — l’accord suit le nombre de sommets réellement manquants',
    dits.uniCE1.every(m => (m.manque === 1) === /le sommet manquant/.test(m.q)),
    'manquants : ' + [...new Set(dits.uniCE1.map(m => m.manque))].join());

  const titres = await page.evaluate(() => {
    const t = {};
    Object.values(CONTENU.paliers).forEach(p =>
      (p.miniJeux || []).forEach(m => { t[m.id] = m.titre; }));
    return t;
  });
  T('titres — les deux mini-jeux de complétion portent le MÊME nom : c’est la même compétence à deux niveaux',
    titres['cp-completer'] === titres['ce1-completer'],
    titres['cp-completer'] + ' / ' + titres['ce1-completer']);
  T('titres — et ce nom est au pluriel : une partie en montre plusieurs',
    /^Les pièces inachevées$/.test(titres['cp-completer'] || ''), titres['cp-completer']);

  /* ---------- 9. Papier uni : l’instrument rend la précision atteignable ---------- */
  await page.goto(base + '?competence=ce2-construire-uni');
  await page.waitForTimeout(220);
  const uni = await page.evaluate(async () => {
    pos = 0; manche();
    await new Promise(r => setTimeout(r, 60));
    const q = file[pos];
    const tolAvant = chantier.tol;
    const ref = longueurReference(q);
    document.querySelector('#barreOutils .outil').click();      // la règle graduée
    await new Promise(r => setTimeout(r, 40));
    const anc = ancresCourantes();
    /* Un point posé à 6 px d’une graduation doit s’y accrocher exactement. */
    const a0 = anc[3];
    poserSommet([a0[0] + 6, a0[1] + 5]);
    const pose = chantier.sommets[0];
    return {tol:tolAvant, ref, nbAncres:anc.length, unite:PX_PAR_UNITE,
            colle: Math.hypot(pose[0]-a0[0], pose[1]-a0[1]) < 0.01};
  });
  /* 6 % de la longueur de référence, PLAFONNÉS à 0,4 unité. Les 3 % d’avant
     jugeaient la plus petite figure à moins de 4 px sous le doigt ; le
     plafond, lui, garde la tolérance sous la demi-unité, sans quoi un côté
     de 10 et un côté de 11 deviendraient le même. */
  T('tolérance uni = 6 % de la longueur de référence, plafonnés à 0,4 unité',
    Math.abs(uni.tol - Math.min(0.06 * uni.ref, 0.4 * uni.unite)) < 1e-9,
    `${uni.tol.toFixed(2)} px pour une référence de ${uni.ref.toFixed(0)}`);
  T('la règle graduée publie ses graduations comme ancres', uni.nbAncres >= 13, uni.nbAncres);
  T('un point posé près d’une graduation s’y accroche exactement', uni.colle);

  /* ---------- 10. Le mode croquis du CE2 ---------- */
  await page.goto(base + '?competence=ce2-reproduire');
  await page.waitForTimeout(220);
  const esq = await page.evaluate(async () => {
    const boutons = [...document.querySelectorAll('#barreOutils .outil-mode')];
    const ref = longueurReference(file[pos]);
    boutons[0].click();
    const tolEsquisse = chantier.tol;
    boutons[1].click();
    const tolRegle = chantier.tol;
    return {n:boutons.length, tolEsquisse, tolRegle, ref, libelles:boutons.map(b => b.textContent)};
  });
  T('deux modes proposés au CE2', esq.n === 2, JSON.stringify(esq.libelles));
  T('le croquis tolère 12 %', Math.abs(esq.tolEsquisse - 0.12 * esq.ref) < 1e-9, esq.tolEsquisse.toFixed(1));
  T('le tracé exact reste au serré', esq.tolRegle <= 2.001, esq.tolRegle);
  T('les deux modes valent le même nombre de points', /PTS_MANCHE = 1/.test(brut) && !/_mode.*PTS/.test(brut));

  /* ---------- 11. Le compas : deux gestes, un par palier ---------- */
  const compas = {};
  for (const id of ['ce1-construire','ce2-construire-uni','ce2-rosace']) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(180);
    compas[id] = await page.evaluate(() => file.map(q => q.compas || null));
  }
  T('CE1 : le compas passe PAR un point donné', compas['ce1-construire'].filter(Boolean).every(c => c === 'passant'),
    JSON.stringify(compas['ce1-construire']));
  T('CE2 : le rayon se règle d’abord', compas['ce2-construire-uni'].filter(Boolean).every(c => c === 'rayon'),
    JSON.stringify(compas['ce2-construire-uni']));
  /* La rosace n'utilise plus l'abstraction `compas` du module : elle pilote
     le vrai moteur, comme M35. */
  T('la rosace n’utilise plus le compas simulé du module',
    compas['ce2-rosace'].every(c => c === null), JSON.stringify(compas['ce2-rosace']));

  /* ---------- 12. Les trois exemples officiels du CE2 ---------- */
  await page.goto(base + '?competence=ce2-construire-uni');
  await page.waitForTimeout(200);
  const officiels = await page.evaluate(() => {
    const U = PX_PAR_UNITE;
    const mesure = (c) => c.map((p, i) => Math.round(Math.hypot(c[(i+1)%c.length][0]-p[0], c[(i+1)%c.length][1]-p[1]) / U));
    return file.map(q => ({
      q:q.q, cotes:mesure(q.solutions[0][0]),
      rayon:q.cercles ? Math.round(q.cercles[0].r / U) : null,
      centreSurSommet: q.cercles ? q.cercles.every(ce => q.solutions[0][0].some(s => s[0] === ce.c[0] && s[1] === ce.c[1])) : null
    }));
  });
  const parQ = (re) => officiels.find(o => re.test(o.q));
  const r7 = parQ(/rectangle de longueur 7/);
  T('exemple 1 : rectangle 7 × 3', r7 && JSON.stringify(r7.cotes) === '[7,3,7,3]', r7 && JSON.stringify(r7.cotes));
  const c6 = parQ(/carré de côté 6/);
  T('exemple 2 : carré de côté 6', c6 && c6.cotes.every(x => x === 6), c6 && JSON.stringify(c6.cotes));
  T('exemple 2 : cercle de rayon 4 centré sur un sommet', c6 && c6.rayon === 4 && c6.centreSurSommet, c6 && c6.rayon);
  const t10 = parQ(/10 et 4/);
  T('exemple 3 : triangle rectangle de côtés 10 et 4',
    t10 && t10.cotes.includes(10) && t10.cotes.includes(4), t10 && JSON.stringify(t10.cotes));

  /* ---------- 13. Le sommet de l’angle droit est UNIQUE ---------- */
  await page.goto(base + '?competence=ce1-completer');
  await page.waitForTimeout(200);
  const unique = await page.evaluate(() => {
    let faux = 0, oublies = 0, vus = 0, nb = [];
    for (let n = 0; n < 60; n++) {
      const f = qCe1Completer();
      const q = f.find(x => x.instruments && x.instruments.includes('equerre') && x.solutions[0][0].length === 3);
      if (!q) continue;
      vus++; nb.push(q.solutions.length);
      const a = q.solutions[0][0][0], b = q.solutions[0][0][1];
      /* Chaque solution annoncée porte VRAIMENT un angle droit… */
      q.solutions.forEach(sol => {
        const c = sol[0][2];
        const u = [a[0]-c[0], a[1]-c[1]], v = [b[0]-c[0], b[1]-c[1]];
        if (Math.abs(u[0]*v[0] + u[1]*v[1]) > 1e-6) faux++;
      });
      /* … et aucun nœud correct n’est refusé. */
      const tous = sommetsAngleDroit(ZONE_PLEINE, a, b);
      if (tous.length !== q.solutions.length) oublies++;
    }
    return {vus, faux, oublies, min:Math.min(...nb), max:Math.max(...nb)};
  });
  T('chaque solution annoncée porte vraiment un angle droit',
    unique.faux === 0 && unique.vus > 20, `${unique.vus} tirages, ${unique.faux} faux`);
  T('aucun nœud correct n’est refusé', unique.oublies === 0, unique.oublies);
  T('deux ou trois solutions par item, jamais une loterie',
    unique.min >= 2 && unique.max <= 3, `${unique.min}–${unique.max}`);

  /* ---------- 14. Les obliques du CE1, du plus doux au plus raide ---------- */
  await page.goto(base + '?competence=ce1-reproduire');
  await page.waitForTimeout(200);
  const obl = await page.evaluate(() => {
    const pente = (c) => {
      const v = [c[1][0]-c[0][0], c[1][1]-c[0][1]];
      return Math.abs(Math.abs(v[0]) - Math.abs(v[1])) < .01 ? 1 : Math.max(Math.abs(v[0]), Math.abs(v[1])) / Math.min(Math.abs(v[0]), Math.abs(v[1]));
    };
    return file.map(q => +pente(q.solutions[0][0]).toFixed(2));
  });
  T('ce1-reproduire commence à 45°', obl[0] === 1 && obl[1] === 1, JSON.stringify(obl));
  T('… puis durcit les pentes', obl[obl.length-1] > obl[0], JSON.stringify(obl));

  /* ---------- 15. §15 verrouillage des paliers ---------- */
  await profil('CP');
  await page.goto(base);
  await page.waitForTimeout(160);
  let puces = await page.evaluate(() => [...document.querySelectorAll('.puce-palier')]
    .map(b => ({t:b.textContent, v:b.classList.contains('verrouille'), d:b.disabled})));
  T('§15 profil CP : CE1 et CE2 verrouillés',
    puces.length === 3 && !puces[0].v && puces[1].v && puces[2].v, JSON.stringify(puces));
  T('§15 le cadenas est visible', puces[1].t.includes('🔒'));
  await page.evaluate(() => {
    const s = ['cp-reproduire','cp-completer','cp-assembler'].map(c => ({profilId:'p1', module:'M38', competence:c,
      score:5, total:5, date:new Date().toISOString(), duree:60}));
    localStorage.setItem('mayeutik-sessions', JSON.stringify(s));
  });
  await page.goto(base);
  await page.waitForTimeout(160);
  T('§15 paquet cadeau après maîtrise du CP',
    await page.evaluate(() => !document.getElementById('bloc-bonus').hidden && !document.getElementById('paquet-cadeau').hidden));
  await page.click('#paquet-cadeau');
  await page.waitForTimeout(620);
  T('§15 le paquet dévoile les mini-jeux CE1',
    await page.evaluate(() => document.querySelectorAll('#grille-bonus .card').length === 3));
  await profil('CE2');
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));

  /* ---------- 16. §16 deep-link palier ---------- */
  await page.goto(base + '?palier=CE1');
  await page.waitForTimeout(160);
  T('§16 ?palier=CE1 ouvre le bon onglet',
    await page.evaluate(() => etatPalierAffiche === 'CE1' && document.querySelectorAll('#grille-jeux .card').length === 3));

  /* ---------- 17. Parties complètes : §11, étoiles, vitrail cumulatif ---------- */
  await page.evaluate(() => localStorage.setItem('mayeutik-sessions', '[]'));
  for (const id of JEUX) {
    await page.goto(base + '?competence=' + id);
    await page.waitForTimeout(200);
    const fini = await page.evaluate(async () => {
      for (let garde = 0; garde < 20; garde++) {
        if (!document.getElementById('end').hidden) break;
        desarmerAutoSuivant();
        const q = file[pos];
        /* On produit la bonne réponse en remplissant le chantier depuis la
           solution : le test vise la validation, pas le doigt — le doigt est
           éprouvé pour de vrai par « partie entière ». En mode TRACÉ, c’est
           l’ensemble des SEGMENTS qui fait foi, pas les contours : les poser
           directement serait mentir au validateur. */
        if (q.mode === 'tracer' && chantier.trace) {
          segmentsDeSolution(q.solutions[0], chantier.z)
            .forEach(k => { if (!chantier.trace.pre.has(k)) chantier.trace.traces.add(k); });
          chantier.contours = chantier.trace.faces()
            .map(f => simplifierPoly(f.poly).map(g => chantier.trace.versScene(g)));
        }
        else if (q.solutions.length) chantier.contours = q.solutions[0].map(c => c.slice());
        if (q.cercles) chantier.cerclesPoses = [{c:q.cercles[0].c.slice(),
          r:q.cercles[0].rLibre ? (q.cercles[0].rMin + q.cercles[0].rMax)/2 : q.cercles[0].r}];
        validerManche(q);
        await new Promise(r => setTimeout(r, 40));
        desarmerAutoSuivant();
        if (!document.getElementById('end').hidden) break;
        document.getElementById('btnNext').click();
        await new Promise(r => setTimeout(r, 40));
      }
      const s = JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]');
      return {fin: !document.getElementById('end').hidden, derniere: s[s.length-1],
              etoiles: document.getElementById('endStars').textContent,
              vitrail: vitrail.length,
              panneau: document.getElementById('endVitrailSvg').innerHTML.length};
    });
    T(`${id} : la partie va jusqu’à l’écran de fin`, fini.fin);
    const d = fini.derniere || {};
    const contrat = ['profilId','module','competence','score','total','date','duree'];
    T(`${id} : session §11 complète`, contrat.every(k => k in d) && d.module === 'M38' && d.competence === id,
      JSON.stringify(d));
    T(`${id} : score et total entiers`, Number.isInteger(d.score) && Number.isInteger(d.total), `${d.score}/${d.total}`);
    T(`${id} : sans faute ⇒ score plein et 3 étoiles`, d.score === d.total && fini.etoiles.includes('⭐⭐⭐'),
      `${d.score}/${d.total} ${fini.etoiles}`);
    T(`${id} : le vitrail a accumulé une pièce par manche`, fini.vitrail === d.total, fini.vitrail);
    T(`${id} : le panneau final est dessiné`, fini.panneau > 100, fini.panneau);
  }

  /* ---------- 18. §18 : révélation différée, et pas d’essai-erreur ---------- */
  await page.goto(base + '?competence=ce2-reproduire');
  await page.waitForTimeout(220);
  const corr = await page.evaluate(async () => {
    pos = 0; manche();
    await new Promise(r => setTimeout(r, 60));
    const q = file[pos], z = chantier.z;
    /* Une figure volontairement fausse. */
    chantier.contours = [[versScene(z,1,1), versScene(z,4,1), versScene(z,4,5), versScene(z,1,5)]];
    validerManche(q);
    const avant = document.getElementById('correction').innerHTML.length;
    await new Promise(r => setTimeout(r, 1100));
    desarmerAutoSuivant();
    const apres = document.getElementById('correction').innerHTML;
    /* On tente de « corriger » après validation : cela doit être sans effet. */
    const nb = chantier.contours.length;
    poserSommet(versScene(z, 2, 2));
    return {avant, apres:apres.length, vert:/class="attendu"/.test(apres),
            rouge:/corail/.test(apres), sommetsApres:chantier.sommets.length, nb,
            fb:document.getElementById('feedback').textContent};
  });
  T('§18 la correction n’apparaît qu’après ~900 ms', corr.avant === 0 && corr.apres > 50, `${corr.avant} → ${corr.apres}`);
  T('§18 la figure attendue est montrée en vert', corr.vert);
  T('§18 le rouge ne désigne pas la bonne réponse', !corr.rouge);
  T('§18 pas d’essai-erreur sur place après validation', corr.sommetsApres === 0);
  T('§18 le message d’erreur ne se substitue pas à la solution', /Presque/.test(corr.fb), corr.fb.slice(0, 60));

  /* ---------- 19. Pose contre défilement (§19, point le plus exposé) ---------- */
  await page.goto(base + '?competence=ce2-reproduire');
  await page.waitForTimeout(240);
  await page.evaluate(() => { pos = 0; manche(); });
  await page.waitForTimeout(160);
  const boite = await page.evaluate(() => {
    const r = document.getElementById('scene').getBoundingClientRect();
    return {x:r.x + r.width/2, y:r.y + r.height*0.72};
  });
  await page.mouse.move(boite.x, boite.y);
  await page.mouse.down();
  await page.mouse.up();
  const apresTap = await page.evaluate(() => chantier.sommets.length);
  T('un tap franc pose un sommet', apresTap === 1, apresTap);
  await page.mouse.move(boite.x - 40, boite.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(boite.x - 40, boite.y - i*9);
  await page.mouse.up();
  const apresGlisse = await page.evaluate(() => chantier.sommets.length);
  T('un geste qui glisse ne pose RIEN (c’est un défilement)', apresGlisse === 1, apresGlisse);

  /* ---------- 20. Assemblages : sommets partagés ---------- */
  await page.goto(base + '?competence=cp-assembler');
  await page.waitForTimeout(200);
  const assemb = await page.evaluate(() => {
    return file.map(q => {
      const cs = q.solutions[0];
      let partages = 0;
      for (let i = 0; i < cs.length; i++) for (let j = i+1; j < cs.length; j++)
        cs[i].forEach(p => { if (cs[j].some(x => Math.hypot(x[0]-p[0], x[1]-p[1]) < .01)) partages++; });
      return {n:cs.length, partages};
    });
  });
  T('chaque assemblage compte 2 ou 3 pièces', assemb.every(a => a.n >= 2 && a.n <= 3), JSON.stringify(assemb.map(a=>a.n)));
  T('les pièces d’un assemblage partagent un CÔTÉ (deux sommets au moins)',
    assemb.every(a => a.partages >= 2), JSON.stringify(assemb.map(a=>a.partages)));

  /* ---------- 21. La rosace, construite au compas ----------
     Elle ne se pose plus en trois etapes guidees : elle se CONSTRUIT, et le
     nombre six ne s'y annonce nulle part — c'est le fait a decouvrir. Le
     detail de la construction est couvert par test_rosace.js ; ici on verifie
     ce qui releve du module. */
  await page.goto(base + '?competence=ce2-rosace');
  await page.waitForTimeout(220);
  const ros = await page.evaluate(() => ({
    manches: file.length,
    mode: file[0].mode,
    textes: [file[0].q, file[0].enonce, file[0].sous].join(' | '),
    sansNombre: file.every(q => q.nbPointsAttendu === undefined),
    /* la geometrie de reference reste celle de M34 : le rayon se reporte six
       fois, et les six centres forment un hexagone regulier */
    hexagoneVerifie: typeof hexagoneRegulier === 'function',
    rMax: rayonMaxRosace(),
    zone: {l:ZONE_PLEINE.l, h:ZONE_PLEINE.h}
  }));
  T('la rosace est une manche de synthèse, construite d’un seul tenant',
    ros.manches === 1 && ros.mode === 'rosace', ros.manches + ' manche(s), mode ' + ros.mode);
  T('le nombre six n’est écrit nulle part : il se découvre',
    !/\b(six|6)\b/i.test(ros.textes) && ros.sansNombre, ros.textes.slice(0, 70));
  T('la figure est RELUE, pas déduite du nombre de clics', ros.hexagoneVerifie);
  T('le rayon est borné pour que la rosace entière tienne dans le panneau',
    2 * ros.rMax <= Math.min(ros.zone.l, ros.zone.h), '2r = ' + 2*ros.rMax
    + ' pour ' + Math.min(ros.zone.l, ros.zone.h));

  /* ---------- 22. §7 retour au menu ---------- */
  await page.goto(base);
  await page.waitForTimeout(160);
  await page.evaluate(() => document.getElementById('bouton-menu').click());
  await page.waitForTimeout(120);
  T('§7 le retour au shell demande confirmation',
    await page.evaluate(() => !document.getElementById('modale-menu').hidden));
  await page.click('#modale-menu-rester');
  await page.waitForTimeout(120);
  T('§7 « Rester » referme la modale sans quitter',
    await page.evaluate(() => document.getElementById('modale-menu').hidden && !document.getElementById('home').hidden));
  const MODULE = 'M38';
  const DECLARES = null;

  /* ---------- §13 bis : les tirages, mesurés À L’ÉCHELLE DE LA FILE ----------
     Le validateur d’items relit chaque manche PRISE ISOLÉMENT ; une file de
     manches toutes justes peut être répétitive, et c’est exactement pour cela
     qu’il n’a jamais rien vu. Les dimensions contrôlées sont DÉCLARÉES PAR LE
     MODULE : la suite ne tient pas sa propre liste, qui dériverait au premier
     mini-jeu ajouté. */
  await page.goto(base);
  await page.waitForTimeout(250);
  const tirages = await page.evaluate((MODULE) => {
    const N = 200, res = [], modesVus = new Set();
    const files = [];
    Object.values(CONTENU.paliers).forEach(pal => pal.miniJeux.forEach(cfg => {
      files.push({cfg, pal, cle: MODULE === 'M38' ? cfg.id : null});
    }));
    files.forEach(({cfg, pal}) => {
      const engendrer = () => MODULE === 'M38' ? cfg.gen() : engendrerFile(cfg);
      const dims = MODULE === 'M38' ? DIMENSIONS_CONTENU[cfg.id] : null;
      if (MODULE !== 'M38') engendrer().forEach(q => modesVus.add(q.mode));
      const listes = MODULE === 'M38' ? (dims ? [[cfg.id, dims]] : [])
        : Object.entries(DIMENSIONS_CONTENU)
            .filter(([mode]) => engendrer().some(q => q.mode === mode))
            .map(([mode, d]) => [mode, d]);
      if (!listes.length) { res.push({id:cfg.id, aucune:true}); return; }
      listes.forEach(([cle, liste]) => liste.forEach(dim => {
        const valeurs = new Set();
        let suite = 0, longueur = 0, exemple = null;
        for (let n = 0; n < N; n++) {
          const vals = engendrer().filter(q => MODULE === 'M38' || q.mode === cle).map(dim.de);
          if (!vals.length) return;
          longueur = vals.length;
          vals.forEach(v => valeurs.add(v));
          for (let i = 1; i < vals.length; i++)
            if (vals[i] === vals[i-1]) { suite++; if (!exemple) exemple = vals.join(' → '); }
        }
        const S = valeurs.size, plafond = Math.ceil(longueur / Math.max(1, S));
        let avantEpuisement = 0;
        for (let n = 0; n < N; n++) {
          const compte = {};
          engendrer().filter(q => MODULE === 'M38' || q.mode === cle).map(dim.de)
            .forEach(v => { compte[v] = (compte[v]||0)+1; });
          if (Object.values(compte).some(c => c > plafond)) avantEpuisement++;
        }
        res.push({id:cfg.id, nom:dim.nom, ferme:dim.ferme || null,
                  suite, avantEpuisement, stock:S, file:longueur, exemple});
      }));
    });
    return {res, modesVus:[...modesVus]};
  }, MODULE);

  const dims13 = tirages.res.filter(x => !x.aucune);
  T('§13 bis — au moins une dimension de contenu est déclarée et mesurée',
    dims13.length > 0, dims13.length + ' dimensions');
  if (MODULE !== 'M38') {
    const orphelins = tirages.modesVus.filter(m =>
      !DECLARES.dimensions.includes(m) && !DECLARES.sansContenu.includes(m));
    T('§13 bis — chaque mode est examiné : dimension déclarée, ou absence justifiée',
      orphelins.length === 0, orphelins.join(', '));
  }

  const suites13 = dims13.filter(x => x.suite > 0);
  T('§13 bis — aucun contenu ne paraît deux manches de suite, nulle part',
    suites13.length === 0,
    suites13.map(x => `${x.id}/${x.nom} : ${x.suite} fois (${String(x.exemple).slice(0, 70)})`).slice(0, 3).join(' | '));

  const cycles13 = dims13.filter(x => !x.ferme && x.avantEpuisement > 0);
  T('§13 bis — hors stock fermé, aucun contenu ne revient avant épuisement',
    cycles13.length === 0,
    cycles13.map(x => `${x.id}/${x.nom} : ${x.avantEpuisement}/200`).slice(0, 3).join(' | '));

  const etroits13 = dims13.filter(x => !x.ferme && x.stock <= x.file);
  T('§13 bis — hors stock fermé, le stock est plus grand que la file',
    etroits13.length === 0,
    etroits13.map(x => `${x.id}/${x.nom} : stock ${x.stock} pour ${x.file} manches`).join(' | '));

  const fermes13 = dims13.filter(x => x.ferme);
  T('§13 bis — chaque stock fermé est justifié en toutes lettres',
    fermes13.every(x => x.ferme.length > 30),
    fermes13.filter(x => x.ferme.length <= 30).map(x => x.id + '/' + x.nom).join(', '));
  const parDim = {};
  fermes13.forEach(x => { (parDim[x.nom] = parDim[x.nom] || []).push(x); });
  const gratuites13 = Object.entries(parDim)
    .filter(([, l]) => l.every(x => x.stock > x.file && x.avantEpuisement === 0));
  T('§13 bis — aucune dispense de stock fermé n’est gratuite',
    gratuites13.length === 0,
    gratuites13.map(([nom, l]) => `${nom} (${l.map(x => x.id).join(', ')})`).join(' | '));

  const jointure13 = await page.evaluate(() => {
    const mesure = (stock, n) => {
      let suite = 0, prec = null, total = 0;
      for (let k = 0; k < 3000; k++)
        tirerSansRepetition('jointure-' + stock.length + '-' + n, stock, n)
          .forEach(v => { if (prec === v) suite++; prec = v; total++; });
      return {suite, total};
    };
    /* On suit `prec` D’UN APPEL À L’AUTRE : la jointure est ENTRE deux
       cycles, pas à l’intérieur d’un appel. */
    return {court:mesure(['a','b'], 1), moyen:mesure(['a','b','c','d','e','f'], 5),
            long:mesure(['a','b','c'], 7)};
  });
  ['court','moyen','long'].forEach(cas => {
    T(`§13 bis — le tirage ne répète pas à la jointure de deux cycles (${cas})`,
      jointure13[cas].suite === 0, `${jointure13[cas].suite} sur ${jointure13[cas].total}`);
  });



  console.log('\nErreurs JS/console/réseau :', erreurs.length ? erreurs.slice(0, 8) : 'aucune');
  if (erreurs.length) ko += erreurs.length;
  console.log(`\n${ok} OK, ${ko} KO`);
  console.log('EXIT:' + (ko === 0 ? 'SUCCES' : 'ECHEC'));
  await nav.close(); srv.close();
})().catch(e => { console.log('CRASH', e); console.log('EXIT:ECHEC'); process.exit(1); });
