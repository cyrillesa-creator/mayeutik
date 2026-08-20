const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

const srv = http.createServer((q, r) => {
  const p = path.join('/home/user/mayeutik', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(d);
  });
});

/* Verrouillage des onglets de palier (CHARTE §15) : un onglet au-delà du
   niveau du profil actif doit être désactivé et grisé tant que son paquet
   cadeau n'a pas été ouvert, dans les trois modules adaptatifs. */

async function ouvrir(browser, port, { fichier, niveau, bonusRevele, cleBonus }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  const u = `http://localhost:${port}/jeux/${fichier}`;
  await page.goto(u);
  await page.evaluate(({ niveau, bonusRevele, cleBonus }) => {
    localStorage.setItem('mayeutik-profils', JSON.stringify([{ id: 'p1', prenom: 'T', niveau }]));
    localStorage.setItem('mayeutik-profil-actif', 'p1');
    localStorage.setItem('mayeutik-sessions', JSON.stringify([]));
    if (bonusRevele) localStorage.setItem(cleBonus, JSON.stringify({ p1: bonusRevele }));
    else localStorage.removeItem(cleBonus);
  }, { niveau, bonusRevele, cleBonus });
  await page.goto(u);
  await page.waitForSelector('.puce-palier', { state: 'attached' });
  await page.waitForTimeout(200);
  return { page, erreurs };
}

