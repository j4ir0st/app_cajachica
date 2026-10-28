import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  ArrowRight,
  MapPin,
  Car
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useCatalogoStore } from '../store/catalogoStore';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { obtenerTipoCaja } from '../utils/tipoCaja';
import { esArchivoPdf } from '../utils/archivoUtil';
import { resolverRutaOEntidad } from '../utils/entidades';
import { puedeAccederCierreCaja } from '../utils/permisos';
import ModalVisorComprobante from '../components/ModalVisorComprobante';
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

/**
 * Helper para verificar si un requerimiento es candidato válido para Cierre de Caja:
 * - Debe estar Liquidado ('LQ')
 * - Debe estar Revisado por Gerencia ('revisado' o 'revision' === true)
 * - NO debe pertenecer ya a otro cierre semanal (sin 'saldo_semanal_id' ni 'saldo_semanal' ni 'codigo_cierre')
 */
const esRequerimientoValidoParaCierre = (req) => {
  if (!req) return false;
  const estado = typeof req.estado_requerimiento === 'object'
    ? Object.keys(req.estado_requerimiento)[0]
    : req.estado_requerimiento;
  const estaLiquidado = estado === 'LQ';
  const estaRevisado = Boolean(req.revisado || req.revision);
  const yaTieneSaldo = Boolean(req.saldo_semanal_id || req.saldo_semanal || req.codigo_cierre);
  return estaLiquidado && estaRevisado && !yaTieneSaldo;
};

// ============================================================================
// COMPONENTE PRINCIPAL: CIERRE DE CAJA
// ============================================================================

