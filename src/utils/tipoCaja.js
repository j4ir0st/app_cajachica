/**
 * tipoCaja.js
 * Configuración visual y lógica para la determinación del Tipo de Caja
 * basado en empresa_id y requerimiento de factura:
 * - Tipo A: Surgicorp SRL (ID: 1) -> Rojo
 * - Tipo B: RR MEDICAL SRL (ID: 4) -> Azul
 * - Tipo C: Sin Factura -> Ámbar
 * - Tipo D: MCKINSEY MEDICA S.R.L. (ID: 3) -> Morado / Púrpura
 * - Tipo E: BIOPRO PERU S.R.L. (ID: 2) -> Esmeralda
 */

export const LISTA_EMPRESAS = [
  { id: 1, nombre: 'Surgicorp SRL', tipo: 'A' },
  { id: 4, nombre: 'RR MEDICAL SRL', tipo: 'B' },
  { id: 3, nombre: 'MCKINSEY MEDICA S.R.L.', tipo: 'D' },
  { id: 2, nombre: 'BIOPRO PERU S.R.L.', tipo: 'E' },
];

export const MAPA_TIPOS_CAJA = {
  A: {
    tipo: 'A',
    etiqueta: 'TIPO: A',
    etiquetaCabecera: 'Factura a Surgicorp',
    nombreEmpresa: 'Surgicorp SRL',
    empresaId: 1,
    claseBadge: 'bg-red-50 text-red-600 border-red-200',
    colorHex: '#dc2626',
    colorFondo: 'bg-red-500',
  },
  B: {
    tipo: 'B',
    etiqueta: 'TIPO: B',
    etiquetaCabecera: 'Factura a RR Medical',
    nombreEmpresa: 'RR MEDICAL SRL',
    empresaId: 4,
    claseBadge: 'bg-blue-50 text-blue-600 border-blue-200',
    colorHex: '#2563eb',
    colorFondo: 'bg-blue-500',
  },
  C: {
    tipo: 'C',
    etiqueta: 'TIPO: C',
    etiquetaCabecera: 'Sin Factura',
    nombreEmpresa: 'Sin Factura',
    empresaId: null,
    claseBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    colorHex: '#d97706',
    colorFondo: 'bg-amber-500',
  },
  D: {
    tipo: 'D',
    etiqueta: 'TIPO: D',
    etiquetaCabecera: 'Factura a Mackensy Medical',
    nombreEmpresa: 'MCKINSEY MEDICA S.R.L.',
    empresaId: 3,
    claseBadge: 'bg-purple-50 text-purple-600 border-purple-200',
    colorHex: '#7c3aed',
    colorFondo: 'bg-purple-500',
  },
  E: {
    tipo: 'E',
    etiqueta: 'TIPO: E',
    etiquetaCabecera: 'Factura a Biopro Perú',
    nombreEmpresa: 'BIOPRO PERU S.R.L.',
    empresaId: 2,
    claseBadge: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    colorHex: '#059669',
    colorFondo: 'bg-emerald-500',
  },
};

/**
 * Extrae de forma robusta el ID numérico de la empresa a partir de cualquier formato:
 * - ID numérico: 1, 4, 3, 2
 * - String numérico o URL: "1", "https://appsurgicorperu.com/Empresa/1/", "/Empresa/1/"
 * - Objeto empresa serializado: { "url": "...", "id": 1, "empresa": "SURGICORP S.R.L." }
 * - Objeto detalle o requerimiento: { "empresa_id": { "id": 1, ... } } o { "empresa_id": 1 } o { "empresa": ... }
 * - String con nombre de la empresa: "SURGICORP", "RR MEDICAL", "MCKINSEY", "BIOPRO"
 * @param {any} val - Valor o estructura que contiene la empresa.
 * @returns {number|null} ID numérico de la empresa (1, 4, 3, 2) o null.
 */
export const extraerIdEmpresa = (val) => {
  if (val === null || val === undefined) return null;

  // 1. Número directo
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }

  // 2. String (URL, número en string, o nombre institucional)
  if (typeof val === 'string') {
    const limpio = val.trim();
    if (!limpio) return null;

    // URL tipo /Empresa/1/ o https://.../Empresa/1/
    const match = limpio.match(/\/(\d+)\/?$/);
    if (match) return parseInt(match[1], 10);

    // String numérico ("1", "4")
    const parsed = parseInt(limpio, 10);
    if (!isNaN(parsed) && String(parsed) === limpio) return parsed;

    // Coincidencia por texto/razón social
    const norm = limpio
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (norm.includes('SURGICORP')) return 1;
    if (norm.includes('RR MEDICAL') || norm.includes('RR_MEDICAL') || norm.includes('R.R.')) return 4;
    if (norm.includes('MCKINSEY') || norm.includes('MACKENSY')) return 3;
    if (norm.includes('BIOPRO')) return 2;

    return null;
  }

  // 3. Objeto
  if (typeof val === 'object') {
    // Si tiene campos de registro (costo, requerimiento_id, usuario_id, detalle, monto_solicitado),
    // se trata de un requerimiento o detalle, NO de la entidad Empresa en sí.
    const esRegistroGasto =
      'costo' in val ||
      'requerimiento_id' in val ||
      'subgasto_id' in val ||
      'subgasto_url' in val ||
      'tipogasto_url' in val ||
      'monto_solicitado' in val ||
      'total_gastado' in val ||
      'fecha_solicitud' in val;

    if (!esRegistroGasto) {
      // Es directamente el objeto Empresa serializado
      // ej: { url: 'https://.../Empresa/1/', id: 1, empresa: 'SURGICORP S.R.L.' }
      if (val.id !== undefined && val.id !== null) {
        const idNum = typeof val.id === 'number' ? val.id : parseInt(val.id, 10);
        if (!isNaN(idNum) && [1, 2, 3, 4].includes(idNum)) {
          return idNum;
        }
      }
      if (typeof val.empresa === 'string') {
        const res = extraerIdEmpresa(val.empresa);
        if (res !== null) return res;
      }
      if (typeof val.nombre === 'string') {
        const res = extraerIdEmpresa(val.nombre);
        if (res !== null) return res;
      }
      if (typeof val.razon_social === 'string') {
        const res = extraerIdEmpresa(val.razon_social);
        if (res !== null) return res;
      }
      if (typeof val.url === 'string') {
        const res = extraerIdEmpresa(val.url);
        if (res !== null) return res;
      }
    }

    // Si es un detalle o requerimiento, buscar en sus campos de empresa
    const candidatos = [
      val.empresa_id,
      val.empresa,
      val.empr_id,
      val.empresa_obj,
      val.empresa_factura,
      val.empresa_nombre,
    ];

    for (const cand of candidatos) {
      if (cand !== null && cand !== undefined) {
        const idExtraido = extraerIdEmpresa(cand);
        if (idExtraido !== null) return idExtraido;
      }
    }
  }

  return null;
};

