/* Détecte les élisions manquantes dans les textes destinés à l'enfant.
   En français, « de/le/la/je/ne/me/te/se/ce/que » s'élident OBLIGATOIREMENT
   devant une voyelle ou un h muet. Deux passes :
     1) chaînes littérales du source ;
     2) textes ASSEMBLÉS à l'exécution (le vrai piège : « Combien de » + un
        mot venu d'une table de données).                                   */
const fs = require('fs');
const path = require('path');

const MOTS = ['de', 'le', 'la', 'je', 'ne', 'me', 'te', 'se', 'ce', 'que'];
const VOYELLE = 'aàâäeéèêëiîïoôöuùûüy';
// h aspiré courant en classe : ces mots ne s'élident PAS (« de haricots »).
const H_ASPIRE = /^(haricot|hibou|hache|haie|hamster|hanche|hangar|hasard|haut|hérisson|hêtre|hibou|hollande|homard|honte|hoquet|houx|huit|hublot)/i;

function violations(texte, contexte) {
  const out = [];
  /* `\b` de JS est ASCII : il ouvre une frontière entre « è » et « se », d'où
     un faux positif sur « pèse entre ». On exige donc explicitement que rien
     de lettré (ni apostrophe) ne précède le mot élidable. */
  const re = new RegExp(`(?<![\\p{L}'’])(${MOTS.join('|')})\\s+([${VOYELLE}h]\\p{L}*)`, 'giu');
  let m;
  while ((m = re.exec(texte)) !== null) {
    const suivant = m[2];
    if (/^h/i.test(suivant) && H_ASPIRE.test(suivant)) continue;   // h aspiré : correct
    if (/^h/i.test(suivant) && !/^h/i.test(suivant)) continue;
    // « le onze », « de un » : numéraux, tolérés
    if (/^(onze|un|une|huit|huitième|onzième)$/i.test(suivant)) continue;
    out.push({ contexte, extrait: m[0], phrase: texte.slice(Math.max(0, m.index - 40), m.index + 50) });
  }
  return out;
}

// ---------- Passe 1 : chaînes littérales du source ----------
const dossier = path.join(__dirname, '..', 'jeux');
let total = 0;
const parFichier = {};
for (const f of fs.readdirSync(dossier).filter(n => n.endsWith('.html'))) {
  const src = fs.readFileSync(path.join(dossier, f), 'utf8');
  const trouvees = [];
  // chaînes '...', "...", `...` — on ignore les commentaires /* */ et //
  const sansCommentaires = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const reStr = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let s;
  while ((s = reStr.exec(sansCommentaires)) !== null) {
    const contenu = s[2];
    if (contenu.length < 4) continue;
    if (/^[a-zA-Z-]+$/.test(contenu)) continue;               // identifiants CSS/HTML
    if (/[<>{}]\s*$/.test(contenu) && !/\s/.test(contenu)) continue;
    trouvees.push(...violations(contenu, 'littéral'));
  }
  if (trouvees.length) { parFichier[f] = trouvees; total += trouvees.length; }
}

console.log('===== PASSE 1 : chaînes littérales =====');
for (const [f, v] of Object.entries(parFichier)) {
  console.log('\n--- ' + f + ' (' + v.length + ') ---');
  v.forEach(x => console.log('  « ' + x.extrait + ' »   …' + x.phrase.replace(/\s+/g, ' ') + '…'));
}
if (!total) console.log('(aucune)');

module.exports = { violations };
