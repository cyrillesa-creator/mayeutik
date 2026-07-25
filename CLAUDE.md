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
