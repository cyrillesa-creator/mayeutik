# Charte graphique & technique — Mayeutik

Cette charte décrit le **design system commun** à tous les mini-jeux HTML de la série Mayeutik (jeux éducatifs autonomes pour l'école primaire française). Chaque nouveau jeu ajouté au dossier `/jeux` doit s'y conformer, afin que la série ait un look & feel cohérent, quel que soit le fichier ouvert.

Chaque jeu est un fichier **HTML autonome** (HTML + CSS + JS dans un seul fichier, sans dépendance de build), qui respecte les règles ci-dessous.

---

## 1. Typographie

Police unique pour toute la série : **[Fredoka](https://fonts.google.com/specimen/Fredoka)** (Google Fonts), une police ronde et ludique adaptée à un public d'enfants.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
```

```css
body {
  font-family: 'Fredoka', system-ui, sans-serif;
}
```

- Graisses utilisées : `400` (texte courant), `500`/`600` (boutons, titres de cartes), `700` (titres principaux).
- Les titres et boutons privilégient des tailles généreuses (min. `1.1rem`) et un `border-radius` prononcé (12–24px) pour rester cohérents avec l'esprit rond de la police.

---

## 2. Palette de couleurs

La palette est déclarée sous forme de **variables CSS** sur `:root`, avec des noms sémantiques partagés par tous les jeux :

```css
:root {
  --couleur-fond: #FFF8EF;      /* fond clair, chaud */
  --couleur-encre: #2B2B2B;     /* texte principal */
  --couleur-mandarine: #FF8C42; /* accent chaud / boutons principaux */
  --couleur-menthe: #4ECDC4;    /* succès / éléments secondaires */
  --couleur-corail: #FF6B6B;    /* erreur / alerte douce */
  --couleur-soleil: #FFD93D;    /* mise en valeur / étoiles / récompenses */
}
```

Règles d'usage :
- `--couleur-fond` : fond de page (jamais de blanc pur).
- `--couleur-encre` : texte principal, jamais de noir pur.
- `--couleur-mandarine` : couleur d'action principale (CTA, boutons "valider").
- `--couleur-menthe` : retours positifs (bonne réponse, validation, progression).
- `--couleur-corail` : retours d'erreur, toujours utilisé avec douceur (jamais agressif, pas de rouge vif pur).
- `--couleur-soleil` : étoiles, badges, éléments de récompense/valorisation.

Ces six variables sont **le seul vocabulaire de couleurs** de la série : pas de couleurs "en dur" ailleurs dans le CSS d'un jeu, on compose à partir de ces six teintes (avec `opacity`/`color-mix()` si besoin de nuances).

---

## 3. Mode clair forcé

Les jeux sont conçus uniquement en mode clair. Il faut empêcher le mode sombre du système (notamment iOS/Safari) de casser les couleurs.

**Balise meta** (dans le `<head>` de chaque jeu) :

```html
<meta name="color-scheme" content="light only">
```

**Fallback CSS** pour forcer le rendu clair même si un navigateur iOS ignore la meta en mode sombre système :

```css
:root {
  color-scheme: light only;
}

@media (prefers-color-scheme: dark) {
  html {
    background-color: var(--couleur-fond);
  }
  body {
    background-color: var(--couleur-fond);
    color: var(--couleur-encre);
  }
  /* Neutralise les inversions automatiques de formulaires/inputs sous iOS dark mode */
  input, select, textarea, button {
    background-color: #FFFFFF;
    color: var(--couleur-encre);
  }
}
```

---

## 4. Moteur de confettis

À **chaque bonne réponse**, une explosion de confettis est déclenchée pour renforcer le feedback positif.

- Implémentation en **JS vanilla**, sans dépendance externe (canvas ou éléments DOM générés dynamiquement puis retirés).
- Les confettis utilisent la palette de la charte (`--couleur-mandarine`, `--couleur-menthe`, `--couleur-corail`, `--couleur-soleil`) plutôt que des couleurs arbitraires.
- Fonction exposée sous un nom homogène dans tous les jeux, par exemple :

```js
function lancerConfettis() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // génère un lot de particules colorées (issues de la palette),
  // les anime en chute avec rotation puis les supprime du DOM
}
```

- Le déclenchement doit rester léger (durée courte, quelques dizaines de particules maximum) pour ne pas ralentir les appareils bas de gamme utilisés en classe.
- Respect de `prefers-reduced-motion` : si l'utilisateur (ou l'appareil) a activé la réduction des animations, `lancerConfettis()` ne déclenche rien (le feedback sonore et visuel de couleur/texte suffisent). Ce garde-fou est la première ligne de la fonction dans tous les jeux de la série.

---

## 5. Feedback sonore

Chaque jeu fournit un retour sonore synthétisé via l'**API Web Audio** (`AudioContext`), sans fichiers audio externes à charger :

- Un son **"bravo"** (mélodie ascendante, joyeuse) joué sur bonne réponse, en complément des confettis.
- Un son **"raté"** (son bref, descendant, non anxiogène) joué sur mauvaise réponse.

```js
function jouerSon(type) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  // type === 'bravo' -> séquence de notes ascendante
  // type === 'rate'  -> note brève descendante
}
```

- L'`AudioContext` doit être créé/relancé suite à une interaction utilisateur (contrainte des navigateurs mobiles), jamais au chargement de la page.
- Le son reste un **plus**, jamais un pré-requis : le jeu doit rester compréhensible sans le son (feedback visuel toujours présent en parallèle).

---

## 6. Contenu pédagogique séparé de la logique

Le contenu pédagogique (questions, réponses, énoncés, niveaux...) est déclaré dans un **bloc JSON isolé**, distinct du code qui gère l'affichage et les interactions.

```html
<script type="application/json" id="donnees-jeu">
{
  "titre": "Compléments à 10",
  "niveaux": [
    { "question": "3 + ? = 10", "reponse": 7 }
  ]
}
</script>

