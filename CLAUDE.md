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
  return /^[aeiouyàâäéèêëïîôöùûü]/i.test(mot) ? "d'" + mot : "de " + mot;
}
// `Combien ${deElision(libelle)} a ${solide.nom} ?`  et NON  `Combien de ${libelle} …`
```

Vaut aussi pour l'article défini (`l'arbre` / `le camion` — cf.
`nommerAvecArticle` dans M23) et pour l'accord en genre et en nombre des mots
qui entourent la variable.

À contrôler **à chaque fois qu'une série de questions est créée ou modifiée**,
en générant les énoncés et en les relisant, pas seulement en lisant le gabarit :
c'est la donnée qui révèle le défaut. Le script
`scratchpad/lint_elision_runtime.js` fait ce balayage (chaînes littérales +
énoncés produits à l'exécution).
