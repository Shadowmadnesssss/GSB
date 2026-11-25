// API HTTP du Bus TCL : assemble les routes auth, logs et monitoring.
//
//   const api = createBusApi({ secret });
//   const ctx = setupBuses(app, {
//     auth: { secret, publicRoutes: api.publicRoutes },
//     monitor: { notifier: new MultiNotifier([new ConsoleNotifier(), api.alertHistory.notifier]) },
//     registerRoutes: (app, ctx) => api.register(app, ctx),
//   });
//
// Chaque partie peut être désactivée (auth: false, logs: false, monitoring: false).
import { createTokenService } from "../shared/auth/tokens.js";
import { createAuthApi } from "./authApi.js";
import { createLogsApi } from "./logsApi.js";
import { createMonitoringApi } from "./monitoringApi.js";
import { createAlertHistory } from "./alertHistory.js";

export { createAuthApi } from "./authApi.js";
export { createLogsApi } from "./logsApi.js";
export { createMonitoringApi } from "./monitoringApi.js";
export { createAlertHistory } from "./alertHistory.js";
export { createCors } from "./cors.js";

export function createBusApi({
  secret,
  auth = {},           // options de createAuthApi + { tokens: options de createTokenService }, ou false
  logs = {},           // options de createLogsApi, ou false
  monitoring = {},     // options de createMonitoringApi, ou false
  alertHistory = createAlertHistory(),
} = {}) {
  let tokens = null;
  let authApi = null;
  if (auth !== false) {
    const { tokens: tokenOptions, tokenService, ...authOptions } = auth;
    tokens = tokenService ?? createTokenService({ secret, ...tokenOptions });
    authApi = createAuthApi({ tokens, ...authOptions });
  }
  const logsApi = logs === false ? null : createLogsApi(logs);
  const monitoringApi = monitoring === false ? null : createMonitoringApi({ history: alertHistory, ...monitoring });

  return {
    publicRoutes: authApi ? authApi.publicRoutes : [],
    alertHistory,
    tokens,
    register(app, ctx) {
      authApi?.register(app, ctx);
      logsApi?.register(app, ctx);
      monitoringApi?.register(app, ctx);
    },
  };
}
