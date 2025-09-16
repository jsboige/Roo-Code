# Rapport d'Investigation : Crash de l'UI de Roo Code

**Date :** 2025-08-02
**Auteur :** Roo, Assistant Technique
**Protocole :** SDDD (Semantic Documentation Driven Design)

---

## 1. Contexte

Ce document analyse les causes potentielles du crash récurrent de l'interface utilisateur (WebView) de l'extension Roo Code. Le symptôme principal est un écran gris qui ne répond plus, survenant fréquemment lors de l'utilisation de plusieurs fenêtres VSCode ou après de longues sessions d'utilisation.

L'investigation s'est concentrée sur le fichier `roo-code/src/core/webview/ClineProvider.ts`, identifié comme le composant central de la gestion de la WebView via une recherche sémantique initiale.

---

## 2. Analyse et Hypothèses

L'examen du code de `ClineProvider.ts` a permis de formuler plusieurs hypothèses sur l'origine du problème.

### Fichier Clé Analysé

*   **Chemin :** `roo-code/src/core/webview/ClineProvider.ts`
*   **Rôle :** Gère l'intégralité du cycle de vie de la WebView, de sa création à sa destruction, y compris la gestion des états et la communication avec l'extension.

### Hypothèse 1 : Libération incorrecte des ressources (`Disposables`)

**Observation :**
La classe `ClineProvider` utilise deux collections pour les ressources à libérer : `disposables` (global) et `webviewDisposables` (spécifique à la vue). La logique dans `onDidDispose` (lignes 487-501) ne nettoie que `webviewDisposables` pour la vue de la barre latérale.

**Cause potentielle :**
Une ressource liée à la vue (ex: listener) ajoutée par erreur au tableau global `disposables` ne sera pas libérée à la fermeture de la barre latérale, créant une **fuite de mémoire** et des listeners "fantômes" pouvant provoquer un crash.

### Hypothèse 2 : Conditions de concurrence ("Race Conditions")

**Observation :**
La méthode `postStateToWebview` est appelée depuis de nombreux endroits, souvent de manière asynchrone, sans vérifier si la vue `this.view` est toujours valide avant d'appeler `postMessage`.

**Cause potentielle :**
Un événement peut déclencher un `postStateToWebview` juste au moment où l'UI est fermée. L'appel à `postMessage` sur une référence invalide est une cause classique de crashs.

### Hypothèse 3 : Complexité de la gestion multi-fenêtres

**Observation :**
La classe utilise un ensemble statique `activeInstances` pour suivre les vues dans différentes fenêtres.

**Cause potentielle :**
Une mauvaise synchronisation lors de la destruction d'une vue pourrait laisser des instances "zombies" dans `activeInstances`, conduisant à des interactions avec des objets détruits.

---

## 3. Conclusion et Recommandations Initiales

Les causes les plus probables du crash sont des **fuites de ressources** et des **conditions de concurrence**, exacerbées par la complexité du multi-fenêtres.

---

## 4. Correctifs Implémentés

En réponse aux hypothèses formulées, les actions suivantes ont été menées pour stabiliser le `ClineProvider`.

### Renforcement de `postMessageToWebview`

*   **Problème :** Des appels à `postMessage` sur une `webview` potentiellement invalide ou non visible pouvaient causer des crashs (Race Condition).
*   **Solution :** Une garde de protection a été ajoutée à la méthode `postMessageToWebview`. Avant tout appel, elle vérifie désormais si `this.view` est défini et si `this.view.visible` est `true`. De plus, un bloc `try...catch` intercepte les erreurs spécifiques à une `webview` "disposed", évitant ainsi un crash complet.

Cette modification prévient les erreurs fatales lorsqu'un message est envoyé à une `webview` en cours de fermeture ou déjà détruite, renforçant significativement la robustesse du composant face aux conditions de concurrence.