// SDK client Bus TCL : appeler depuis un front (navigateur) ou Node >= 18 une API montée avec
// setupBuses() + createBusApi(). Aucune dépendance. Documentation : docs/sdk.md.
//
//   import { createBusClient, browserStorage } from "bus-tcl/client";
//
//   const api = createBusClient({ baseUrl: "https://api.exemple.fr", storage: browserStorage() });
//   await api.auth.login("alice", "••••••");
//   const articles = await api.get("/articles");
export { createBusClient, paginate, DEFAULT_ROUTES } from "./client.js";
export { BusError, isBusError } from "./errors.js";
export { memoryStorage, browserStorage } from "./storage.js";
