import { useUserStore } from '../store/userStore';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Bandera para evitar múltiples intentos de refresh simultáneos
let refrescando = false;

/**
 * Muestra un overlay que avisa al usuario que se redirigirá al login.
 */
const mostrarAvisoExpiracion = () => {
  if (document.getElementById('cc-token-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'cc-token-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Outfit', sans-serif;
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
      <div style="height: 4px; background: #f1f5f9; border-radius: 99px; overflow: hidden;">
        <div id="cc-progress" style="height: 100%; width: 100%; background: #0ea5e9; border-radius: 99px; transition: width 3s linear;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    const barra = document.getElementById('cc-progress');
    if (barra) barra.style.width = '0%';
  });
};

/**
 * Intenta renovar el access token usando el refresh token.
 */
const renovarToken = async () => {
  const { refreshToken, setToken } = useUserStore.getState();
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
  } catch (error) {
    console.error('[fetchAuth] Error crítico al renovar token:', error);
    return null;
  }
};

const manejarSesionExpirada = () => {
  const { logout } = useUserStore.getState();
  logout();
  mostrarAvisoExpiracion();
  setTimeout(() => {
    window.location.href = '/app_cajachica/login';
  }, 3000);
};

/**
 * Realiza un fetch autenticado con el token JWT.
 * Normaliza la URL para evitar dobles slashes.
 */
export const fetchAuth = async (url, opciones = {}) => {
  const { token } = useUserStore.getState();
  
  // Normalizar URL: quitar slashes duplicados (excepto después de http://)
  const urlFinal = url.replace(/([^:]\/)\/+/g, "$1");

  const construirCabeceras = (tkn) => {
    const headers = { ...opciones.headers };
    if (tkn) {
      headers['Authorization'] = `Bearer ${tkn}`;
    }
    return headers;
  };

  try {
    const respuesta = await fetch(urlFinal, {
      ...opciones,
      headers: construirCabeceras(token),
    });

    if (respuesta.status !== 401) return respuesta;

    if (refrescando) {
      manejarSesionExpirada();
      return respuesta;
    }

    refrescando = true;
    const nuevoToken = await renovarToken();
    refrescando = false;

    if (!nuevoToken) {
      manejarSesionExpirada();
      return respuesta;
    }

    // Reintentar con el nuevo token
    return fetch(urlFinal, {
      ...opciones,
      headers: construirCabeceras(nuevoToken),
    });
  } catch (error) {
    console.error(`[fetchAuth] Error de red en ${urlFinal}:`, error);
    throw error;
  }
};

