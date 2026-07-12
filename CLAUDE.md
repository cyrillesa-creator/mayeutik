# Instructions de travail — dépôt Mayeutik

## Workflow git

- Committer et pousser DIRECTEMENT sur `main`, sans créer de branche ni de pull request, sauf demande contraire explicite.
- Messages de commit courts en français, préfixés par l'ID du module concerné quand il y en a un (ex : "M17: corrige la graduation").
- Si l'utilisateur signale qu'une version fusionnée est cassée, proposer un `git revert` du commit fautif.

## Références du projet

- `CHARTE.md` : design system et contrat de données — à respecter dans chaque jeu.
- `PRODUIT.md` : décisions produit (modules E, radar, PWA, etc.).
- Convention de nommage : `jeux/M<numéro>-<slug>.html` et `jeux/E-<niveau>-<numéro>.html`.

## Qualité

- Vérifier la syntaxe JS (absence d'erreur console) avant de committer.
- Ne jamais introduire de dépendance réseau dans les jeux (fichiers autonomes).
