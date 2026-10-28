/**
 * reglasAccesos.js
 * Matriz de reglas de visibilidad y acceso a Tipos de Gasto y Subgastos
 * basada en la matriz oficial: "ACCESOS OPCIONES CAJA CHICA.xlsx"
 *
 * Criterios evaluados:
 * - Área del usuario (campo user.area): "DISTRIBUCIÓN", "ALMACÉN INSTRUMENTALES" u otras áreas.
 * - Puesto del usuario (campo user.puesto): "CHOFERES", "COORDINADORES" o "GERENTE DE OPERACIONES" (el "YO" del Excel).
 */

/**
 * Normaliza cadenas de texto para comparaciones robustas e insensibles a mayúsculas, diacríticos y puntuación.
 */
export const normalizarTexto = (texto) => {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const extraerTextoDeCampo = (campo) => {
  if (!campo) return '';
  if (typeof campo === 'string') return campo.trim();
  if (typeof campo === 'object') {
    return (
      campo.nombre ||
      campo.puesto_nombre ||
      campo.area_nombre ||
      campo.name ||
      campo.descripcion ||
      ''
    ).trim();
  }
  return String(campo).trim();
};

/**
 * Obtiene el área textual del usuario con soporte para objetos y serializers de DRF.
 */
export const obtenerAreaUsuario = (user) => {
  if (!user) return '';

  const candidatos = [
    extraerTextoDeCampo(user.area_id),
    user.area_puesto?.area_nombre,
    user.area_puesto?.area,
    user.area_nombre,
    extraerTextoDeCampo(user.area),
  ];

  for (const c of candidatos) {
    if (c && typeof c === 'string' && c.trim() && c.trim() !== 'Sin Área') {
      if (!c.startsWith('http') && !c.startsWith('/') && isNaN(Number(c))) {
        return c.trim();
      }
    }
  }

  return String(user.area || user.area_nombre || user.area_id || '').trim();
};

/**
 * Obtiene el puesto textual del usuario con soporte para objetos y serializers de DRF.
 */
export const obtenerPuestoUsuario = (user) => {
  if (!user) return '';

  const candidatos = [
    extraerTextoDeCampo(user.puesto_id),
    user.area_puesto?.puesto_nombre,
    user.area_puesto?.puesto,
    user.puesto_nombre,
    extraerTextoDeCampo(user.puesto),
    extraerTextoDeCampo(user.cargo),
    extraerTextoDeCampo(user.rol),
  ];

  for (const c of candidatos) {
    if (c && typeof c === 'string' && c.trim() && c.trim() !== 'Sin Puesto') {
      return c.trim();
    }
  }

  return String(user.puesto || user.cargo || user.rol || '').trim();
};

/**
 * Determina si el puesto corresponde a Gerente de Operaciones (o superusuario / gerencia general).
 * En la matriz del Excel se identifica como "YO".
 * NO otorga acceso a administradores generales (is_staff) ni a jefaturas.
 */
export const esGerenteOperaciones = (user) => {
  if (!user) return false;
  if (user.is_superuser) return true;

  const p = normalizarTexto(obtenerPuestoUsuario(user));
  const a = normalizarTexto(obtenerAreaUsuario(user));
  const u = normalizarTexto(user.username || '');

  const grupos = Array.isArray(user.groups) ? user.groups : [];
  const tieneGrupoGerencial = grupos.some((g) => {
    const gt = normalizarTexto(typeof g === 'object' ? (g.name || g.nombre || '') : g);
    return gt.includes('gerente') || gt.includes('gerencia');
  });

  const esGerente = p.includes('gerente') || p.includes('gerencia') || tieneGrupoGerencial;

  if (p.includes('gerente general') || p.includes('gerencia general')) return true;

  if (esGerente && (p.includes('operacion') || p.includes('operaciones'))) return true;
  if (esGerente && (a.includes('operacion') || a.includes('operaciones'))) return true;

  if (p === 'operaciones' || p === 'operacion') return true;
  if (
    u === 'operaciones' ||
    u === 'goperaciones' ||
    u.includes('gerente operaciones') ||
    u.includes('gerente_operaciones')
  ) {
    return true;
  }

  return false;
};

/**
 * Determina si el puesto corresponde a Coordinador / Supervisor / Jefatura.
 */
export const esCoordinador = (user) => {
  if (!user) return false;
  if (esGerenteOperaciones(user)) return true;
  const p = normalizarTexto(obtenerPuestoUsuario(user));
  return (
    p.includes('coordinador') ||
    p.includes('coordinadora') ||
    p.includes('supervisor') ||
    p.includes('supervisora') ||
    p.includes('planner') ||
    p.includes('jefe')
  );
};

/**
 * Determina si el puesto corresponde a Chofer / Conductor / Motorizado.
 */
export const esChofer = (user) => {
  if (!user) return false;
  const p = normalizarTexto(obtenerPuestoUsuario(user));
  return p.includes('chofer') || p.includes('conductor') || p.includes('motorizado');
};

/**
 * Determina si el área del usuario es Distribución.
 */
export const esAreaDistribucion = (user) => {
  if (!user) return false;
  const a = normalizarTexto(obtenerAreaUsuario(user));
  return a.includes('distribucion');
};

/**
 * Determina si el área del usuario es Almacén Instrumentales (o Instrumentales).
 */
export const esAreaInstrumentales = (user) => {
  if (!user) return false;
  const a = normalizarTexto(obtenerAreaUsuario(user));
  return a.includes('instrumental');
};

/**
 * Matriz de 45 opciones extraída directamente de las Columnas A, B y C del Excel oficial.
 */
export const MATRIZ_ACCESOS_EXCEL = [
  // 1. SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES (6 items)
  {
    quien: 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
    tipo: 'ACC Y REPUESTOS UNIDADES TRANSPORTE',
    subgasto: 'ACC MENORES, FLUIDOS, BATERIAS, LLANTAS',
    normTipo: 'acc y repuestos unidades transporte',
    normSub: 'acc menores fluidos baterias llantas',
  },
  {
    quien: 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
    tipo: 'ACC Y REPUESTOS UNIDADES TRANSPORTE',
    subgasto: 'PLANCHADO Y/O PINTURA',
    normTipo: 'acc y repuestos unidades transporte',
    normSub: 'planchado y o pintura',
  },
  {
    quien: 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
    tipo: 'ACC Y REPUESTOS UNIDADES TRANSPORTE',
    subgasto: 'REPUESTOS MAYORES',
    normTipo: 'acc y repuestos unidades transporte',
    normSub: 'repuestos mayores',
  },
  {
    quien: 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
    tipo: 'ACC Y REPUESTOS UNIDADES TRANSPORTE',
    subgasto: 'OTROS SERVICIOS',
    normTipo: 'acc y repuestos unidades transporte',
    normSub: 'otros servicios',
  },
  {
    quien: 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
    tipo: 'ESTACIONAMIENTO UNIDADES TRANSPORTE',
    subgasto: 'ESTACIONAMIENTO',
    normTipo: 'estacionamiento unidades transporte',
    normSub: 'estacionamiento',
  },
  {
    quien: 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
    tipo: 'COMBUSTIBLE UNIDADES TRANSPORTE',
    subgasto: 'COMBUSTIBLE',
    normTipo: 'combustible unidades transporte',
    normSub: 'combustible',
  },

  // 2. SOLO COORDINADORES Y YO (7 items)
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'MANTENIMIENTO Y/O REVISIONES UNIDADES TRANSPORTE',
    subgasto: 'GPS',
    normTipo: 'mantenimiento y o revisiones unidades transporte',
    normSub: 'gps',
  },
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'MANTENIMIENTO Y/O REVISIONES UNIDADES TRANSPORTE',
    subgasto: 'MANTENIMIENTO PREVENTIVO',
    normTipo: 'mantenimiento y o revisiones unidades transporte',
    normSub: 'mantenimiento preventivo',
  },
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'MANTENIMIENTO Y/O REVISIONES UNIDADES TRANSPORTE',
    subgasto: 'REVISIÓN TECNICA, SOAT',
    normTipo: 'mantenimiento y o revisiones unidades transporte',
    normSub: 'revision tecnica soat',
  },
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'PEAJES UNIDADES DE TRANSPORTE',
    subgasto: 'RECARGA PEX',
    normTipo: 'peajes unidades de transporte',
    normSub: 'recarga pex',
  },
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'CAPACITACIÓN Y/O EVENTOS PERSONAL',
    subgasto: 'CAPACITACIÓN',
    normTipo: 'capacitacion y o eventos personal',
    normSub: 'capacitacion',
  },
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'CAPACITACIÓN Y/O EVENTOS PERSONAL',
    subgasto: 'EVENTO DÍA FESTIVO',
    normTipo: 'capacitacion y o eventos personal',
    normSub: 'evento dia festivo',
  },
  {
    quien: 'SOLO COORDINADORES Y YO',
    tipo: 'DISTRIBUCIÓN',
    subgasto: 'SERVICIOS TRANSPORTE ADICIONALES',
    normTipo: 'distribucion',
    normSub: 'servicios transporte adicionales',
  },

  // 3. TODO DISTRIBUCIÓN (7 items)
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'PEAJES UNIDADES DE TRANSPORTE',
    subgasto: 'PEAJE MANUAL',
    normTipo: 'peajes unidades de transporte',
    normSub: 'peaje manual',
  },
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'CLIENTES',
    subgasto: 'VIATICOS ENTIDADES',
    normTipo: 'clientes',
    normSub: 'viaticos entidades',
  },
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'IMPRESIONES SIMPLES',
    subgasto: 'IMPRESIONES SIMPLES',
    normTipo: 'impresiones simples',
    normSub: 'impresiones simples',
  },
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'DISTRIBUCIÓN PROVINCIA',
    subgasto: 'ENVIO PROV. - EMP. TRANS (AGENCIA A AGENCIA)',
    normTipo: 'distribucion provincia',
    normSub: 'envio prov emp trans agencia a agencia',
  },
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'DISTRIBUCIÓN PROVINCIA',
    subgasto: 'INTERNAMIENTO PROV. - COURIER (AGENCIA A ENTIDAD)',
    normTipo: 'distribucion provincia',
    normSub: 'internamiento prov courier agencia a entidad',
  },
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'DISTRIBUCIÓN PROVINCIA',
    subgasto: 'RECOJO PROV. - COURIER (ENTIDAD A AGENCIA)',
    normTipo: 'distribucion provincia',
    normSub: 'recojo prov courier entidad a agencia',
  },
  {
    quien: 'TODO DISTRIBUCIÓN',
    tipo: 'DISTRIBUCIÓN PROVINCIA',
    subgasto: 'RETORNO PROV. - EMP. TRANS (AGENCIA A AGENCIA)',
    normTipo: 'distribucion provincia',
    normSub: 'retorno prov emp trans agencia a agencia',
  },

  // 4. TODOS (17 items)
  {
    quien: 'TODOS',
    tipo: 'TAXI',
    subgasto: 'TAXI ENTREGAS Y/O RECOJOS',
    normTipo: 'taxi',
    normSub: 'taxi entregas y o recojos',
  },
  {
    quien: 'TODOS',
    tipo: 'TAXI',
    subgasto: 'TAXI ENTREGAS Y/O RECOJOS - EMERGENCIA FUERA DE HORARIO',
    normTipo: 'taxi',
    normSub: 'taxi entregas y o recojos emergencia fuera de horario',
  },
  {
    quien: 'TODOS',
    tipo: 'TAXI',
    subgasto: 'TAXI DESPACHOS Y/O RECOJOS PROVINCIA (HUB - AGENCIA - HUB)',
    normTipo: 'taxi',
    normSub: 'taxi despachos y o recojos provincia hub agencia hub',
  },
  {
    quien: 'TODOS',
    tipo: 'TAXI',
    subgasto: 'TAXI RECOJO - COMPRA DE HIELO',
    normTipo: 'taxi',
    normSub: 'taxi recojo compra de hielo',
  },
  {
    quien: 'TODOS',
    tipo: 'TAXI',
    subgasto: 'TAXI DOMICILIO - FUERA DE HORARIO',
    normTipo: 'taxi',
    normSub: 'taxi domicilio fuera de horario',
  },
  {
    quien: 'TODOS',
    tipo: 'TAXI',
    subgasto: 'TAXI INVENTARIOS (HUB - ENTIDAD - HUB)',
    normTipo: 'taxi',
    normSub: 'taxi inventarios hub entidad hub',
  },
  {
    quien: 'TODOS',
    tipo: 'PERSONAL',
    subgasto: 'REFRIGERIO - VIATICOS',
    normTipo: 'personal',
    normSub: 'refrigerio viaticos',
  },
  {
    quien: 'TODOS',
    tipo: 'INSUMOS Y/O EMBALAJES',
    subgasto: 'BANDEJAS PLASTICO',
    normTipo: 'insumos y o embalajes',
    normSub: 'bandejas plastico',
  },
  {
    quien: 'TODOS',
    tipo: 'INSUMOS Y/O EMBALAJES',
    subgasto: 'CAJAS',
    normTipo: 'insumos y o embalajes',
    normSub: 'cajas',
  },
  {
    quien: 'TODOS',
    tipo: 'INSUMOS Y/O EMBALAJES',
    subgasto: 'HIELO SECO',
    normTipo: 'insumos y o embalajes',
    normSub: 'hielo seco',
  },
  {
    quien: 'TODOS',
    tipo: 'INSUMOS Y/O EMBALAJES',
    subgasto: 'PAÑOS, PAPEL TERMICO',
    normTipo: 'insumos y o embalajes',
    normSub: 'panos papel termico',
  },
  {
    quien: 'TODOS',
    tipo: 'DOCUMENTOS Y TRAMITES',
    subgasto: 'CARNE SANIDAD',
    normTipo: 'documentos y tramites',
    normSub: 'carne sanidad',
  },
  {
    quien: 'TODOS',
    tipo: 'DOCUMENTOS Y TRAMITES',
    subgasto: 'TRAMITES NOTARIA',
    normTipo: 'documentos y tramites',
    normSub: 'tramites notaria',
  },
  {
    quien: 'TODOS',
    tipo: 'SERVICIO DE LAVADO Y/O ESTERILIZACIÓN',
    subgasto: 'LAVADO, LAVANDERIA',
    normTipo: 'servicio de lavado y o esterilizacion',
    normSub: 'lavado lavanderia',
  },
  {
    quien: 'TODOS',
    tipo: 'UTILES',
    subgasto: 'UTILES ESCRITORIO',
    normTipo: 'utiles',
    normSub: 'utiles escritorio',
  },
  {
    quien: 'TODOS',
    tipo: 'UTILES',
    subgasto: 'UTILES DE ASEO',
    normTipo: 'utiles',
    normSub: 'utiles de aseo',
  },
  {
    quien: 'TODOS',
    tipo: 'OTRAS COMPRAS',
    subgasto: '-',
    normTipo: 'otras compras',
    normSub: '',
  },

  // 5. SOLO INSTRUMENTALES (8 items)
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'OTRAS IMPRESIONES',
    subgasto: 'IMPRESIÓN 3D, IMPRESIÓN LASER, BANNER, ENMICADOS',
    normTipo: 'otras impresiones',
    normSub: 'impresion 3d impresion laser banner enmicados',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'COMPRAS ACC Y/O MANTEMIENTO INSTRUMENTALES',
    subgasto: 'COMPRA ACCESORIOS',
    normTipo: 'compras acc y o mantemiento instrumentales',
    normSub: 'compra accesorios',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'COMPRAS ACC Y/O MANTEMIENTO INSTRUMENTALES',
    subgasto: 'COMPRA REPUESTOS',
    normTipo: 'compras acc y o mantemiento instrumentales',
    normSub: 'compra repuestos',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'COMPRAS ACC Y/O MANTEMIENTO INSTRUMENTALES',
    subgasto: 'COMPRA EQUIPOS',
    normTipo: 'compras acc y o mantemiento instrumentales',
    normSub: 'compra equipos',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'COMPRAS ACC Y/O MANTEMIENTO INSTRUMENTALES',
    subgasto: 'REPARACIÓN Y/O MANTENIMIENTO ACCESORIOS',
    normTipo: 'compras acc y o mantemiento instrumentales',
    normSub: 'reparacion y o mantenimiento accesorios',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'COMPRAS ACC Y/O MANTEMIENTO INSTRUMENTALES',
    subgasto: 'REPARACIÓN Y/O MANTENIMIENTO REPUESTOS',
    normTipo: 'compras acc y o mantemiento instrumentales',
    normSub: 'reparacion y o mantenimiento repuestos',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'COMPRAS ACC Y/O MANTEMIENTO INSTRUMENTALES',
    subgasto: 'REPARACIÓN Y/O MANTENIMIENTO EQUIPO',
    normTipo: 'compras acc y o mantemiento instrumentales',
    normSub: 'reparacion y o mantenimiento equipo',
  },
  {
    quien: 'SOLO INSTRUMENTALES',
    tipo: 'SERVICIO DE LAVADO Y/O ESTERILIZACIÓN',
    subgasto: 'ESTERILIZACIÓN',
    normTipo: 'servicio de lavado y o esterilizacion',
    normSub: 'esterilizacion',
  },
];

