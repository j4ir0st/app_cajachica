import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Eye,
  Plus,
  RefreshCw,
  Receipt,
  User,
  Building,
  X,
  Send,
  FileText
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth } from '../utils/fetchAuth';
import Toast from '../components/Toast';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ============================================================================
// CONFIGURACIÓN VISUAL DE ESTADOS
// ============================================================================

const ESTADOS_MAPA = {
  PD: {
    clave: 'PD',
    etiqueta: 'Pendiente',
    claseBadge: 'bg-amber-50 text-amber-600 border-amber-200',
    claseFondo: 'border-l-amber-500',
    icono: Clock,
  },
  LQ: {
    clave: 'LQ',
    etiqueta: 'Liquidado',
    claseBadge: 'bg-blue-50 text-blue-600 border-blue-200',
    claseFondo: 'border-l-blue-500',
    icono: CheckCircle2,
  },
  CD: {
    clave: 'CD',
    etiqueta: 'Cerrado',
    claseBadge: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    claseFondo: 'border-l-emerald-500',
    icono: CheckCircle2,
  },
  RC: {
    clave: 'RC',
    etiqueta: 'Rechazado',
    claseBadge: 'bg-red-50 text-red-600 border-red-200',
    claseFondo: 'border-l-red-500',
    icono: AlertCircle,
  },
};

const FILTROS_ESTADO = [
  { clave: 'TODOS', etiqueta: 'Todos' },
  { clave: 'PD', etiqueta: 'Pendientes' },
  { clave: 'LQ', etiqueta: 'Liquidados' },
  { clave: 'CD', etiqueta: 'Cerrados' },
  { clave: 'RC', etiqueta: 'Rechazados' },
];

// ============================================================================
// FUNCIONES AUXILIARES DE FORMATEO
// ============================================================================

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
 * Obtiene la etiqueta textual del estado.
 */
const obtenerEtiquetaEstado = (estado) => {
  if (!estado) return 'Pendiente';
  if (typeof estado === 'string') {
    return ESTADOS_MAPA[estado.toUpperCase()]?.etiqueta || estado;
  }
  if (typeof estado === 'object') {
    const valores = Object.values(estado);
    if (valores.length > 0) return valores[0];
  }
  return 'Pendiente';
};

