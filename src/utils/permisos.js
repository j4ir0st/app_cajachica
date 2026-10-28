/**
 * permisos.js
 * Control de permisos de acceso a pestañas y módulos de Caja Chica.
 *
 * REGLAS INSTITUCIONALES DEFINIDAS:
 * 1. Superusuario (`is_superuser`) y Administrador (`is_staff`) son usuarios distintos:
 *    - `is_superuser`: Control total del sistema.
 *    - `is_staff`: Personal administrativo; NO tiene acceso a Cierre de Caja ni Balance Semanal
 *      a menos que su puesto corresponda a la Gerencia autorizada.
 * 2. Cierre de Caja (`/cierre-caja`):
 *    - Exclusivo para: Gerente de Operaciones y Superusuario (`is_superuser`).
 *    - Los administradores (`is_staff` solo) NO tienen acceso.
 * 3. Balance Semanal (`/balance`):
 *    - Exclusivo para: Gerencias (Gerencia de Operaciones o Gerencia de Finanzas / General) y Superusuario.
 *    - NO se permite acceso a Jefaturas ni coordinadores.
 * 4. Aprobaciones (`/aprobaciones`):
 *    - Permitido para roles de supervisión y gestión: Gerentes, Jefaturas y Coordinadores (y Superusuario).
 * 5. Nueva Solicitud y Mis Solicitudes:
 *    - Permitido para todos los usuarios autenticados.
 */

import { normalizarTexto } from './reglasAccesos.js';

/**
 * Determina si el usuario es Superusuario (is_superuser).
 */
export const esSuperusuario = (user) => {
  if (!user) return false;
  return Boolean(user.is_superuser);
};

/**
 * Determina si el usuario es Administrador de Staff (is_staff) sin ser superusuario.
 */
export const esAdminStaff = (user) => {
  if (!user) return false;
  return Boolean(user.is_staff) && !user.is_superuser;
};

/**
 * Extrae de manera segura el nombre o texto de un campo de usuario que puede venir como string o como objeto serializado (DRF).
 */
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
 * Obtiene el puesto o cargo normalizado del usuario evaluando múltiples fuentes:
 * - user.puesto_id (string u objeto { id, nombre })
 * - user.area_puesto (objeto { puesto_nombre, area_nombre })
 * - user.puesto_nombre
 * - user.puesto (string u objeto)
 * - user.cargo (string u objeto)
 * - user.rol (string u objeto)
 */
export const obtenerPuestoLimpio = (user) => {
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
      return normalizarTexto(c);
    }
  }

  return normalizarTexto(user.puesto || user.cargo || user.rol || '');
};

/**
 * Obtiene el área normalizada del usuario evaluando múltiples fuentes:
 * - user.area_id (string u objeto { id, nombre })
 * - user.area_puesto (objeto { area_nombre, puesto_nombre })
 * - user.area_nombre
 * - user.area (string u objeto)
 */
export const obtenerAreaLimpia = (user) => {
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
      // Evitar que URLs tipo "/Area/1/" o solo números sueltos se confundan con nombres de área
      if (!c.startsWith('http') && !c.startsWith('/') && isNaN(Number(c))) {
        return normalizarTexto(c);
      }
    }
  }

  const fallback = typeof user.area === 'string' ? user.area : (user.area_nombre || '');
  return normalizarTexto(fallback);
};

/**
 * Determina si el usuario tiene rango o jerarquía gerencial (por puesto, cargo o grupos).
 */
export const tieneRangoGerencial = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;

  const puesto = obtenerPuestoLimpio(user);
  if (puesto.includes('gerente') || puesto.includes('gerencia')) return true;

  // Verificar grupos Django (user.groups)
  const grupos = Array.isArray(user.groups) ? user.groups : [];
  for (const g of grupos) {
    const gTexto = normalizarTexto(typeof g === 'object' ? (g.name || g.nombre || '') : g);
    if (gTexto.includes('gerente') || gTexto.includes('gerencia')) {
      return true;
    }
  }

  return false;
};

/**
 * Determina si el usuario corresponde a Gerente de Operaciones o Gerente General.
 * Excluye a administradores generales comunes (is_staff) y a mandos medios (jefatura/coordinador).
 */
export const esGerenteOperaciones = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;

  const puesto = obtenerPuestoLimpio(user);
  const area = obtenerAreaLimpia(user);
  const username = normalizarTexto(user.username || '');
  const esGerente = tieneRangoGerencial(user);

  // 1. Gerente General tiene control total
  if (puesto.includes('gerente general') || puesto.includes('gerencia general')) return true;

  // 2. Coincidencia combinada de Gerente + Operaciones en el puesto
  // Ej: "gerente de operaciones", "gerencia de operaciones", "gerente operaciones", "gerente de operaciones y logistica"
  if (esGerente && (puesto.includes('operacion') || puesto.includes('operaciones'))) {
    return true;
  }

  // 3. Nivel Gerencial con Área asignada de Operaciones
  if (esGerente && (area.includes('operacion') || area.includes('operaciones'))) {
    return true;
  }

  // 4. Casos especiales del sistema Surgicorp (puesto o cuenta de operaciones):
  if (puesto === 'operaciones' || puesto === 'operacion') {
    return true;
  }
  if (
    username === 'operaciones' ||
    username === 'goperaciones' ||
    username.includes('gerente operaciones') ||
    username.includes('gerente_operaciones')
  ) {
    return true;
  }

  return false;
};

