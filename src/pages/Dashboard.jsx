import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  Clock,
  AlertCircle,
  TrendingUp,
  ChevronRight,
  PlusCircle,
  FileText,
  FileCheck,
  CheckCircle2,
  RefreshCw,
  User,
  Building,
  ShieldCheck,
  Calendar,
  DollarSign,
  Receipt,
  Layers,
  Sparkles,
  ArrowRight,
  PieChart
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { obtenerTipoCaja } from '../utils/tipoCaja';
import Toast from '../components/Toast';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ============================================================================
// CONFIGURACIÓN VISUAL Y MAPAS DE ESTADO
// ============================================================================

const ESTADOS_MAPA = {
  PD: {
    clave: 'PD',
    etiqueta: 'Borrador',
    claseBadge: 'bg-amber-50 text-amber-600 border-amber-200',
    claseBorde: 'border-l-amber-500',
    icono: Clock,
  },
  LQ: {
    clave: 'LQ',
    etiqueta: 'Liquidado',
    claseBadge: 'bg-blue-50 text-blue-600 border-blue-200',
    claseBorde: 'border-l-blue-500',
    icono: FileCheck,
  },
  CD: {
    clave: 'CD',
    etiqueta: 'Cerrado',
    claseBadge: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    claseBorde: 'border-l-emerald-500',
    icono: CheckCircle2,
  },
  RC: {
    clave: 'RC',
    etiqueta: 'Rechazado',
    claseBadge: 'bg-red-50 text-red-600 border-red-200',
    claseBorde: 'border-l-red-500',
    icono: AlertCircle,
  },
};

// ============================================================================
// FUNCIONES AUXILIARES DE FORMATEO Y ROLES
// ============================================================================

/**
 * Determina si el usuario tiene rol de Gestión / Supervisión.
 */
const esRolGestion = (usuario) => {
  if (!usuario) return false;
  if (usuario.is_staff) return true;
  const puesto = (usuario.puesto || '').toLowerCase();
  return ['gerente', 'jefe', 'coordinador', 'supervisor', 'planner', 'administrador', 'admin'].some((r) =>
    puesto.includes(r)
  );
};

/**
 * Obtiene la clave corta del estado ('PD', 'LQ', 'CD', 'RC').
 */
const obtenerClaveEstado = (estado) => {
  if (!estado) return 'PD';
  if (typeof estado === 'string') return estado.toUpperCase();
  if (typeof estado === 'object') {
    const claves = Object.keys(estado);
    if (claves.length > 0) return claves[0].toUpperCase();
  }
  return 'PD';
};

/**
 * Obtiene el nombre completo del solicitante.
 */
const obtenerNombreSolicitante = (usuario) => {
  if (!usuario) return 'Usuario';
  if (typeof usuario === 'object') {
    return (
      usuario.full_name ||
      `${usuario.first_name || ''} ${usuario.last_name || ''}`.trim() ||
      usuario.username ||
      'Usuario'
    );
  }
  if (typeof usuario === 'string') {
    return usuario.startsWith('http') ? 'Usuario' : usuario;
  }
  return 'Usuario';
};

/**
 * Formatea valores numéricos a moneda nacional (S/ 0.00).
 */
