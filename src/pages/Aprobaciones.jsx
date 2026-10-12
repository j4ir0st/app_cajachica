import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileCheck,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  DollarSign,
  AlertCircle,
  Receipt,
  User,
  Building,
  ArrowRight,
  RotateCcw,
  Check,
  X,
  Copy,
  TrendingUp,
  ShieldAlert,
  Send
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import Toast from '../components/Toast';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ============================================================================
// FUNCIONES AUXILIARES DE FORMATEO
// ============================================================================

/**
 * Obtiene el nombre completo del solicitante a partir del objeto o cadena del backend.
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

// ============================================================================
// COMPONENTE PRINCIPAL: APROBACIONES
// ============================================================================

const Aprobaciones = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();

  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  // Filtros y Búsqueda
  const [busqueda, setBusqueda] = useState('');

  // Modal de Auditoría y Visor de Imagen
  const [solicitudAuditoria, setSolicitudAuditoria] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);

  // Modal para Rechazar / Devolver
  const [modalRechazo, setModalRechazo] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  // Modal para Postergar a la Siguiente Semana
  const [modalPostergar, setModalPostergar] = useState(null);
  const [motivoPostergacion, setMotivoPostergacion] = useState('');

  // ============================================================================
  // CARGA DE DATOS (SOLICITUDES LIQUIDADAS PENDIENTES DE AUDITORÍA)
  // ============================================================================

  const cargarSolicitudes = async () => {
    setCargando(true);
    try {
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

      setSolicitudes(ordenadas);
      console.log(`[Aprobaciones] ✅ Cargadas ${ordenadas.length} solicitudes liquidadas para revisión.`);
    } catch (err) {
      console.error('[Aprobaciones] ❌ Error al cargar solicitudes:', err.message || err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Cargar Rendiciones',
        mensaje: err.message || 'No se pudieron obtener las solicitudes liquidadas para aprobación.',
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
    if (!busqueda.trim()) return solicitudes;

    const query = busqueda.toLowerCase().trim();
    return solicitudes.filter((req) => {
      const idTexto = String(req.id || '').toLowerCase();
      const solicitanteTexto = obtenerNombreSolicitante(req.usuario_id).toLowerCase();
      const obsTexto = (req.obs || '').toLowerCase();
      const areaTexto = String(req.area_id || '').toLowerCase();
      const detallesTexto = (req.detalle || req.detalles || [])
        .map((d) => `${d.detalle || ''} ${d.nro_factura || ''} ${d.nro_ruc || ''} ${d.placa || ''} ${d.subgasto_id?.nombre || ''}`)
        .join(' ')
        .toLowerCase();

      return (
        idTexto.includes(query) ||
        solicitanteTexto.includes(query) ||
        obsTexto.includes(query) ||
        areaTexto.includes(query) ||
        detallesTexto.includes(query)
      );
    });
  }, [solicitudes, busqueda]);

  // ============================================================================
  // TOTALES Y KPIS DE AUDITORÍA
  // ============================================================================

  const totalMontoAuditoria = useMemo(() => {
    return solicitudes.reduce((acc, req) => {
      const gasto = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      return acc + (isNaN(gasto) ? 0 : gasto);
    }, 0);
  }, [solicitudes]);

  const totalComprobantes = useMemo(() => {
    return solicitudes.reduce((acc, req) => acc + (req.detalle || req.detalles || []).length, 0);
  }, [solicitudes]);

  // ============================================================================
  // ACCIÓN: RECHAZAR / DEVOLVER SOLICITUD (RC)
  // ============================================================================

  const ejecutarRechazo = async () => {
    if (!modalRechazo) return;
    setProcesandoAccion(true);

    try {
      const obsFinal = motivoRechazo.trim()
        ? `[Rechazado en Auditoría]: ${motivoRechazo.trim()} | ${modalRechazo.obs || ''}`
        : modalRechazo.obs || 'Rechazado por el área de revisión';

      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${modalRechazo.id}/?format=json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado_requerimiento: 'RC',
          obs: obsFinal,
        }),
      });

      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Rendición Rechazada',
        mensaje: `La solicitud #${modalRechazo.id} fue devuelta como Rechazada (RC).`,
      });

      setModalRechazo(null);
      setMotivoRechazo('');
      setSolicitudAuditoria(null);
      await cargarSolicitudes();
    } catch (err) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Rechazar',
        mensaje: err.message || 'No se pudo rechazar la solicitud.',
      });
    } finally {
      setProcesandoAccion(false);
    }
  };

  // ============================================================================
  // ACCIÓN: POSTERGAR A LA SIGUIENTE SEMANA
  // ============================================================================

  const ejecutarPostergacion = async () => {
    if (!modalPostergar) return;
    setProcesandoAccion(true);

    try {
      // 1. Marcar el requerimiento actual como Rechazado/Postergado (RC)
      const notaPostergado = motivoPostergacion.trim()
        ? `[Postergado a siguiente semana]: ${motivoPostergacion.trim()}`
        : '[Postergado a siguiente semana para próximo cierre]';

      const obsActual = `${notaPostergado} | ${modalPostergar.obs || ''}`;

      const resAnular = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${modalPostergar.id}/?format=json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado_requerimiento: 'RC',
          obs: obsActual,
        }),
      });

      if (!resAnular.ok) {
        const errorDetallado = await extraerMensajeError(resAnular);
        throw new Error(errorDetallado);
      }

      // 2. Crear una nueva réplica en estado Liquidado (LQ) para la siguiente semana
      const usuarioUrl = typeof modalPostergar.usuario_id === 'object'
        ? modalPostergar.usuario_id.url
        : (modalPostergar.usuario_id ? `${API_URL}/Usuario/${modalPostergar.usuario_id}/` : null);

      const areaUrl = typeof modalPostergar.area_id === 'object'
        ? modalPostergar.area_id.url
        : (modalPostergar.area_id ? `${API_URL}/Area/${modalPostergar.area_id}/` : null);

      const nuevaCabeceraPayload = {
        monto_solicitado: String(modalPostergar.monto_solicitado || '0'),
        obs: `Réplica de #${modalPostergar.id} postergado. ${motivoPostergacion.trim() || ''}`.trim(),
        fecha_solicitud: new Date().toISOString(),
        estado_requerimiento: 'LQ',
        ...(usuarioUrl ? { usuario_id: usuarioUrl, created_by: usuarioUrl } : {}),
        ...(areaUrl ? { area_id: areaUrl } : {}),
      };

      const resCrear = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaCabeceraPayload),
      });

      if (resCrear.ok) {
        const nuevoReq = await resCrear.json();
        const nuevoId = nuevoReq.id;

        // Replicar detalles si existen
        const detallesOrigen = modalPostergar.detalle || modalPostergar.detalles || [];
        for (const det of detallesOrigen) {
          try {
            const formDataDetalle = new FormData();
            formDataDetalle.append('requerimiento_id', nuevoReq.url || `${API_URL}/Requerimiento_CajaChica/${nuevoId}/`);
            if (det.tipogasto_id?.url) formDataDetalle.append('tipogasto_id', det.tipogasto_id.url);
            if (det.subgasto_id?.url) formDataDetalle.append('subgasto_id', det.subgasto_id.url);
            formDataDetalle.append('lima_provincia', det.lima_provincia || 'L');
            if (det.provincia_id?.url) formDataDetalle.append('provincia_id', det.provincia_id.url);
            if (det.nro_factura) formDataDetalle.append('nro_factura', det.nro_factura);
            if (det.nro_ruc) formDataDetalle.append('nro_ruc', det.nro_ruc);
            if (det.placa) formDataDetalle.append('placa', det.placa);
            if (det.origen?.url) formDataDetalle.append('origen', det.origen.url);
            if (det.destino?.url) formDataDetalle.append('destino', det.destino.url);
            formDataDetalle.append('costo', String(det.costo || '0'));
            formDataDetalle.append('detalle', det.detalle || '');
            formDataDetalle.append('fecha_gasto', det.fecha_gasto || new Date().toISOString().slice(0, 10));

            await fetchAuth(`${API_URL}/RC_Detalle/?format=json`, {
              method: 'POST',
              body: formDataDetalle,
            });
          } catch (errorDetalle) {
            console.warn('[Aprobaciones] No se pudo replicar detalle secundario:', errorDetalle);
          }
        }

        setNotificacion({
          tipo: 'exito',
          titulo: 'Solicitud Postergada con Éxito',
          mensaje: `Se postergó el requerimiento #${modalPostergar.id} y se generó el nuevo requerimiento #${nuevoId} para la siguiente semana.`,
        });
      } else {
        setNotificacion({
          tipo: 'advertencia',
          titulo: 'Postergación Parcial',
          mensaje: `Se anuló el requerimiento #${modalPostergar.id} de la semana actual.`,
        });
      }

      setModalPostergar(null);
      setMotivoPostergacion('');
      setSolicitudAuditoria(null);
      await cargarSolicitudes();
    } catch (err) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Postergar',
        mensaje: err.message || 'No se pudo postergar la solicitud seleccionada.',
      });
    } finally {
      setProcesandoAccion(false);
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
          <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">Bandeja de Aprobaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
            Revisión y visto bueno previo de rendiciones liquidadas antes del cierre semanal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarSolicitudes}
            disabled={cargando || procesandoAccion}
            className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-sm"
            title="Recargar rendiciones"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin text-brand-primary' : ''} />
          </button>

          <button
            onClick={() => navigate('/cierre-caja')}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <span>Ir a Cierre de Caja</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Panel Superior de Métricas de Revisión */}
      <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-gray-100 shadow-sm shrink-0 grid grid-cols-3 gap-2 text-xs">
        <div className="bg-brand-light/60 rounded-xl px-3 py-1.5">
          <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider block">
            Por Auditar
          </span>
          <span className="text-xs sm:text-sm font-black text-brand-dark">
            {solicitudes.length} rendiciones
          </span>
        </div>

        <div className="bg-gray-50 rounded-xl px-3 py-1.5">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
            Total Rendido
          </span>
          <span className="text-xs sm:text-sm font-black text-brand-primary">
            S/ {totalMontoAuditoria.toFixed(2)}
          </span>
        </div>

        <div className="bg-gray-50 rounded-xl px-3 py-1.5">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
            Comprobantes
          </span>
          <span className="text-xs sm:text-sm font-black text-gray-700">
            {totalComprobantes} fotos/docs
          </span>
        </div>
      </div>

      {/* Buscador de Solicitudes */}
      <div className="bg-white px-3 py-2 rounded-2xl border border-gray-100 shadow-sm shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ID, solicitante, factura, motivo o placa..."
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

      {/* Contenedor Scrollable de Solicitudes para Auditoría */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 pb-2">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-9 h-9 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cargando bandeja de aprobaciones...
            </span>
          </div>
        ) : solicitudesFiltradas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {solicitudesFiltradas.map((req) => {
              const totalGast = parseFloat(req.total_gastado || req.monto_solicitado || 0);
              const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
              const numComprobantes = (req.detalle || req.detalles || []).length;
              const tieneFotosCompletas = (req.detalle || req.detalles || []).every((d) => d.adj_cajachica);

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 hover:border-brand-primary/40 shadow-sm hover:shadow-md transition-all flex flex-col justify-between border-l-4 border-l-blue-500"
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
                        Importe Rendido
                      </span>
                      <span className="text-xs sm:text-sm font-black text-brand-primary">
                        S/ {totalGast.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                        Fotos / Docs
                      </span>
                      <span
                        className={`text-xs font-black flex items-center gap-1 ${
                          tieneFotosCompletas ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        <Receipt size={12} />
                        {numComprobantes} comprobante(s)
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Revisión Previa */}
                  <div className="mt-2.5 pt-2 border-t border-gray-50 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSolicitudAuditoria(req)}
                      className="py-1.5 px-2 bg-brand-light hover:bg-brand-primary/10 text-brand-primary font-black text-[10px] rounded-lg flex items-center justify-center gap-1 transition-all truncate"
                      title="Ver todos los comprobantes y fotos"
                    >
                      <Eye size={12} />
                      <span>Revisar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setModalPostergar(req);
                        setMotivoPostergacion('');
                      }}
                      className="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-[10px] rounded-lg border border-amber-200 flex items-center justify-center gap-1 transition-all truncate"
                      title="Mover o postergar para el próximo cierre"
                    >
                      <RotateCcw size={12} />
                      <span>Postergar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setModalRechazo(req);
                        setMotivoRechazo('');
                      }}
                      className="py-1.5 px-2 bg-red-50 hover:bg-red-100 text-red-600 font-black text-[10px] rounded-lg border border-red-200 flex items-center justify-center gap-1 transition-all truncate"
                      title="Rechazar y devolver al solicitante"
                    >
                      <X size={12} />
                      <span>Rechazar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <FileCheck size={24} />
            </div>
            <h3 className="text-sm font-black text-brand-dark">Sin rendiciones pendientes de revisión</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              {busqueda
                ? 'No se encontraron solicitudes con los términos de búsqueda.'
                : 'Todas las rendiciones liquidadas están listas para el Cierre Semanal de Caja.'}
            </p>
            <button
              onClick={() => navigate('/cierre-caja')}
              className="mt-1 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all"
            >
              Ir a Cierre de Caja
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================
          MODAL DETALLE COMPLETO DE AUDITORÍA Y COMPROBANTES
         ======================================================================== */}
      {solicitudAuditoria && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                  Auditoría Requerimiento #{solicitudAuditoria.id}
                </span>
                <h3 className="text-sm font-black text-brand-dark">Revisión de Gastos y Comprobantes</h3>
              </div>
              <button
                type="button"
                onClick={() => setSolicitudAuditoria(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {/* Resumen del Requerimiento */}
              <div className="bg-brand-light/50 p-3 rounded-2xl border border-brand-primary/10 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold">Solicitante:</span>
                  <span className="font-bold text-brand-dark">{obtenerNombreSolicitante(solicitudAuditoria.usuario_id)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold">Área:</span>
                  <span className="font-bold text-brand-dark">{solicitudAuditoria.area_id || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold">Total Rendido:</span>
                  <span className="font-black text-brand-primary">S/ {parseFloat(solicitudAuditoria.total_gastado || 0).toFixed(2)}</span>
                </div>
                {solicitudAuditoria.obs && (
                  <div className="col-span-2 sm:col-span-3 pt-1 border-t border-brand-primary/10 text-[11px] text-gray-600">
                    <span className="font-bold text-brand-dark">Observaciones: </span>
                    <span>{solicitudAuditoria.obs}</span>
                  </div>
                )}
              </div>

              {/* Lista de Comprobantes Adjuntos */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-brand-dark block">
                  Comprobantes Adjuntos ({(solicitudAuditoria.detalle || solicitudAuditoria.detalles || []).length})
                </span>

                {(solicitudAuditoria.detalle || solicitudAuditoria.detalles || []).map((det, idx) => {
                  const nombreGasto = typeof det.subgasto_id === 'object' && det.subgasto_id
                    ? det.subgasto_id.nombre
                    : 'Comprobante de Gasto';
                  const tipoGasto = det.subgasto_id?.tipogasto_id?.nombre || null;

                  return (
                    <div
                      key={det.url || idx}
                      className="p-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {det.adj_cajachica ? (
                            <button
                              type="button"
                              onClick={() => setImagenModal(det.adj_cajachica)}
                              className="group/img relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 hover:opacity-90 transition-opacity"
                              title="Ver comprobante en grande"
                            >
                              <img src={det.adj_cajachica} alt="Comprobante" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-brand-dark/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <Eye size={15} />
                              </div>
                            </button>
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                              <Receipt size={20} />
                            </div>
                          )}

                          <div>
                            {tipoGasto && (
                              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-light text-brand-primary inline-block mb-0.5">
                                {tipoGasto}
                              </span>
                            )}
                            <h4 className="text-xs font-black text-brand-dark leading-snug">{nombreGasto}</h4>
                            <p className="text-[11px] text-gray-500 mt-0.5">{det.detalle || 'Sin descripción'}</p>
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
                        {det.nro_factura && <span className="px-2 py-0.5 bg-gray-50 rounded-md">Doc: {det.nro_factura}</span>}
                        {det.nro_ruc && <span className="px-2 py-0.5 bg-gray-50 rounded-md">RUC: {det.nro_ruc}</span>}
                        {det.placa && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">Placa: {det.placa}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer de Acciones del Modal */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalPostergar(solicitudAuditoria);
                    setMotivoPostergacion('');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all"
                >
                  Postergar Semana
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalRechazo(solicitudAuditoria);
                    setMotivoRechazo('');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all"
                >
                  Rechazar
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSolicitudAuditoria(null)}
                className="px-4 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-white transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL DE CONFIRMACIÓN PARA POSTERGAR A SIGUIENTE SEMANA
         ======================================================================== */}
      {modalPostergar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 p-6 space-y-3.5 animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <RotateCcw size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-brand-dark">Postergar Requerimiento #{modalPostergar.id}</h3>
              <p className="text-xs text-gray-400">
                Se anulará el registro actual y se creará automáticamente una réplica en estado Liquidado para la próxima semana.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                Motivo de la postergación (opcional):
              </label>
              <textarea
                rows={2}
                placeholder="Ej. Comprobante requiere validación adicional o se incluirá en el siguiente lote..."
                value={motivoPostergacion}
                onChange={(e) => setMotivoPostergacion(e.target.value)}
                className="w-full bg-brand-light/50 border border-gray-100 focus:border-amber-400 rounded-xl p-2.5 text-xs font-medium text-brand-dark outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalPostergar(null)}
                disabled={procesandoAccion}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={ejecutarPostergacion}
                disabled={procesandoAccion}
                className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
              >
                {procesandoAccion ? 'Postergando...' : 'Confirmar y Postergar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL DE CONFIRMACIÓN PARA RECHAZAR / DEVOLVER
         ======================================================================== */}
      {modalRechazo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 p-6 space-y-3.5 animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <ShieldAlert size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-brand-dark">Rechazar Requerimiento #{modalRechazo.id}</h3>
              <p className="text-xs text-gray-400">
                La solicitud pasará al estado Rechazado (RC) y se excluirá de la liquidación y del cierre semanal.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                Motivo del rechazo:
              </label>
              <textarea
                rows={2}
                placeholder="Indique la observación o error en los comprobantes..."
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                className="w-full bg-brand-light/50 border border-gray-100 focus:border-red-400 rounded-xl p-2.5 text-xs font-medium text-brand-dark outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalRechazo(null)}
                disabled={procesandoAccion}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={ejecutarRechazo}
                disabled={procesandoAccion}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md shadow-red-500/20 transition-all disabled:opacity-50"
              >
                {procesandoAccion ? 'Rechazando...' : 'Rechazar Solicitud'}
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
              className="absolute -top-10 right-0 text-white p-2 rounded-full hover:bg-white/20 transition-colors"
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

export default Aprobaciones;