/**
 * Opciones oficiales del modelo backend RC_SubGasto.grupo_acceso
 */
export const GRUPO_ACCESO_CHOICES = {
  TODOS: 'TODOS',
  TODO_DISTRIBUCION: 'TODO_DISTRIBUCION',
  DISTRIBUCION_CHOFERES_COORD: 'DISTRIBUCION_CHOFERES_COORD',
  COORD_Y_GERENTE: 'COORD_Y_GERENTE',
  SOLO_INSTRUMENTALES: 'SOLO_INSTRUMENTALES',
};

/**
 * Evalúa si el usuario autenticado tiene permiso para acceder a un grupo_acceso.
 * Soporta tanto los códigos del backend (TODOS, TODO_DISTRIBUCION, etc.)
 * como las etiquetas de la matriz original del Excel.
 */
export const tieneAccesoAGrupo = (grupo, user) => {
  if (!grupo || grupo === 'TODOS') return true;

  // Gerente de Operaciones ("YO"), Superusuarios o Staff tienen acceso irrestricto
  if (esGerenteOperaciones(user)) return true;

  const enDistribucion = esAreaDistribucion(user);
  const enInstrumentales = esAreaInstrumentales(user);
  const esChf = esChofer(user);
  const esCoord = esCoordinador(user);

  switch (grupo) {
    case 'TODOS':
      return true;

    case 'TODO_DISTRIBUCION':
    case 'TODO DISTRIBUCIÓN':
      return enDistribucion;

    case 'DISTRIBUCION_CHOFERES_COORD':
    case 'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES':
      return enDistribucion && (esChf || esCoord);

    case 'COORD_Y_GERENTE':
    case 'SOLO COORDINADORES Y YO':
      return esCoord;

    case 'SOLO_INSTRUMENTALES':
    case 'SOLO INSTRUMENTALES':
      return enInstrumentales;

    default:
      return true;
  }
};

