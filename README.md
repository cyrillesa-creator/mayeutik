# mayeutik
Series of standalone HTML educational games for French primary school.

## Structure du projet

```
.
├── CHARTE.md   # Design system commun à tous les jeux (police, couleurs, thème, confettis, sons, etc.)
├── jeux/       # Un fichier HTML autonome par jeu (aucune dépendance de build)
└── README.md
```

Chaque jeu du dossier `jeux/` est un fichier HTML unique (HTML + CSS + JS), sans étape de build ni dépendance externe autre que la police Google Fonts. Il respecte le design system décrit dans [`CHARTE.md`](./CHARTE.md).

## Convention de nommage

Les fichiers de `jeux/` suivent le format :

```
M<numéro>-<slug-du-jeu>.html
```

- `M<numéro>` : numéro du module/thème pédagogique sur deux chiffres (`M06`, `M12`...).
- `<slug-du-jeu>` : nom du jeu en minuscules, mots séparés par des tirets, sans accents.

Exemple : `M06-complements-a-10.html` pour le module 6, jeu "compléments à 10".
