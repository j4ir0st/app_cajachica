/**
 * entidades.js
 * Reglas de negocio y utilidades de presentación para el catálogo de Entidades y Sedes Médicas (RC_Entidades).
 *
 * REGLAS INSTITUCIONALES:
 * 1. El nombre visible debe ser SOLO la sede (nombre con el que distribución conoce las entidades).
 * 2. Si la sede dice o contiene "PRINCIPAL" (insensible a mayúsculas) o está vacía,
 *    se debe hacer fallback a la `razon_social`.
 * 3. Filtrar y mostrar únicamente sedes marcadas como entrega: `tipo_sede='E'` y `de_baja!='S'`.
 */

/**
 * Determina si el texto de una sede contiene o es "PRINCIPAL".
 * @param {string} texto
 * @returns {boolean}
 */
export const contienePrincipal = (texto) => {
  if (!texto || typeof texto !== 'string') return false;
  return /principal/i.test(texto.trim());
};

/**
 * Obtiene el nombre de sede depurado:
 * Solo muestra la sede; si la sede es "PRINCIPAL" o está ausente, hace fallback a `razon_social`.
 * @param {Object} ent - Objeto de entidad recibido del backend o caché.
 * @returns {string} Nombre de sede limpio.
 */
export const obtenerNombreEntidadLimpio = (ent) => {
  if (!ent) return '';
  if (typeof ent === 'string') return ent;

  const sede = (ent.sede || ent.nombre_comercial || ent.nombre || '').trim();
  const razon = (ent.razon_social || '').trim();

  // Si la sede dice o contiene "PRINCIPAL", o está vacía, fallback a razon_social
  if (!sede || contienePrincipal(sede)) {
    return razon || sede || 'Entidad';
  }

  // Lo ideal es que solo salga la sede (como la conoce el personal de distribución)
  return sede;
};

/**
 * Formatea la etiqueta de una entidad para su visualización en Combobox, resúmenes y tarjetas.
 * @param {Object} ent - Entidad de RC_Entidades
 * @returns {string} Sede limpia (o razón social si sede=PRINCIPAL).
 */
export const formatearNombreEntidad = (ent) => {
  return obtenerNombreEntidadLimpio(ent);
};

/**
 * Genera el subtítulo descriptivo secundario para el Combobox.
 * Si se muestra la sede, coloca la razón social y RUC abajo.
 * @param {Object} ent
 * @returns {string}
 */
export const formatearSubtituloEntidad = (ent) => {
  if (!ent || typeof ent !== 'object') return '';
  const partes = [];
  const sede = (ent.sede || ent.nombre_comercial || ent.nombre || '').trim();
  const razon = (ent.razon_social || '').trim();

  if (!contienePrincipal(sede) && razon && razon.toLowerCase() !== sede.toLowerCase()) {
    partes.push(razon);
  } else if (ent.codigo_sede) {
    partes.push(`Código: ${ent.codigo_sede}`);
  }

  if (ent.ruc) partes.push(`RUC: ${ent.ruc}`);

  return partes.join(' • ');
};

/**
 * Determina si un valor tipo_sede corresponde a 'E' (Entrega).
 * Soporta string ('E') o formato objeto DRF TextChoices ({ "E": "Entrega" }).
 * @param {any} tipoSede
 * @returns {boolean}
 */
export const esTipoEntrega = (tipoSede) => {
  if (!tipoSede) return false;
  if (typeof tipoSede === 'string') {
    return tipoSede.trim().toUpperCase() === 'E';
  }
  if (typeof tipoSede === 'object') {
    if ('E' in tipoSede) return true;
    if (tipoSede.clave && String(tipoSede.clave).toUpperCase() === 'E') return true;
    if (tipoSede.id && String(tipoSede.id).toUpperCase() === 'E') return true;
    if (tipoSede.code && String(tipoSede.code).toUpperCase() === 'E') return true;
    return Object.keys(tipoSede).some((k) => k.trim().toUpperCase() === 'E');
  }
  return false;
};

/**
 * Valida si la entidad está activa, marcada como Entrega (tipo_sede='E')
 * y NO dice ni contiene "PRINCIPAL" (las sedes con principal no se usan y deben omitirse).
 * @param {Object} ent
 * @returns {boolean}
 */
export const esEntidadValidaEntrega = (ent) => {
  if (!ent || typeof ent !== 'object') return false;
  // Descartar si está de baja ('S' = sí de baja)
  if (ent.de_baja && String(ent.de_baja).trim().toUpperCase() === 'S') return false;
  // Solo sedes marcadas como entrega: tipo_sede='E'
  if (!esTipoEntrega(ent.tipo_sede)) return false;
  // Omitir entidades que digan o contengan "PRINCIPAL" o que no tengan nombre de sede
  const sede = (ent.sede || ent.nombre_comercial || ent.nombre || '').trim();
  if (!sede || contienePrincipal(sede)) return false;

  return true;
};
