// Bus d'événements partagé entre TOUS les bus du projet (Auth, Log, Monitoring, Anti-fraude...).
// On en crée UN dans l'application, et on le passe à chaque bus avec l'option "events".
//
//   const events = createEventBus();
//   const authenticate = createAuthenticate({ secret, events });
//   events.on("auth:status", (e) => logBus.write(e));
//
// Les noms d'événements sont préfixés par le bus qui les émet ("auth:...", "log:...")
// pour que deux bus ne se marchent pas dessus.
import { EventEmitter } from "node:events";

function defaultOnListenerError(err, eventName) {
  console.error(`EventBus : un abonné à "${eventName}" a levé une erreur`, err);
}

export function createEventBus({ onListenerError = defaultOnListenerError } = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  return {
    // Appelle chaque abonné séparément : si l'un plante (même en async),
    // les autres sont quand même appelés et la requête continue.
    publish(eventName, payload) {
      for (const listener of emitter.listeners(eventName)) {
        try {
          const result = listener(payload);
          if (result && typeof result.catch === "function") {
            result.catch((err) => onListenerError(err, eventName));
          }
        } catch (err) {
          onListenerError(err, eventName);
        }
      }
    },

    // Renvoie une fonction pour se désabonner.
    on(eventName, listener) {
      emitter.on(eventName, listener);
      return () => emitter.off(eventName, listener);
    },

    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
  };
}
