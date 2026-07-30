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
- **Bouton « ← Menu » (retour à la coquille)** : sur l'**écran d'accueil des mini-jeux uniquement** (jamais à l'intérieur d'un mini-jeu en cours), chaque jeu affiche en **haut à gauche** un bouton discret **« ← Menu »** qui ramène à la coquille PWA de la série (`index.html` à la racine, chemin relatif **`../index.html`** depuis `jeux/`). Règles :
  - **Position et style** : coin supérieur gauche de l'écran d'accueil, discret (style « secondaire » : fond blanc ou transparent, bordure/texte encre ou mandarine, jamais une couleur hors palette), cible tactile ≥ 44px. Il cohabite avec le titre du jeu sans le masquer.
  - **Confirmation obligatoire** : tout clic déclenche une confirmation **« Revenir au menu principal ? Ta partie en cours sera perdue. »** avec deux choix clairs — **Rester** (annule) et **Revenir au menu** (navigue) — afin d'éviter les sorties accidentelles. À défaut de modale maison, un `window.confirm` est acceptable.
  - **Parcours de retour** : depuis un mini-jeu en cours, l'enfant passe **d'abord par le bouton retour interne** (retour à l'écran d'accueil du jeu), **puis** par « ← Menu » pour rejoindre la coquille. Le « ← Menu » n'est donc jamais visible pendant une partie.
  - **Ouverture hors coquille** : le bouton ne doit **pas casser** le jeu s'il est ouvert directement (hors coquille). Le lien relatif `../index.html` reste inoffensif ; en cas de doute, **l'afficher toujours est acceptable** (pas de détection obligatoire du contexte).

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

**Déploiement — quelle URL tester/partager.** Toujours utiliser l'URL de production affichée sur le tableau de bord Netlify pour tester ou partager le site, jamais un ancien lien de déploiement ou de prévisualisation individuel gardé en favori/partagé précédemment : ces liens peuvent pointer vers une version figée et périmée du site, ce qui peut faire ressembler un bug déjà corrigé à un bug persistant.

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

Session d'un module d'entraînement (type "M", cas par défaut — c'est le seul format que les jeux existants comme M17 ont besoin d'écrire) :

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

Session d'un module d'évaluation (type "E", chronométré — cf. section 12) : deux champs supplémentaires, présents **uniquement** quand `"type": "evaluation"` :

```json
{
  "profilId": "p1",
  "module": "E-CE2-01",
  "competence": "soustraire",
  "score": 7,
  "total": 10,
  "date": "ISO 8601",
  "duree": 165,
  "type": "evaluation",
  "tempsImparti": 180,
  "interrompu": false
}
```

- `competence` : id du **mini-jeu** (granularité fine, ex. `"egales"`, `"calculer-difficile"`, `"soustraire"`).
- `duree` : temps réellement écoulé, en secondes.
- `type` (optionnel, défaut `"entrainement"`) : `"entrainement"` pour une session de jeu classique, ou `"evaluation"` pour une session jouée au format officiel d'une fiche Évaluation Repère (cf. PRODUIT.md, section « Modules d'évaluation »). Un jeu qui n'écrit pas ce champ produit implicitement des sessions `"entrainement"` ; les jeux existants n'ont pas besoin d'être modifiés pour rester valides.
- `tempsImparti` (uniquement si `type === "evaluation"`) : durée officielle allouée à l'exercice, en secondes, telle que définie par la fiche Repères.
- `interrompu` (uniquement si `type === "evaluation"`) : `true` si le temps imparti a expiré avant que l'élève ait terminé, `false` s'il a terminé dans les temps. Les modules "M" ne portent jamais ces deux champs.

Les étoiles restent locales au jeu (récompense enfant) ; les sessions sont une couche parallèle destinée au suivi parental.

### RÉFÉRENTIEL

