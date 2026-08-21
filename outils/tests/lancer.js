#!/usr/bin/env node
/*
 * LANCE TOUTES LES SUITES et rend un compte unique.
 *
 * Une suite par module ou par moteur, chacune autonome : on peut n’en jouer
 * qu’une pendant qu’on travaille dessus (`node outils/tests/lancer.js m38`),
 * et les jouer toutes avant de committer. Le code de sortie vaut 1 dès qu’une
 * seule échoue, pour qu’un enchaînement s’arrête tout seul.
 */
'use strict';
const {execFileSync} = require('child_process');
const fs = require('fs'), path = require('path');

/* LES SUITES TRÈS LONGUES SONT MISES DE CÔTÉ, PAS AFFAIBLIES. Celle-ci
   échantillonne les énoncés RENDUS À L’ÉCRAN, une navigation par tirage : sa
   force vient précisément de son nombre de tirages, et la raccourcir la
   viderait. Mais vingt minutes dans le lot, c’est un filet qu’on cesse de
   lancer — et un filet qu’on ne lance plus ne rattrape rien. Elle est donc
   nommée à chaque exécution, jouée sur demande (`lancer.js langue`) et par
   `--tout`, jamais oubliée en silence. Ajouter un nom ici est une décision
   sur le RYTHME, pas sur la couverture. */
const LENTES = ['langue-elision-interface.js'];

const ici = __dirname;
const filtre = process.argv.slice(2).find(a => a !== '--tout');
const tout = process.argv.includes('--tout');
const toutes = fs.readdirSync(ici)
  .filter(f => /\.js$/.test(f) && f !== 'socle.js' && f !== 'lancer.js')
  .filter(f => !filtre || f.indexOf(filtre) >= 0)
  .sort();
/* Une lente nommée explicitement est jouée : c’est bien elle qu’on demande. */
const suites = toutes.filter(f => tout || filtre || LENTES.indexOf(f) < 0);
const misesDeCote = toutes.filter(f => suites.indexOf(f) < 0);

let duree = 0, total = 0, echecs = 0;
for (const f of suites) {
  const t0 = Date.now();
  let sortie = '';
  try { sortie = execFileSync('node', [path.join(ici, f)], {encoding:'utf8', timeout:1800000}); }
  catch (e) { sortie = (e.stdout || '') + (e.stderr || ''); }
  const s = Date.now() - t0; duree += s;
  const m = sortie.match(/(\d+) OK, (\d+) KO/);
  const bon = /EXIT:SUCCES|TOUT OK/.test(sortie);
  if (m) { total += +m[1]; echecs += +m[2]; }
  if (!bon && !echecs) echecs = 1;
  console.log((bon ? '  ✔ ' : '  ✘ ') + f.replace(/\.js$/, '').padEnd(26)
    + (m ? (m[1] + ' OK, ' + m[2] + ' KO').padEnd(18) : ''.padEnd(18))
    + (s/1000).toFixed(1) + ' s');
  if (!bon) sortie.split('\n').filter(l => /^KO|^✗/.test(l)).slice(0, 6).forEach(l => console.log('      ' + l));
}
console.log('\n' + suites.length + ' suite(s), ' + total + ' assertion(s), '
  + echecs + ' échec(s), ' + (duree/1000).toFixed(0) + ' s au total.');
if (misesDeCote.length) console.log('Mise(s) de côté pour leur durée, à jouer par leur nom ou avec --tout : '
  + misesDeCote.map(f => f.replace(/\.js$/, '')).join(', '));
process.exit(echecs ? 1 : 0);
