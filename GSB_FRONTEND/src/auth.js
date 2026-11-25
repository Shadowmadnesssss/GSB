import { api, USER_KEY } from './api';

export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

export const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));

// Connecté = session Bus TCL valide + profil connu.
export const isAuthenticated = () => api.auth.isAuthenticated && !!getUser();

export async function login(email, password) {
  const { user } = await api.auth.login(email, password);
  setUser(user);
  return user;
}

// Ferme la session côté serveur (refresh token révoqué), puis localement.
export async function logout() {
  await api.auth.logout();
  localStorage.removeItem(USER_KEY);
}
