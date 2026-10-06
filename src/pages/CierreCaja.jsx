import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Calendar,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  X,
  Eye,
  Trash2,
  RotateCcw,
  Receipt,
  FileText,
  User,
  Building,
  TrendingDown,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth } from '../utils/fetchAuth';
import Toast from '../components/Toast';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ============================================================================
// FUNCIONES AUXILIARES DE FORMATEO
// ============================================================================

/**
 * Obtiene el nombre completo del solicitante.
 */
const obtenerNombreSolicitante = (usuario) => {
  if (!usuario) return '—';
  if (typeof usuario === 'object') {
    return usuario.full_name || `${usuario.first_name || ''} ${usuario.last_name || ''}`.trim() || usuario.username || '—';
  }
  if (typeof usuario === 'string') {
    return usuario.startsWith('http') ? 'Usuario' : usuario;
  }
  return '—';
};

/**
 * Extrae de forma limpia el mensaje de error del backend.
 */
const extraerMensajeError = async (respuesta) => {
  try {
    const datosJson = await respuesta.json();
    if (datosJson.detail && datosJson.error_tecnico) {
      return `${datosJson.detail}\nDetalle técnico: ${datosJson.error_tecnico}`;
    }
    if (datosJson.detail) return datosJson.detail;
    if (datosJson.error) return datosJson.error;
    if (typeof datosJson === 'object') {
      const primerError = Object.entries(datosJson)
        .map(([campo, msg]) => `${campo}: ${Array.isArray(msg) ? msg.join(', ') : msg}`)
        .join(' | ');
      if (primerError) return primerError;
    }
    return JSON.stringify(datosJson);
  } catch {
    return `Error de servidor (${respuesta.status})`;
  }
};

/**
 * Obtiene la fecha de hoy en formato YYYY-MM-DD.
 */
const obtenerFechaHoy = () => {
  const hoy = new Date();
  return hoy.toISOString().slice(0, 10);
};

/**
 * Obtiene la fecha del lunes de la semana actual o hace 7 días.
 */
const obtenerFechaLunesActual = () => {
  const d = new Date();
  const diaSemana = d.getDay();
  const diff = d.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
  const lunes = new Date(d.setDate(diff));
  return lunes.toISOString().slice(0, 10);
};

// ============================================================================
// COMPONENTE PRINCIPAL: CIERRE DE CAJA
// ============================================================================

