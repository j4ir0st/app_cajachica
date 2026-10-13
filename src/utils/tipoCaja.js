/**
 * tipoCaja.js
 * Configuración visual y lógica para la determinación del Tipo de Caja
 * basado en empresa_id y requerimiento de factura:
 * - Tipo A: Surgicorp SRL (ID: 1) -> Rojo
 * - Tipo B: RR MEDICAL SRL (ID: 4) -> Azul
 * - Tipo C: No requiere factura / Sin Factura -> Ámbar
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
    nombreEmpresa: 'Surgicorp SRL',
    empresaId: 1,
    claseBadge: 'bg-red-50 text-red-600 border-red-200',
    colorHex: '#dc2626',
    colorFondo: 'bg-red-500',
  },
  B: {
    tipo: 'B',
    etiqueta: 'TIPO: B',
    nombreEmpresa: 'RR MEDICAL SRL',
    empresaId: 4,
    claseBadge: 'bg-blue-50 text-blue-600 border-blue-200',
    colorHex: '#2563eb',
    colorFondo: 'bg-blue-500',
  },
  C: {
    tipo: 'C',
    etiqueta: 'TIPO: C',
    nombreEmpresa: 'Sin Factura',
    empresaId: null,
    claseBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    colorHex: '#d97706',
    colorFondo: 'bg-amber-500',
  },
  D: {
    tipo: 'D',
    etiqueta: 'TIPO: D',
    nombreEmpresa: 'MCKINSEY MEDICA S.R.L.',
    empresaId: 3,
    claseBadge: 'bg-purple-50 text-purple-600 border-purple-200',
    colorHex: '#7c3aed',
    colorFondo: 'bg-purple-500',
  },
  E: {
    tipo: 'E',
    etiqueta: 'TIPO: E',
    nombreEmpresa: 'BIOPRO PERU S.R.L.',
    empresaId: 2,
    claseBadge: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    colorHex: '#059669',
    colorFondo: 'bg-emerald-500',
  },
};

/**
 * Resuelve el Tipo de Caja individual a partir de un empresa_id o un objeto detalle.
 * @param {Object|number|string|null} detOId - Detalle o ID de empresa.
 * @returns {string} Clave del tipo: 'A', 'B', 'C', 'D' o 'E'.
 */
export const resolverClaveTipoIndividual = (detOId) => {
  if (!detOId) return 'C';

  let idEmpresa = null;

  if (typeof detOId === 'number') {
    idEmpresa = detOId;
  } else if (typeof detOId === 'string') {
    const match = detOId.match(/\/(\d+)\/?$/);
    idEmpresa = match ? parseInt(match[1], 10) : parseInt(detOId, 10);
  } else if (typeof detOId === 'object') {
    const campo = detOId.empresa_id !== undefined ? detOId.empresa_id : detOId.empresa;
    if (campo !== null && campo !== undefined) {
      if (typeof campo === 'object') {
        idEmpresa = campo.id || null;
      } else if (typeof campo === 'number') {
        idEmpresa = campo;
      } else if (typeof campo === 'string') {
        const match = campo.match(/\/(\d+)\/?$/);
        idEmpresa = match ? parseInt(match[1], 10) : parseInt(campo, 10);
      }
    }
  }

  if (idEmpresa === 1) return 'A';
  if (idEmpresa === 4) return 'B';
  if (idEmpresa === 3) return 'D';
  if (idEmpresa === 2) return 'E';

  return 'C';
};

/**
 * Obtiene el objeto de Tipo de Caja.
 * Si recibe un requerimiento con lista de comprobantes, analiza qué tipo de caja
 * predomina en mayor cantidad en sus detalles y asigna ese tipo al registro principal.
 * Si recibe un detalle individual o un ID de empresa, devuelve su tipo directo.
 * @param {Object|number|string} reqOId - Requerimiento, detalle o ID de la empresa.
 * @returns {Object} Objeto con tipo, etiqueta, nombreEmpresa, claseBadge, etc.
 */
export const obtenerTipoCaja = (reqOId) => {
  if (!reqOId) return MAPA_TIPOS_CAJA.C;

  // Si es un objeto requerimiento que posee un arreglo de detalles
  if (typeof reqOId === 'object' && reqOId !== null) {
    const listaDetalles = reqOId.detalle || reqOId.detalles;
    if (Array.isArray(listaDetalles) && listaDetalles.length > 0) {
      const conteo = { A: 0, B: 0, C: 0, D: 0, E: 0 };

      listaDetalles.forEach((det) => {
        const clave = resolverClaveTipoIndividual(det);
        if (conteo[clave] !== undefined) {
          conteo[clave]++;
        } else {
          conteo.C++;
        }
      });

      // Determinamos el tipo que tiene más cantidad en los detalles
      let tipoGanador = 'C';
      let maxFrecuencia = -1;

      // Evaluamos en orden para consistencia institucional
      const ordenEvaluacion = ['A', 'B', 'D', 'E', 'C'];
      for (const t of ordenEvaluacion) {
        if (conteo[t] > maxFrecuencia) {
          maxFrecuencia = conteo[t];
          tipoGanador = t;
        }
      }

      return MAPA_TIPOS_CAJA[tipoGanador] || MAPA_TIPOS_CAJA.C;
    }
  }

  // Si es un detalle individual o un ID numérico/string directo
  const claveIndividual = resolverClaveTipoIndividual(reqOId);
  return MAPA_TIPOS_CAJA[claveIndividual] || MAPA_TIPOS_CAJA.C;
};
