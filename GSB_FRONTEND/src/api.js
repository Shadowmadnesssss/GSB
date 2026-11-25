// Client unique de l'API GSB : SDK Bus TCL (src/lib/bus-tcl, copie de B3-Nexa/bus-tcl).
// Session (access 15 min + refresh 7 j, renouvelée seule), erreurs typées (BusError),
// x-request-id sur chaque requête, réessais des GET, session partagée entre onglets.
import { createBusClient, browserStorage } from './lib/bus-tcl/sdk/index.js';
import { API_URL } from './config';

export { BusError, isBusError } from './lib/bus-tcl/sdk/index.js';

// Profil de l'utilisateur connecté ({ _id, name, email, role }), lu par les composants.
export const USER_KEY = 'user';

// Ancien stockage du token (avant Bus TCL) : n'est plus utilisé.
try { localStorage.removeItem('token'); } catch { /* stockage indisponible */ }

export const api = createBusClient({
  baseUrl: API_URL,
  storage: browserStorage(),
  // Le backend Render (offre gratuite) peut mettre ~1 min à se réveiller.
  timeoutMs: 60_000,
  onSessionChange: (session) => {
    if (!session) {
      try { localStorage.removeItem(USER_KEY); } catch { /* idem */ }
    }
  },
  // Session expirée ou révoquée : retour à la page de connexion.
  onAuthError: () => {
    if (window.location.pathname !== '/login') window.location.assign('/login');
  },
});