const CierreCaja = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();

  const [solicitudesLiquidadas, setSolicitudesLiquidadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoCierre, setProcesandoCierre] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('');

  // Parámetros del Balance Semanal
  const [saldoInicial, setSaldoInicial] = useState('4000.00');
  const [nuevoIngresoManual, setNuevoIngresoManual] = useState('');
  const [fechaInicio, setFechaInicio] = useState(obtenerFechaLunesActual());
  const [fechaFin, setFechaFin] = useState(obtenerFechaHoy());

  // Modal de Detalle / Auditoría de Solicitud
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);

  // Modal de Confirmación de Cierre
  const [mostrarModalConfirmacion, setMostrarModalConfirmacion] = useState(false);

  // ============================================================================
  // CARGA DE SOLICITUDES LIQUIDADAS
  // ============================================================================

  const cargarSolicitudesLiquidadas = async () => {
    setCargando(true);
    try {
      // Filtrar únicamente los registros en estado Liquidado (LQ)
      const parametros = new URLSearchParams({
        format: 'json',
        estado_requerimiento: 'LQ',
      });

      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/?${parametros.toString()}`);
      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const data = await res.json();
      const lista = data.results ?? data;

      const ordenadas = Array.isArray(lista)
        ? [...lista].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        : [];

      setSolicitudesLiquidadas(ordenadas);
    } catch (err) {
      console.error('[CierreCaja] Error al cargar liquidaciones:', err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error de Conexión',
        mensaje: err.message || 'No se pudieron obtener las solicitudes liquidadas.',
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarSolicitudesLiquidadas();
  }, []);

  // ============================================================================
  // FILTRADO REACTIVO EN MEMORIA
  // ============================================================================

  const solicitudesFiltradas = useMemo(() => {
    if (!busqueda.trim()) return solicitudesLiquidadas;

    const query = busqueda.toLowerCase().trim();
    return solicitudesLiquidadas.filter((req) => {
      const idTexto = String(req.id || '').toLowerCase();
      const solicitanteTexto = obtenerNombreSolicitante(req.usuario_id).toLowerCase();
      const obsTexto = (req.obs || '').toLowerCase();
      const areaTexto = String(req.area_id || '').toLowerCase();

      return (
        idTexto.includes(query) ||
        solicitanteTexto.includes(query) ||
        obsTexto.includes(query) ||
        areaTexto.includes(query)
      );
    });
  }, [solicitudesLiquidadas, busqueda]);

  // ============================================================================
  // CÁLCULOS FINANCIEROS DEL CIERRE
  // ============================================================================

  const gastoTotalSemana = useMemo(() => {
    return solicitudesLiquidadas.reduce((acumulado, req) => {
      const total = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      return acumulado + (isNaN(total) ? 0 : total);
    }, 0);
  }, [solicitudesLiquidadas]);

  const saldoInicialNum = parseFloat(saldoInicial) || 0;
  const saldoFinal = saldoInicialNum - gastoTotalSemana;
  const nuevoIngresoSugerido = nuevoIngresoManual !== '' ? (parseFloat(nuevoIngresoManual) || 0) : gastoTotalSemana;

  // ============================================================================
  // ANULAR / RECHAZAR SOLICITUD INDIVIDUAL
  // ============================================================================

  const manejarAnularSolicitud = async (req) => {
    const confirmar = window.confirm(
      `¿Está seguro de anular el requerimiento #${req.id} de ${obtenerNombreSolicitante(req.usuario_id)}?\nEl estado pasará a Rechazado (RC) y se excluirá de este cierre.`
    );
    if (!confirmar) return;

    try {
      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${req.id}/?format=json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado_requerimiento: 'RC',
        }),
      });

      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Solicitud Anulada',
        mensaje: `El requerimiento #${req.id} fue marcado como Rechazado/Anulado.`,
      });

      setSolicitudSeleccionada(null);
      await cargarSolicitudesLiquidadas();
    } catch (err) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Anular',
        mensaje: err.message || 'No se pudo anular la solicitud seleccionada.',
      });
    }
  };

  // ============================================================================
  // EJECUTAR CIERRE DE CAJA SEMANAL
  // ============================================================================

  const ejecutarCierreSemanal = async () => {
    if (solicitudesLiquidadas.length === 0) {
      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Sin Registros por Cerrar',
        mensaje: 'No hay solicitudes liquidadas disponibles para cerrar.',
      });
      return;
    }

    setProcesandoCierre(true);
    setMostrarModalConfirmacion(false);

    try {
      // Actualizar secuencialmente las solicitudes a estado Cerrado ('CD')
      let exitosos = 0;
      let fallidos = 0;

      for (const req of solicitudesLiquidadas) {
        try {
          const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${req.id}/?format=json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              estado_requerimiento: 'CD',
            }),
          });

          if (res.ok) {
            exitosos++;
          } else {
            fallidos++;
          }
        } catch {
          fallidos++;
        }
      }

      if (fallidos === 0) {
        setNotificacion({
          tipo: 'exito',
          titulo: 'Cierre de Caja Exitoso',
          mensaje: `Se cerraron formalmente ${exitosos} solicitudes liquidadas con un total de S/ ${gastoTotalSemana.toFixed(2)}.`,
        });
      } else {
        setNotificacion({
          tipo: 'advertencia',
          titulo: 'Cierre Parcial',
          mensaje: `Se cerraron ${exitosos} solicitudes, pero ${fallidos} presentaron errores al actualizar.`,
        });
      }

      await cargarSolicitudesLiquidadas();
    } catch (err) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error durante el Cierre',
        mensaje: err.message || 'Ocurrió un error inesperado al procesar el cierre de caja.',
      });
    } finally {
      setProcesandoCierre(false);
    }
  };

  // ============================================================================
  // RENDERIZADO
  // ============================================================================

  return (
    <div className="h-[calc(100vh-5.5rem)] md:h-[calc(100vh-6rem)] flex flex-col pt-3 pb-3 px-4 md:px-8 space-y-2.5 animate-fade-in font-outfit w-full overflow-hidden relative">
      {/* Notificación Flotante Toast */}
      {notificacion && (
        <Toast
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          alCerrar={() => setNotificacion(null)}
        />
      )}

      {/* Encabezado Principal (Fijo) */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">Cierre Semanal de Caja</h1>
          <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
            Consolidación de rendiciones liquidadas, balance de caja y nuevo importe de reposición.
          </p>
        </div>

        <button
          onClick={cargarSolicitudesLiquidadas}
          disabled={cargando || procesandoCierre}
          className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-sm"
          title="Recargar liquidaciones"
        >
          <RefreshCw size={15} className={cargando ? 'animate-spin text-brand-primary' : ''} />
        </button>
      </div>

      {/* Panel Superior de KPI Financiero y Fechas (Adaptable Móvil / Desktop) */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm shrink-0 space-y-3">
        {/* Fila 1: Fechas y Presupuesto Base */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Fecha Inicio Semana
            </label>
            <div className="flex items-center gap-1.5 bg-brand-light/50 border border-gray-100 rounded-xl px-2.5 py-1.5 font-bold text-brand-dark">
              <Calendar size={13} className="text-brand-primary shrink-0" />
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="bg-transparent outline-none w-full text-xs font-bold text-brand-dark"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Fecha Fin Semana (Hoy)
            </label>
            <div className="flex items-center gap-1.5 bg-brand-light/50 border border-gray-100 rounded-xl px-2.5 py-1.5 font-bold text-brand-dark">
              <Calendar size={13} className="text-brand-primary shrink-0" />
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="bg-transparent outline-none w-full text-xs font-bold text-brand-dark"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Saldo Inicial (Base)
            </label>
            <div className="flex items-center gap-1.5 bg-brand-light/50 border border-gray-100 rounded-xl px-2.5 py-1.5 font-bold text-brand-dark">
              <Wallet size={13} className="text-gray-400 shrink-0" />
              <span className="text-[11px] text-gray-400 font-bold">S/</span>
              <input
                type="number"
                step="0.01"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className="bg-transparent outline-none w-full text-xs font-black text-brand-dark"
                placeholder="4000.00"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-brand-primary block">
              Nuevo Ingreso Solicitado
            </label>
            <div className="flex items-center gap-1.5 bg-brand-primary/5 border border-brand-primary/20 rounded-xl px-2.5 py-1.5 font-bold text-brand-primary">
              <TrendingUp size={13} className="text-brand-primary shrink-0" />
              <span className="text-[11px] text-brand-primary font-bold">S/</span>
              <input
                type="number"
                step="0.01"
                value={nuevoIngresoManual !== '' ? nuevoIngresoManual : gastoTotalSemana.toFixed(2)}
                onChange={(e) => setNuevoIngresoManual(e.target.value)}
                className="bg-transparent outline-none w-full text-xs font-black text-brand-primary placeholder:text-brand-primary/50"
                placeholder={gastoTotalSemana.toFixed(2)}
              />
            </div>
          </div>
        </div>

        {/* Fila 2: Resumen en Vivo y Botón de Acción Principal */}
        <div className="pt-2 border-t border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-2 text-xs flex-1">
            <div className="bg-gray-50 rounded-xl px-3 py-1.5">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Gasto Total Semana</span>
              <span className="text-xs sm:text-sm font-black text-red-600">
                S/ {gastoTotalSemana.toFixed(2)}
              </span>
            </div>

            <div className="bg-gray-50 rounded-xl px-3 py-1.5">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Saldo Final en Caja</span>
              <span className={`text-xs sm:text-sm font-black ${saldoFinal < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                S/ {saldoFinal.toFixed(2)}
              </span>
            </div>

            <div className="bg-brand-light/70 rounded-xl px-3 py-1.5">
              <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider block">Solicitudes a Cerrar</span>
              <span className="text-xs sm:text-sm font-black text-brand-dark">
                {solicitudesLiquidadas.length} reg.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMostrarModalConfirmacion(true)}
            disabled={solicitudesLiquidadas.length === 0 || procesandoCierre}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Lock size={15} />
            <span>{procesandoCierre ? 'Cerrando Caja...' : 'Cerrar Caja Semanal'}</span>
          </button>
        </div>
      </div>

      {/* Buscador de Solicitudes Liquidadas */}
      <div className="bg-white px-3 py-2 rounded-2xl border border-gray-100 shadow-sm shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ID, personal solicitante o motivo de gasto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-brand-light/40 border border-gray-100 focus:border-brand-primary rounded-xl pl-9 pr-8 py-1.5 text-xs font-bold text-brand-dark outline-none transition-colors placeholder:text-gray-400 placeholder:font-normal"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Contenedor Scrollable de Solicitudes Liquidadas */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 pb-2">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-9 h-9 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cargando rendiciones liquidadas...
            </span>
          </div>
        ) : solicitudesFiltradas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {solicitudesFiltradas.map((req) => {
              const montoSol = parseFloat(req.monto_solicitado) || 0;
              const totalGast = parseFloat(req.total_gastado) || 0;
              const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
              const numComprobantes = req.detalles?.length || 0;

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 hover:border-brand-primary/40 shadow-sm transition-all flex flex-col justify-between border-l-4 border-l-blue-500"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-brand-dark bg-brand-light px-2 py-0.5 rounded-lg">
                        #{req.id}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border bg-blue-50 text-blue-600 border-blue-200 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Liquidado
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xs sm:text-sm font-black text-brand-dark leading-tight truncate">
                        {nombreSolicitante}
                      </h3>
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 font-medium mt-0.5">
                        <Calendar size={12} className="text-brand-primary" />
                        <span>{req.fecha_solicitud ? req.fecha_solicitud.replace('T', ' ').slice(0, 16) : '—'}</span>
                      </div>
                      {req.obs && (
                        <p className="text-[11px] text-gray-600 font-medium mt-0.5 line-clamp-1 italic">
                          "{req.obs}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                        Gasto Total
                      </span>
                      <span className="text-xs sm:text-sm font-black text-brand-primary">
                        S/ {totalGast.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                        Comprobantes
                      </span>
                      <span className="text-xs font-bold text-gray-600">
                        {numComprobantes} doc(s)
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Auditoría y Anulación */}
                  <div className="mt-2 pt-1.5 border-t border-gray-50 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSolicitudSeleccionada(req)}
                      className="text-[10px] font-black text-brand-primary hover:text-brand-secondary bg-brand-light px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
                    >
                      <Eye size={12} />
                      <span>Ver Comprobantes</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => manejarAnularSolicitud(req)}
                      className="text-[10px] font-black text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 flex items-center gap-1 transition-all"
                      title="Anular o Rechazar solicitud si tiene error"
                    >
                      <Trash2 size={12} />
                      <span>Anular</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-sm font-black text-brand-dark">No hay rendiciones pendientes de cierre</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              {busqueda
                ? 'No se encontraron liquidaciones con los criterios de búsqueda especificados.'
                : 'Todas las solicitudes liquidadas ya han sido cerradas en la semana.'}
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================
          MODAL DE CONFIRMACIÓN DEL CIERRE DE CAJA
         ======================================================================== */}
      {mostrarModalConfirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 p-6 space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Lock size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-brand-dark">Confirmar Cierre de Caja Semanal</h3>
              <p className="text-xs text-gray-400">
                Se actualizarán todas las solicitudes liquidadas al estado <b>Cerrado (CD)</b>.
              </p>
            </div>

            {/* Resumen Final en el Modal */}
            <div className="bg-gray-50 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Período:</span>
                <span className="font-bold text-brand-dark">{fechaInicio} al {fechaFin}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Solicitudes:</span>
                <span className="font-black text-brand-dark">{solicitudesLiquidadas.length} registros</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Gasto Total Semana:</span>
                <span className="font-black text-red-600">S/ {gastoTotalSemana.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Saldo Final en Caja:</span>
                <span className="font-black text-emerald-600">S/ {saldoFinal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-gray-200">
                <span className="font-black text-brand-primary">Nuevo Ingreso a Solicitar:</span>
                <span className="font-black text-brand-primary">S/ {nuevoIngresoSugerido.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMostrarModalConfirmacion(false)}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={ejecutarCierreSemanal}
                disabled={procesandoCierre}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                {procesandoCierre ? 'Procesando...' : 'Sí, Cerrar Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL DETALLE DE COMPROBANTES / AUDITORÍA
         ======================================================================== */}
      {solicitudSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                  Auditoría #{solicitudSeleccionada.id}
                </span>
                <h3 className="text-sm font-black text-brand-dark">Comprobantes de la Rendición</h3>
              </div>
              <button
                type="button"
                onClick={() => setSolicitudSeleccionada(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-brand-light/50 p-3 rounded-xl">
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold">Solicitante:</span>
                  <span className="font-bold text-brand-dark">{obtenerNombreSolicitante(solicitudSeleccionada.usuario_id)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block font-bold">Total Rendido:</span>
                  <span className="font-black text-brand-primary">S/ {parseFloat(solicitudSeleccionada.total_gastado || 0).toFixed(2)}</span>
                </div>
              </div>

              {solicitudSeleccionada.detalles?.map((det, idx) => (
                <div key={det.url || idx} className="p-3 bg-white rounded-xl border border-gray-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {det.adj_cajachica ? (
                      <button
                        type="button"
                        onClick={() => setImagenModal(det.adj_cajachica)}
                        className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 shrink-0"
                      >
                        <img src={det.adj_cajachica} alt="Comprobante" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        <Receipt size={18} />
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-black text-brand-dark">{det.subgasto_id?.nombre || 'Gasto'}</h4>
                      <p className="text-[11px] text-gray-500">{det.detalle || 'Sin descripción'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-brand-dark">S/ {parseFloat(det.costo || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSolicitudSeleccionada(null)}
                className="px-4 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-white transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visor de Imagen a Pantalla Completa */}
      {imagenModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-fade-in"
          onClick={() => setImagenModal(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setImagenModal(null)}
              className="absolute -top-10 right-0 text-white p-2 rounded-full hover:bg-white/20 transition-colors"
            >
              <X size={24} />
            </button>
            <img
              src={imagenModal}
              alt="Comprobante"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CierreCaja;
