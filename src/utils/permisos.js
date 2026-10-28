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
 * Obtiene el puesto o cargo normalizado del usuario.
 */
export const obtenerPuestoLimpio = (user) => {
  if (!user) return '';
  return normalizarTexto(user.puesto || user.cargo || user.rol || '');
};

/**
 * Obtiene el área normalizada del usuario.
 */
export const obtenerAreaLimpia = (user) => {
  if (!user) return '';
  return normalizarTexto(user.area || user.area_nombre || user.area_id || '');
};

/**
 * Determina si el usuario corresponde a Gerente de Operaciones o Gerente General.
 * Excluye a administradores generales (is_staff) y a jefaturas (jefe de operaciones).
 */
export const esGerenteOperaciones = (user) => {
  if (!user) return false;
  if (esSuperusuario(user)) return true;

  const puesto = obtenerPuestoLimpio(user);
  const area = obtenerAreaLimpia(user);

  // Debe ser explícitamente Gerente (no jefatura, no supervisor)
  const esGerente = puesto.includes('gerente') || puesto.includes('gerencia');
  if (!esGerente) return false;

  // Gerente General o Gerente de Operaciones
  if (puesto.includes('gerente general')) return true;
  if (puesto.includes('gerente de operaciones') || puesto.includes('gerencia de operaciones')) return true;
  if (area.includes('operacion') && esGerente) return true;

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

  const esGerente = puesto.includes('gerente') || puesto.includes('gerencia');
  if (!esGerente) return false;

  const esFinanciera =
    puesto.includes('finanza') ||
    area.includes('finanza') ||
    puesto.includes('administracion y finanzas') ||
    area.includes('administracion') ||
    area.includes('contabilidad');

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

  const puesto = obtenerPuestoLimpio(user);

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