const CierreCaja = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { entidades } = useCatalogoStore();

  // Protección estricta: Solo Gerente de Operaciones y Superusuario
  useEffect(() => {
    if (user && !puedeAccederCierreCaja(user)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const [solicitudesLiquidadas, setSolicitudesLiquidadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoCierre, setProcesandoCierre] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [buscandoRemoto, setBuscandoRemoto] = useState(false);

  // Parámetros del Balance Semanal
  const [saldoInicial, setSaldoInicial] = useState('4000.00');
  const [nuevoIngresoManual, setNuevoIngresoManual] = useState('');
  const [fechaInicio, setFechaInicio] = useState(obtenerFechaLunesActual());
  const [fechaFin, setFechaFin] = useState(obtenerFechaHoy());
  const [observaciones, setObservaciones] = useState('');

  // Modal de Detalle / Auditoría de Solicitud
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);

  // Modal de Confirmación de Cierre
  const [mostrarModalConfirmacion, setMostrarModalConfirmacion] = useState(false);

  // ============================================================================
  // CARGA DE SOLICITUDES LIQUIDADAS Y REVISADAS
  // ============================================================================

  const cargarSolicitudesLiquidadas = async () => {
    setCargando(true);
    try {
      // Filtrar únicamente los registros en estado Liquidado (LQ) y con revisión gerencial (revisado=true)
      const parametros = new URLSearchParams({
        format: 'json',
        estado_requerimiento: 'LQ',
        revisado: 'true',
      });

      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/?${parametros.toString()}`);
      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const data = await res.json();
      const lista = data.results ?? (Array.isArray(data) ? data : []);

      const ordenadas = lista
        .filter(esRequerimientoValidoParaCierre)
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

      setSolicitudesLiquidadas(ordenadas);
      console.log(`[CierreCaja] ✅ Cargadas ${ordenadas.length} solicitudes liquidadas y revisadas para cierre.`);
    } catch (err) {
      console.error('[CierreCaja] ❌ Error al cargar liquidaciones:', err.message || err);
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
  // FILTRADO REACTIVO EN MEMORIA (SOLO LIQUIDADOS Y REVISADOS)
  // ============================================================================

  const solicitudesFiltradas = useMemo(() => {
    const base = solicitudesLiquidadas.filter(esRequerimientoValidoParaCierre);

    if (!busqueda.trim()) return base;

    const query = busqueda.toLowerCase().trim();
    const querySinHash = query.replace(/^#/, '');
    return base.filter((req) => {
      const idTexto = String(req.id || '').toLowerCase();
      const solicitanteTexto = obtenerNombreSolicitante(req.usuario_id).toLowerCase();
      const obsTexto = (req.obs || '').toLowerCase();
      const areaTexto = String(req.area_id || '').toLowerCase();

      return (
        idTexto === querySinHash ||
        idTexto.includes(querySinHash) ||
        idTexto.includes(query) ||
        solicitanteTexto.includes(query) ||
        obsTexto.includes(query) ||
        areaTexto.includes(query)
      );
    });
  }, [solicitudesLiquidadas, busqueda]);

  // Búsqueda Inteligente: En memoria primero; si no hay coincidencias o se busca por ID no cargado, consultar BD
  useEffect(() => {
    const termino = busqueda.trim();
    if (!termino) {
      setBuscandoRemoto(false);
      return;
    }

    const idLimpio = termino.replace(/^#/, '').trim();
    const esIdNumerico = /^\d+$/.test(idLimpio);
    const idEncontradoEnMemoria = esIdNumerico && solicitudesLiquidadas.some((s) => String(s.id) === idLimpio);

    if (idEncontradoEnMemoria) return;
    if (!esIdNumerico && solicitudesFiltradas.length > 0) return;

    const temporizador = setTimeout(async () => {
      setBuscandoRemoto(true);
      try {
        if (esIdNumerico) {
          const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${idLimpio}/?format=json`);
          if (res.ok) {
            const req = await res.json();
            if (esRequerimientoValidoParaCierre(req)) {
              setSolicitudesLiquidadas((prev) => {
                const existe = prev.some((s) => s.id === req.id);
                return existe ? prev : [req, ...prev];
              });
            }
          }
        } else {
          const params = new URLSearchParams({
            format: 'json',
            estado_requerimiento: 'LQ',
            revisado: 'true',
            search: termino,
          });
          const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            const lista = data.results ?? (Array.isArray(data) ? data : []);
            const validos = lista.filter(esRequerimientoValidoParaCierre);
            if (validos.length > 0) {
              setSolicitudesLiquidadas((prev) => {
                const idsExistentes = new Set(prev.map((s) => s.id));
                const nuevos = validos.filter((s) => !idsExistentes.has(s.id));
                return nuevos.length > 0 ? [...prev, ...nuevos] : prev;
              });
            }
          }
        }
      } catch (err) {
        console.warn('[CierreCaja] Búsqueda remota sin resultados:', err.message);
      } finally {
        setBuscandoRemoto(false);
      }
    }, 400);

    return () => clearTimeout(temporizador);
  }, [busqueda, solicitudesLiquidadas.length, solicitudesFiltradas.length]);

  // ============================================================================
  // CÁLCULOS FINANCIEROS DEL CIERRE (SOLO LIQUIDADOS Y REVISADOS)
  // ============================================================================

  const gastoTotalSemana = useMemo(() => {
    return solicitudesLiquidadas
      .filter(esRequerimientoValidoParaCierre)
      .reduce((acumulado, req) => {
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
  // EJECUTAR CIERRE DE CAJA SEMANAL (SOLO LIQUIDADOS Y REVISADOS)
  // ============================================================================

  const ejecutarCierreSemanal = async () => {
    if (!fechaInicio || !fechaFin) {
      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Fechas Requeridas',
        mensaje: 'Debe ingresar tanto la fecha de inicio como la fecha de fin para el periodo de cierre.',
      });
      return;
    }

    if (fechaInicio > fechaFin) {
      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Rango de Fechas Inválido',
        mensaje: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
      });
      return;
    }

    const solicitudesValidas = solicitudesLiquidadas.filter(esRequerimientoValidoParaCierre);

    if (solicitudesValidas.length === 0) {
      setNotificacion({
        tipo: 'advertencia',
        titulo: 'Sin Registros por Cerrar',
        mensaje: 'No hay solicitudes liquidadas y revisadas disponibles para cerrar.',
      });
      return;
    }

    setProcesandoCierre(true);
    setMostrarModalConfirmacion(false);

    try {
      const idsRequerimientos = solicitudesValidas
        .map((req) => {
          if (typeof req.id === 'number') return req.id;
          if (typeof req.id === 'string' && /^\d+$/.test(req.id)) return parseInt(req.id, 10);
          if (typeof req.url === 'string') {
            const match = req.url.match(/\/(\d+)\/?$/);
            if (match) return parseInt(match[1], 10);
          }
          return null;
        })
        .filter((id) => Number.isInteger(id) && id > 0);

      if (idsRequerimientos.length === 0) {
        setNotificacion({
          tipo: 'advertencia',
          titulo: 'IDs Inválidos',
          mensaje: 'No se encontraron identificadores válidos para las solicitudes a cerrar.',
        });
        setProcesandoCierre(false);
        return;
      }

      const payloadCierre = {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        saldo_inicial: saldoInicialNum.toFixed(2),
        total_gasto: gastoTotalSemana.toFixed(2),
        saldo_final: saldoFinal.toFixed(2),
        nuevo_ingreso: nuevoIngresoSugerido.toFixed(2),
        observaciones: observaciones.trim() || `Cierre semanal del ${fechaInicio} al ${fechaFin}`,
        requerimientos: idsRequerimientos,
      };

      // 1. Ejecutar Cierre Atómico en /RC_SaldoSemanal/ según GUIA_FRONTEND.md
      let res = await fetchAuth(`${API_URL}/RC_SaldoSemanal/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadCierre),
      });

      if (!res.ok) {
        // Reintento alternativo con requerimientos en formato string separado por comas
        const payloadString = { ...payloadCierre, requerimientos: idsRequerimientos.join(',') };
        const resAlt = await fetchAuth(`${API_URL}/RC_SaldoSemanal/?format=json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadString),
        });
        if (resAlt.ok) {
          res = resAlt;
        } else if (res.status === 404 || res.status === 405 || resAlt.status === 404 || resAlt.status === 405) {
          const resFallback = await fetchAuth(`${API_URL}/RC_SaldoSemanal/cerrar-caja/?format=json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadCierre),
          });
          if (resFallback.ok) {
            res = resFallback;
          }
        }
      }

      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const dataCierre = await res.json();
      const codigoGenerado = dataCierre.codigo_cierre || `Cierre #${dataCierre.id}`;

      setNotificacion({
        tipo: 'exito',
        titulo: 'Cierre de Caja Exitoso',
        mensaje: `Se generó el registro de saldo semanal ${codigoGenerado} y se cerraron formalmente ${idsRequerimientos.length} solicitudes liquidadas y revisadas.`,
      });

      setObservaciones('');
      await cargarSolicitudesLiquidadas();
    } catch (err) {
      console.error('[CierreCaja] Error al ejecutar cierre semanal:', err);
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
            Consolidación de rendiciones liquidadas y revisadas, balance de caja y nuevo importe de reposición.
          </p>
        </div>

        <button
          onClick={cargarSolicitudesLiquidadas}
          disabled={cargando || procesandoCierre}
          className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-sm"
          title="Recargar liquidaciones y revisiones"
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
              <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider block">Liquidadas y Revisadas</span>
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

      {/* Buscador de Solicitudes Liquidadas y Revisadas */}
      <div className="bg-white px-3 py-2 rounded-2xl border border-gray-100 shadow-sm shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ID, personal solicitante o motivo de gasto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-brand-light/40 border border-gray-100 focus:border-brand-primary rounded-xl pl-9 pr-24 py-1.5 text-xs font-bold text-brand-dark outline-none transition-colors placeholder:text-gray-400 placeholder:font-normal"
          />
          {buscandoRemoto && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-brand-primary">
              <RefreshCw size={11} className="animate-spin" />
              <span className="hidden sm:inline">Consultando BD...</span>
            </div>
          )}
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

      {/* Contenedor Scrollable de Solicitudes Liquidadas y Revisadas */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 pb-2">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-9 h-9 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cargando rendiciones liquidadas y revisadas...
            </span>
          </div>
        ) : solicitudesFiltradas.length > 0 ? (
          <div className="space-y-1.5 sm:space-y-2">
            {solicitudesFiltradas.map((req) => {
              const totalGast = parseFloat(req.total_gastado || req.monto_solicitado || 0);
              const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
              const numComprobantes = (req.detalle || req.detalles || []).length;
              const tipoCajaInfo = obtenerTipoCaja(req);

              return (
                <div
                  key={req.id}
                  onClick={() => setSolicitudSeleccionada(req)}
                  className="p-2.5 sm:p-3 bg-white hover:bg-blue-50/30 rounded-xl sm:rounded-2xl border border-gray-100 hover:border-blue-200 flex items-center justify-between gap-2.5 sm:gap-4 transition-all cursor-pointer group shadow-xs"
                >
                  {/* Lado izquierdo: ID, Badge Tipo, Solicitante e info rápida */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <span className="text-xs font-black text-brand-dark bg-brand-light border border-gray-200/60 px-2 py-1 rounded-lg shrink-0">
                      #{req.id}
                    </span>

                    <span
                      className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border shrink-0 ${tipoCajaInfo.claseBadge}`}
                    >
                      {tipoCajaInfo.etiqueta}
                    </span>

                    <span className="text-[9px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      Revisado
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-brand-dark leading-tight truncate group-hover:text-brand-primary transition-colors">
                          {nombreSolicitante}
                        </h4>
                        <span className="hidden md:inline-block text-[10px] font-bold text-gray-400 shrink-0">
                          • {req.area_id || 'Área'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                        <span className="shrink-0">{req.fecha_solicitud ? req.fecha_solicitud.slice(0, 10) : '—'}</span>
                        <span className="shrink-0">• {numComprobantes} doc(s)</span>
                        {req.obs && (
                          <span className="italic truncate max-w-[140px] sm:max-w-xs md:max-w-md hidden sm:inline text-gray-500">
                            "{req.obs}"
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lado derecho: Monto y Botones compactos */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                        Gasto Total
                      </span>
                      <span className="text-xs sm:text-sm font-black text-brand-dark">
                        S/ {totalGast.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSolicitudSeleccionada(req);
                        }}
                        className="p-1.5 bg-gray-50 hover:bg-brand-light text-gray-600 hover:text-brand-primary rounded-lg transition-colors border border-gray-100"
                        title="Ver Comprobantes"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          manejarAnularSolicitud(req);
                        }}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-lg transition-colors border border-red-100"
                        title="Anular Solicitud"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
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
                ? 'No se encontraron rendiciones con los criterios de búsqueda especificados.'
                : 'No hay solicitudes liquidadas y revisadas pendientes de cierre semanal.'}
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================
          MODAL DE CONFIRMACIÓN DEL CIERRE DE CAJA
         ======================================================================== */}
      {mostrarModalConfirmacion && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setMostrarModalConfirmacion(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 p-6 space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Lock size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-brand-dark">Confirmar Cierre de Caja Semanal</h3>
              <p className="text-xs text-gray-400">
                Se actualizarán las <b>{solicitudesLiquidadas.length}</b> solicitudes liquidadas y revisadas al estado <b>Cerrado (CD)</b>.
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

            {/* Observaciones del Cierre */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Observaciones del Cierre (Opcional):
              </label>
              <input
                type="text"
                placeholder={`Cierre semanal del ${fechaInicio} al ${fechaFin}`}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full bg-brand-light/40 border border-gray-200 focus:border-brand-primary rounded-xl px-3 py-2 text-xs font-semibold text-brand-dark outline-none transition-colors placeholder:text-gray-400 placeholder:font-normal"
              />
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
        </div>,
        document.body
      )}

      {/* ========================================================================
          MODAL DETALLE DE COMPROBANTES / AUDITORÍA
         ======================================================================== */}
      {solicitudSeleccionada && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          onClick={() => setSolicitudSeleccionada(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                    Auditoría #{solicitudSeleccionada.id}
                  </span>
                  {(() => {
                    const tipoModal = obtenerTipoCaja(solicitudSeleccionada);
                    return (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoModal.claseBadge}`}>
                        {tipoModal.etiqueta}
                      </span>
                    );
                  })()}
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <CheckCircle2 size={11} className="text-emerald-600" />
                    Revisado
                  </span>
                </div>
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

              {(solicitudSeleccionada.detalle || solicitudSeleccionada.detalles || []).map((det, idx) => {
                const nombreGasto = typeof det.subgasto_id === 'object' && det.subgasto_id
                  ? det.subgasto_id.nombre
                  : (det.subgasto_nombre || 'Gasto');
                const tipoGasto = det.subgasto_id?.tipogasto_id?.nombre || det.tipogasto_nombre || null;
                const { ruta } = resolverRutaOEntidad(det, entidades);

                return (
                  <div key={det.url || det.id || idx} className="p-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {det.adj_cajachica ? (
                          <button
                            type="button"
                            onClick={() => setImagenModal(det.adj_cajachica)}
                            className="group/img relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 hover:opacity-90 transition-opacity bg-white"
                            title="Ver comprobante completo"
                          >
                            {esArchivoPdf(det.adj_cajachica) ? (
                              <div className="w-full h-full bg-red-50 text-red-600 flex flex-col items-center justify-center font-bold">
                                <FileText size={20} />
                                <span className="text-[8px] font-black uppercase tracking-wider mt-0.5">PDF</span>
                              </div>
                            ) : (
                              <img src={det.adj_cajachica} alt="Comprobante" className="w-full h-full object-cover" />
                            )}
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
                          
                          {/* Ruta de Origen y Destino (relevante para Taxi / Movilidad / Traslados) */}
                          {ruta && (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50/80 border border-blue-200/60 px-2 py-0.5 rounded-md mt-1 w-fit">
                              <MapPin size={12} className="text-blue-600 shrink-0" />
                              <span>{ruta}</span>
                            </div>
                          )}

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
                      {(() => {
                        const tipoDet = obtenerTipoCaja(det);
                        return (
                          <span className={`px-2 py-0.5 rounded-md font-black text-[9px] uppercase border ${tipoDet.claseBadge}`}>
                            {tipoDet.etiqueta} {tipoDet.nombreEmpresa !== 'Sin Factura' ? `• ${tipoDet.nombreEmpresa}` : ''}
                          </span>
                        );
                      })()}
                      {det.lima_provincia && (
                        <span className="px-2 py-0.5 bg-gray-50 rounded-md">
                          {det.lima_provincia === 'L' ? 'Lima' : 'Provincia'}
                        </span>
                      )}
                      {det.nro_factura && <span className="px-2 py-0.5 bg-gray-50 rounded-md">Doc: {det.nro_factura}</span>}
                      {det.nro_ruc && (
                        <span className="px-2 py-0.5 bg-gray-50 rounded-md">
                          RUC: {det.nro_ruc}{det.razon_social ? ` • ${det.razon_social}` : ''}
                        </span>
                      )}
                      {(det.placa_nombre || det.placa) && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md flex items-center gap-1 font-bold">
                          <Car size={11} />
                          {det.placa_nombre || det.placa}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
        </div>,
        document.body
      )}

      {/* ========================================================================
          VISOR UNIVERSAL DE COMPROBANTE (IMÁGENES Y PDFS)
         ======================================================================== */}
      {imagenModal && (
        <ModalVisorComprobante
          archivo={imagenModal}
          onClose={() => setImagenModal(null)}
          titulo="Comprobante de Gasto"
        />
      )}
    </div>
  );
};

export default CierreCaja;