const formatearMoneda = (monto) => {
  const num = parseFloat(monto) || 0;
  return `S/ ${num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ============================================================================
// COMPONENTE PRINCIPAL: PANEL GENERAL (DASHBOARD)
// ============================================================================

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();

  const esGestion = useMemo(() => esRolGestion(user), [user]);

  // Si es supervisor o gerente, permite alternar entre vista ejecutiva y personal
  const [vistaModo, setVistaModo] = useState('gestion'); // 'gestion' | 'personal'

  // Estados de datos reales
  const [solicitudesUsuario, setSolicitudesUsuario] = useState([]);
  const [solicitudesGestion, setSolicitudesGestion] = useState([]);
  const [ultimoCierre, setUltimoCierre] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [notificacion, setNotificacion] = useState(null);

  // ============================================================================
  // CARGA DE DATOS REALES DE LA API
  // ============================================================================

  const cargarDatosDashboard = useCallback(async () => {
    setCargando(true);
    try {
      const promesas = [];

      // 1. Cargar requerimientos personales del usuario autenticado
      if (user?.id) {
        const urlPersonales = `${API_URL}/Requerimiento_CajaChica/?format=json&usuario_id=${user.id}&ordering=-id`;
        promesas.push(
          fetchAuth(urlPersonales)
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                return data.results ?? (Array.isArray(data) ? data : []);
              }
              return [];
            })
            .catch(() => [])
        );
      } else {
        promesas.push(Promise.resolve([]));
      }

      // 2. Si el usuario tiene rol de gestión, cargar requerimientos en curso y último cierre
      if (esGestion) {
        // Traer requerimientos en LQ y PD para supervisión
        const urlGestion = `${API_URL}/Requerimiento_CajaChica/?format=json&estado_requerimiento=LQ,PD&ordering=-id`;
        promesas.push(
          fetchAuth(urlGestion)
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                return data.results ?? (Array.isArray(data) ? data : []);
              }
              return [];
            })
            .catch(() => [])
        );

        // Traer el último cierre semanal para saber el saldo vigente
        const urlCierre = `${API_URL}/RC_SaldoSemanal/?format=json&page=1&top=1&ordering=-fecha_fin`;
        promesas.push(
          fetchAuth(urlCierre)
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                const items = data.results ?? (Array.isArray(data) ? data : []);
                return items.length > 0 ? items[0] : null;
              }
              return null;
            })
            .catch(() => null)
        );
      }

      const resultados = await Promise.all(promesas);

      const misReqs = resultados[0] || [];
      setSolicitudesUsuario(misReqs);

      if (esGestion) {
        const reqsGestion = resultados[1] || [];
        const ultimoSaldo = resultados[2] || null;
        setSolicitudesGestion(reqsGestion);
        setUltimoCierre(ultimoSaldo);
        console.log(
          `[Dashboard] ✅ Datos cargados para Gestión: ${reqsGestion.length} requerimientos activos, Último Cierre: ${
            ultimoSaldo?.codigo_cierre || 'Ninguno'
          }.`
        );
      } else {
        console.log(`[Dashboard] ✅ Datos cargados para Usuario Operativo: ${misReqs.length} requerimientos.`);
      }
    } catch (err) {
      console.error('[Dashboard] ❌ Error al cargar datos del panel:', err.message || err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Cargar Panel',
        mensaje: 'No se pudieron sincronizar las estadísticas en tiempo real.',
      });
    } finally {
      setCargando(false);
    }
  }, [user?.id, esGestion]);

  useEffect(() => {
    cargarDatosDashboard();
  }, [cargarDatosDashboard]);

  // Escuchar evento global de recarga
  useEffect(() => {
    const manejarRecargaGlobal = () => {
      cargarDatosDashboard();
    };
    window.addEventListener('app:recargar-datos', manejarRecargaGlobal);
    return () => window.removeEventListener('app:recargar-datos', manejarRecargaGlobal);
  }, [cargarDatosDashboard]);

  // ============================================================================
  // CÁLCULO DE MÉTRICAS EN MEMORIA (REACTIVAS Y SIN CONSUMO EXTRA DE API)
  // ============================================================================

  // Métricas personales del usuario
  const metricasUsuario = useMemo(() => {
    let totalGastado = 0;
    let cantPendientes = 0;
    let cantLiquidados = 0;
    let cantCerrados = 0;
    let saldoPorRendir = 0;

    solicitudesUsuario.forEach((req) => {
      const clave = obtenerClaveEstado(req.estado_requerimiento);
      const gastado = parseFloat(req.total_gastado || 0);
      const solicitado = parseFloat(req.monto_solicitado || 0);

      totalGastado += gastado;

      if (clave === 'PD') {
        cantPendientes += 1;
        saldoPorRendir += Math.max(0, solicitado - gastado);
      } else if (clave === 'LQ') {
        cantLiquidados += 1;
      } else if (clave === 'CD') {
        cantCerrados += 1;
      }
    });

    return {
      totalGastado,
      cantPendientes,
      cantLiquidados,
      cantCerrados,
      saldoPorRendir,
      totalSolicitudes: solicitudesUsuario.length,
    };
  }, [solicitudesUsuario]);

  // Métricas de Gestión / Supervisión (Jefes y Gerentes)
  const metricasGestion = useMemo(() => {
    let cantPorAprobar = 0;
    let montoPorAprobar = 0;
    let cantBorradoresActivos = 0;
    let montoBorradores = 0;

    solicitudesGestion.forEach((req) => {
      const clave = obtenerClaveEstado(req.estado_requerimiento);
      const gastado = parseFloat(req.total_gastado || req.monto_solicitado || 0);

      if (clave === 'LQ') {
        cantPorAprobar += 1;
        montoPorAprobar += gastado;
      } else if (clave === 'PD') {
        cantBorradoresActivos += 1;
        montoBorradores += gastado;
      }
    });

    return {
      cantPorAprobar,
      montoPorAprobar,
      cantBorradoresActivos,
      montoBorradores,
      saldoVigente: ultimoCierre ? parseFloat(ultimoCierre.saldo_final || 0) : 0,
      codigoUltimoCierre: ultimoCierre?.codigo_cierre || 'Sin Cierre',
      fechaUltimoCierre: ultimoCierre?.fecha_fin || null,
    };
  }, [solicitudesGestion, ultimoCierre]);

  // Rendiciones que requieren atención de supervisión (en estado LQ)
  const rendicionesPorAprobar = useMemo(() => {
    return solicitudesGestion.filter((req) => obtenerClaveEstado(req.estado_requerimiento) === 'LQ').slice(0, 5);
  }, [solicitudesGestion]);

  // Últimas solicitudes del usuario (hasta 4)
  const ultimasSolicitudesPersonales = useMemo(() => {
    return solicitudesUsuario.slice(0, 4);
  }, [solicitudesUsuario]);

  // ============================================================================
  // RENDERIZADO DEL COMPONENTE
  // ============================================================================

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 animate-fade-in font-outfit max-w-7xl mx-auto">
      {/* ========================================================================
          BARRA DE VISTA SUPERVISIÓN / PERSONAL (SÓLO SI TIENE ROL DE GESTIÓN)
         ======================================================================== */}
      {esGestion && (
        <div className="flex items-center justify-between bg-white p-2 sm:p-2.5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-wider ml-1">
              Vista:
            </span>
            <div className="bg-gray-100/80 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setVistaModo('gestion')}
                className={`text-[11px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all ${
                  vistaModo === 'gestion'
                    ? 'bg-white text-brand-primary shadow-sm'
                    : 'text-gray-500 hover:text-brand-dark'
                }`}
              >
                Supervisión
              </button>
              <button
                type="button"
                onClick={() => setVistaModo('personal')}
                className={`text-[11px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all ${
                  vistaModo === 'personal'
                    ? 'bg-white text-brand-primary shadow-sm'
                    : 'text-gray-500 hover:text-brand-dark'
                }`}
              >
                Mis Rendiciones
              </button>
            </div>
          </div>

          <span className="text-[11px] font-bold text-gray-400 hidden sm:inline-block pr-2">
            Panel de Operaciones de Caja Chica
          </span>
        </div>
      )}

      {/* ========================================================================
          VISTA 1: SUPERVISIÓN & GESTIÓN (JEFES, GERENTES, COORDINADORES)
         ======================================================================== */}
      {esGestion && vistaModo === 'gestion' ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Fila de Tarjetas KPI Móviles / Ejecutivas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {/* KPI 1: Pendientes de Aprobación (Urgente) */}
            <div
              onClick={() => navigate('/aprobaciones')}
              className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 hover:border-blue-300 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                  <FileCheck size={20} />
                </div>
                {metricasGestion.cantPorAprobar > 0 && (
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse">
                    Por Revisar
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Por Aprobar (LQ)
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : `${metricasGestion.cantPorAprobar} rend.`}
                </h3>
                <span className="text-[11px] font-bold text-blue-600 block mt-0.5">
                  {cargando ? '...' : formatearMoneda(metricasGestion.montoPorAprobar)}
                </span>
              </div>
            </div>

            {/* KPI 2: Borradores en Curso */}
            <div
              onClick={() => navigate('/mis-solicitudes')}
              className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 hover:border-amber-300 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                  <Clock size={20} />
                </div>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  En Llenado
                </span>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Borradores (PD)
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : `${metricasGestion.cantBorradoresActivos} rend.`}
                </h3>
                <span className="text-[11px] font-bold text-amber-600 block mt-0.5">
                  {cargando ? '...' : formatearMoneda(metricasGestion.montoBorradores)}
                </span>
              </div>
            </div>

            {/* KPI 3: Saldo Vigente de Caja */}
            <div
              onClick={() => navigate('/balance')}
              className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 hover:border-emerald-300 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                  <Wallet size={20} />
                </div>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                  Caja Chica
                </span>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Último Saldo
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : formatearMoneda(metricasGestion.saldoVigente)}
                </h3>
                <span className="text-[10px] text-gray-400 font-medium block mt-0.5 truncate">
                  Cierre: {metricasGestion.codigoUltimoCierre}
                </span>
              </div>
            </div>

            {/* KPI 4: Acceso Rápido a Cierre de Caja */}
            <div
              onClick={() => navigate('/cierre-caja')}
              className="bg-gradient-to-br from-brand-primary to-brand-secondary text-white rounded-2xl p-3.5 sm:p-5 shadow-md shadow-brand-primary/20 hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/20 text-white flex items-center justify-center font-black backdrop-blur-sm group-hover:scale-105 transition-transform">
                  <ShieldCheck size={20} />
                </div>
                <ArrowRight size={16} className="text-white/60 group-hover:translate-x-1 transition-transform" />
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-white/70 uppercase tracking-wider block">
                  Operaciones
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                  Cierre de Caja
                </h3>
                <span className="text-[10px] sm:text-[11px] text-white/80 font-medium block mt-0.5">
                  Auditar y liquidar ciclo semanal
                </span>
              </div>
            </div>
          </div>

          {/* Sección de Rendiciones Urgentes por Aprobar */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileCheck size={20} className="text-blue-600" />
                <h3 className="text-sm sm:text-base font-black text-brand-dark">
                  Rendiciones Pendientes de Aprobación ({rendicionesPorAprobar.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/aprobaciones')}
                className="text-xs font-black text-brand-primary hover:text-brand-secondary flex items-center gap-1 transition-colors"
              >
                <span>Ver Todas</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {cargando ? (
              <div className="py-10 text-center flex flex-col items-center justify-center space-y-2">
                <div className="w-7 h-7 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400 font-bold">Cargando rendiciones...</span>
              </div>
            ) : rendicionesPorAprobar.length > 0 ? (
              <div className="space-y-2.5">
                {rendicionesPorAprobar.map((req) => {
                  const gasto = parseFloat(req.total_gastado || req.monto_solicitado || 0);
                  const listaDet = req.detalle || req.detalles || [];
                  const solicitante = obtenerNombreSolicitante(req.usuario_id);
                  const tipoCajaInfo = obtenerTipoCaja(req);

                  return (
                    <div
                      key={req.id}
                      onClick={() => navigate('/aprobaciones')}
                      className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/20 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-center shrink-0">
                          #{req.id}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-black text-brand-dark group-hover:text-blue-600 transition-colors">
                              {solicitante}
                            </h4>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoCajaInfo.claseBadge}`}>
                              {tipoCajaInfo.etiqueta}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium mt-0.5">
                            <span>{req.area_id || 'Área'}</span>
                            <span>•</span>
                            <span>{req.fecha_solicitud?.slice(0, 10) || '—'}</span>
                            <span>•</span>
                            <span className="text-blue-600 font-bold">{listaDet.length} docs</span>
                          </div>
                          {req.obs && (
                            <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-1">
                              "{req.obs}"
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                        <div className="text-left sm:text-right">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Total Gastado
                          </span>
                          <span className="text-xs sm:text-sm font-black text-brand-dark">
                            {formatearMoneda(gasto)}
                          </span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                          Auditar
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center space-y-1.5">
                <CheckCircle2 size={28} className="text-emerald-500" />
                <h4 className="text-xs sm:text-sm font-black text-brand-dark">
                  ¡Al día! No hay rendiciones pendientes de aprobación
                </h4>
                <p className="text-[11px] text-gray-400 max-w-xs">
                  Todas las solicitudes enviadas por el equipo han sido revisadas o ya están cerradas.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================
           VISTA 2: COLABORADOR / SOLICITANTE (AUXILIARES, ADMINISTRATIVOS, OPERATIVOS)
           ======================================================================== */
        <div className="space-y-4 sm:space-y-6">
          {/* Tarjetas de Resumen Financiero Personal */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {/* KPI 1: Gastado acumulado */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                  <TrendingUp size={20} />
                </div>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                  Rendido
                </span>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Total Gastado
                </span>
                <h3 className="text-lg sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : formatearMoneda(metricasUsuario.totalGastado)}
                </h3>
                <span className="text-[10px] text-gray-400 font-medium block mt-0.5">
                  En {metricasUsuario.totalSolicitudes} solicitudes
                </span>
              </div>
            </div>

            {/* KPI 2: Por Enviar (Borradores Pendientes) */}
            <div
              onClick={() => navigate('/mis-solicitudes')}
              className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 hover:border-amber-300 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                  <Clock size={20} />
                </div>
                {metricasUsuario.cantPendientes > 0 && (
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">
                    Por Enviar
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Borradores (PD)
                </span>
                <h3 className="text-lg sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : `${metricasUsuario.cantPendientes} por enviar`}
                </h3>
                <span className="text-[10px] text-amber-600 font-bold block mt-0.5">
                  {metricasUsuario.cantPendientes > 0 ? 'Faltan comprobantes' : 'Sin pendientes'}
                </span>
              </div>
            </div>

            {/* KPI 3: En Revisión (Liquidados) */}
            <div
              onClick={() => navigate('/mis-solicitudes')}
              className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 hover:border-blue-300 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black group-hover:scale-105 transition-transform">
                  <FileCheck size={20} />
                </div>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  Enviados
                </span>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  En Revisión (LQ)
                </span>
                <h3 className="text-lg sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : `${metricasUsuario.cantLiquidados} en espera`}
                </h3>
                <span className="text-[10px] text-gray-400 font-medium block mt-0.5">
                  Revisión por Jefatura
                </span>
              </div>
            </div>

            {/* KPI 4: Aprobadas / Cerradas */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                  <CheckCircle2 size={20} />
                </div>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                  Aprobadas
                </span>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block">
                  Cerradas (CD)
                </span>
                <h3 className="text-lg sm:text-2xl font-black text-brand-dark tracking-tight mt-0.5">
                  {cargando ? '—' : `${metricasUsuario.cantCerrados} cerradas`}
                </h3>
                <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
                  Liquidadas con éxito
                </span>
              </div>
            </div>
          </div>

          {/* Lista de Solicitudes Recientes del Colaborador */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-brand-primary" />
                <h3 className="text-sm sm:text-base font-black text-brand-dark">
                  Mis Solicitudes Recientes
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/mis-solicitudes')}
                className="text-xs font-black text-brand-primary hover:text-brand-secondary flex items-center gap-1 transition-colors"
              >
                <span>Ver Historial</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {cargando ? (
              <div className="py-10 text-center flex flex-col items-center justify-center space-y-2">
                <div className="w-7 h-7 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400 font-bold">Cargando tus solicitudes...</span>
              </div>
            ) : ultimasSolicitudesPersonales.length > 0 ? (
              <div className="space-y-2.5">
                {ultimasSolicitudesPersonales.map((req) => {
                  const clave = obtenerClaveEstado(req.estado_requerimiento);
                  const estadoInfo = ESTADOS_MAPA[clave] || ESTADOS_MAPA.PD;
                  const IconoEstado = estadoInfo.icono;
                  const gasto = parseFloat(req.total_gastado || 0);
                  const solicitado = parseFloat(req.monto_solicitado || 0);
                  const listaDet = req.detalle || req.detalles || [];
                  const tipoCajaInfo = obtenerTipoCaja(req);

                  return (
                    <div
                      key={req.id}
                      onClick={() => {
                        if (clave === 'PD') {
                          navigate('/nueva-solicitud', { state: { requerimientoAEditar: req } });
                        } else {
                          navigate('/mis-solicitudes');
                        }
                      }}
                      className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-100 hover:border-brand-primary/40 shadow-sm transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 ${estadoInfo.claseBorde} group`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-light text-brand-primary font-black text-xs flex items-center justify-center shrink-0">
                          #{req.id}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border flex items-center gap-1 ${estadoInfo.claseBadge}`}
                            >
                              <IconoEstado size={11} />
                              {estadoInfo.etiqueta}
                            </span>
                            <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoCajaInfo.claseBadge}`}>
                              {tipoCajaInfo.etiqueta}
                            </span>
                            <span className="text-[11px] text-gray-400 font-medium">
                              {req.fecha_solicitud?.slice(0, 10) || '—'}
                            </span>
                          </div>

                          <div className="text-xs sm:text-sm font-bold text-brand-dark mt-1">
                            {req.obs || 'Rendición de Gastos Operativos'}
                          </div>
                          <span className="text-[11px] text-gray-400 font-medium">
                            {listaDet.length} comprobante(s) adjuntos
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                        <div className="text-left sm:text-right">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                            Solicitado / Gastado
                          </span>
                          <span className="text-xs sm:text-sm font-black text-brand-dark">
                            {formatearMoneda(solicitado)}{' '}
                            <span className="text-[10px] sm:text-xs font-semibold text-gray-400">
                              / {formatearMoneda(gasto)}
                            </span>
                          </span>
                        </div>

                        {clave === 'PD' ? (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            ✏️ Completar
                          </span>
                        ) : (
                          <ChevronRight size={16} className="text-gray-400 group-hover:translate-x-1 transition-transform" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center text-brand-primary">
                  <Receipt size={20} />
                </div>
                <h4 className="text-xs sm:text-sm font-black text-brand-dark">Aún no tienes rendiciones registradas</h4>
                <p className="text-[11px] text-gray-400 max-w-xs">
                  Crea tu primera solicitud para justificar tus gastos de movilidad, viáticos u oficina.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/nueva-solicitud')}
                  className="mt-1 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-black shadow-sm hover:bg-brand-secondary transition-all"
                >
                  Registrar Primer Gasto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notificación flotante Toast si ocurre un error */}
      {notificacion && (
        <Toast
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          onClose={() => setNotificacion(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
