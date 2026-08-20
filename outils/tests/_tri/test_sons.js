const fs = require('fs');
const vm = require('vm');

let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };

/* Les fonctions sonores vivent dans l'IIFE de chaque module : elles ne sont pas
   joignables depuis l'extérieur, et je ne veux pas ajouter de crochet de test
   dans le code livré. On EXTRAIT donc leur source telle qu'elle est écrite dans
   le fichier, et on l'exécute dans un bac à sable avec un AudioContext espion :
   c'est bien le code expédié qui est éprouvé, et le graphe audio relevé est
   exactement celui que produira le navigateur. */
function extraireDeclaration(source, nom) {
  const motifs = [
    new RegExp('\\n\\s*function ' + nom + '\\s*\\('),
    new RegExp('\\n\\s*const ' + nom + '\\s*=')
  ];
  for (const motif of motifs) {
    const m = motif.exec(source);
    if (!m) continue;
    const debut = m.index + 1;
    if (m[0].includes('const')) {
      const fin = source.indexOf(';', debut);
      return source.slice(debut, fin + 1);
    }
    let i = source.indexOf('{', debut), prof = 0;
    while (i < source.length) {
      if (source[i] === '{') prof++;
      else if (source[i] === '}') { prof--; if (prof === 0) break; }
      i++;
    }
    return source.slice(debut, i + 1);
  }
  return null;
}

const NOMS = ['jouerNote', 'NOTES_BONNE_REPONSE', 'NOTES_NIVEAU_PARFAIT', 'ACCORD_NIVEAU_PARFAIT',
              'sonBonneReponse', 'sonNiveauParfait', 'sonErreur', 'sonTic', 'sonCritique', 'jouerSon'];

function bacASable(chemin) {
  const source = fs.readFileSync(chemin, 'utf8');
  const morceaux = NOMS.map((n) => extraireDeclaration(source, n)).filter(Boolean);
  const notes = [];
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume() {},
    createOscillator() {
      const note = { freq: null, type: 'sine', debut: null, fin: null };
      notes.push(note);
      return {
        set type(v) { note.type = v; }, get type() { return note.type; },
        frequency: { set value(v) { note.freq = v; }, get value() { return note.freq; } },
        connect(n) { return n; },
        start(t) { note.debut = t; },
        stop(t) { note.fin = t; }
      };
    },
    createGain() {
      return {
        gain: { setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } },
        connect(n) { return n; }
      };
    }
  };
  const bac = {
    notes,
    obtenirContexteAudio: () => ctx,
    actx: ctx,
    window: { AudioContext: function () { return ctx; }, webkitAudioContext: undefined },
    console
  };
  vm.createContext(bac);
  vm.runInContext(morceaux.join('\n\n'), bac);
  return bac;
}

function resume(bac, appel) {
  bac.notes.length = 0;
  vm.runInContext(appel, bac);
  const n = bac.notes.filter((x) => x.freq !== null && x.debut !== null);
  if (!n.length) return null;
  const debut = Math.min(...n.map((x) => x.debut));
  const fin = Math.max(...n.map((x) => x.fin));
  const parInstant = {};
  n.forEach((x) => { const k = x.debut.toFixed(3); parInstant[k] = (parInstant[k] || 0) + 1; });
  return {
    nbNotes: n.length,
    duree: +(fin - debut).toFixed(3),
    freqMax: Math.max(...n.map((x) => x.freq)),
    polyphonieMax: Math.max(...Object.values(parInstant)),
    freqs: n.map((x) => Math.round(x.freq)).join(',')
  };
}

const MODULES = ['M01-nombres-jusqu-9-cp', 'M17-fractions-ce2', 'M23-longueurs',
                 'M36-solides', 'M39-tableaux-diagrammes', 'M99-boss-des-tables'];

const empreintesBonne = new Set(), empreintesParfait = new Set();

