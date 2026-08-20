const {execFileSync} = require('child_process');
const fs = require('fs'), path = require('path');
const ici = __dirname;
const fichiers = fs.readdirSync(ici).filter(f => /\.js$/.test(f) && f !== 'trier.js').sort();
const bilan = [];
for (const f of fichiers) {
  const t0 = Date.now();
  let out = '', code = 0;
  try { out = execFileSync('node', [path.join(ici, f)], {encoding:'utf8', timeout:180000, cwd:ici}); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); code = e.status || 1; }
  const m = out.match(/(\d+) OK, (\d+) KO/);
  const bon = /EXIT:SUCCES|TOUT OK/.test(out) || (code === 0 && m && +m[2] === 0);
  const premierKO = (out.split('\n').find(l => /^KO|^✗|^Error|Cannot find/.test(l)) || '').slice(0, 90);
  bilan.push({f, bon, ok:m ? +m[1] : null, ko:m ? +m[2] : null,
              s:((Date.now()-t0)/1000).toFixed(0), motif:bon ? '' : premierKO});
  console.log((bon ? 'PASSE  ' : 'ÉCHOUE ') + f.padEnd(34)
    + (m ? (m[1] + '/' + (+m[1] + +m[2])).padEnd(10) : ''.padEnd(10))
    + bilan[bilan.length-1].s + 's  ' + bilan[bilan.length-1].motif);
}
fs.writeFileSync(path.join(ici, 'bilan.json'), JSON.stringify(bilan, null, 1));
console.log('\n' + bilan.filter(b => b.bon).length + ' passent, ' + bilan.filter(b => !b.bon).length + ' échouent.');
