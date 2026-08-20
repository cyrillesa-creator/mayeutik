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

const ici = __dirname;
const suites = fs.readdirSync(ici)
  .filter(f => /\.js$/.test(f) && f !== 'socle.js' && f !== 'lancer.js')
  .filter(f => !process.argv[2] || f.indexOf(process.argv[2]) >= 0)
  .sort();

let duree = 0, total = 0, echecs = 0;
for (const f of suites) {
  const t0 = Date.now();
  let sortie = '';
  try { sortie = execFileSync('node', [path.join(ici, f)], {encoding:'utf8', timeout:900000}); }
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
process.exit(echecs ? 1 : 0);