for (const m of MODULES) {
  const bac = bacASable(`/home/user/mayeutik/jeux/${m}.html`);
  const bonne = resume(bac, 'sonBonneReponse()');
  const parfait = resume(bac, 'sonNiveauParfait()');

  ok(bonne && bonne.nbNotes === 4, `${m} — bonne réponse : 4 notes`, bonne && bonne.freqs);
  ok(bonne && bonne.duree < 1, `${m} — bonne réponse : moins d'une seconde`, bonne && bonne.duree + ' s');
  ok(parfait && parfait.duree >= 1 && parfait.duree <= 2,
    `${m} — 3 étoiles : entre 1 et 2 secondes`, parfait && parfait.duree + ' s');
  ok(parfait && bonne && parfait.duree > bonne.duree * 1.5,
    `${m} — 3 étoiles nettement plus long`, parfait && bonne && `${parfait.duree} s contre ${bonne.duree} s`);
  ok(parfait && bonne && parfait.freqMax > bonne.freqMax,
    `${m} — 3 étoiles monte plus haut`, parfait && bonne && `${Math.round(parfait.freqMax)} Hz contre ${Math.round(bonne.freqMax)} Hz`);
  ok(parfait && bonne && parfait.polyphonieMax >= 3 && bonne.polyphonieMax === 1,
    `${m} — 3 étoiles finit sur un accord, la bonne réponse reste monodique`,
    parfait && bonne && `${parfait.polyphonieMax} voix contre ${bonne.polyphonieMax}`);

  if (bonne) empreintesBonne.add(bonne.freqs + '|' + bonne.duree);
  if (parfait) empreintesParfait.add(parfait.freqs + '|' + parfait.duree);
}

ok(empreintesBonne.size === 1, 'Le son de bonne réponse est IDENTIQUE dans les 6 modules',
  Array.from(empreintesBonne).join('  //  '));
ok(empreintesParfait.size === 1, 'Le son de 3 étoiles est IDENTIQUE dans les 6 modules',
  Array.from(empreintesParfait).join('  //  '));

// ---- L'aiguillage historique reste opérationnel là où il existe ----
for (const m of ['M01-nombres-jusqu-9-cp', 'M23-longueurs', 'M99-boss-des-tables']) {
  const bac = bacASable(`/home/user/mayeutik/jeux/${m}.html`);
  const viaBravo = resume(bac, "jouerSon('bravo')");
  const direct = resume(bac, 'sonBonneReponse()');
  ok(viaBravo && direct && viaBravo.freqs === direct.freqs,
    `${m} — jouerSon('bravo') joue bien le son de référence`);
  const rate = resume(bac, "jouerSon('rate')");
  ok(rate && rate.nbNotes === 2 && rate.freqMax < 500,
    `${m} — jouerSon('rate') : motif d'erreur descendant`, rate && rate.freqs);
  const tic = resume(bac, "jouerSon('tic')");
  ok(tic && tic.nbNotes === 1, `${m} — jouerSon('tic') : clic bref`, tic && tic.freqs);
}
{ // M36 conserve ses noms historiques
  const bac = bacASable('/home/user/mayeutik/jeux/M36-solides.html');
  const source = fs.readFileSync('/home/user/mayeutik/jeux/M36-solides.html', 'utf8');
  ok(/function sonBravo\(\)\{ sonBonneReponse\(\); \}/.test(source),
    'M36 — sonBravo() est devenu un alias du son de référence');
  ok(/function sonRate\(\)\{ sonErreur\(\); \}/.test(source),
    'M36 — sonRate() est devenu un alias du son d\'erreur');
}

// ---- Le son de 3 étoiles est bien DÉCLENCHÉ à 3 étoiles, et seulement là ----
for (const m of MODULES) {
  const source = fs.readFileSync(`/home/user/mayeutik/jeux/${m}.html`, 'utf8');
  const appels = (source.match(/sonNiveauParfait\(\)/g) || []).length;
  const conditionne = /(etoilesGagnees === 3|n === 3)[^\n]*\n?[^\n]*sonNiveauParfait\(\)|if\s*\(\s*(etoilesGagnees === 3|n === 3)\s*\)\s*\{?\s*sonNiveauParfait\(\)/.test(source)
    || /(etoilesGagnees === 3|n === 3)/.test(source.slice(Math.max(0, source.indexOf('sonNiveauParfait()') - 400), source.indexOf('sonNiveauParfait()')));
  ok(appels >= 2, `${m} — sonNiveauParfait est défini ET appelé`, appels + ' occurrences');
  ok(conditionne, `${m} — l'appel est bien conditionné aux 3 étoiles`);
}

console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
process.exit(echecs === 0 ? 0 : 1);