async function etatPuces(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.puce-palier')).map((p) => ({
    palier: p.textContent.replace('🔒', '').trim(),
    verrouille: p.classList.contains('verrouille'),
    disabled: p.disabled,
    actif: p.classList.contains('actif'),
    cadenas: p.textContent.includes('🔒')
  })));
}

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  const MODULES = [
    { fichier: 'M23-longueurs.html', cleBonus: 'mayeutik-m23-bonus-revele', paliers: ['CP', 'CE1', 'CE2'] },
    { fichier: 'M39-tableaux-diagrammes.html', cleBonus: 'mayeutik-m39-bonus-revele', paliers: ['CP', 'CE1', 'CE2'] },
    { fichier: 'M36-solides.html', cleBonus: 'mayeutik-m36-bonus-revele', paliers: ['CP', 'CE1', 'CE2'] }
  ];

  for (const mod of MODULES) {
    const { fichier, cleBonus, paliers } = mod;

    // ---- 1. Profil au niveau le plus bas, aucun bonus jamais ouvert ----
    {
      const { page, erreurs } = await ouvrir(browser, port, { fichier, niveau: paliers[0] });
      const puces = await etatPuces(page);
      ok(puces.length === paliers.length, `${fichier} : ${paliers.length} onglets affichés`, puces.map((p) => p.palier));
      puces.forEach((p, i) => {
        if (i === 0) {
          ok(!p.verrouille && !p.disabled && p.actif, `${fichier} : onglet ${p.palier} (niveau du profil) déverrouillé et actif`, p);
        } else {
          ok(p.verrouille && p.disabled && p.cadenas, `${fichier} : onglet ${p.palier} verrouillé (🔒, disabled) — aucun bonus ouvert`, p);
        }
      });

      // ---- 2. Cliquer sur un onglet verrouillé ne fait RIEN ----
      const avant = await page.evaluate(() => ({
        titres: document.getElementById('grille-jeux').innerHTML,
        actif: document.querySelector('.puce-palier.actif').textContent
      }));
      // Un bouton `disabled` ne déclenche pas de handler : on force quand même
      // l'événement pour prouver l'absence d'effet, au cas où un futur refactor
      // retirerait `disabled` sans retirer le garde applicatif.
      await page.evaluate(() => {
        const cible = Array.from(document.querySelectorAll('.puce-palier')).find((p) => p.classList.contains('verrouille'));
        if (cible) cible.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForTimeout(150);
      const apres = await page.evaluate(() => ({
        titres: document.getElementById('grille-jeux').innerHTML,
        actif: document.querySelector('.puce-palier.actif').textContent
      }));
      ok(avant.actif === apres.actif && avant.titres === apres.titres,
        `${fichier} : cliquer un onglet verrouillé ne change ni le palier actif ni la grille`, { avant: avant.actif, apres: apres.actif });

      // ---- Note textuelle : ne référence jamais un palier verrouillé ----
      const note = await page.evaluate(() => document.getElementById('note-palier').textContent);
      const paliersVerrouilles = puces.filter((p) => p.verrouille).map((p) => p.palier);
      const citeUnVerrouille = paliersVerrouilles.some((p) => note.includes('palier ' + p));
      ok(!citeUnVerrouille, `${fichier} : la note ne mentionne aucun palier verrouillé`, note);

      ok(erreurs.length === 0, `${fichier} : aucune erreur console / JS (cas 1-2)`, erreurs.slice(0, 4));
      await page.close();
    }

    // ---- 3. Palier intermédiaire déverrouillé via bonusDejaRevele, le suivant reste verrouillé ----
    if (paliers.length >= 3) {
      const { page, erreurs } = await ouvrir(browser, port, {
        fichier, niveau: paliers[0], bonusRevele: { [paliers[1]]: true }, cleBonus
      });
      const puces = await etatPuces(page);
      ok(!puces[0].verrouille, `${fichier} : palier du profil (${paliers[0]}) toujours déverrouillé`, puces[0]);
      ok(!puces[1].verrouille, `${fichier} : palier ${paliers[1]} déverrouillé (bonus déjà ouvert POUR CE PALIER)`, puces[1]);
      ok(puces[2].verrouille && puces[2].disabled && puces[2].cadenas,
        `${fichier} : palier ${paliers[2]} reste verrouillé (indexation par palier CIBLE : ouvrir ${paliers[1]} ne débloque pas ${paliers[2]})`, puces[2]);
      ok(erreurs.length === 0, `${fichier} : aucune erreur console / JS (cas 3)`, erreurs.slice(0, 4));
      await page.close();
    }

    // ---- 4. Le palier débloqué reste déverrouillé même en changeant l'affichage ----
    {
      const { page } = await ouvrir(browser, port, {
        fichier, niveau: paliers[0], bonusRevele: { [paliers[1]]: true }, cleBonus
      });
      await page.locator('.puce-palier:not(.verrouille)').nth(1).click();
      await page.waitForTimeout(150);
      const puces = await etatPuces(page);
      ok(puces[1].actif && !puces[1].verrouille, `${fichier} : on peut naviguer vers le palier débloqué (devient actif)`, puces[1]);
      await page.close();
    }

    // ---- 5. Profil déjà au palier le plus haut : tous les onglets déverrouillés ----
    {
      const dernier = paliers[paliers.length - 1];
      const { page, erreurs } = await ouvrir(browser, port, { fichier, niveau: dernier });
      const puces = await etatPuces(page);
      ok(puces.every((p) => !p.verrouille && !p.disabled),
        `${fichier} : profil au niveau le plus haut (${dernier}) -> tous les onglets déverrouillés`, puces);
      ok(erreurs.length === 0, `${fichier} : aucune erreur console / JS (cas 5)`, erreurs.slice(0, 4));
      await page.close();
    }

    // ---- 6. Niveau de profil non couvert par le module : traité comme le palier le plus bas ----
    {
      const { page } = await ouvrir(browser, port, { fichier, niveau: 'CM1' });
      const puces = await etatPuces(page);
      ok(!puces[0].verrouille && puces.slice(1).every((p) => p.verrouille),
        `${fichier} : niveau non couvert (CM1) -> seul le palier le plus bas est déverrouillé`, puces);
      await page.close();
    }
  }

  console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
  await browser.close(); srv.close();
  process.exit(echecs === 0 ? 0 : 1);
})();
