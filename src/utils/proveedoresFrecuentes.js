/**
 * proveedoresFrecuentes.js
 * Mapeo de proveedores frecuentes por Tipo de Gasto y Subgasto para Caja Chica.
 * Permite filtrar y presentar botones de acceso rápido contextuales en Step2Detalles.
 */

export const LISTA_PROVEEDORES_FRECUENTES = [
  {
    item: 1,
    nombre_comercial: 'VENTURA MISIYAURI JUAN VALERIO',
    razon_social: 'VENTURA MISIYAURI JUAN VALERIO',
    nro_ruc: '10089742710',
    tipos_gasto: [
      'ACC Y REPUESTOS UNIDADES TRANSPORTE',
      'MANTENIMIENTO Y/O REVISIONES UNIDADES TRANSPORTE',
    ],
    subgasto: null,
  },
  {
    item: 2,
    nombre_comercial: 'GPS SATELITAL',
    razon_social: 'GPS SATELITAL PERU EIRL',
    nro_ruc: '20603456981',
    tipos_gasto: [
      'ACC Y REPUESTOS UNIDADES TRANSPORTE',
      'MANTENIMIENTO Y/O REVISIONES UNIDADES TRANSPORTE',
    ],
    subgasto: null,
  },
  {
    item: 3,
    nombre_comercial: 'COESTI',
    razon_social: 'COESTI SA',
    nro_ruc: '20127765279',
    tipos_gasto: ['COMBUSTIBLE UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 4,
    nombre_comercial: 'REPSOL',
    razon_social: 'REPSOL COMERCIAL SAC',
    nro_ruc: '20503840121',
    tipos_gasto: ['COMBUSTIBLE UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 5,
    nombre_comercial: 'SHENANDOA',
    razon_social: 'SHENANDOA SAC',
    nro_ruc: '20147847727',
    tipos_gasto: ['COMBUSTIBLE UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 6,
    nombre_comercial: 'OLTURSA',
    razon_social: 'EMPRESA DE TRANSPORTES TURISTICO OLANO SA',
    nro_ruc: '20135414931',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 7,
    nombre_comercial: 'CRUZ DEL SUR',
    razon_social: 'TRANSPORTES CRUZ DEL SUR SAC',
    nro_ruc: '20100227461',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 8,
    nombre_comercial: 'SAN MARTIN',
    razon_social: 'TRANSPORTES SAN MARTIN S.A.',
    nro_ruc: '20131560266',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 9,
    nombre_comercial: 'MOVIL BUS',
    razon_social: 'MOVIL BUS SAC',
    nro_ruc: '20555901179',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 10,
    nombre_comercial: 'LATAM AIRLINES',
    razon_social: 'LATAM AIRLINES PERU SAC',
    nro_ruc: '20341841357',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 11,
    nombre_comercial: 'CIVA',
    razon_social: 'TURISMO CIVA SAC',
    nro_ruc: '20102427891',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 12,
    nombre_comercial: 'VIGO TOURS',
    razon_social: 'VIGO TOURS SAC',
    nro_ruc: '20603007175',
    tipos_gasto: ['DISTRIBUCIÓN PROVINCIA'],
    subgasto: null,
  },
  {
    item: 13,
    nombre_comercial: 'INVERSIONES URBANISTICAS',
    razon_social: 'INVERSIONES URBANISTICAS OPERADORA SAC',
    nro_ruc: '20603381697',
    tipos_gasto: ['ESTACIONAMIENTO UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 14,
    nombre_comercial: 'TEMPLO',
    razon_social: 'TEMPLO SAC',
    nro_ruc: '20521127296',
    tipos_gasto: ['ESTACIONAMIENTO UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 15,
    nombre_comercial: 'P.G. PROMOTORES',
    razon_social: 'P.G. PROMOTORES S.R.L',
    nro_ruc: '20508451921',
    tipos_gasto: ['ESTACIONAMIENTO UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 16,
    nombre_comercial: 'LTC INVERSIONES',
    razon_social: 'LTC INVERSIONES SA',
    nro_ruc: '20306230612',
    tipos_gasto: ['ESTACIONAMIENTO UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 17,
    nombre_comercial: 'JERUSALEMA',
    razon_social: 'JERUSALEMA SAC',
    nro_ruc: '20609011808',
    tipos_gasto: ['ESTACIONAMIENTO UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 18,
    nombre_comercial: 'MOA INTERAMERICANA',
    razon_social: 'MOA INTERAMERICANA SAC',
    nro_ruc: '20602281257',
    tipos_gasto: ['ESTACIONAMIENTO UNIDADES TRANSPORTE'],
    subgasto: null,
  },
  {
    item: 19,
    nombre_comercial: 'ICE POWER SAC',
    razon_social: 'ICE POWER SAC',
    nro_ruc: '20519111307',
    tipos_gasto: ['INSUMOS Y/O EMBALAJES'],
    subgasto: null,
  },
  {
    item: 20,
    nombre_comercial: 'LIMA EXPRESA',
    razon_social: 'LIMA EXPRESA SAC',
    nro_ruc: '20523621212',
    tipos_gasto: ['PEAJES UNIDADES DE TRANSPORTE'],
    subgasto: 'PEAJE MANUAL',
  },
  {
    item: 21,
    nombre_comercial: 'PERU PEX SAC',
    razon_social: 'PERU PEX SAC',
    nro_ruc: '20600046153',
    tipos_gasto: ['PEAJES UNIDADES DE TRANSPORTE'],
    subgasto: 'RECARGA PEX',
  },
  {
    item: 22,
    nombre_comercial: 'CULQUER',
    razon_social: 'CULQUER GROUP S.A.C.',
    nro_ruc: '20565673051',
    tipos_gasto: ['SERVICIO DE LAVADO Y/O ESTERILIZACIÓN'],
    subgasto: null,
  },
  {
    item: 23,
    nombre_comercial: 'PERLITA EXPRESS',
    razon_social: 'PERLITA EXPRESS LAVANDERIA',
    nro_ruc: '10422309468',
    tipos_gasto: ['SERVICIO DE LAVADO Y/O ESTERILIZACIÓN'],
    subgasto: null,
  },
  {
    item: 24,
    nombre_comercial: 'T & CH ASOCIADOS',
    razon_social: 'T & CH ASOCIADOS S.A.C.',
    nro_ruc: '20506666032',
    tipos_gasto: ['SERVICIO DE LAVADO Y/O ESTERILIZACIÓN'],
    subgasto: null,
  },
];

/**
 * Normaliza cadenas para comparaciones sin acentos ni mayúsculas.
 */
const normalizar = (txt) => {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/**
 * Obtiene los proveedores frecuentes correspondientes al tipo y subgasto activo.
 * @param {string|Object} tipoGasto - Nombre u objeto de Tipo de Gasto.
 * @param {string|Object} subgasto - Nombre u objeto de Subgasto.
 * @param {Array} catalogoProveedores - Lista completa de RC_Proveedor cargada en memoria.
 * @returns {Array} Lista de proveedores frecuentes encontrados para mostrar como botones.
 */
export const obtenerProveedoresFrecuentesContextuales = (tipoGasto, subgasto, catalogoProveedores = []) => {
  const nombreTipo = typeof tipoGasto === 'object' ? tipoGasto?.nombre : tipoGasto;
  const nombreSub = typeof subgasto === 'object' ? subgasto?.nombre : subgasto;

  if (!nombreTipo && !nombreSub) return [];

  const tipoNorm = normalizar(nombreTipo);
  const subNorm = normalizar(nombreSub);

  // Filtrar las reglas que coincidan con el tipo de gasto y/o subgasto
  const reglasCoincidentes = LISTA_PROVEEDORES_FRECUENTES.filter((regla) => {
    // 1. Verificación por subgasto específico si la regla lo define
    if (regla.subgasto) {
      const reglaSubNorm = normalizar(regla.subgasto);
      if (subNorm && (subNorm.includes(reglaSubNorm) || reglaSubNorm.includes(subNorm))) {
        return true;
      }
      return false;
    }

    // 2. Verificación por Tipo de Gasto
    const coincideTipo = regla.tipos_gasto.some((t) => {
      const tNorm = normalizar(t);
      return tipoNorm.includes(tNorm) || tNorm.includes(tipoNorm);
    });

    return coincideTipo;
  });

  if (reglasCoincidentes.length === 0) return [];

  // Emparejar cada regla con el objeto de proveedor real de la base de datos
  return reglasCoincidentes.map((regla) => {
    const provEncontrado = (catalogoProveedores || []).find((p) => {
      if (regla.nro_ruc && p.nro_ruc && String(p.nro_ruc).trim() === String(regla.nro_ruc).trim()) {
        return true;
      }
      const pNomCom = normalizar(p.nombre_comercial);
      const rNomCom = normalizar(regla.nombre_comercial);
      if (pNomCom && rNomCom && pNomCom === rNomCom) return true;

      const pRaz = normalizar(p.razon_social);
      const rRaz = normalizar(regla.razon_social);
      return pRaz && rRaz && (pRaz.includes(rRaz) || rRaz.includes(pRaz));
    });

    return {
      nombre: regla.nombre_comercial,
      razon_social: regla.razon_social,
      nro_ruc: regla.nro_ruc,
      proveedor: provEncontrado || {
        id: null,
        nro_ruc: regla.nro_ruc,
        razon_social: regla.razon_social,
        nombre_comercial: regla.nombre_comercial,
      },
    };
  });
};