Métadonnées par module (fichier central de la coquille, pas dans les jeux) : module, titre, niveau, domaine, programme (ex. `"BO-2024"`), et liste des compétences `{id, libelle}`. Pour un module d'évaluation (type "E"), chaque compétence porte en plus le `tempsImparti` officiel (cf. section 12) et, le cas échéant, les bandes de lecture de la fiche Repères (cf. PRODUIT.md).

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

## 12. Mode chronométré (modules d'évaluation)

Les modules de type **"E"** (évaluations Repères, cf. PRODUIT.md) sont **chronométrés**, contrairement aux modules **"M"** (entraînement) qui ne le sont jamais.

- **Temps imparti** : c'est un **paramètre par exercice/compétence**, issu de la fiche Repères officielle correspondante, stocké dans le **référentiel du module** (cf. section 11) — jamais codé en dur dans la logique du jeu. Deux exercices d'un même module peuvent avoir des durées différentes.
- **Affichage** : un compte à rebours **visible mais discret et non anxiogène**, cohérent avec le ton bienveillant de la charte — pas de son de tic-tac stressant ni d'animation alarmante. Les dernières secondes peuvent être signalées visuellement (ex. changement de couleur doux vers `--couleur-corail`), sans dramatiser (pas de clignotement violent, pas de son d'alarme).
- **À l'expiration du temps** : la saisie est **figée immédiatement**, aucun temps supplémentaire n'est accordé, et le jeu passe directement au décompte du score. Cet arrêt net fait partie intégrante de l'évaluation (c'est une mesure de fluence), ce n'est pas un bug à corriger.
- **Score** : uniquement le nombre de bonnes réponses obtenues **dans le temps imparti**. Les items non atteints faute de temps ne sont ni rattrapés, ni comptés comme des erreurs — ils sont simplement absents du score obtenu.
- La session correspondante est enregistrée avec `"type": "evaluation"`, `"tempsImparti"` (durée officielle) et `"interrompu"` (`true` si le chrono a expiré avant la fin) — cf. l'objet SESSION en section 11.

---

## 13. Variété et randomisation (obligatoire pour tous les jeux)

Ces règles sont un **critère de conformité** : tout nouveau jeu ajouté à `/jeux` doit les respecter, au même titre que le reste de la charte.

### Position des réponses (QCM)

Dans tout QCM, l'ordre des propositions doit être **mélangé à chaque affichage** (algorithme de Fisher-Yates), en recalculant l'index de la bonne réponse après mélange. La bonne réponse ne doit **JAMAIS** occuper une position fixe (ex. toujours en 2ᵉ position).

Fonction utilitaire de référence à copier dans chaque nouveau jeu :

```js
function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

function melangerOptions(options, indexCorrect) {
  const enveloppes = options.map((valeur, i) => ({ valeur, estCorrecte: i === indexCorrect }));
  const melangees = melanger(enveloppes);
  return {
    options: melangees.map((e) => e.valeur),
    indexCorrect: melangees.findIndex((e) => e.estCorrecte)
  };
}
```

### Ordre des questions

L'ordre des questions d'un mini-jeu est **mélangé par défaut à chaque partie** (même algorithme de Fisher-Yates, appliqué au tableau de questions).

