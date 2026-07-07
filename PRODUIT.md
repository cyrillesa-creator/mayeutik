# Décisions produit — Mayeutik

Ce document consigne les décisions produit de la série Mayeutik (au-delà du design system, décrit dans [`CHARTE.md`](./CHARTE.md)). Il sert de référence pour arbitrer les futures évolutions sans les rediscuter à chaque fois.

---

## Forme du produit

**V1** : une **coquille PWA** regroupant les jeux — écran d'accueil, index par niveau × matière × thème, progression centralisée, profils multi-enfants. Les jeux eux-mêmes restent des **modules HTML autonomes** (cf. CHARTE.md), inchangés dans leur fonctionnement.

**V2** :
- Empaquetage **Capacitor** pour publication sur les stores (App Store / Play Store).
- Fonctionnalité **"photo de la leçon"** : l'enfant (ou le parent) prend une photo du cahier de leçon, une API de vision identifie le thème abordé, et l'app propose le jeu Mayeutik correspondant.

**Architecture** : local-first à toutes les étapes. Tout doit fonctionner sans compte ni serveur ; le cloud (sauvegarde, synchronisation multi-appareils...) sera **optionnel**, jamais un prérequis.

---

## Tableau de bord parental

- **Terminologie et échelle** : reprend telle quelle celle définie dans le contrat de données de CHARTE.md (échelle LSU : Non travaillé / Objectifs non atteints / Partiellement atteints / Atteints / Dépassés).
- **Visualisation principale** : un **diagramme en toile d'araignée (radar)**, dans l'esprit des restitutions des évaluations nationales. Deux niveaux de lecture :
  1. Un **radar de synthèse** à **4 axes** (les 4 domaines du programme 2024).
  2. Pour chaque domaine, un **radar détaillé par compétence** (**8 axes maximum** par radar, au-delà on scinde en plusieurs radars).
  
  Valeur radiale portée sur chaque axe :

  | Statut | Valeur |
  |---|---|
  | Non travaillé | 0 |
  | Objectifs non atteints | 1 |
  | Partiellement atteints | 2 |
  | Atteints | 3 |
  | Dépassés | 4 |

- **Recommandations** : le tableau de bord met en avant, en priorité, les compétences "à consolider" (Objectifs non atteints), puis "en cours" (Partiellement atteints) — en commençant par les **plus anciennes** (celles où l'enfant n'a pas joué depuis le plus longtemps) — et suggère les jeux correspondants.
- **Mention obligatoire**, affichée sur toute vue parentale : *« positionnement indicatif basé sur les jeux, inspiré de l'échelle du livret scolaire »*. Ce n'est en aucun cas une évaluation scolaire officielle.

---

## Évaluations Repères (Éducation nationale)

Les fiches officielles **"Évaluations Repères"** (publiées par niveau et par thème) servent de **référence d'étalonnage** pour les compétences qui en disposent.

Quand une fiche existe pour une compétence donnée :
- le module correspondant peut proposer un mini-jeu **"Mode Évaluation Repère"**, qui reproduit fidèlement le format officiel (nombre d'items, chronométrage, type de propositions) ;
- les **bandes de lecture officielles** de la fiche (les seuils de score définis par l'Éducation nationale) sont reportées dans le **référentiel du module**, et **priment sur les seuils génériques** de l'échelle d'acquisition (section 11 de CHARTE.md) pour cette compétence précise ;
- une session jouée dans ce mode s'enregistre avec `"type": "evaluation"` (cf. amendement du contrat de données dans CHARTE.md).

**Exemple de référence** — CP, compétence *Soustraire* : 10 calculs, QCM à 6 propositions, 3 minutes ; bandes de lecture : **0–4** / **5–6** / **7–10**.

---

## Modules d'évaluation (type E)

**Nomenclature "E"**, parallèle à celle des modules "M" d'entraînement. Un module E reproduit fidèlement le format officiel d'une évaluation nationale Repères (DEPP) : mêmes exercices, même nombre d'items, même chronométrage (cf. CHARTE.md, section 12 « Mode chronométré »).

**Règle de calendrier** : les évaluations Repères ont lieu en septembre, en **début** d'année scolaire. Une fiche de début d'année N mesure donc les acquis de **fin d'année N-1**. Pour évaluer la fin d'une année scolaire donnée, on utilise la fiche Repères du **niveau suivant** (ex. : pour mesurer la fin de CE2, on utilise la fiche Repères de début CM1).

**Double usage de chaque fiche** :
1. **Diagnostic d'entrée** : la fiche du niveau courant, jouée en début d'année.
2. **Cible de fin d'année** : la même fiche, réutilisée comme objectif à atteindre par les élèves du niveau précédent en fin d'année.

**Sessions** : les modules E écrivent des sessions `"type": "evaluation"` (format défini en CHARTE.md section 11, comportement chronométré détaillé en section 12) ; les modules M continuent d'écrire des sessions `"type": "entrainement"`.

**Modules maths cycle 2 prévus** :
- `E-CP-01`
- `E-CP-PE-01` (Point d'étape mi-CP — seul Repère qui a lieu en cours d'année plutôt qu'en septembre)
- `E-CE1-01`
- `E-CE2-01`
- `E-CM1-01`

**Source** : les fiches Repères officielles (PDF) servent de **cahier des charges** de chaque module E (nombre d'items, type de propositions, temps imparti, bandes de lecture). Elles sont rangées dans [`ressources/evaluations-reperes/`](./ressources/evaluations-reperes/).

---

## UI/UX

La charte actuelle ([`CHARTE.md`](./CHARTE.md)) reste la référence visuelle et technique pour **tous les jeux** de la V1 — aucune divergence de design system entre les modules.

L'effort de design produit se concentre sur la **coquille** (écran d'accueil, index, tableau de bord parental), avec un **ton délibérément différencié** selon le public :
- **côté enfant** : ludique, coloré, dans l'esprit de la charte des jeux ;
- **côté parent** : sobre et informatif, pensé pour une lecture rapide et rassurante du tableau de bord.