<script>
  const donnees = JSON.parse(document.getElementById('donnees-jeu').textContent);
  // toute la logique du jeu lit ensuite `donnees`, sans valeur pédagogique en dur ailleurs
</script>
```

Objectif : permettre de modifier/relire facilement le contenu pédagogique (par un enseignant, ou pour créer une variante) sans toucher au code du moteur de jeu.

---

## 7. Écran d'accueil

Bien que chaque fichier HTML soit autonome, la série partage un même patron d'écran d'accueil quand un jeu propose plusieurs mini-jeux/niveaux :

- **Cartes de mini-jeux** : une grille de cartes cliquables (`border-radius` prononcé, ombre douce), une carte par mini-jeu/niveau, utilisant les couleurs de la palette pour se différencier.
- **Système d'étoiles** : chaque carte affiche la progression de l'enfant sous forme d'étoiles (`--couleur-soleil`), typiquement de 0 à 3 étoiles selon la performance, stockées en `localStorage`.
- **Bouton retour** : présent sur l'écran de jeu pour revenir à l'écran d'accueil/à la sélection des cartes, toujours positionné de façon cohérente (coin supérieur gauche) et stylé selon la charte (mandarine ou encre, jamais une couleur hors palette).

---

## 8. Responsive iPhone

La cible principale d'usage est un iPhone en main (élève ou enseignant), en plus des tablettes/ordinateurs de classe :

- Layout **mobile-first**, testé en priorité sur des largeurs type iPhone (375–430px).
- Sur l'écran d'accueil, les **cartes de mini-jeux sont limitées à environ `34vh` de hauteur maximum** (`max-height: 34vh`), afin que plusieurs cartes restent visibles sans scroll excessif sur un écran de téléphone.
- Utilisation de `vh`/`vw`/`%` et de `flexbox`/`grid` plutôt que de dimensions fixes en pixels pour les conteneurs principaux.
- Zones cliquables (cartes, boutons de réponse) dimensionnées pour le tactile (cible minimale ~44px de hauteur).
- Pas de scroll horizontal : tout conteneur large (ex. grille de cartes) doit s'adapter ou passer en `overflow-x: auto` contenu, jamais déborder de la page.

---

## 9. Stockage sûr des données (étoiles, progression)

Les jeux persistent localement la progression de l'enfant (étoiles, scores...) via `localStorage`. Mais `localStorage` n'est pas fiable partout : il est absent ou bloqué dans certains environnements où un jeu peut être ouvert — Safari en navigation privée, une iframe sandboxée (artefact Claude par exemple), un navigateur avec le stockage désactivé par une politique de confidentialité. Dans ces cas, **le simple fait de lire la propriété `localStorage`** peut lever une exception, pas seulement `getItem`/`setItem`.

Le pattern ci-dessous est **obligatoire pour tous les jeux de la série**, afin qu'ils fonctionnent aussi bien dans Safari (persistance réelle) que dans un environnement où `localStorage` est indisponible ou bloqué (progression valable pour la session en cours seulement, sans erreur) :

- une **variable JavaScript en mémoire** est toujours la source de vérité pour la session en cours ;
- à la **lecture initiale**, on tente de lire `localStorage` dans un `try/catch` ; en cas d'échec (accès refusé, indisponible...), on part silencieusement d'un objet vide ;
- à l'**écriture**, on met d'abord à jour la variable en mémoire, puis on tente d'écrire dans `localStorage` dans un `try/catch` ; en cas d'échec, on ignore silencieusement (pas d'erreur affichée, pas de `throw`) ;
- le jeu ne doit **JAMAIS planter ni afficher d'erreur** si `localStorage` est absent : dans ce cas, les données ne valent que pour la session en cours.

Extrait de référence à copier dans chaque nouveau jeu (`lireDonnees` / `enregistrerDonnees`) :

```js
let memoireDonnees = null;

