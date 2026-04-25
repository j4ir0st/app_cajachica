/**
 * fetchAuth.js
 * Wrapper centralizado sobre fetch para peticiones autenticadas.
 *
 * Flujo al recibir un 401:
 *   1. Intenta renovar el access token usando el refresh token del store.
 *   2. Si la renovación es exitosa, reintenta la petición original con el nuevo token.
 *   3. Si falla (refresh inválido o expirado), muestra un overlay de aviso
 *      y redirige al login después de 3 segundos.
 */

import { useUserStore } from '../store/userStore';

const API_URL = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL;

// Bandera para evitar múltiples intentos de refresh simultáneos
let refrescando = false;

/**
 * Muestra un overlay que avisa al usuario que se redirigirá al login.
 * Se destruye solo cuando la página hace el redirect.
 */
const mostrarAvisoExpiracion = () => {
  // Evitar duplicados si ya existe el overlay
  if (document.getElementById('cc-token-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'cc-token-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Outfit', sans-serif;
    animation: fadeIn 0.3s ease;
  `;
  overlay.innerHTML = `
    <div style="
      background: white; border-radius: 24px; padding: 40px 48px;
      text-align: center; max-width: 380px; box-shadow: 0 32px 64px rgba(0,0,0,0.3);
    ">
      <div style="
        width: 56px; height: 56px; border-radius: 50%;
        background: #FEF2F2; margin: 0 auto 16px;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px;
      ">⏱️</div>
      <h3 style="color: #1e293b; font-size: 18px; font-weight: 800; margin: 0 0 8px;">
        Sesión expirada
      </h3>
      <p style="color: #64748b; font-size: 14px; margin: 0 0 20px; line-height: 1.5;">
        Tu sesión ha expirado. Por seguridad, serás redirigido al inicio de sesión en unos segundos.
      </p>
      <div style="
        height: 4px; background: #f1f5f9; border-radius: 99px; overflow: hidden;
      ">
        <div id="cc-progress" style="
          height: 100%; width: 100%; background: #0ea5e9;
          border-radius: 99px;
          transition: width 3s linear;
        "></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Iniciar la barra de progreso en el siguiente frame para que la transición sea visible
  requestAnimationFrame(() => {
    const barra = document.getElementById('cc-progress');
    if (barra) barra.style.width = '0%';
  });
};

/**
 * Intenta renovar el access token usando el refresh token almacenado.
 * @returns {Promise<string|null>} El nuevo access token, o null si falla.
 */
const renovarToken = async () => {
  const { refreshToken, setToken, logout } = useUserStore.getState();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!res.ok) return null;

    const datos = await res.json();
    const nuevoToken = datos.access;
    setToken(nuevoToken);
    return nuevoToken;
  } catch {
    return null;
  }
};

/**
 * Maneja la expiración de sesión irrecuperable:
 * muestra aviso y redirige al login tras 3 segundos.
 */
const manejarSesionExpirada = () => {
  const { logout } = useUserStore.getState();
  logout();
  mostrarAvisoExpiracion();
  setTimeout(() => {
    window.location.href = '/app_cajachica/login';
  }, 3000);
};

/**
 * Realiza un fetch autenticado con el token JWT del store.
 * En caso de 401, intenta refrescar el token una sola vez.
 * @param {string} url - URL del endpoint.
 * @param {RequestInit} opciones - Opciones de fetch (method, body, etc.).
 * @returns {Promise<Response>}
 */
export const fetchAuth = async (url, opciones = {}) => {
  const { token } = useUserStore.getState();

  const construirCabeceras = (tkn) => ({
    ...opciones.headers,
    Authorization: `Bearer ${tkn}`,
  });

  // Primera petición con el token actual
  const respuesta = await fetch(url, {
    ...opciones,
    headers: construirCabeceras(token),
  });

  // Si no es 401 o ya estamos en medio de un refresh, devolver directamente
  if (respuesta.status !== 401) return respuesta;
  if (refrescando) {
    manejarSesionExpirada();
    // Devolvemos la respuesta 401 original para que el caller la maneje
    return respuesta;
  }

  // Intentar renovar el token (solo un intento simultáneo)
  refrescando = true;
  const nuevoToken = await renovarToken();
  refrescando = false;

  if (!nuevoToken) {
    // El refresh falló: sesión irrecuperable
    manejarSesionExpirada();
    return respuesta;
  }

  // Reintentar la petición original con el nuevo token
  return fetch(url, {
    ...opciones,
    headers: construirCabeceras(nuevoToken),
  });
};
