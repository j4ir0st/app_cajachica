/**
 * catalogoCache.js
 * Utilidad de caché persistente para catálogos de Caja Chica.
 * Almacena en localStorage con TTL de 24 horas.
 * El Header puede llamar a `limpiarTodo()` para forzar recarga.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

// Claves utilizadas en localStorage
export const CLAVES_CATALOGO = {
  tiposGasto: 'cc_cache_tipogasto',
  subgastos:  'cc_cache_subgasto',
  entidades:  'cc_cache_entidades',
  provincias: 'cc_cache_provincias',
};

/**
 * Guarda datos en caché con marca de expiración.
 * Solo persiste si los datos son un array válido.
 * @param {string} clave - Clave del catálogo (de CLAVES_CATALOGO).
 * @param {Array}  datos - Array de objetos a persistir.
 */
export const guardarEnCache = (clave, datos) => {
  if (!Array.isArray(datos)) return; // Nunca cachear respuestas de error
  const entrada = { datos, expira: Date.now() + TTL_MS };
  localStorage.setItem(clave, JSON.stringify(entrada));
};

/**
 * Lee datos del caché si existen, no han expirado y son un array válido.
 * @param {string} clave - Clave del catálogo.
 * @returns {Array|null} Los datos si están vigentes, null si expiró, no existe o es inválido.
 */
export const leerDeCache = (clave) => {
  const raw = localStorage.getItem(clave);
  if (!raw) return null;
  try {
    const { datos, expira } = JSON.parse(raw);
    if (Date.now() > expira || !Array.isArray(datos)) {
      localStorage.removeItem(clave);
      return null;
    }
    return datos;
  } catch {
    localStorage.removeItem(clave);
    return null;
  }
};

/**
 * Elimina todos los catálogos del caché para forzar recarga desde la API.
 */
export const limpiarCatalogos = () => {
  Object.values(CLAVES_CATALOGO).forEach((k) => localStorage.removeItem(k));
};
