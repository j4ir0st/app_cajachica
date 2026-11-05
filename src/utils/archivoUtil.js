/**
 * archivoUtil.js
 * Utilidades para detección y manejo de archivos adjuntos (imágenes y PDFs),
 * y reglas de obligatoriedad de comprobantes/adjuntos por subgasto.
 */

export const esArchivoPdf = (adj, preview = null) => {
  if (!adj && !preview) return false;

  if (adj instanceof File || adj instanceof Blob) {
    if (adj.type === 'application/pdf') return true;
    if (adj.name && adj.name.toLowerCase().endsWith('.pdf')) return true;
  }

  if (typeof adj === 'string') {
    const urlLimpia = adj.toLowerCase().split('?')[0];
    if (urlLimpia.endsWith('.pdf') || urlLimpia.includes('.pdf')) return true;
  }

  if (typeof preview === 'string') {
    const urlLimpia = preview.toLowerCase().split('?')[0];
    if (urlLimpia.endsWith('.pdf') || urlLimpia.includes('.pdf')) return true;
  }

  return false;
};

/**
 * Normaliza cadenas de texto para comparaciones robustas sin tildes ni caracteres especiales.
 */
const normalizarNombreSubgasto = (texto) => {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

/**
 * Subgastos exentos de adjuntar comprobante o foto obligatoria.
 * Por regla de negocio, 'REFRIGERIO - VIATICOS' e 'IMPRESIONES SIMPLES'
 * no requieren adjunto para poder liquidarse.
 */
const SUBGASTOS_SIN_ADJUNTO_OBLIGATORIO = new Set([
  'refrigerio viaticos',
  'impresiones simples',
]);

/**
 * Determina si un detalle o subgasto específico exige comprobante/foto obligatoria.
 * @param {object|string} detalleOSubgasto - Detalle del requerimiento o nombre/objeto del subgasto.
 * @param {Array} listaSubgastosCatalogo - Catálogo opcional de subgastos para resolver por URL o ID.
 * @returns {boolean} Retorna true si el comprobante/adjunto es obligatorio; false si está exento.
 */
export const subgastoExigeAdjunto = (detalleOSubgasto, listaSubgastosCatalogo = []) => {
  if (!detalleOSubgasto) return true;

  // 1. Extraer nombre directo del subgasto desde varias posibles estructuras
  let nombre = '';
  if (typeof detalleOSubgasto === 'string') {
    nombre = detalleOSubgasto;
  } else if (typeof detalleOSubgasto === 'object') {
    const subObj = detalleOSubgasto.subgasto_obj || detalleOSubgasto.subgasto_id;
    if (subObj && typeof subObj === 'object') {
      nombre = subObj.nombre || subObj.subgasto_nombre || subObj.subgasto || '';
    } else if (typeof detalleOSubgasto.subgasto_nombre === 'string') {
      nombre = detalleOSubgasto.subgasto_nombre;
    } else if (typeof detalleOSubgasto.subgasto === 'string') {
      nombre = detalleOSubgasto.subgasto;
    } else if (typeof detalleOSubgasto.nombre === 'string') {
      nombre = detalleOSubgasto.nombre;
    }

    // 2. Si no se resolvió por objeto anidado, buscar en el catálogo con subgasto_url o ID
    if (!nombre && Array.isArray(listaSubgastosCatalogo) && listaSubgastosCatalogo.length > 0) {
      const targetUrl = detalleOSubgasto.subgasto_url || (typeof subObj === 'string' && subObj.startsWith('http') ? subObj : null);
      const targetId = typeof subObj === 'number' ? subObj : (typeof subObj === 'string' && !subObj.startsWith('http') ? Number(subObj) : null);
      const encontrado = listaSubgastosCatalogo.find((s) => (targetUrl && s.url === targetUrl) || (targetId && s.id === targetId));
      if (encontrado) {
        nombre = encontrado.nombre || '';
      }
    }
  }

  const nombreNorm = normalizarNombreSubgasto(nombre);
  if (SUBGASTOS_SIN_ADJUNTO_OBLIGATORIO.has(nombreNorm)) {
    return false;
  }

  return true;
};

/**
 * Normaliza la URL de un comprobante para compatibilidad tanto en desarrollo local
 * (Docker en Windows o Linux) como en producción (detrás de IIS o Nginx).
 * Convierte URLs locales absolutas en rutas relativas para que pasen por el proxy/host actual.
 */
export const resolverUrlAdjunto = (archivo) => {
  if (!archivo) return '';

  if (archivo instanceof File || archivo instanceof Blob) {
    return URL.createObjectURL(archivo);
  }

  if (typeof archivo !== 'string') return '';

  const urlLimpia = archivo.trim();
  if (!urlLimpia) return '';

  if (urlLimpia.startsWith('blob:') || urlLimpia.startsWith('data:')) {
    return urlLimpia;
  }

  // Si apunta a localhost, 127.0.0.1 o el dominio propio del sistema, convertir a ruta relativa
  if (/^https?:\/\/(localhost|127\.0\.0\.1|appsurgicorperu\.com)(:\d+)?/i.test(urlLimpia)) {
    const rutaRelativa = urlLimpia.replace(/^https?:\/\/[^/]+/i, '');
    return rutaRelativa.startsWith('/') ? rutaRelativa : `/${rutaRelativa}`;
  }

  // Si es un recurso externo independiente (SharePoint, Azure Blob, S3), respetarlo
  if (/^https?:\/\//i.test(urlLimpia)) {
    return urlLimpia;
  }

  // Si es una ruta relativa sin barra inicial (ej: NewAPI/static/...), anteponer '/'
  return urlLimpia.startsWith('/') ? urlLimpia : `/${urlLimpia}`;
};
