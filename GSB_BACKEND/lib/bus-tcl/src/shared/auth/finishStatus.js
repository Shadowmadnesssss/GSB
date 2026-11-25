// Sortie commune aux deux middlewares : logger le statut, le publier, puis exécuter son action.
import { defaultHandlers } from "./handlers.js";
import { AUTH_EVENTS, buildEvent } from "./events.js";

export function createFinisher({ source, events, handlers = {}, logger }) {
  const allHandlers = { ...defaultHandlers, ...handlers };

  return function finish(req, res, next, result, startedAt) {
    const event = buildEvent(source, req, result, startedAt);

    // Le log et la publication ne doivent jamais casser la requête.
    try {
      if (logger) logger(event);
      events.publish(AUTH_EVENTS.ALL, event);
      events.publish(AUTH_EVENTS.of(event.status), event);
    } catch (err) {
      console.error(`Auth (${source}) : erreur pendant le log ou la publication`, err);
    }

    const handler = allHandlers[result.status.code] ?? defaultHandlers.INTERNAL_ERROR;
    handler(req, res, next, result);
  };
}