/**
 * Determina si el usuario corresponde a Gerencia de Finanzas, Administración o Contabilidad.
 * Excluye jefaturas y coordinaciones.
 */
export const esGerenteFinanzas = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;

  const puesto = obtenerPuestoLimpio(user);
  const area = obtenerAreaLimpia(user);
  const esGerente = tieneRangoGerencial(user);

  if (!esGerente) return false;

  const esFinanciera =
    puesto.includes('finanza') ||
    area.includes('finanza') ||
    puesto.includes('administracion y finanzas') ||
    area.includes('administracion') ||
    area.includes('contabilidad') ||
    puesto.includes('contabilidad');

  return esFinanciera;
};

/**
 * Determina si el usuario tiene nivel de Gerencia (Operaciones, Finanzas o General).
 * Excluye expresamente a jefaturas (jefe), coordinadores y personal administrativo (is_staff).
 */
export const esNivelGerencia = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;

  return esGerenteOperaciones(user) || esGerenteFinanzas(user);
};

/**
 * Determina si el usuario tiene rol de Coordinador, Jefatura o Gerencia para aprobar rendiciones.
 */
export const esRolAprobador = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;
  if (esGerenteOperaciones(user)) return true;

  const puesto = obtenerPuestoLimpio(user);
  const esGerente = tieneRangoGerencial(user);
  if (esGerente) return true;

  // Revisión de grupos
  const grupos = Array.isArray(user.groups) ? user.groups : [];
  const tieneGrupoAprobador = grupos.some((g) => {
    const gt = normalizarTexto(typeof g === 'object' ? (g.name || g.nombre || '') : g);
    return (
      gt.includes('aprobador') ||
      gt.includes('jefe') ||
      gt.includes('gerente') ||
      gt.includes('coordinador') ||
      gt.includes('supervisor')
    );
  });
  if (tieneGrupoAprobador) return true;

  return (
    puesto.includes('coordinador') ||
    puesto.includes('coordinadora') ||
    puesto.includes('jefe') ||
    puesto.includes('jefatura') ||
    puesto.includes('supervisor') ||
    puesto.includes('supervisora') ||
    puesto.includes('planner') ||
    puesto.includes('gerente') ||
    puesto.includes('gerencia')
  );
};

// ============================================================================
// EVALUACIÓN DE ACCESO POR PESTAÑA / RUTA
// ============================================================================

/**
 * Valida el acceso a Cierre de Caja (`/cierre-caja`).
 * Solo permitido para Gerente de Operaciones y Superusuario.
 * Los administradores (`is_staff`) NO tienen acceso.
 */
export const puedeAccederCierreCaja = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;
  return esGerenteOperaciones(user);
};

/**
 * Valida el acceso a Balance Semanal (`/balance`).
 * Solo permitido para Gerencias (Operaciones o Finanzas / General) y Superusuario.
 * NO permitido para Jefaturas, coordinadores ni administradores comunes.
 */
export const puedeAccederBalanceSemanal = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;
  return esNivelGerencia(user);
};

/**
 * Valida el acceso a Aprobaciones (`/aprobaciones`).
 * Permitido para Gerentes, Jefaturas y Coordinadores (y Superusuario).
 */
export const puedeAccederAprobaciones = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;
  return esRolAprobador(user);
};

/**
 * Evalúa si el usuario autenticado tiene permiso para ver y navegar a una ruta del menú.
 * @param {string} ruta - Ruta solicitada (ej: '/cierre-caja', '/balance', '/aprobaciones')
 * @param {Object} user - Objeto de usuario autenticado
 * @returns {boolean}
 */
export const puedeAccederRuta = (ruta, user) => {
  if (!ruta) return false;
  if (!user) return false;

  const rutaLimpia = ruta.replace(/^\//, '').toLowerCase();

  switch (rutaLimpia) {
    case 'cierre-caja':
      return puedeAccederCierreCaja(user);

    case 'balance':
    case 'balance-semanal':
      return puedeAccederBalanceSemanal(user);

    case 'aprobaciones':
      return puedeAccederAprobaciones(user);

    case 'dashboard':
    case 'nueva-solicitud':
    case 'mis-solicitudes':
      return true;

    default:
      return true;
  }
};