function lireDonnees() {
  if (memoireDonnees === null) {
    memoireDonnees = {};
    try {
      const brut = window.localStorage.getItem(CLE_STOCKAGE);
      if (brut) memoireDonnees = JSON.parse(brut);
    } catch (e) {
      memoireDonnees = {};
    }
  }
  return memoireDonnees;
}

function enregistrerDonnees(cle, valeur) {
  const tout = lireDonnees();
  tout[cle] = valeur;
  memoireDonnees = tout;
  try {
    window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(tout));
  } catch (e) {
    // localStorage indisponible : les données restent valables pour la session en cours.
  }
}
```

Cette convention s'applique à toute donnée que la charte demande de stocker (étoiles, progression...) : jamais d'appel direct à `localStorage.getItem`/`setItem` hors d'un `try/catch`, et jamais de blocage du jeu si le stockage échoue.

---

## 10. Flux de test et de publication

Chaque jeu suit la même procédure avant d'être fusionné dans `main`, de sa création par Claude Code jusqu'à sa mise en ligne :

1. **Claude Code** produit ou modifie le fichier `.html` du jeu sur une branche dédiée, et ouvre (ou met à jour) la Pull Request correspondante.
2. Sur **GitHub**, ouvrir le fichier `.html` modifié dans la Pull Request, puis cliquer sur **"Raw"** pour accéder au contenu brut du fichier.
3. Sur ordinateur : **clic droit → "Enregistrer sous"** pour télécharger le fichier, puis **double-cliquer** sur le fichier téléchargé pour l'ouvrir directement dans le navigateur par défaut.
4. **Tester manuellement** tous les mini-jeux du fichier et vérifier :
   - les couleurs et le mode clair forcé (pas de bascule en sombre) ;
   - le rendu responsive (notamment sur une largeur type iPhone) ;
   - le déclenchement des confettis sur bonne réponse ;
   - le feedback sonore ;
   - l'absence d'erreur dans la console du navigateur (outils de développement).
5. **Si tout est correct** : fusionner la Pull Request dans `main`. **Sinon**, décrire précisément le problème constaté à Claude Code pour qu'il corrige sur la même branche, puis reprendre le test à l'étape 4.

La validation du rendu visuel et du ressenti de jeu (étape 4) reste **manuelle** : un humain doit ouvrir et tester le jeu dans un vrai navigateur avant fusion, car ce rendu (couleurs perçues, fluidité des animations, agrément sonore, confort tactile réel) ne peut pas être garanti par une vérification automatisée seule.

---

## 11. Contrat de données — progression et acquis (v1)

### Principe

Local-first. Les jeux écrivent des enregistrements bruts et simples ; toute l'intelligence (statuts, recommandations) vit dans la coquille, jamais dans les jeux. Les règles de calcul peuvent évoluer sans rouvrir les jeux.

### Clés de stockage partagées (communes à tous les jeux)

- `mayeutik-profils` : tableau de profils
- `mayeutik-profil-actif` : id du profil courant (défaut `"p1"`)
- `mayeutik-sessions` : tableau de sessions (ajout en fin)

Toujours accédées via le pattern « stockage sûr » (mémoire + `try/catch`, cf. section 9). Plafond : conserver au maximum les 500 dernières sessions par profil (supprimer les plus anciennes au-delà).

### Objet PROFIL

```json
{ "id": "p1", "prenom": "", "niveau": "CE2", "creeLe": "AAAA-MM-JJ" }
```

Minimisation RGPD : prénom et niveau uniquement. Si aucun profil n'existe, les jeux fonctionnent avec le profil par défaut `"p1"`.

### Objet SESSION — écrit par le jeu à la fin de chaque mini-jeu TERMINÉ (jamais pour une partie abandonnée)

```json
{
  "profilId": "p1",
  "module": "M17",
  "competence": "egales",
  "score": 5,
  "total": 6,
  "date": "ISO 8601",
  "duree": 180,
  "type": "entrainement"
}
```

- `competence` : id du **mini-jeu** (granularité fine, ex. `"egales"`, `"calculer-difficile"`).
- `duree` : en secondes.
- `type` (optionnel, défaut `"entrainement"`) : `"entrainement"` pour une session de jeu classique, ou `"evaluation"` pour une session jouée au format officiel d'une fiche Évaluation Repère (cf. PRODUIT.md). Un jeu qui n'écrit pas ce champ produit implicitement des sessions `"entrainement"` ; les jeux existants n'ont pas besoin d'être modifiés pour rester valides.

Les étoiles restent locales au jeu (récompense enfant) ; les sessions sont une couche parallèle destinée au suivi parental.

### RÉFÉRENTIEL

Métadonnées par module (fichier central de la coquille, pas dans les jeux) : module, titre, niveau, domaine, programme (ex. `"BO-2024"`), et liste des compétences `{id, libelle}`.

### Échelle d'acquisition

Terminologie officielle LSU (bilans périodiques, élémentaire), **calculée par la coquille, JAMAIS stockée** :

- **Non travaillé** (état technique, affiché « — ») : aucune session
- **Objectifs non atteints** : sessions existantes, taux de réussite < 50 %
- **Partiellement atteints** : au moins une session ≥ 50 %, critères « atteints » non remplis
- **Atteints** : ≥ 3 sessions avec score ≥ 80 %, sur au moins 2 jours distincts
- **Dépassés** : critères « atteints » remplis + dernières sessions à 100 % sur la variante la plus difficile de la compétence

Seuils = paramètres de la coquille, ajustables sans toucher aux données. Mention obligatoire dans toute interface parentale : « positionnement indicatif basé sur les jeux, inspiré de l'échelle du livret scolaire » (ce n'est pas une évaluation scolaire officielle).

### Ce qu'on n'enregistre PAS (décisions explicites v1)

Pas de détail question par question, pas de données nominatives au-delà du prénom, pas d'identifiant d'appareil, rien côté serveur.

---

## Résumé technique

| Aspect | Choix |
|---|---|
| Police | Fredoka (Google Fonts) |
| Couleurs | 6 variables CSS sémantiques (`--couleur-*`) |
| Thème | Clair forcé (`color-scheme: light only` + fallback `prefers-color-scheme: dark`) |
| Récompense visuelle | Confettis JS vanilla à chaque bonne réponse |
| Récompense sonore | Web Audio API, sons "bravo"/"raté" synthétisés |
| Contenu | Bloc JSON séparé de la logique du jeu |
| Accueil | Cartes de mini-jeux + étoiles de progression + bouton retour |
| Responsive | Mobile-first, cartes d'accueil `max-height: 34vh` |
| Stockage | Variable mémoire = source de vérité, `localStorage` en best-effort via `try/catch` |
| Test & publication | Test manuel via le fichier "Raw" téléchargé depuis la PR, avant fusion dans `main` |
| Progression & acquis | Contrat de données v1 : sessions brutes écrites par les jeux, statuts calculés côté coquille |
