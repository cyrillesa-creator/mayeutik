/* Vérifie les gabarits CORRIGÉS en les appliquant aux VRAIES données du jeu :
   on extrait du source la fonction deElision de chaque fichier et sa table de
   données, puis on produit l'énoncé exactement comme le jeu le ferait.
   Plus fiable qu'une marche dans l'interface, qui n'atteint pas toujours
   l'écran où l'énoncé s'affiche. */
const fs = require('fs');
const { violations } = require('./lint_elision.js');
let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : JSON.stringify(x)); if (!c) echecs++; };

/* Extraction par ÉQUILIBRAGE des accolades : la fonction tient parfois sur une
   seule ligne (M01), et un `}` peut apparaître dans un littéral de gabarit —
   une regex paresseuse s'arrêterait trop tôt. */
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
      enonces.push('Combien ' + de(e.pluriel) + ' ' + (e.emoji || '') + ' as-tu comptées ?');
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
  ok(de('abeilles').startsWith("d'") && de('étoiles').startsWith("d'") && de('bonbons') === 'de bonbons',
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

console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
process.exit(echecs === 0 ? 0 : 1);