/**
 * Resuelve el Tipo de Caja individual a partir de un empresa_id o un objeto detalle.
 * @param {Object|number|string|null} detOId - Detalle o ID de empresa.
 * @returns {string} Clave del tipo: 'A', 'B', 'C', 'D' o 'E'.
 */
export const resolverClaveTipoIndividual = (detOId) => {
  const idEmpresa = extraerIdEmpresa(detOId);

  if (idEmpresa === 1) return 'A';
  if (idEmpresa === 4) return 'B';
  if (idEmpresa === 3) return 'D';
  if (idEmpresa === 2) return 'E';

  return 'C';
};

/**
 * Obtiene el objeto de Tipo de Caja.
 * - Para la tarjeta general / encabezado del requerimiento: muestra el nombre completo de facturación.
 * - Para los detalles de gasto: mantiene la nomenclatura individual tipo 'TIPO: A'.
 * @param {Object|number|string} reqOId - Requerimiento, detalle o ID de la empresa.
 * @param {boolean|null} esDetalle - Forzar si se trata de un detalle individual (true) o cabecera (false).
 * @returns {Object} Objeto con tipo, etiqueta, nombreEmpresa, claseBadge, etc.
 */
export const obtenerTipoCaja = (reqOId, esDetalle = null) => {
  if (!reqOId) {
    const baseC = MAPA_TIPOS_CAJA.C;
    return {
      ...baseC,
      etiqueta: esDetalle ? baseC.etiqueta : baseC.etiquetaCabecera,
      etiquetaDetalle: baseC.etiqueta,
      etiquetaGeneral: baseC.etiquetaCabecera,
    };
  }

  const tieneDetalles =
    typeof reqOId === 'object' &&
    reqOId !== null &&
    (Array.isArray(reqOId.detalle) || Array.isArray(reqOId.detalles));

  // Detección automática: Es detalle si es número, string o tiene 'costo' / 'subgasto_url' / 'subgasto_id'
  const esDetalleCalculado =
    esDetalle !== null
      ? esDetalle
      : (
        typeof reqOId === 'number' ||
        typeof reqOId === 'string' ||
        (typeof reqOId === 'object' &&
          reqOId !== null &&
          !tieneDetalles &&
          (
            'costo' in reqOId ||
            'subgasto_url' in reqOId ||
            'subgasto_id' in reqOId ||
            'tipogasto_url' in reqOId
          ))
      );

  let clave = 'C';

  // Si es un objeto requerimiento que posee un arreglo de detalles
  if (typeof reqOId === 'object' && reqOId !== null && !esDetalleCalculado) {
    const listaDetalles = reqOId.detalle || reqOId.detalles;

    const conteo = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    let detallesConFactura = 0;

    if (Array.isArray(listaDetalles) && listaDetalles.length > 0) {
      listaDetalles.forEach((det) => {
        if (det && typeof det === 'object') {
          const c = resolverClaveTipoIndividual(det);
          if (c !== 'C') {
            detallesConFactura++;
            conteo[c]++;
          }
        }
      });
    }

    if (detallesConFactura > 0) {
      let maxFrecuencia = -1;
      let ganador = 'C';
      for (const t of ['A', 'B', 'D', 'E']) {
        if (conteo[t] > maxFrecuencia) {
          maxFrecuencia = conteo[t];
          ganador = t;
        }
      }
      clave = ganador;
    } else {
      // Si los detalles no tenían empresa o la lista está vacía / contiene solo URLs,
      // se evalúa la empresa_id del requerimiento principal
      clave = resolverClaveTipoIndividual(reqOId);
    }
  } else {
    // Si es un detalle individual o un ID numérico/string directo
    clave = resolverClaveTipoIndividual(reqOId);
  }

  const base = MAPA_TIPOS_CAJA[clave] || MAPA_TIPOS_CAJA.C;

  return {
    ...base,
    etiqueta: esDetalleCalculado ? base.etiqueta : base.etiquetaCabecera,
    etiquetaDetalle: base.etiqueta,
    etiquetaGeneral: base.etiquetaCabecera,
  };
};
