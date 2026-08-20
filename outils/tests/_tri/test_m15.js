const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const srv = http.createServer((q, r) => {
  const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(d);
  });
});

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

  const url = `http://localhost:${port}/jeux/M15-fractions-ce1.html`;
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau: 'CE1' }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.removeItem('mayeutik-sessions');
  });
  await page.goto(url);
  await page.waitForSelector('#grille-jeux');

  const lancer = async (jeu) => {
    await page.goto(url);
    await page.waitForSelector('#grille-jeux');
    await page.evaluate((j) => document.querySelector(`[data-jeu="${j}"]`).click(), jeu);
    await page.waitForTimeout(250);
  };
  const feedback = () => page.evaluate(() => (document.getElementById('zone-feedback') || {}).className || '');
  const suivant = async () => { await page.locator('#bouton-suivant').click(); await page.waitForTimeout(250); };
  const taperNombre = async (v) => {
    for (const ch of String(v).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(150);
  };
  const taperFraction = async (n, d) => {
    for (const ch of String(n).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
    await page.locator('.touche-valider').first().click();
    await page.waitForTimeout(60);
    if (d !== undefined) {
      for (const ch of String(d).split('')) await page.locator('.touche-pave', { hasText: new RegExp('^' + ch + '$') }).first().click();
      await page.locator('.touche-valider').first().click();
    }
    await page.waitForTimeout(150);
  };

  // ================= ACCUEIL =================
  {
    const cartes = await page.evaluate(() => Array.from(document.querySelectorAll('.carte-jeu'))
      .map((c) => ({ id: c.dataset.jeu, titre: c.querySelector('h2').textContent })));
    ok(cartes.length === 6, 'Accueil : six mini-jeux', cartes.map((c) => c.id).join(','));
    ok(cartes.some((c) => c.titre === 'La bouteille de limonade'), 'Le gimmick bouteille est là');
  }

  // ============ PAVÉ NUMÉRIQUE : un chiffre remplace le précédent ============
  // (aucun nombre à deux chiffres possible), sélection auto du dénominateur,
  // et correction possible en recliquant l'une ou l'autre case.
  await lancer('lire-ecrire'); // manche 1 = type « ecrire », deux cases à remplir
  {
    const lireSlots = () => page.evaluate(() => {
      const s = document.querySelectorAll('.slot-frac');
      return { n: s[0].textContent, d: s[1].textContent,
        nActif: s[0].classList.contains('actif'), dActif: s[1].classList.contains('actif') };
    });

    // Un seul chiffre suffit à remplir le numérateur (valeurs à un chiffre
    // seulement dans ce module) : le focus doit sauter TOUT SEUL sur le
    // dénominateur dès ce premier chiffre.
    await page.locator('.touche-pave', { hasText: /^3$/ }).first().click();
    await page.waitForTimeout(60);
    let s = await lireSlots();
    ok(s.n === '3', 'Pavé : le numérateur affiche le chiffre tapé', s.n);
    ok(s.dActif && !s.nActif,
      'Pavé : sélection AUTOMATIQUE du dénominateur dès que le numérateur est rempli', JSON.stringify(s));

    // Sur la case maintenant active (le dénominateur), taper un second
    // chiffre REMPLACE le premier : jamais de nombre à deux chiffres.
    await page.locator('.touche-pave', { hasText: /^5$/ }).first().click();
    await page.waitForTimeout(60);
    await page.locator('.touche-pave', { hasText: /^9$/ }).first().click();
    await page.waitForTimeout(60);
    s = await lireSlots();
    ok(s.d === '9', 'Pavé : un second chiffre REMPLACE le premier sur la même case (pas de « 59 »)', s.d);

    // Recliquer le numérateur permet de le corriger sans perturber le
    // dénominateur déjà rempli, ni relancer le saut automatique.
    await page.locator('.slot-frac').first().click();
    await page.waitForTimeout(60);
    await page.locator('.touche-pave', { hasText: /^2$/ }).first().click();
    await page.waitForTimeout(60);
    s = await lireSlots();
    ok(s.n === '2' && s.d === '9' && s.nActif,
      'Pavé : reclique sur le numérateur pour le corriger, le dénominateur reste acquis', JSON.stringify(s));

    // On efface proprement les deux cases (sans jamais presser ✓, pour ne pas
    // valider prématurément avec ces valeurs de démonstration) avant de
    // répondre pour de vrai.
    await page.locator('.touche-pave', { hasText: /^C$/ }).first().click(); // vide n (actif)
    await page.waitForTimeout(60);
    await page.locator('.slot-frac').nth(1).click(); // sélectionne d
    await page.waitForTimeout(60);
    await page.locator('.touche-pave', { hasText: /^C$/ }).first().click(); // vide d
    await page.waitForTimeout(60);
    await page.locator('.slot-frac').first().click(); // revient sur n, prêt pour une saisie normale
    await page.waitForTimeout(60);
    s = await lireSlots();
    ok(s.n === '?' && s.d === '?', 'Pavé : les deux cases sont bien vides avant la vraie réponse', JSON.stringify(s));

    const e0 = await page.evaluate(() => {
      const total = Math.max(document.querySelectorAll('#zone-jeu .carre-choco').length,
        document.querySelectorAll('#zone-jeu .part-tarte').length,
        document.querySelectorAll('#zone-jeu .part-brownie').length);
      const rempli = Math.max(document.querySelectorAll('#zone-jeu .carre-choco.rempli').length,
        document.querySelectorAll('#zone-jeu .part-tarte.rempli').length,
        document.querySelectorAll('#zone-jeu .part-brownie.rempli').length);
      return { total, rempli };
    });
    await taperFraction(e0.rempli, e0.total);
    ok(/feedback-succes/.test(await feedback()), 'Pavé : la manche se conclut normalement après la démonstration');
  }

  // ================= 1. LE BON PARTAGE =================
  await lancer('partage-egal');
  for (let manche = 1; manche <= 5; manche++) {
    const e = await page.evaluate(() => {
      const cartes = Array.from(document.querySelectorAll('.carte-partage'));
      const compter = (c) => Math.max(
        c.querySelectorAll('.carre-choco').length,
        c.querySelectorAll('.part-tarte').length);
      // La bonne carte : parts toutes égales. Pour la bande = aucun flexGrow
      // personnalisé ; pour la tarte = tous les segments du même angle (on lit
      // la longueur du path : même 'd' de forme → on compare les aires via
      // getBBox impossible ici, donc on repère par l'ABSENCE d'attributs
      // d'inégalité : bandes sans style flex-grow, tartes dont tous les paths
      // ont la même longueur totale de trait.
      const estEgale = (c) => {
        const carres = Array.from(c.querySelectorAll('.carre-choco'));
        if (carres.length) return carres.every((x) => !x.style.flexGrow);
        const parts = Array.from(c.querySelectorAll('.part-tarte'));
        const longueurs = parts.map((p) => Math.round(p.getTotalLength()));
        return longueurs.every((l) => Math.abs(l - longueurs[0]) <= 2);
      };
      return {
        nb: cartes.length,
        nbEgales: cartes.filter(estEgale).length,
        indexEgale: cartes.findIndex(estEgale),
        parts: cartes.map(compter)
      };
    });
    ok(e.nb === 3, `Partage m${manche} : trois découpes proposées`, e.nb);
    ok(e.nbEgales === 1, `Partage m${manche} : UNE seule découpe en parts égales`, e.nbEgales);

    await page.locator('.carte-partage').nth(e.indexEgale).click();
    await page.waitForTimeout(150);
    const comptage = await page.evaluate(() => ({
      vert: document.querySelectorAll('.carte-partage.correct').length,
      pave: document.querySelectorAll('.pave-numerique').length,
      invite: (Array.from(document.querySelectorAll('.legende-forte')).pop() || {}).textContent || ''
    }));
    ok(comptage.vert === 1 && comptage.pave === 1, `Partage m${manche} : phase de comptage ouverte`, JSON.stringify(comptage));
    await taperNombre(e.parts[e.indexEgale]);
    ok(/feedback-succes/.test(await feedback()), `Partage m${manche} : bon choix + bon compte → succès`);
    const vocab = await page.evaluate(() => document.body.textContent.includes('DÉNOMINATEUR'));
    ok(vocab, `Partage m${manche} : le mot dénominateur est introduit`);
    if (manche < 5) await suivant();
  }
  await suivant();
  {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
      .find((x) => x.competence === 'partage-egal'));
    ok(s && s.module === 'M15' && s.score === 5 && s.total === 5,
      'Session « partage-egal » 5/5 sous module M15', JSON.stringify(s || {}));
  }

  // ---- Erreur au partage : §18 ----
  await lancer('partage-egal');
  {
    const e = await page.evaluate(() => {
      const cartes = Array.from(document.querySelectorAll('.carte-partage'));
      const estEgale = (c) => {
        const carres = Array.from(c.querySelectorAll('.carre-choco'));
        if (carres.length) return carres.every((x) => !x.style.flexGrow);
        const parts = Array.from(c.querySelectorAll('.part-tarte'));
        const longueurs = parts.map((p) => Math.round(p.getTotalLength()));
        return longueurs.every((l) => Math.abs(l - longueurs[0]) <= 2);
      };
      return { indexEgale: cartes.findIndex(estEgale), nbParts: Math.max(
        cartes[cartes.findIndex(estEgale)].querySelectorAll('.carre-choco').length,
        cartes[cartes.findIndex(estEgale)].querySelectorAll('.part-tarte').length) };
    });
    const mauvaise = e.indexEgale === 0 ? 1 : 0;
    await page.locator('.carte-partage').nth(mauvaise).click();
    await page.waitForTimeout(150);
    const marques = await page.evaluate(() => ({
      rouge: document.querySelectorAll('.carte-partage.incorrect').length,
      vert: document.querySelectorAll('.carte-partage.correct').length
    }));
    ok(marques.rouge === 1 && marques.vert === 1,
      '§18 : découpe fautive en rouge, la bonne en vert', JSON.stringify(marques));
    await taperNombre(e.nbParts);
    ok(/feedback-erreur/.test(await feedback()),
      'Mauvais choix de découpe → manche ratée même si le compte est bon');
  }

  // ---- Réussite PARTIELLE : bon partage, mauvais compte ----
  // Confettis propres à la sous-réponse correcte, message final adapté.
  await lancer('partage-egal');
  {
    const e = await page.evaluate(() => {
      const cartes = Array.from(document.querySelectorAll('.carte-partage'));
      const compter = (c) => Math.max(c.querySelectorAll('.carre-choco').length, c.querySelectorAll('.part-tarte').length);
      const estEgale = (c) => {
        const carres = Array.from(c.querySelectorAll('.carre-choco'));
        if (carres.length) return carres.every((x) => !x.style.flexGrow);
        const parts = Array.from(c.querySelectorAll('.part-tarte'));
        const longueurs = parts.map((p) => Math.round(p.getTotalLength()));
        return longueurs.every((l) => Math.abs(l - longueurs[0]) <= 2);
      };
      const indexEgale = cartes.findIndex(estEgale);
      return { indexEgale, nbParts: compter(cartes[indexEgale]) };
    });
    const avant = await page.evaluate(() => document.querySelectorAll('.confetti').length);
    await page.locator('.carte-partage').nth(e.indexEgale).click();
    await page.waitForTimeout(200);
    const apresPhase1 = await page.evaluate(() => document.querySelectorAll('.confetti').length);
    ok(apresPhase1 > avant, 'Confettis dès la sous-réponse « bon partage », avant même le comptage', apresPhase1);

    const faux = e.nbParts >= 8 ? e.nbParts - 1 : e.nbParts + 1;
    await taperNombre(faux);
    const apres = await page.evaluate(() => ({
      fb: (document.getElementById('zone-feedback') || {}).className,
      msg: (document.getElementById('zone-feedback') || {}).textContent
    }));
    ok(/feedback-erreur/.test(apres.fb), 'Bon partage + mauvais compte : la manche reste ratée globalement');
    ok(/Bon choix de partage/.test(apres.msg),
      'Message final ADAPTÉ : signale que le partage était bon malgré l’erreur de comptage', apres.msg);
  }

  // ---- Réussite PARTIELLE : mauvais partage, bon compte ----
  await lancer('partage-egal');
  {
    const e = await page.evaluate(() => {
      const cartes = Array.from(document.querySelectorAll('.carte-partage'));
      const compter = (c) => Math.max(c.querySelectorAll('.carre-choco').length, c.querySelectorAll('.part-tarte').length);
      const estEgale = (c) => {
        const carres = Array.from(c.querySelectorAll('.carre-choco'));
        if (carres.length) return carres.every((x) => !x.style.flexGrow);
        const parts = Array.from(c.querySelectorAll('.part-tarte'));
        const longueurs = parts.map((p) => Math.round(p.getTotalLength()));
        return longueurs.every((l) => Math.abs(l - longueurs[0]) <= 2);
      };
      const indexEgale = cartes.findIndex(estEgale);
      const nbEgale = compter(cartes[indexEgale]);
      // La carte fausse dont le nombre de parts est LE MÊME que la bonne (elle
      // ne diffère que par l'inégalité des parts, pas par leur nombre) : on
      // peut y répondre juste au comptage tout en s'étant trompé au choix.
      const indexFausseMemeCompte = cartes.findIndex((c, i) => i !== indexEgale && !estEgale(c) && compter(c) === nbEgale);
      return { indexFausseMemeCompte, nbEgale };
    });
    if (e.indexFausseMemeCompte !== -1) {
      await page.locator('.carte-partage').nth(e.indexFausseMemeCompte).click();
      await page.waitForTimeout(200);
      await taperNombre(e.nbEgale);
      const apres = await page.evaluate(() => ({
        fb: (document.getElementById('zone-feedback') || {}).className,
        msg: (document.getElementById('zone-feedback') || {}).textContent
      }));
      ok(/feedback-erreur/.test(apres.fb), 'Mauvais partage + bon compte : la manche reste ratée globalement');
      ok(/bien compté/.test(apres.msg),
        'Message final ADAPTÉ : signale que le comptage était bon malgré le mauvais partage', apres.msg);
    } else {
      ok(true, 'Réussite partielle (partage faux, compte juste) : cas non tiré cette fois, ignoré sans échec');
    }
  }

  // ================= 2. LA PART DU PIQUE-NIQUE =================
  await lancer('lire-ecrire');
  for (let manche = 1; manche <= 5; manche++) {
    const e = await page.evaluate(() => {
      const consigne = (document.querySelector('.consigne') || {}).textContent || '';
      const compter = (sel, selRempli) => ({
        total: document.querySelectorAll(sel).length,
        remplies: document.querySelectorAll(selRempli).length
      });
      const bande = compter('#zone-jeu .carre-choco', '#zone-jeu .carre-choco.rempli');
      const tarte = compter('#zone-jeu .part-tarte', '#zone-jeu .part-tarte.rempli');
      const brownie = compter('#zone-jeu .part-brownie', '#zone-jeu .part-brownie.rempli');
      const forme = bande.total ? bande : (tarte.total ? tarte : brownie);
      return {
        consigne,
        type: /Colorie/.test(consigne) ? 'colorier' : (/Quelle part/.test(consigne) ? 'mot' : 'ecrire'),
        total: forme.total, remplies: forme.remplies,
        options: document.querySelectorAll('.bouton-option').length,
        slots: document.querySelectorAll('.slot-frac:not(.fixe)').length
      };
    });

    if (e.type === 'colorier') {
      const m = e.consigne.match(/Colorie (\d+)\/(\d+)/);
      ok(!!m && Number(m[2]) === e.total, `Pique-nique m${manche} (colorier) : la forme a le bon nombre de parts`, e.consigne);
      const n = Number(m[1]);
      // On colorie exactement n parts.
      for (let i = 0; i < n; i++) {
        await page.evaluate((idx) => {
          const parts = document.querySelectorAll('#zone-jeu button.carre-choco, #zone-jeu .part-tarte.cliquable, #zone-jeu button.part-brownie');
          parts[idx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }, i);
        await page.waitForTimeout(40);
      }
      await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider' }).click();
      await page.waitForTimeout(200);
      ok(/feedback-succes/.test(await feedback()), `Pique-nique m${manche} : coloriage juste → succès`);
    } else if (e.type === 'mot') {
      ok(e.options === 4, `Pique-nique m${manche} (mots) : QCM à 4 noms`, e.options);
      // On lit la fraction sur la forme et on choisit le nom correspondant.
      const attendu = await page.evaluate(() => {
        const d = JSON.parse(document.getElementById('donnees-jeu').textContent);
        const total = Math.max(document.querySelectorAll('#zone-jeu .carre-choco').length,
          document.querySelectorAll('#zone-jeu .part-tarte').length,
          document.querySelectorAll('#zone-jeu .part-brownie').length);
        const rempli = Math.max(document.querySelectorAll('#zone-jeu .carre-choco.rempli').length,
          document.querySelectorAll('#zone-jeu .part-tarte.rempli').length,
          document.querySelectorAll('#zone-jeu .part-brownie.rempli').length);
        return d.nomsCourants[rempli + '/' + total];
      });
      ok(!!attendu, `Pique-nique m${manche} : la forme correspond à un nom courant`, attendu);
      await page.locator('.bouton-option', { hasText: attendu }).first().click();
      await page.waitForTimeout(200);
      ok(/feedback-succes/.test(await feedback()), `Pique-nique m${manche} : bon nom → succès`);
    } else {
      ok(e.slots === 2, `Pique-nique m${manche} (écrire) : deux cases à remplir`, e.slots);
      const vocab = await page.evaluate(() => document.body.textContent.includes('numérateur') && document.body.textContent.includes('dénominateur'));
      ok(vocab, `Pique-nique m${manche} : vocabulaire numérateur/dénominateur affiché`);
      await taperFraction(e.remplies, e.total);
      ok(/feedback-succes/.test(await feedback()), `Pique-nique m${manche} : fraction écrite juste → succès`, `${e.remplies}/${e.total}`);
    }
    if (manche < 5) await suivant();
  }
  await suivant();
  {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
      .find((x) => x.competence === 'lire-ecrire'));
    ok(s && s.score === 5 && s.total === 5, 'Session « lire-ecrire » 5/5', JSON.stringify(s || {}));
  }

  // ================= 3. LA BOUTEILLE DE LIMONADE =================
  await lancer('contenances');
  for (let manche = 1; manche <= 5; manche++) {
    const e = await page.evaluate(() => ({
      consigne: (document.querySelector('.consigne') || {}).textContent || '',
      verres: document.querySelectorAll('.verre-btn').length,
      pleins: document.querySelectorAll('.verre-btn.plein').length,
      graduations: document.querySelectorAll('.bouteille-svg line').length,
      slots: document.querySelectorAll('.slot-frac').length
    }));
    ok(e.graduations === e.verres - 1, `Limonade m${manche} : ${e.verres} verres et ${e.graduations} graduations (d−1)`, `${e.verres} verres`);

    if (manche === 1) {
      // Recalibrage : « verser la moitié » ne doit plus remplir un seul verre
      // géant (peu réaliste) — la bouteille est partagée en QUATRE verres, il
      // faut en remplir DEUX pour réaliser la moitié.
      ok(e.verres === 4, 'Limonade m1 : la moitié est calibrée sur 4 verres, pas 1 verre = 1/2 la bouteille', e.verres);
      ok(/1\/2/.test(e.consigne), 'Limonade m1 : l’énoncé parle toujours de « la moitié (1/2) »', e.consigne);
      const cible = e.verres / 2;
      for (let i = 0; i < cible; i++) {
        await page.locator('.verre-btn:not(.plein)').first().click();
        await page.waitForTimeout(520);
      }
      await page.locator('#zone-jeu .bouton-principal', { hasText: 'versé' }).click();
      await page.waitForTimeout(200);
      ok(/feedback-succes/.test(await feedback()),
        'Limonade m1 : verser 2 verres sur 4 réalise bien la moitié → succès', `${cible}/${e.verres}`);
    } else if (manche === 2) {
      const m = e.consigne.match(/(\d+)\/(\d+)/);
      const cible = Number(m[1]);
      ok(Number(m[2]) === e.verres, `Limonade m${manche} : autant de verres que de parts`, e.consigne);
      for (let i = 0; i < cible; i++) {
        await page.locator('.verre-btn:not(.plein)').first().click();
        await page.waitForTimeout(520);
      }
      const niveau = await page.evaluate(() => {
        const r = document.querySelector('.bouteille-svg rect[fill*="limonade"]');
        return Math.round(parseFloat(r.getAttribute('height')));
      });
      ok(niveau > 0 || cible === e.verres, `Limonade m${manche} : le niveau de la bouteille a baissé`, niveau + 'px restants');
      await page.locator('#zone-jeu .bouton-principal', { hasText: 'versé' }).click();
      await page.waitForTimeout(200);
      ok(/feedback-succes/.test(await feedback()), `Limonade m${manche} : versement juste → succès`, `${cible}/${e.verres}`);
    } else if (manche === 3 || manche === 4) {
      ok(e.pleins > 0, `Limonade m${manche} : des verres sont déjà versés`, e.pleins);
      const attendu = manche === 3 ? e.pleins : e.verres - e.pleins;
      await taperFraction(attendu, e.verres);
      ok(/feedback-succes/.test(await feedback()), `Limonade m${manche} : fraction ${manche === 3 ? 'versée' : 'restante'} juste → succès`, `${attendu}/${e.verres}`);
    } else {
      // Manche 5 : tout verser, puis la question n/n = 1.
      for (let i = 0; i < e.verres; i++) {
        await page.locator('.verre-btn:not(.plein)').first().click();
        await page.waitForTimeout(520);
      }
      await page.waitForTimeout(200);
      const q = await page.evaluate(() => ({
        options: document.querySelectorAll('.bouton-option').length,
        texte: (Array.from(document.querySelectorAll('.legende-forte')).pop() || {}).textContent || ''
      }));
      ok(q.options === 3 && new RegExp(e.verres + '/' + e.verres).test(q.texte),
        `Limonade m5 : bouteille vidée → question ${e.verres}/${e.verres}`, q.texte);
      await page.locator('.bouton-option', { hasText: 'bouteille entière' }).click();
      await page.waitForTimeout(200);
      ok(/feedback-succes/.test(await feedback()), 'Limonade m5 : n/n = 1 → succès');
      const morale = await page.evaluate(() => document.body.textContent.includes('= 1 : toutes les parts'));
      ok(morale, 'Limonade m5 : la morale n/n = 1 est affichée');
    }
    if (manche < 5) await suivant();
  }
  await suivant();
  {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
      .find((x) => x.competence === 'contenances'));
    ok(s && s.score === 5 && s.total === 5, 'Session « contenances » 5/5', JSON.stringify(s || {}));
  }

  // ---- Le versement se corrige : reprendre un verre ----
  await lancer('contenances');
  {
    await page.locator('.verre-btn:not(.plein)').first().click();
    await page.waitForTimeout(520);
    const apresVerse = await page.evaluate(() => document.querySelectorAll('.verre-btn.plein').length);
    await page.locator('.verre-btn.plein').first().click();
    await page.waitForTimeout(520);
    const apresReprise = await page.evaluate(() => document.querySelectorAll('.verre-btn.plein').length);
    ok(apresVerse === 1 && apresReprise === 0, 'Toucher un verre plein reverse la limonade dans la bouteille', `${apresVerse} → ${apresReprise}`);
  }

  // ================= 4. LES PORTRAITS =================
  await lancer('representations');
  for (let manche = 1; manche <= 5; manche++) {
    const e = await page.evaluate(() => {
      const consigne = (document.querySelector('.consigne') || {}).textContent || '';
      const m = consigne.match(/(\d+)\/(\d+)/);
      const n = Number(m[1]), d = Number(m[2]);
      const cartes = Array.from(document.querySelectorAll('.carte-portrait'));
      const lireCarte = (c) => {
        const carres = Array.from(c.querySelectorAll('.carre-choco'));
        const parts = Array.from(c.querySelectorAll('.part-tarte'));
        const brownies = Array.from(c.querySelectorAll('.part-brownie'));
        let total, rempli, egal = true;
        if (carres.length) {
          total = carres.length;
          rempli = carres.filter((x) => x.classList.contains('rempli')).length;
          egal = carres.every((x) => !x.style.flexGrow);
        } else if (parts.length) {
          total = parts.length;
          rempli = parts.filter((x) => x.classList.contains('rempli')).length;
          const longueurs = parts.map((p) => Math.round(p.getTotalLength()));
          egal = longueurs.every((l) => Math.abs(l - longueurs[0]) <= 2);
        } else {
          total = brownies.length;
          rempli = brownies.filter((x) => x.classList.contains('rempli')).length;
        }
        return { total, rempli, egal };
      };
      const infos = cartes.map(lireCarte);
      return {
        n, d, nb: cartes.length,
        bonnes: infos.map((x, i) => (x.egal && x.total === d && x.rempli === n) ? i : -1).filter((i) => i !== -1),
        inegales: infos.filter((x) => !x.egal).length,
        valeurEgales: infos.filter((x, i) => x.egal && (x.rempli * d === n * x.total) && !(x.total === d && x.rempli === n)).length
      };
    });
    ok(e.nb === 6, `Portraits m${manche} : six images`, e.nb);
    ok(e.bonnes.length >= 2 && e.bonnes.length <= 3, `Portraits m${manche} : 2 ou 3 bonnes images`, e.bonnes.length);
    ok(e.inegales >= 1, `Portraits m${manche} : au moins un piège « parts inégales »`, e.inegales);
    ok(e.valeurEgales === 0, `Portraits m${manche} : aucun piège d'équivalence (notion CE2)`, e.valeurEgales);

    for (const i of e.bonnes) {
      await page.locator('.carte-portrait').nth(i).click();
      await page.waitForTimeout(40);
    }
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider' }).click();
    await page.waitForTimeout(200);
    ok(/feedback-succes/.test(await feedback()), `Portraits m${manche} : sélection exacte → succès`);
    if (manche < 5) await suivant();
  }
  await suivant();

  // ---- Erreur aux portraits : badges explicatifs ----
  await lancer('representations');
  {
    // On choisit une seule mauvaise carte : la carte inégale.
    const idx = await page.evaluate(() => {
      const cartes = Array.from(document.querySelectorAll('.carte-portrait'));
      return cartes.findIndex((c) => {
        const carres = Array.from(c.querySelectorAll('.carre-choco'));
        if (carres.some((x) => x.style.flexGrow)) return true;
        const parts = Array.from(c.querySelectorAll('.part-tarte'));
        if (!parts.length) return false;
        const longueurs = parts.map((p) => Math.round(p.getTotalLength()));
        return !longueurs.every((l) => Math.abs(l - longueurs[0]) <= 2);
      });
    });
    ok(idx !== -1, 'Le piège des parts inégales est repérable');
    await page.locator('.carte-portrait').nth(idx).click();
    await page.locator('#zone-jeu .bouton-principal', { hasText: 'Valider' }).click();
    await page.waitForTimeout(200);
    const apres = await page.evaluate(() => ({
      badgeInegal: Array.from(document.querySelectorAll('.badge-portrait')).some((b) => /parts inégales/.test(b.textContent)),
      oubliees: document.querySelectorAll('.carte-portrait.oubliee').length,
      fb: (document.getElementById('zone-feedback') || {}).className
    }));
    ok(/feedback-erreur/.test(apres.fb), 'Portraits : mauvaise sélection → manche ratée');
    ok(apres.badgeInegal, '§18 : le piège explique « parts inégales ! »');
    ok(apres.oubliees >= 2, '§18 : les bonnes images oubliées sont montrées en vert pointillé', apres.oubliees);
  }

  // ================= 5. LA PLUS GRANDE PART =================
  await lancer('comparer-ce1');
  let egalitesVues = 0;
  for (let manche = 1; manche <= 5; manche++) {
    const e = await page.evaluate(() => {
      const fracs = Array.from(document.querySelectorAll('.carte-perso .fraction-affichage'))
        .map((f) => ({ n: Number(f.children[0].textContent), d: Number(f.children[2].textContent) }));
      return {
        fracs,
        boutons: Array.from(document.querySelectorAll('.reponses-duel .bouton-option')).map((b) => b.textContent),
        persos: Array.from(document.querySelectorAll('.perso-nom')).map((p) => p.textContent)
      };
    });
    ok(e.fracs.length === 2, `Duel m${manche} : deux parts en présence`, JSON.stringify(e.fracs));
    ok(e.boutons.length === 3 && /Parts égales/.test(e.boutons[1]),
      `Duel m${manche} : trois réponses possibles dont l'égalité`, e.boutons.join(' | '));
    if (manche >= 4) {
      ok(e.fracs.every((f) => f.n === 1), `Duel m${manche} : fractions unitaires en fin de partie`, JSON.stringify(e.fracs));
    } else {
      ok(e.fracs[0].d === e.fracs[1].d, `Duel m${manche} : même dénominateur en début de partie`, JSON.stringify(e.fracs));
    }
    const va = e.fracs[0].n / e.fracs[0].d, vb = e.fracs[1].n / e.fracs[1].d;
    const bonneIdx = va > vb ? 0 : (vb > va ? 2 : 1);
    if (bonneIdx === 1) egalitesVues++;
    await page.locator('.reponses-duel .bouton-option').nth(bonneIdx).click();
    await page.waitForTimeout(250);
    ok(/feedback-succes/.test(await feedback()), `Duel m${manche} : bonne réponse → succès`);
    const sup = await page.evaluate(() => ({
      barres: document.querySelectorAll('.barre-superposee').length,
      largeurs: Array.from(document.querySelectorAll('.barre-superposee')).map((b) => b.style.width)
    }));
    ok(sup.barres === 2, `Duel m${manche} : la superposition des parts est montrée`, sup.largeurs.join(' '));
    if (manche < 5) await suivant();
  }
  ok(egalitesVues === 1, 'Une manche d\'égalité exactement dans la partie', egalitesVues);
  await suivant();
  {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
      .find((x) => x.competence === 'comparer-ce1'));
    ok(s && s.score === 5 && s.total === 5, 'Session « comparer-ce1 » 5/5', JSON.stringify(s || {}));
  }

  // ================= 6. LES COMPTES DU GOÛTER =================
  await lancer('calculer-ce1');
  const typesVus = new Set();
  for (let manche = 1; manche <= 5; manche++) {
    const e = await page.evaluate(() => {
      const consigne = (document.querySelector('.consigne') || {}).textContent || '';
      const fracs = (consigne.match(/(\d+)\/(\d+)/g) || []).map((f) => f.split('/').map(Number));
      let type = 'complement';
      if (/en mange .+ en tout/.test(consigne) || /mangée en tout/.test(consigne)) type = 'addition';
      else if (/Il restait/.test(consigne)) type = 'soustraction';
      return { consigne, fracs, type, slotFixe: (document.querySelector('.slot-frac.fixe') || {}).textContent };
    });
    typesVus.add(e.type);
    const [n1, d] = e.fracs[0];
    let attendu;
    if (e.type === 'addition') attendu = n1 + e.fracs[1][0];
    else if (e.type === 'soustraction') attendu = n1 - e.fracs[1][0];
    else attendu = d - n1;
    ok(Number(e.slotFixe) === d, `Goûter m${manche} (${e.type}) : le dénominateur est affiché FIXE`, e.slotFixe);
    ok(attendu >= 1 && attendu <= d, `Goûter m${manche} : résultat dans [1/d ; 1]`, attendu + '/' + d);
    await taperFraction(attendu);
    ok(/feedback-succes/.test(await feedback()), `Goûter m${manche} : calcul juste → succès`, e.consigne.slice(0, 50));
    if (e.type === 'complement') {
      // La bouteille doit se remplir ENTIÈREMENT, le complément apparaissant
      // dans une AUTRE couleur (mandarine) que le niveau de départ (jaune).
      await page.waitForTimeout(650); // laisser l'animation du complément se terminer
      const bouteille = await page.evaluate(() => {
        const rects = Array.from(document.querySelectorAll('.bouteille-svg rect'));
        const liquide = rects.find((r) => r.getAttribute('fill') === 'var(--limonade)');
        const complement = rects.find((r) => r.getAttribute('fill') === 'var(--couleur-mandarine)');
        return {
          hauteurLiquide: liquide ? Math.round(parseFloat(liquide.getAttribute('height'))) : 0,
          hauteurComplement: complement ? Math.round(parseFloat(complement.getAttribute('height'))) : 0,
          yComplement: complement ? Math.round(parseFloat(complement.getAttribute('y'))) : null,
          yLiquide: liquide ? Math.round(parseFloat(liquide.getAttribute('y'))) : null,
          legende: (document.querySelector('#zone-jeu .legende') || {}).textContent || ''
        };
      });
      ok(bouteille.hauteurComplement > 0, 'Goûter (complément) : la bouteille se remplit d’une seconde couleur', bouteille.hauteurComplement);
      ok(bouteille.yComplement < bouteille.yLiquide, 'Goûter (complément) : le complément se pose AU-DESSUS du niveau initial', JSON.stringify(bouteille));
      ok(Math.abs((bouteille.yComplement + bouteille.hauteurComplement) - bouteille.yLiquide) <= 3,
        'Goûter (complément) : le complément rejoint exactement le niveau initial, sans trou ni chevauchement', JSON.stringify(bouteille));
      ok(/\(orange\)/.test(bouteille.legende) && /1 bouteille pleine/.test(bouteille.legende),
        'Goûter (complément) : la légende explique les deux couleurs', bouteille.legende);
    }
    if (manche < 5) await suivant();
  }
  ok(typesVus.size === 3, 'Les trois types (addition, soustraction, complément) sortent dans la partie', [...typesVus].join(','));
  await suivant();
  {
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('mayeutik-sessions') || '[]')
      .find((x) => x.competence === 'calculer-ce1'));
    ok(s && s.score === 5 && s.total === 5, 'Session « calculer-ce1 » 5/5', JSON.stringify(s || {}));
    const resultats = await page.evaluate(() => ({
      etoiles: document.querySelectorAll('#zone-jeu .etoile.pleine').length,
      bloc: document.querySelectorAll('.bloc-resultats').length
    }));
    ok(resultats.bloc === 1 && resultats.etoiles === 3, 'Écran de résultats : 3 étoiles à 5/5', JSON.stringify(resultats));
  }

  // ---- Erreur au calcul : §18 ----
  await lancer('calculer-ce1');
  {
    const e = await page.evaluate(() => {
      const consigne = (document.querySelector('.consigne') || {}).textContent || '';
      const fracs = (consigne.match(/(\d+)\/(\d+)/g) || []).map((f) => f.split('/').map(Number));
      let type = 'complement';
      if (/en mange .+ en tout/.test(consigne) || /mangée en tout/.test(consigne)) type = 'addition';
      else if (/Il restait/.test(consigne)) type = 'soustraction';
      return { fracs, consigne, type };
    });
    const [n1, d] = e.fracs[0];
    let bon;
    if (e.type === 'addition') bon = n1 + e.fracs[1][0];
    else if (e.type === 'soustraction') bon = n1 - e.fracs[1][0];
    else bon = d - n1;
    // Un seul chiffre, forcément faux (le pavé n'accepte plus qu'un chiffre —
    // taper « 9 » puis « 9 » ne composerait plus « 99 » mais resterait « 9 »).
    const faux = bon === 9 ? 8 : 9;
    await taperFraction(faux);
    const apres = await page.evaluate(() => ({
      fb: (document.getElementById('zone-feedback') || {}).className,
      correction: (document.querySelector('.bloc-correction') || {}).textContent || '',
      slotRouge: document.querySelectorAll('.slot-frac.incorrect').length
    }));
    ok(/feedback-erreur/.test(apres.fb), 'Calcul faux → manche ratée');
    ok(/La bonne réponse/.test(apres.correction), '§18 : la bonne réponse est donnée', apres.correction);
    ok(apres.slotRouge === 1, '§18 : la case fausse passe au rouge');
  }

  ok(erreurs.length === 0, 'Aucune erreur console / JS', erreurs.slice(0, 6));
  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await b.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
