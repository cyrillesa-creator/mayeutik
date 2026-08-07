/* Vérifie les gabarits CORRIGÉS en les appliquant aux VRAIES données du jeu :
   on extrait du source la fonction deElision de chaque fichier et sa table de
   données, puis on produit l'énoncé exactement comme le jeu le ferait.
   Plus fiable qu'une marche dans l'interface, qui n'atteint pas toujours
   l'écran où l'énoncé s'affiche. */
const fs = require('fs');
const { violations } = require('./lint-elision.js');
let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : JSON.stringify(x)); if (!c) echecs++; };

/* Extraction par ÉQUILIBRAGE des accolades : la fonction tient parfois sur une
   seule ligne (M01), et un `}` peut apparaître dans un littéral de gabarit —
   une regex paresseuse s'arrêterait trop tôt. */
function extraireFonction(src, nom) {
  const debut = src.indexOf('function ' + nom);
  if (debut === -1) return null;
  let i = src.indexOf('{', debut), niveau = 0, fin = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') niveau++;
    else if (src[j] === '}') { niveau--; if (niveau === 0) { fin = j; break; } }
  }
  if (fin === -1) return null;
  return new Function(src.slice(debut, fin + 1) + '; return ' + nom + ';')();
}

function extraireDeElision(src) {
  const debut = src.indexOf('function deElision');
  if (debut === -1) return null;
  let i = src.indexOf('{', debut), niveau = 0, fin = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') niveau++;
    else if (src[j] === '}') { niveau--; if (niveau === 0) { fin = j; break; } }
  }
  if (fin === -1) return null;
  return new Function(src.slice(debut, fin + 1) + '; return deElision;')();
}
function donneesJSON(src) {
  const m = src.match(/<script type="application\/json" id="donnees-jeu">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

// ---------- M39 : « Combien <de+pluriel> <emoji> as-tu comptées ? » ----------
{
  const src = fs.readFileSync('/home/user/mayeutik/jeux/M39-tableaux-diagrammes.html', 'utf8');
  const de = extraireDeElision(src);
  ok(!!de, 'M39 : deElision présent dans le fichier');
  ok(/'Combien ' \+ deElision\(espece\.pluriel\)/.test(src),
    "M39 : l'invite du tally utilise bien deElision");
  const json = donneesJSON(src);
  const enonces = [];
  for (const table of [json.especes, json.objets]) {
    for (const id of Object.keys(table)) {
      const e = table[id];
      enonces.push('Combien ' + de(e.pluriel) + ' ' + (e.emoji || '') + ' dans le tableau ?');
    }
  }
  const mauvais = enonces.filter(t => violations(t, 'M39').length);
  ok(mauvais.length === 0, `M39 : ${enonces.length} énoncés produits sur les vraies espèces, tous corrects`, mauvais);
  console.log('     ex. : ' + enonces.filter(t => /d[’']/.test(t)).slice(0, 3).join('  |  '));
}

// ---------- M01 : « … qui a AUTANT <de+mot> … » ----------
{
  const src = fs.readFileSync('/home/user/mayeutik/jeux/M01-nombres-jusqu-9-cp.html', 'utf8');
  const de = extraireDeElision(src);
  ok(!!de, 'M01 : deElision présent dans le fichier');
  ok(/AUTANT \$\{deElision\(univers\.mot\)\}/.test(src) && /\$\{motCle\} \$\{deElision\(univers\.mot\)\}/.test(src),
    'M01 : les deux consignes « Plus, moins, autant » utilisent deElision');
  const json = donneesJSON(src);
  const enonces = [];
  (json.universComparer || []).forEach(u => {
    enonces.push(`Choisis ${u.article} ${u.contenant} qui a AUTANT ${de(u.mot)} que le modèle !`);
    enonces.push(`Choisis ${u.article} ${u.contenant} qui a LE PLUS ${de(u.mot)} !`);
  });
  const mauvais = enonces.filter(t => violations(t, 'M01').length);
  ok(mauvais.length === 0, `M01 : ${enonces.length} consignes produites sur les vrais univers, toutes correctes`, mauvais);
  // Épreuve de robustesse : un mot à voyelle ajouté demain doit s'élider seul.
  ok(de('abeilles').startsWith('d\u2019') && de('étoiles').startsWith('d\u2019') && de('bonbons') === 'de bonbons',
    "M01 : un futur mot à voyelle s'élidera automatiquement",
    [de('abeilles'), de('étoiles'), de('bonbons')]);
}

// ---------- M36 : « Combien <de+libellé> a <solide> ? » ----------
{
  const src = fs.readFileSync('/home/user/mayeutik/jeux/M36-solides.html', 'utf8');
  const de = extraireDeElision(src);
  ok(!!de, 'M36 : deElision présent dans le fichier');
  ok(/Combien \$\{deElision\(libelle\)\} a \$\{S\.nom\}/.test(src), 'M36 : « Je compte » utilise deElision');
  const enonces = ['faces', 'faces plates', 'sommets', 'arêtes'].map(l => `Combien ${de(l)} a le cube ?`);
  const mauvais = enonces.filter(t => violations(t, 'M36').length);
  ok(mauvais.length === 0, 'M36 : les 4 libellés comptés produisent un énoncé correct', mauvais);
  console.log('     ex. : ' + enonces.join('  |  '));
}

// ---------- ACCORD : le participe suit le genre de la donnée ----------
/* Le défaut typique : « Combien d’oiseaux as-tu comptéES ? ». On produit
   l'énoncé pour CHAQUE espèce et on vérifie que la terminaison correspond au
   genre déclaré — un masculin ajouté demain dans une table jusque-là toute
   féminine ferait ressortir la faute ici. */
for (const [nom, fichier, gabarit] of [
  ['M39', 'M39-tableaux-diagrammes.html',
    (de, ac, e) => 'Combien ' + de(e.pluriel) + ' ' + (e.emoji || '') + ' as-tu ' + ac('compté', e.genre) + ' ?'],
  ['M01', 'M01-nombres-jusqu-9-cp.html',
    (de, ac, e) => 'Combien ' + de(e.pluriel) + ' as-tu ' + ac('compté', e.genre) + ' ? Appuie sur le bon nombre.']
]) {
  const src = fs.readFileSync('/home/user/mayeutik/jeux/' + fichier, 'utf8');
  const de = extraireDeElision(src);
  const ac = extraireFonction(src, 'accordePluriel');
  ok(!!ac, `${nom} : accordePluriel présent dans le fichier`);
  ok(/as-tu '? *\+? *accordePluriel|as-tu \$\{accordePluriel/.test(src),
    `${nom} : l'invite de comptage accorde le participe`);
  const json = donneesJSON(src);
  const especes = Object.values(json.especes || {});
  ok(especes.every(e => e.genre === 'm' || e.genre === 'f'),
    `${nom} : toutes les espèces déclarent un genre`,
    especes.filter(e => !e.genre).map(e => e.singulier));
  const mauvais = [];
  especes.forEach(e => {
    const t = gabarit(de, ac, e);
    const feminin = /comptées/.test(t);
    if (feminin !== (e.genre === 'f')) mauvais.push(t + '   (genre ' + e.genre + ')');
    if (violations(t, nom).length) mauvais.push('élision : ' + t);
  });
  ok(mauvais.length === 0, `${nom} : ${especes.length} énoncés de comptage, élision ET accord corrects`, mauvais);
  console.log('     ex. : ' + especes.slice(0, 2).map(e => gabarit(de, ac, e)).join('  |  '));
}

// ---------- TYPOGRAPHIE : apostrophe droite bannie des textes ----------
{
  const LETTRE = 'A-Za-zÀ-ÖØ-öø-ÿ';
  const restes = [];
  for (const f of fs.readdirSync('/home/user/mayeutik/jeux').filter(n => n.endsWith('.html'))) {
    const src = fs.readFileSync('/home/user/mayeutik/jeux/' + f, 'utf8');
    const re = new RegExp(`[${LETTRE}]'[${LETTRE}]`, 'g');
    const m = src.match(re);
    if (m) restes.push(f + ' : ' + m.slice(0, 3).join(', '));
  }
  ok(restes.length === 0, "Typographie : apostrophe typographique ’ partout dans les jeux", restes);
}

console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
process.exit(echecs === 0 ? 0 : 1);
