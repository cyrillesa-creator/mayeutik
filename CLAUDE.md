# Instructions de travail — dépôt Mayeutik

## Workflow git

- Committer et pousser DIRECTEMENT sur `main`, sans créer de branche ni de pull request, sauf demande contraire explicite.
- Messages de commit courts en français, préfixés par l'ID du module concerné quand il y en a un (ex : "M17: corrige la graduation").
- Si l'utilisateur signale qu'une version fusionnée est cassée, proposer un `git revert` du commit fautif.

## Références du projet

- `CHARTE.md` : design system et contrat de données — à respecter dans chaque jeu.
- `PRODUIT.md` : décisions produit (modules E, radar, PWA, etc.).
- `pilotage/backlog.json` : référence vivante du backlog des 41 modules (domaine, sous-thème, années couvertes, statut, effort, notes), issue du fichier de pilotage `Pilotage_Maths_Cycle2_v3.xlsx` — à consulter avant toute tâche de production ou de modification touchant le référentiel, la numérotation des modules, ou leur classification par domaine/sous-thème. Après toute modification touchant un module (nouveau jeu livré, statut changé, renommage), mettre à jour l'entrée correspondante dans `pilotage/backlog.json` dans la foulée.
- Convention de nommage : `jeux/M<numéro>-<slug>.html` et `jeux/E-<niveau>-<numéro>.html`.

## Qualité

- Vérifier la syntaxe JS (absence d'erreur console) avant de committer.
- Ne jamais introduire de dépendance réseau dans les jeux (fichiers autonomes).
- `outils/tests/` : les suites de test, **versionnées avec le code qu'elles
  rattrapent**. `node outils/tests/lancer.js` les joue toutes (~14 min) ;
  `node outils/tests/lancer.js m38` n'en joue qu'une ; `--tout` ajoute les
  suites mises de côté pour leur durée, que le compte final nomme toujours.
  Ce qui dépend de la machine — racine du dépôt, Playwright, Chromium — vient
  de `socle.js`, jamais d'un chemin écrit en dur. Elles ont vécu dans un
  répertoire de travail hors dépôt et ont été effacées deux fois par un
  redémarrage de conteneur — ce sont pourtant elles qui ont trouvé les manches
  infaillibles du pochoir, le blocage dès la deuxième manche et les
  instruments jamais déplaçables. Toute suite nouvelle va là, jamais ailleurs.
  `outils/tests/_tri/` est le reliquat de ce sauvetage : des suites qui
  échouent encore, décrites une par une dans `_tri/RESTE.md` — un échec y dit
  seulement qu'il reste à savoir si c'est le test qui est périmé ou le code
  qui est cassé.
- Les propriétés corrigées se verrouillent par une **mutation** : casser la
  correction dans le code doit faire rougir un test. Une mutation qui reste
  verte signale un test aveugle, ou un mutant équivalent — et alors c'est le
  code redondant qu'on retire, pas le test qu'on affaiblit.

## Langue : élision obligatoire dans les énoncés générés

Les jeux **assemblent** leurs énoncés (« Combien de » + un mot venu d'une table
de données). Dès qu'un mot variable suit un mot élidable, l'élision doit être
calculée, jamais écrite en dur — sinon on produit « Combien de arêtes »,
« de escargots », « de abeilles ».

Mots concernés devant voyelle ou h muet : **de → d'**, **le/la → l'**,
**ce → cet**, **que → qu'**, **ne → n'**, **je → j'**, **me/te/se**.

Règle de production : dans un gabarit d'énoncé, **aucun mot élidable ne doit
précéder directement une variable**. Utiliser un utilitaire — plusieurs jeux en
ont déjà un, à reprendre tel quel :

```js
function deElision(mot){
  return /^[aeiouyàâäéèêëïîôöùûü]/i.test(mot) ? "d’" + mot : "de " + mot;
}
// `Combien ${deElision(libelle)} a ${solide.nom} ?`  et NON  `Combien de ${libelle} …`
```

Vaut aussi pour l'article défini (`l’arbre` / `le camion` — cf.
`nommerAvecArticle` dans M23).

## Langue : accord en genre et en nombre

Même piège, même cause : un mot **accordable** placé près d'une variable doit
être calculé à partir de la donnée, jamais figé. Défaut déjà rencontré :
« Combien d’oiseaux as-tu **comptées** ? ».

Cas à surveiller dans un gabarit :

- **participe passé** avec le COD placé avant (« combien d’escargots as-tu
  compt**és** ? » / « d’abeilles as-tu compt**ées** ? ») ;
- **article et adjectif** qui encadrent la variable (`le`/`la`, `un`/`une`,
  `tous`/`toutes`, `quel`/`quelle`) ;
- **singulier / pluriel** quand la quantité est variable (`n > 1 ? pluriel :
  singulier` — cf. M01 « Fais glisser exactement 1 escargot »).

Toute table de données décrivant un nom commun porte donc un champ **`genre`**
(`"m"` / `"f"`) et, quand les deux formes servent, `singulier` et `pluriel` :

```js
{"emoji":"🐌","singulier":"escargot","pluriel":"escargots","genre":"m"}

function accordePluriel(base, genre){ return base + (genre === 'f' ? 'es' : 's'); }
// `… as-tu ${accordePluriel('compté', espece.genre)} ?`
```

## Langue : contrôle et typographie

À contrôler **à chaque fois qu'une série de questions est créée ou modifiée**,
en générant les énoncés et en les relisant, pas seulement en lisant le gabarit :
c'est la donnée qui révèle le défaut — un mot masculin ajouté demain dans une
table qui n'en contenait aucun fait apparaître la faute.

Deux outils versionnés :

- `outils/lint-elision.js` — balaie les chaînes littérales de tous les jeux ;
- `outils/verif-elision-gabarits.js` — applique les gabarits aux **vraies**
  données et relit les énoncés produits (élision **et** accord).

Typographie : **apostrophe typographique `’` partout** dans les textes affichés
(et dans les chaînes JS qui les composent), jamais l'apostrophe droite `'`,
réservée aux délimiteurs de chaîne et aux identifiants.