**Règle par défaut** (sauf contre-ordre ou précision explicite dans la spec d'un module) : au sein d'une même partie, l'ordre de présentation des questions doit être **aléatoire**, et **aucune question ne doit se répéter** (pas de redondance) tant que la banque de questions disponibles pour cette partie n'est pas épuisée. Si un mini-jeu déclare explicitement un nombre de questions par partie (ex. 6 questions), la banque source doit contenir **significativement plus d'entrées** que ce nombre (viser **au moins 2 à 3 fois plus**), pour que le tirage sans redondance soit réellement varié d'une partie à l'autre et non systématiquement les mêmes N questions juste mélangées dans un ordre différent.

Cette règle s'applique **par défaut à tous les mini-jeux de tous les modules**, sauf si une contrainte d'ordre pédagogique explicite est documentée pour un mini-jeu précis — auquel cas : mélanger d'abord normalement (ex. « la question B doit suivre la question A », pour une progression pédagogique précise), **puis** rétablir la contrainte en repositionnant les questions concernées après coup. La contrainte ne dispense jamais du mélange du reste ni de l'absence de redondance.

### Variété entre sessions

Une partie ne doit pas reproduire la même série de questions que la précédente. Deux stratégies selon la nature du contenu :

- **Génération procédurale** (calcul, nombres, fractions...) : fabriquer les questions par tirage aléatoire de paramètres à **chaque partie** (cf. M17, `jeux/M17-fractions-ce2.html`). À privilégier dès que le contenu s'y prête.
- **Banque + tirage** (contenu fini : géographie, solides, vocabulaire...) : écrire une banque de questions **sensiblement plus grande** que le nombre posé par partie — viser **au moins 2 à 3 fois plus** — et en tirer un sous-ensemble aléatoire à chaque partie (cf. M36, `jeux/M36-solides.html`).

Dans les deux cas, éviter de reposer exactement le même item deux parties de suite quand la taille de la banque le permet.

### Cas particulier : modules d'évaluation (type E)

Un module **"E"** doit reproduire **strictement** le format officiel de la fiche Repères correspondante (cf. PRODUIT.md, section « Modules d'évaluation (type E) ») : nombre d'items, chronométrage, nombre et type de propositions, registre de difficulté. **Ce moule est immuable** — on n'y applique jamais les libertés de format qu'un module M pourrait prendre.

En revanche, les **valeurs concrètes des items sont régénérées à chaque passation**, par tirage procédural dans le registre de difficulté défini par la fiche. Deux raisons à cela :
- que **rejouer entraîne réellement** — l'élève ne doit pas pouvoir mémoriser des réponses plutôt que la compétence ;
- que **deux passages soient comparables** pour le suivi de progression (même format, même niveau de difficulté, valeurs différentes).

**Exception** : lorsqu'un exercice ne peut pas être régénéré par formule (figure géométrique spécifique, suite de nombres donnée dans la fiche...), utiliser une **petite banque de variantes équivalentes**, ou à défaut un **contenu figé** — la fiche officielle fait foi dans tous les cas.

Règle absolue : on ne touche **jamais** au format (nombre d'items, chronométrage, type de propositions), **seulement** au contenu.

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
| Accueil | Cartes de mini-jeux + étoiles de progression + bouton retour + « ← Menu » (retour coquille, avec confirmation) |
| Responsive | Mobile-first, cartes d'accueil `max-height: 34vh` |
| Stockage | Variable mémoire = source de vérité, `localStorage` en best-effort via `try/catch` |
| Test & publication | Test manuel via le fichier "Raw" téléchargé depuis la PR, avant fusion dans `main` |
| Progression & acquis | Contrat de données v1 : sessions brutes écrites par les jeux, statuts calculés côté coquille |
| Mode chronométré | Modules "E" uniquement : temps imparti par exercice (référentiel), arrêt net à expiration, pas de rattrapage |
| Variété & randomisation | QCM mélangés (Fisher-Yates), questions mélangées par partie SANS redondance jusqu'à épuisement de la banque, banque ≥ 2-3× le nombre posé ou génération procédurale |
| Modules adaptatifs par niveau | Un seul fichier, contenu JSON par palier, niveau du profil actif lu au démarrage, palier bonus optionnel au-delà de la maîtrise |

---

## 14. Service worker / PWA — désactivé (reprise différée)

**État actuel : le service worker de la coquille est DÉSACTIVÉ jusqu'à nouvel ordre.**

> Le service worker est actuellement **DÉSACTIVÉ** (voir commit correspondant) suite à plusieurs bugs récurrents et difficiles à diagnostiquer : blocage de l'accès aux jeux, réponses de redirection invalides sur Safari, et surtout un défaut de propagation des mises à jour laissant des visiteurs sur d'anciennes versions en cache malgré `skipWaiting()`/`clients.claim()`. Le fichier `sw.js` est conservé dans le dépôt mais non enregistré. **AVANT DE LE RÉACTIVER** : prévoir une session dédiée avec tests systématiques sur Safari ET Chrome, en navigation normale ET privée, sur AU MOINS deux mises à jour successives (pas seulement « ça marche au premier déploiement »), avant tout déploiement en production.

**Règle à respecter impérativement lors de la RÉACTIVATION future du service worker :** il ne doit jamais mettre en cache ni renvoyer une réponse contenant une redirection pour une requête de navigation (`event.request.mode === 'navigate'`). Safari applique cette règle strictement et affiche l'erreur « Response served by service worker has redirections » ; Chrome est plus tolérant et masque le problème, ce qui peut donner une fausse impression de bon fonctionnement. Vérifier notamment que les ressources mises en cache ne proviennent pas elles-mêmes d'une redirection (ex. Netlify redirigeant `/` vers `/index.html`) sans avoir été résolues au préalable.

**Pourquoi.** En production, sur Safari **comme** Chrome, un visiteur revenant sur l'URL en navigation **normale** recevait une version **périmée** servie par le service worker, alors que la navigation privée (sans SW actif) affichait la dernière version déployée. Le mécanisme de mise à jour immédiate (`skipWaiting` + `clients.claim`) n'a pas suffi à corriger ce problème de fond. Priorité donnée à la **fiabilité totale** pour les tests utilisateurs, au prix des fonctionnalités hors-ligne/PWA.

**Ce qui est en place (dans `index.html`).**
- L'**enregistrement** du service worker (`navigator.serviceWorker.register('sw.js')`) est **retiré** (commenté) : plus aucun nouveau SW n'est installé.
- Un **nettoyage actif** s'exécute **avant toute autre logique**, en tête de `<head>`, à **chaque** chargement de page : désinscription de tout service worker restant (`getRegistrations()` → `unregister()`) et vidage de tous les caches (`caches.keys()` → `caches.delete()`). Il s'exécute que le SW soit déjà désactivé ou non, pour rattraper les visiteurs coincés sur une ancienne version. Résultat attendu : rendu **identique en navigation normale et privée**, sur plusieurs rechargements consécutifs.

**Le fichier `sw.js` est conservé dans le dépôt** (il n'est simplement plus enregistré), pour une reprise ultérieure réfléchie.

**Pour reprendre le hors-ligne/PWA plus tard**, il faudra : (1) traiter la cause racine de la péremption de cache (stratégie de versionnement/invalidation fiable, testée sur Safari **et** Chrome en navigation normale) ; (2) réactiver l'enregistrement commenté dans `index.html` ; (3) **retirer le nettoyage actif** de `<head>` (sinon il désinscrirait aussitôt le SW réactivé).

---

## 15. Modules adaptatifs par niveau (multi-niveaux)

Certains modules couvrent la **même compétence pédagogique sur plusieurs années** du cycle (ex. M39, "Tableaux et diagrammes", CP/CE1/CE2 — cf. `pilotage/backlog.json`), avec des exigences qui montent en complexité d'une année à l'autre plutôt que des compétences totalement différentes. Pour ces modules, on **n'ouvre pas un fichier par niveau** : un seul fichier HTML autonome (même contrainte qu'ailleurs dans la charte) s'adapte au niveau de l'enfant.

### Contenu structuré par palier

Le bloc JSON pédagogique (section 6) est organisé en **paliers**, un par niveau couvert, sous une clé `paliers` indexée par code niveau :

```json
{
  "paliers": {
    "CP": { "miniJeux": [ /* ... */ ] },
    "CE1": { "miniJeux": [ /* ... */ ] },
    "CE2": { "miniJeux": [ /* ... */ ] }
  }
}
```

Chaque palier déclare ses propres mini-jeux (structure libre selon le module), avec des paramètres de difficulté croissante (taille de population, bornes numériques, échelle d'axe...) plutôt que des mécaniques dupliquées quand c'est possible.

### Niveau par défaut : lecture du profil actif

Au démarrage, le jeu lit le niveau du **profil actif** en lisant directement `mayeutik-profils` et `mayeutik-profil-actif` dans `localStorage` (pattern « stockage sûr », section 9 — un jeu autonome ne peut pas importer `js/profils.js` de la coquille, il relit les mêmes clés partagées) :

- si le niveau du profil correspond à un palier couvert par le module, c'est le palier **affiché par défaut** à l'ouverture (aucune sélection manuelle requise) ;
- si le profil n'a pas de niveau, ou un niveau non couvert par le module, on retombe sur le **palier le plus bas** couvert ;
- un contrôle discret de changement de palier peut rester disponible sur l'écran d'accueil du jeu (utile à un enseignant, ou pour explorer), mais n'est **jamais nécessaire** pour jouer au niveau attendu par défaut.

### Palier bonus (déblocage)

Quand **tous les mini-jeux du palier courant** sont maîtrisés (heuristique simplifiée et locale au jeu — pas le calcul officiel LSU qui reste propriété de la coquille — ex. dernière session de chaque mini-jeu du palier ≥ 80 %), le jeu propose en plus, sur l'écran d'accueil, un aperçu **optionnel** du palier suivant, présenté comme une **récompense** ("Palier bonus 🎁" ou équivalent) plutôt que comme une progression obligatoire. Les parties jouées dans ce palier bonus enregistrent de vraies sessions (avec les identifiants de compétence du palier suivant), donc une vraie maîtrise anticipée y est suivie normalement par la coquille.

### Première révélation : effet « paquet cadeau »

**Obligatoire pour tout module ayant un palier bonus.** La toute première fois qu'un palier bonus devient disponible pour un profil donné (transition détectée par `palierMaitrise()` passant de `false` à `true` alors qu'un palier suivant existe), le contenu du bonus n'est **pas affiché directement** : un paquet cadeau visuel le recouvre, et l'enfant doit taper dessus pour le révéler (confettis + petite animation d'ouverture). Une fois ouvert, le paquet ne réapparaît **plus jamais** pour ce profil et ce module : le bonus s'affiche ensuite normalement à chaque visite, comme avant cette section.

Cet état (« déjà ouvert ou non ») est stocké **par profil, par module** — même clé de stockage sûr que les étoiles (section 9), suffixée `-bonus-revele`, avec un objet indexé par `profilId` :

```js
/* ---------- Palier bonus : révélation "paquet cadeau" ---------- */
const CLE_BONUS_REVELE = 'mayeutik-<module>-bonus-revele'; // ex. mayeutik-m23-bonus-revele
let memoireBonusRevele = null;
function lireBonusRevele() {
  if (memoireBonusRevele === null) {
    memoireBonusRevele = {};
    try {
      const brut = window.localStorage.getItem(CLE_BONUS_REVELE);
      if (brut) memoireBonusRevele = JSON.parse(brut);
    } catch (e) {
      memoireBonusRevele = {};
    }
  }
  return memoireBonusRevele;
}
function bonusDejaRevele(profilId) {
  return !!lireBonusRevele()[profilId];
}
function marquerBonusRevele(profilId) {
  const tout = lireBonusRevele();
  tout[profilId] = true;
  memoireBonusRevele = tout;
  try {
    window.localStorage.setItem(CLE_BONUS_REVELE, JSON.stringify(tout));
  } catch (e) {
    // localStorage indisponible : le paquet cadeau réapparaîtra à la prochaine visite.
  }
}
```

Dans le bloc HTML existant du palier bonus (`#bloc-bonus` / `#grille-bonus`), ajouter un bouton `#paquet-cadeau` (`hidden` par défaut) entre le texte d'annonce et la grille :

```html
<button type="button" class="paquet-cadeau" id="paquet-cadeau" hidden>
  <span class="paquet-cadeau-boite">
    <span class="paquet-cadeau-ruban-v"></span>
    <span class="paquet-cadeau-ruban-h"></span>
    <span class="paquet-cadeau-noeud">🎀</span>
  </span>
  <span class="paquet-cadeau-texte">Touche le paquet pour découvrir ta récompense !</span>
</button>
```

Dans la fonction qui construit l'écran d'accueil, là où le palier bonus est révélé (`if (suivant && palierMaitrise(...))`), basculer entre paquet et grille selon `bonusDejaRevele()`, et déclencher l'ouverture au clic :

```js
const profilId = lireProfilActifId();
if (bonusDejaRevele(profilId)) {
  paquetCadeau.hidden = true;
  grilleBonus.hidden = false;
} else {
  paquetCadeau.hidden = false;
  paquetCadeau.disabled = false;
  paquetCadeau.classList.remove('paquet-cadeau-ouverture');
  grilleBonus.hidden = true;
  paquetCadeau.onclick = () => ouvrirPaquetCadeau(profilId, paquetCadeau, grilleBonus);
}

function ouvrirPaquetCadeau(profilId, paquetCadeau, grilleBonus) {
  if (paquetCadeau.disabled) return;
  paquetCadeau.disabled = true;
  marquerBonusRevele(profilId);
  lancerConfettis();
  jouerSon('bravo');
  paquetCadeau.classList.add('paquet-cadeau-ouverture');
  setTimeout(() => {
    paquetCadeau.hidden = true;
    grilleBonus.hidden = false;
  }, 480); // doit correspondre à la durée de l'animation CSS .paquet-cadeau-pop
}
```

Le CSS associé (couleurs franches de la palette, style Fredoka, animation `paquet-cadeau-pop` en `scale`+`rotate`+`opacity` pendant ~450ms, avec repli `prefers-reduced-motion`) est à copier depuis `jeux/M23-longueurs.html` ou `jeux/M39-tableaux-diagrammes.html` (classes `.paquet-cadeau*`), premiers modules à l'implémenter — pas reproduit ici pour ne pas alourdir la charte, mais **identique d'un module à l'autre** (mêmes noms de classes).

Points d'implémentation à ne pas oublier :
- `paquetCadeau.onclick = ...` (propriété, pas `addEventListener`) car le bouton est un élément fixe du DOM, réutilisé à chaque appel de la fonction d'accueil (changement de palier, retour d'un mini-jeu…) — `addEventListener` accumulerait des gestionnaires en double à chaque re-rendu.
- `grilleBonus.hidden = true` tant que le paquet n'est pas ouvert : les cartes du palier bonus doivent être absentes du DOM accessible (pas seulement visuellement masquées) avant l'ouverture.
- Le confetti (section 4) et le son (section 5) déjà utilisés pour une bonne réponse sont réemployés tels quels pour l'ouverture — pas de nouvel effet à inventer.

### Référentiel et contrat de données

- Chaque **mini-jeu, quel que soit son palier**, a un identifiant de compétence **unique et stable** dans tout le module (ex. `cp-recueil-diagramme`, `ce2-probleme-combine`) : c'est lui qui est écrit dans `competence` de l'objet SESSION (section 11), et c'est la même granularité qui apparaît dans les `competences` du référentiel — la montée en niveau d'un module adaptatif n'introduit donc aucune règle de suivi spéciale côté coquille, chaque mini-jeu de chaque palier est juste une compétence de plus.
- Dans `data/referentiel.json`, un module adaptatif ajoute un champ **`niveaux`** (tableau, ex. `["CP", "CE1", "CE2"]`) en complément du champ `niveau` existant (qui reste le niveau d'introduction, pour compatibilité et tri) ; la coquille traite alors le module comme appartenant à **tous** ces niveaux pour le filtrage (accueil enfant, tableau de bord parental) — jamais au seul `niveau` d'intro.

---

## 16. Anticipation : lancement paramétré et généricité future

Deux règles d'architecture à respecter **dès maintenant**, même si les fonctionnalités qu'elles anticipent (deep-linking depuis la coquille, extension du périmètre pédagogique) ne sont pas encore construites. L'objectif : ne pas fermer de portes par des raccourcis pris aujourd'hui, sans pour autant construire ces fonctionnalités par avance.

### Lancement paramétré d'un mini-jeu

Par défaut, ouvrir le fichier HTML d'un module affiche son écran d'accueil général (grille de mini-jeux, éventuellement un sélecteur de palier — cf. section 15). **Tout nouveau module produit à partir de maintenant** doit en plus savoir démarrer **directement** sur un mini-jeu et un palier précis, via des paramètres d'URL :

```
jeux/M23-longueurs.html?competence=encadrer-ce1&palier=ce1
```

- `competence` : l'id du mini-jeu à lancer (même granularité que `competence` dans l'objet SESSION, section 11) ;
- `palier` (modules adaptatifs uniquement, section 15) : le code niveau à afficher (`cp`, `ce1`, `ce2`…), insensible à la casse.

Comportement attendu à l'ouverture :

- si `competence` correspond à un mini-jeu existant du module, le jeu démarre directement dessus (équivalent à un clic sur sa carte), en sautant l'écran d'accueil ;
- si `palier` est fourni et valide, il prime sur le palier déduit du niveau du profil actif (section 15) pour le choix de l'accueil éventuellement affiché ensuite (bouton retour, rejouer) ;
- si un paramètre est absent, invalide, ou ne correspond à rien dans le module, on retombe silencieusement sur le comportement par défaut (écran d'accueil, palier du profil actif) — **jamais d'erreur visible**, ce n'est qu'un raccourci d'entrée.

Cette règle complète le standard « Modules adaptatifs par niveau » (section 15) : elle s'applique aussi bien à un module classique (mono-niveau, paramètre `competence` seul) qu'à un module adaptatif (`competence` + `palier`). Elle prépare, sans l'implémenter ici, un futur lien direct depuis le tableau de bord parental (ex. « rejouer cette compétence ») ou depuis un futur mode enseignant — la coquille n'a pas encore besoin de générer ces liens, mais le jeu doit déjà savoir les recevoir.

### Généricité du référentiel

`data/referentiel.json` et les champs du contrat de données (section 11 : `domaine`, `theme`/`sousTheme`, `competence`, `niveau`/`niveaux`…) sont des **chaînes de caractères déclaratives**, jamais des énumérations figées en dur dans le code de la coquille. Concrètement :

- le code de la coquille (`js/app.js`, `js/statuts.js`, `js/radar.js`) déduit ses listes de domaines, niveaux, thèmes et modules **dynamiquement** à partir de `referentiel.json` (champs `domaines`, `niveaux`, `modules[].domaine`…) — jamais d'une liste recopiée en dur dans un fichier `.js`, qui se désynchroniserait silencieusement du référentiel au premier ajout ;
- un nouveau domaine, un nouveau niveau (ex. CM1/CM2 quand leurs modules seront produits) ou un nouveau type de module doit pouvoir être ajouté en éditant `referentiel.json` (et, si besoin, une correspondance couleur/icône minimale), **sans restructuration** des fonctions de filtrage, de calcul de statuts ou d'affichage existantes ;
- exemple concret déjà rencontré à éviter : un domaine présent dans `referentiel.json.domaines` mais sans module associé avait disparu du filtre enfant parce que ce filtre était dérivé de la présence de modules plutôt que de la liste `domaines` elle-même — corrigé en dérivant strictement du référentiel déclaré, pas des données qui s'y trouvent actuellement.

Avant toute modification touchant le filtrage ou l'affichage par domaine/niveau/thème, vérifier qu'elle continue de fonctionner pour une valeur **absente aujourd'hui** des données mais déclarée dans le référentiel (domaine sans module, niveau sans module, palier bonus au-delà du dernier niveau couvert) — c'est le test de non-régression implicite de cette section.

---
