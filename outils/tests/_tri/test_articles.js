const fs = require('fs');
let echecs = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : '✗    ') + m, x === undefined ? '' : x); if (!c) echecs++; };
const src = fs.readFileSync('/home/user/mayeutik/jeux/M23-longueurs.html', 'utf8');

// 1. Plus aucune parenthèse explicative : la reformulation la remplace.
ok(!/en vrai, pas sur le dessin/.test(src), '1. La parenthèse « en vrai, pas sur le dessin » a disparu');

// 2. Les questions d'UNITÉ portent toutes un article indéfini.
const unites = (src.match(/\{ texte: "(La (?:hauteur|largeur|longueur|distance)[^"]*s'exprime en…)"/g) || [])
  .map((s) => s.match(/"([^"]*)"/)[1]);
ok(unites.length === 12, '2. Les 12 énoncés d\'unité sont bien lus', unites.length);
const fautifs = unites.filter((t) => /\b(du|de la|de l')\s/.test(t) && !/^La distance/.test(t));
ok(fautifs.length === 0, '3. Aucun énoncé d\'objet ne garde d\'article défini', fautifs);
const objets = unites.filter((t) => !/^La distance/.test(t));
ok(objets.length === 8 && objets.every((t) => /d'(un|une)\s/.test(t)),
  '4. Les 8 énoncés d\'objet emploient « d\'un »/« d\'une »', objets);

// 3. Les énoncés d'ESTIMATION (CP) et d'ANIMAUX (CE2) étaient déjà indéfinis.
const estim = (src.match(/"texte": "(Un[e]? [^"]*mesure plutôt…)"/g) || []).length;
ok(estim === 6, '5. CP — les 6 estimations sont déjà en article indéfini', estim);
const animaux = (src.match(/texte: "Quelle est la taille d'un[e]? [^"]*"/g) || []).length;
ok(animaux === 5, '6. CE2 — les 5 questions animaux sont déjà en article indéfini', animaux);

/* 4. Les COMPARAISONS doivent GARDER l'article défini : la question y porte
      justement sur les deux objets dessinés, pas sur une grandeur typique. */
ok(/est plus _____ /.test(src) && /libelleCouleur\(couleurCible\)/.test(src),
  '7. Les comparaisons désignent toujours les objets affichés (article défini conservé)');
ok(/quelle est la longueur de cette brindille/.test(src),
  '8. La lecture de règle garde « cette brindille » : on mesure bien l\'objet dessiné');

console.log(echecs === 0 ? '\nTOUT OK' : `\n${echecs} PROBLÈME(S)`);
process.exit(echecs === 0 ? 0 : 1);
