# Évaluations Repères — Éducation nationale

## Source officielle

[L'évaluation des acquis des élèves en CP, CE1, CE2, CM1 et CM2 : fiches descriptives des exercices Repères](https://www.education.gouv.fr/l-evaluation-des-acquis-des-eleves-en-cp-ce1-ce2-cm1-et-cm2-fiches-descriptives-des-exercices-342046), Ministère de l'Éducation nationale.

**Date de récupération tentée : 2026-07-07.**

## ⚠️ Récupération bloquée par la politique réseau de l'environnement

La récupération automatique **a échoué de façon totale**, pas seulement partielle : le domaine `education.gouv.fr` (et son sous-domaine `eduscol.education.gouv.fr`) est **bloqué au niveau de la politique d'accès réseau de cet environnement d'exécution**, avant même l'établissement de la connexion HTTPS. Cela empêche non seulement le téléchargement des PDF, mais aussi la simple **lecture de la page index** listant les liens (étape 1 de la tâche).

### Détail technique du blocage

Chaque tentative de connexion à ces domaines échoue avec un rejet `403` au niveau du tunnel `CONNECT` du proxy sortant de l'environnement (avant même que la requête HTTPS n'atteigne le site) :

| URL testée | Résultat |
|---|---|
| `https://www.education.gouv.fr/l-evaluation-des-acquis-des-eleves-en-cp-ce1-ce2-cm1-et-cm2-fiches-descriptives-des-exercices-342046` | `403` — CONNECT tunnel rejeté par le proxy (`gateway answered 403 to CONNECT (policy denial or upstream failure)`) |
| `https://eduscol.education.gouv.fr/sites/default/files/document/25cppspdf-112104.pdf` | `403` — idem |
| `https://www.education.gouv.fr/sites/default/files/document/Fiche%20%C3%A9valuation%20rep%C3%A8res%20CE2%20:%20Placer%20un%20nombre%20sur%20une%20ligne%20gradu%C3%A9e-403422.pdf` | `403` — idem |

Ce diagnostic a été confirmé par deux voies indépendantes : un appel `curl` direct (via le proxy sortant de l'environnement) et l'outil de récupération web de l'agent — les deux renvoient un rejet `403` avant tout contenu de page. Ce n'est donc pas un blocage anti-robot du site du ministère, mais une restriction réseau propre à cet environnement d'exécution.

### Ce qui a quand même pu être fait

En l'absence d'accès direct à la page index, une recherche web ciblée a permis d'identifier **le format exact et une URL réelle** d'une fiche individuelle (fournie à titre d'exemple dans `index.json`) :

- **CE2 — Placer un nombre sur une ligne graduée** (mathématiques)
  `https://www.education.gouv.fr/sites/default/files/document/Fiche%20%C3%A9valuation%20rep%C3%A8res%20CE2%20:%20Placer%20un%20nombre%20sur%20une%20ligne%20gradu%C3%A9e-403422.pdf`

Cette URL est elle aussi inaccessible depuis cet environnement pour la même raison (domaine bloqué), et n'a donc **pas** pu être téléchargée. Elle est listée dans `index.json` avec `"telecharge": false`.

La recherche web n'a pas permis de reconstituer une liste fiable et complète des fiches par thème pour chaque niveau (CP, Point d'étape CP, CE1, CE2, CM1, CM2) : seule la page index elle-même contient l'énumération exhaustive, et elle est inaccessible. **Aucune fiche n'a donc été inventée** dans `index.json` : n'y figure que ce qui a pu être vérifié par une source réelle.

### Structure préparée en attendant

Les dossiers par niveau ont été créés (vides, avec un `.gitkeep`) pour accueillir les fiches une fois la récupération possible :

```
ressources/evaluations-reperes/
├── cp/
├── cp-point-etape/
├── ce1/
├── ce2/
├── cm1/
├── cm2/
├── index.json
└── README.md
```

### Comment débloquer

- Relancer cette récupération depuis un environnement ayant un accès réseau non restreint à `education.gouv.fr` et `eduscol.education.gouv.fr` (par exemple, en local, ou après ajout de ces domaines à la liste d'autorisation de l'environnement Claude Code utilisé).
- Une fois la page index accessible, reprendre les 4 étapes prévues : extraction de tous les liens PDF, téléchargement et rangement dans `<niveau>/<theme>.pdf` (noms normalisés en minuscules, sans accents ni espaces), puis mise à jour complète de `index.json`.