/**
 * Obtiene el nombre completo del solicitante a partir del objeto serializado por el backend.
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
 * Extrae de forma limpia el mensaje de error del backend (JSON o texto).
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

// ============================================================================
// COMPONENTE PRINCIPAL: MIS SOLICITUDES
// ============================================================================

const MisSolicitudes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserStore();

  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Notificación flotante Toast
  const [notificacion, setNotificacion] = useState(
    location.state?.exito
      ? { tipo: 'exito', titulo: 'Operación Exitosa', mensaje: location.state.exito }
      : null
  );

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  // Modal de Detalle y Visor de Imagen
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);
  const [liquidando, setLiquidando] = useState(false);
  const [obsLiquidacion, setObsLiquidacion] = useState('');

  // ============================================================================
  // CARGA DE DATOS DE LA API
  // ============================================================================

  const cargarSolicitudes = async () => {
    setCargando(true);
    try {
      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/?format=json&top=100`);
      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const data = await res.json();
      const lista = data.results ?? data;

      // Ordenar por ID numérico descendente
      const ordenadas = Array.isArray(lista)
        ? [...lista].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        : [];

      setSolicitudes(ordenadas);
    } catch (err) {
      console.error('[MisSolicitudes] Error al cargar:', err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Cargar Solicitudes',
        mensaje: err.message || 'No se pudieron obtener las solicitudes. Verifique su conexión.',
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  // ============================================================================
  // FILTRADO REACTIVO EN MEMORIA
  // ============================================================================

  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((req) => {
      const claveEstado = obtenerClaveEstado(req.estado_requerimiento);

      if (filtroEstado !== 'TODOS' && claveEstado !== filtroEstado) {
        return false;
      }

      if (busqueda.trim() !== '') {
        const query = busqueda.toLowerCase().trim();
        const idTexto = String(req.id || '').toLowerCase();
        const obsTexto = (req.obs || '').toLowerCase();
        const solicitanteTexto = obtenerNombreSolicitante(req.usuario_id).toLowerCase();
        const areaTexto = String(req.area_id || '').toLowerCase();
        const fechaTexto = (req.fecha_solicitud || '').toLowerCase();
        const detallesTexto = (req.detalles || [])
          .map((d) => `${d.detalle || ''} ${d.nro_factura || ''} ${d.nro_ruc || ''} ${d.placa || ''} ${d.subgasto_id?.nombre || ''}`)
          .join(' ')
          .toLowerCase();

        const coincide =
          idTexto.includes(query) ||
          obsTexto.includes(query) ||
          solicitanteTexto.includes(query) ||
          areaTexto.includes(query) ||
          fechaTexto.includes(query) ||
          detallesTexto.includes(query);

        if (!coincide) return false;
      }

      return true;
    });
  }, [solicitudes, filtroEstado, busqueda]);

  // ============================================================================
  // ACCIÓN DE LIQUIDAR REQUERIMIENTO PENDIENTE
  // ============================================================================

  const manejarLiquidarRequerimiento = async (req) => {
    const idRequerimiento = req.id;
    if (!idRequerimiento) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error de Identificación',
        mensaje: 'No se pudo determinar el ID de la solicitud para liquidar.',
      });
      return;
    }

    const montoSol = parseFloat(req.monto_solicitado) || 0;
    const totalGast = parseFloat(req.total_gastado) || 0;

    // Regla: No se permite saldo sobrante para liquidar
    if (Math.abs(montoSol - totalGast) > 0.01) {
      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Saldo Pendiente por Justificar',
        mensaje: `Para liquidar la rendición, debe haberse justificado la totalidad del monto solicitado (S/ ${montoSol.toFixed(2)}).\nActualmente ha registrado S/ ${totalGast.toFixed(2)}, quedando un saldo restante de S/ ${(montoSol - totalGast).toFixed(2)} por gastar.`,
      });
      return;
    }

    const listaDetalles = req.detalles || [];
    if (listaDetalles.length === 0) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Comprobantes Faltantes',
        mensaje: 'No puede liquidar una solicitud sin comprobantes registrados.',
      });
      return;
    }

    const tieneComprobanteIncompleto = listaDetalles.some((d) => !d.adj_cajachica);
    if (tieneComprobanteIncompleto) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Foto Obligatoria Faltante',
        mensaje: 'Todos los comprobantes deben tener su foto o ticket adjunto para poder liquidar la solicitud.',
      });
      return;
    }

    setLiquidando(true);
    try {
      // Usar ruta normalizada a través del proxy local
      const endpoint = `${API_URL}/Requerimiento_CajaChica/${idRequerimiento}/liquidar/?format=json`;

      const res = await fetchAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obs: obsLiquidacion || req.obs || 'Liquidación confirmada por el usuario',
        }),
      });

      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      setNotificacion({
        tipo: 'exito',
        titulo: 'Liquidación Exitosa',
        mensaje: `¡Requerimiento #${idRequerimiento} liquidado correctamente!`,
      });

      setSolicitudSeleccionada(null);
      await cargarSolicitudes();
    } catch (err) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Liquidar',
        mensaje: err.message || 'Ocurrió un error al liquidar el requerimiento.',
      });
    } finally {
      setLiquidando(false);
    }
  };

  // ============================================================================
  // RENDERIZADO
  // ============================================================================

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in font-outfit max-w-7xl mx-auto relative">
      {/* Notificación Flotante Toast */}
      {notificacion && (
        <Toast
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          alCerrar={() => setNotificacion(null)}
        />
      )}

      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
            Control de Caja Chica
          </span>
          <h1 className="text-xl font-black text-brand-dark tracking-tight">Mis Liquidaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Historial de rendiciones, comprobantes registrados y estado de aprobación.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarSolicitudes}
            disabled={cargando}
            className="p-3 rounded-2xl border-2 border-gray-100 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50"
            title="Recargar listado"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin text-brand-primary' : ''} />
          </button>

          <button
            onClick={() => navigate('/nueva-solicitud')}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white text-xs font-black shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus size={16} strokeWidth={3} />
            <span>NUEVA RENDICIÓN</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ID, solicitante, factura, placa o motivo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-brand-light/40 border border-gray-100 focus:border-brand-primary rounded-2xl pl-11 pr-4 py-2.5 text-xs font-bold text-brand-dark outline-none transition-colors placeholder:text-gray-400 placeholder:font-normal"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Píldoras de Filtro por Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {FILTROS_ESTADO.map((f) => {
            const activo = filtroEstado === f.clave;
            return (
              <button
                key={f.clave}
                onClick={() => setFiltroEstado(f.clave)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activo
                    ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {f.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid de Tarjetas Táctiles */}
      {cargando ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            Cargando liquidaciones...
          </span>
        </div>
      ) : solicitudesFiltradas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {solicitudesFiltradas.map((req) => {
            const claveEstado = obtenerClaveEstado(req.estado_requerimiento);
            const infoEstado = ESTADOS_MAPA[claveEstado] || ESTADOS_MAPA.PD;
            const IconoEstado = infoEstado.icono;
            const montoSol = parseFloat(req.monto_solicitado) || 0;
            const totalGast = parseFloat(req.total_gastado) || 0;
            const saldoDevolucion = montoSol - totalGast;
            const numComprobantes = req.detalles?.length || 0;
            const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);

            return (
              <div
                key={req.id}
                onClick={() => {
                  setSolicitudSeleccionada(req);
                  setObsLiquidacion('');
                }}
                className={`group bg-white rounded-3xl p-5 border border-gray-100 hover:border-brand-primary/40 shadow-sm hover:shadow-xl hover:shadow-brand-primary/5 transition-all cursor-pointer flex flex-col justify-between border-l-4 ${infoEstado.claseFondo} active:scale-[0.99]`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand-dark bg-brand-light px-2.5 py-1 rounded-xl">
                      #{req.id}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl border flex items-center gap-1 ${infoEstado.claseBadge}`}
                    >
                      <IconoEstado size={12} />
                      {obtenerEtiquetaEstado(req.estado_requerimiento)}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-black text-brand-dark leading-snug truncate">
                      {nombreSolicitante}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mt-1">
                      <Calendar size={13} className="text-brand-primary" />
                      <span>{req.fecha_solicitud ? req.fecha_solicitud.replace('T', ' ').slice(0, 16) : '—'}</span>
                    </div>
                    {req.obs && (
                      <p className="text-xs text-gray-600 font-medium mt-1 line-clamp-1 italic">
                        "{req.obs}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Solicitado / Gastado
                    </span>
                    <span className="text-sm font-black text-brand-dark">
                      S/ {montoSol.toFixed(2)}{' '}
                      <span className="text-xs font-semibold text-gray-400">/ S/ {totalGast.toFixed(2)}</span>
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      {saldoDevolucion > 0 ? 'Saldo Restante' : 'Comprobantes'}
                    </span>
                    <span
                      className={`text-xs font-black ${
                        saldoDevolucion > 0 ? 'text-amber-600 font-bold' : 'text-brand-primary'
                      }`}
                    >
                      {saldoDevolucion > 0 ? `S/ ${saldoDevolucion.toFixed(2)}` : `${numComprobantes} doc(s)`}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between">
                  {claveEstado === 'PD' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/nueva-solicitud', { state: { requerimientoAEditar: req } });
                      }}
                      className="text-[11px] font-black text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <span>✏️ Continuar Llenado</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-brand-primary font-bold">Ver detalle completo</span>
                  )}
                  <ChevronRight size={14} className="text-gray-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center text-brand-primary">
            <FileText size={28} />
          </div>
          <h3 className="text-base font-black text-brand-dark">No se encontraron liquidaciones</h3>
          <p className="text-xs text-gray-400 max-w-sm">
            {busqueda || filtroEstado !== 'TODOS'
              ? 'No hay registros que coincidan con los filtros seleccionados.'
              : 'Aún no tiene rendiciones registradas. Puede crear una nueva solicitud.'}
          </p>
          <button
            onClick={() => navigate('/nueva-solicitud')}
            className="mt-2 px-5 py-2.5 rounded-2xl bg-brand-primary text-white text-xs font-black shadow-md shadow-brand-primary/20 hover:bg-brand-secondary transition-all"
          >
            Registrar Primer Gasto
          </button>
        </div>
      )}

      {/* ========================================================================
          MODAL DETALLE DE LIQUIDACIÓN Y VISOR DE COMPROBANTES
         ======================================================================== */}
      {solicitudSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            {/* Cabecera del Modal */}
            <div className="px-5 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                  Liquidación #{solicitudSeleccionada.id}
                </span>
                <h3 className="text-base font-black text-brand-dark">Detalle de la Rendición</h3>
              </div>
              <button
                type="button"
                onClick={() => setSolicitudSeleccionada(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido Scrollable */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Resumen General */}
              <div className="bg-brand-light/50 border border-brand-primary/15 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">Estado:</span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl border ${
                      ESTADOS_MAPA[obtenerClaveEstado(solicitudSeleccionada.estado_requerimiento)]?.claseBadge ||
                      'bg-gray-50 text-gray-600'
                    }`}
                  >
                    {obtenerEtiquetaEstado(solicitudSeleccionada.estado_requerimiento)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-brand-primary/10 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Solicitante</span>
                    <span className="font-bold text-brand-dark">
                      {obtenerNombreSolicitante(solicitudSeleccionada.usuario_id)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Área</span>
                    <span className="font-bold text-brand-dark">
                      {solicitudSeleccionada.area_id || '—'}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Fecha Solicitud</span>
                    <span className="font-bold text-gray-600">
                      {solicitudSeleccionada.fecha_solicitud
                        ? solicitudSeleccionada.fecha_solicitud.replace('T', ' ').slice(0, 16)
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-brand-primary/10 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Monto Solicitado</span>
                    <span className="font-black text-brand-dark">
                      S/ {parseFloat(solicitudSeleccionada.monto_solicitado || 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Gastado</span>
                    <span className="font-black text-brand-primary">
                      S/ {parseFloat(solicitudSeleccionada.total_gastado || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Saldo / Devolución</span>
                    <span
                      className={`font-black ${
                        parseFloat(solicitudSeleccionada.monto_solicitado || 0) -
                          parseFloat(solicitudSeleccionada.total_gastado || 0) >
                        0
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      S/{' '}
                      {(
                        parseFloat(solicitudSeleccionada.monto_solicitado || 0) -
                        parseFloat(solicitudSeleccionada.total_gastado || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>

                {solicitudSeleccionada.obs && (
                  <div className="pt-2 border-t border-brand-primary/10 text-xs text-gray-600">
                    <span className="font-bold text-brand-dark block">Observaciones:</span>
                    <span>{solicitudSeleccionada.obs}</span>
                  </div>
                )}
              </div>

              {/* Lista de Comprobantes Anidados (`detalles`) */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-brand-dark block">
                  Comprobantes Adjuntos ({solicitudSeleccionada.detalles?.length || 0})
                </span>

                {solicitudSeleccionada.detalles && solicitudSeleccionada.detalles.length > 0 ? (
                  <div className="space-y-2.5">
                    {solicitudSeleccionada.detalles.map((det, idx) => {
                      const nombreSubgasto =
                        typeof det.subgasto_id === 'object' && det.subgasto_id
                          ? det.subgasto_id.nombre
                          : 'Comprobante de Gasto';
                      const tipoGasto = det.subgasto_id?.tipogasto_id?.nombre || null;

                      return (
                        <div
                          key={det.url || idx}
                          className="bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              {det.adj_cajachica ? (
                                <button
                                  type="button"
                                  onClick={() => setImagenModal(det.adj_cajachica)}
                                  className="group/img relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 hover:opacity-90 transition-opacity"
                                  title="Ver imagen completa"
                                >
                                  <img
                                    src={det.adj_cajachica}
                                    alt="Comprobante"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 bg-brand-dark/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity">
                                    <Eye size={16} />
                                  </div>
                                </button>
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-brand-light flex items-center justify-center text-brand-primary shrink-0">
                                  <Receipt size={22} />
                                </div>
                              )}

                              <div>
                                {tipoGasto && (
                                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-light text-brand-primary inline-block mb-0.5">
                                    {tipoGasto}
                                  </span>
                                )}
                                <h4 className="text-xs font-black text-brand-dark leading-snug">
                                  {nombreSubgasto}
                                </h4>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  {det.detalle || 'Sin descripción'}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-xs font-black text-brand-dark block">
                                S/ {parseFloat(det.costo || 0).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {det.fecha_gasto ? det.fecha_gasto.slice(0, 10) : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 font-semibold pt-1 border-t border-gray-50">
                            <span className="px-2 py-0.5 bg-gray-50 rounded-md">
                              {det.lima_provincia === 'L' ? 'Lima' : 'Provincia'}
                            </span>
                            {det.nro_factura && (
                              <span className="px-2 py-0.5 bg-gray-50 rounded-md">Doc: {det.nro_factura}</span>
                            )}
                            {det.nro_ruc && (
                              <span className="px-2 py-0.5 bg-gray-50 rounded-md">RUC: {det.nro_ruc}</span>
                            )}
                            {det.placa && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">
                                Placa: {det.placa}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 rounded-xl">
                    No hay comprobantes adjuntos en esta solicitud.
                  </p>
                )}
              </div>

              {/* Acción de Liquidar (Solo si está Pendiente 'PD') */}
              {obtenerClaveEstado(solicitudSeleccionada.estado_requerimiento) === 'PD' && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                    <Clock size={16} />
                    <span>Esta solicitud está en estado Pendiente de Liquidación</span>
                  </div>

                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Para finalizar y enviar la liquidación formal a administración, ingrese una observación (opcional) y confirme el envío:
                  </p>

                  <textarea
                    rows={2}
                    placeholder="Nota u observación final de la liquidación..."
                    value={obsLiquidacion}
                    onChange={(e) => setObsLiquidacion(e.target.value)}
                    className="w-full bg-white border border-amber-200 rounded-xl p-2.5 text-xs font-medium text-brand-dark outline-none focus:border-amber-400 resize-none"
                  />

                  <button
                    type="button"
                    onClick={() => manejarLiquidarRequerimiento(solicitudSeleccionada)}
                    disabled={liquidando}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
                  >
                    <Send size={14} />
                    {liquidando ? 'Liquidando Solicitud...' : 'ENVIAR Y LIQUIDAR REQUERIMIENTO'}
                  </button>
                </div>
              )}
            </div>

            {/* Pie del Modal */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              {obtenerClaveEstado(solicitudSeleccionada.estado_requerimiento) === 'PD' ? (
                <button
                  type="button"
                  onClick={() => {
                    const req = solicitudSeleccionada;
                    setSolicitudSeleccionada(null);
                    navigate('/nueva-solicitud', { state: { requerimientoAEditar: req } });
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all"
                >
                  <span>✏️ Continuar Llenado</span>
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setSolicitudSeleccionada(null)}
                className="px-5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-white transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          VISOR DE IMAGEN A PANTALLA COMPLETA
         ======================================================================== */}
      {imagenModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-fade-in"
          onClick={() => setImagenModal(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setImagenModal(null)}
              className="absolute -top-12 right-0 text-white p-2 rounded-full hover:bg-white/20 transition-colors"
            >
              <X size={24} />
            </button>
            <img
              src={imagenModal}
              alt="Comprobante en alta resolución"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MisSolicitudes;