/**
 * Evalúa si el subgasto o grupo es visible para personal operativo (choferes y coordinadores de distribución).
 * Replica la lógica de la property visible_para_operativo del modelo backend.
 */
export const esVisibleParaOperativo = (subgastoOGrupo) => {
  if (!subgastoOGrupo) return false;
  const g = typeof subgastoOGrupo === 'string'
    ? subgastoOGrupo
    : (subgastoOGrupo.grupo_acceso || subgastoOGrupo.quien || 'TODOS');
  return [
    'TODOS',
    'TODO_DISTRIBUCION',
    'DISTRIBUCION_CHOFERES_COORD',
    'TODO DISTRIBUCIÓN',
    'SOLO DISTRIBUCIÓN - CHOFERES Y COORDINADORES',
  ].includes(g);
};

/**
 * Evalúa si el usuario autenticado tiene permiso para acceder a una regla dada.
 */
export const tieneAccesoARegla = (regla, user) => {
  if (!regla) return true;
  const grupo = typeof regla === 'string' ? regla : (regla.grupo_acceso || regla.quien);
  return tieneAccesoAGrupo(grupo, user);
};

/**
 * Busca la regla correspondiente en la matriz oficial para un subgasto específico.
 */
export const buscarReglaParaSubgasto = (subgasto, tiposGasto = []) => {
  if (!subgasto) return null;

  const subNorm = normalizarTexto(subgasto.nombre);

  // Resolver nombre del tipo de gasto asociado
  let tipoNorm = '';
  if (subgasto.tipogasto_id && typeof subgasto.tipogasto_id === 'object' && subgasto.tipogasto_id.nombre) {
    tipoNorm = normalizarTexto(subgasto.tipogasto_id.nombre);
  } else if (Array.isArray(tiposGasto) && tiposGasto.length > 0) {
    const tMatch = tiposGasto.find((t) => {
      const tUrl = t.url || (t.id ? `/RC_TipoGasto/${t.id}/` : null);
      const sTipoUrl = subgasto.tipogasto_id?.url || subgasto.tipogasto_id;
      return tUrl && sTipoUrl && (tUrl === sTipoUrl || String(t.id) === String(subgasto.tipogasto_id));
    });
    if (tMatch) {
      tipoNorm = normalizarTexto(tMatch.nombre);
    }
  }

  // 1. Coincidencia exacta por Subgasto y Tipo
  let regla = MATRIZ_ACCESOS_EXCEL.find(
    (r) => r.normSub && r.normSub === subNorm && (!tipoNorm || r.normTipo === tipoNorm)
  );

  // 2. Coincidencia por Subgasto único
  if (!regla) {
    regla = MATRIZ_ACCESOS_EXCEL.find((r) => r.normSub && r.normSub === subNorm);
  }

  // 3. Coincidencia por contención de tokens principales
  if (!regla && subNorm) {
    regla = MATRIZ_ACCESOS_EXCEL.find(
      (r) => r.normSub && (r.normSub.includes(subNorm) || subNorm.includes(r.normSub))
    );
  }

  // 4. Coincidencia por Tipo si el subgasto es comodín (ej: "OTRAS COMPRAS")
  if (!regla && tipoNorm) {
    regla = MATRIZ_ACCESOS_EXCEL.find((r) => !r.normSub && r.normTipo === tipoNorm);
  }

  return regla || null;
};

/**
 * Filtra la lista de subgastos cargada de la API según el perfil del usuario (área y puesto).
 */
export const filtrarSubgastosPorPerfil = (subgastos, user, tiposGasto = []) => {
  if (!Array.isArray(subgastos) || subgastos.length === 0) return [];

  // Superusuarios, staff o Gerente de Operaciones ven el catálogo completo
  if (esGerenteOperaciones(user)) {
    return subgastos;
  }

  return subgastos.filter((sub) => {
    // 1. Si el backend ya nos envía directamente el campo grupo_acceso
    if (sub.grupo_acceso) {
      return tieneAccesoAGrupo(sub.grupo_acceso, user);
    }
    if (sub.grupoAcceso) {
      return tieneAccesoAGrupo(sub.grupoAcceso, user);
    }

    // 2. Si no viene en el registro, buscar en la matriz de reglas por nombre de subgasto y tipo
    const regla = buscarReglaParaSubgasto(sub, tiposGasto);
    if (!regla) {
      // Si el subgasto no está catalogado en la matriz, permitirlo por defecto para evitar bloqueos
      return true;
    }
    return tieneAccesoARegla(regla, user);
  });
};

