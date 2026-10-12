import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  Calendar,
  DollarSign,
  Search,
  RefreshCw,
  Printer,
  FileText,
  CheckCircle2,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Wallet,
  Building,
  User,
  Eye,
  Receipt,
  Download,
  X,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
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
 * Formatea fechas a formato legible DD/MM/YYYY.
 */
const formatearFechaCorta = (fechaStr) => {
  if (!fechaStr) return '—';
  const soloFecha = fechaStr.slice(0, 10);
  const partes = soloFecha.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return fechaStr;
};

// ============================================================================
// COMPONENTE PRINCIPAL: BALANCE SEMANAL
// ============================================================================

const BalanceSemanal = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();

  const [saldosSemanales, setSaldosSemanales] = useState([]);
  const [semanaSeleccionada, setSemanaSeleccionada] = useState(null);
  const [requerimientosSemana, setRequerimientosSemana] = useState([]);
  const [cargandoSemanas, setCargandoSemanas] = useState(true);
  const [cargandoRequerimientos, setCargandoRequerimientos] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  // Paginación y Scroll Infinito (top=10 según GUIA_FRONTEND.md)
  const [pagina, setPagina] = useState(1);
  const [haySiguiente, setHaySiguiente] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const centinelaRef = useRef(null);

  // Filtros y Búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [mesFiltro, setMesFiltro] = useState('TODOS');

  // Modales y Auditoría de Comprobantes
  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [cargandoDetalleSolicitud, setCargandoDetalleSolicitud] = useState(false);
  const [detallesCargadosManual, setDetallesCargadosManual] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);
  const [mostrarModalReporte, setMostrarModalReporte] = useState(false);

  // ============================================================================
  // CARGA DE SALDOS SEMANALES (INFINITE SCROLL CON TOP=10)
  // ============================================================================

  const cargarSaldosSemanales = async (mantenerSeleccion = false) => {
    setCargandoSemanas(true);
    setPagina(1);
    try {
      // Consultar endpoint oficial según GUIA_FRONTEND.md: /RC_SaldoSemanal/?format=json&page=1&top=10&ordering=-fecha_fin
      const res = await fetchAuth(`${API_URL}/RC_SaldoSemanal/?format=json&page=1&top=10&ordering=-fecha_fin`);
      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const data = await res.json();
      const lista = data.results ?? (Array.isArray(data) ? data : []);
      setSaldosSemanales(lista);
      setHaySiguiente(Boolean(data.next));
      if (lista.length > 0 && (!semanaSeleccionada || !mantenerSeleccion)) {
        setSemanaSeleccionada(lista[0]);
      }
      console.log(`[BalanceSemanal] ✅ Cargadas ${lista.length} semanas de balance.`);
    } catch (err) {
      console.error('[BalanceSemanal] ❌ Error al cargar saldos semanales:', err.message || err);
      setSaldosSemanales([]);
      setSemanaSeleccionada(null);
      setRequerimientosSemana([]);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Cargar Balance Semanal',
        mensaje: err.message || 'No se pudo obtener el historial de saldos semanales desde el servidor.',
      });
    } finally {
      setCargandoSemanas(false);
    }
  };

  const cargarMasSemanas = useCallback(async () => {
    if (cargandoMas || !haySiguiente) return;
    setCargandoMas(true);
    const siguientePagina = pagina + 1;
    try {
      const res = await fetchAuth(`${API_URL}/RC_SaldoSemanal/?format=json&page=${siguientePagina}&top=10&ordering=-fecha_fin`);
      if (!res.ok) {
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const data = await res.json();
      const nuevos = data.results ?? (Array.isArray(data) ? data : []);
      setSaldosSemanales((prev) => [...prev, ...nuevos]);
      setPagina(siguientePagina);
      setHaySiguiente(Boolean(data.next));
      console.log(`[BalanceSemanal] ✅ Cargadas ${nuevos.length} semanas adicionales (página ${siguientePagina}).`);
    } catch (err) {
      console.error(`[BalanceSemanal] ❌ Error al paginar saldos semanales (página ${siguientePagina}):`, err.message || err);
      setHaySiguiente(false);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error de Paginación',
        mensaje: err.message || 'No se pudieron cargar más registros semanales.',
      });
    } finally {
      setCargandoMas(false);
    }
  }, [cargandoMas, haySiguiente, pagina]);

  // Observer para Scroll Infinito en el panel de semanas
  useEffect(() => {
    if (!centinelaRef.current || !haySiguiente || cargandoSemanas) return;

    const observador = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && haySiguiente && !cargandoMas) {
          cargarMasSemanas();
        }
      },
      { threshold: 0.1 }
    );

    observador.observe(centinelaRef.current);
    return () => observador.disconnect();
  }, [haySiguiente, cargandoMas, cargandoSemanas, cargarMasSemanas]);

  useEffect(() => {
    cargarSaldosSemanales();
  }, []);

  // Cargar requerimientos de la semana cuando cambia la semana seleccionada
  useEffect(() => {
    if (!semanaSeleccionada) return;

    if (
      Array.isArray(semanaSeleccionada.requerimientos) &&
      semanaSeleccionada.requerimientos.length > 0 &&
      typeof semanaSeleccionada.requerimientos[0] === 'object'
    ) {
      setRequerimientosSemana(semanaSeleccionada.requerimientos);
    } else {
      const cargarRequerimientosDeSemana = async () => {
        setCargandoRequerimientos(true);
        try {
          let paramQuery = '';
          if (semanaSeleccionada.requerimientos) {
            const idsStr = Array.isArray(semanaSeleccionada.requerimientos)
              ? semanaSeleccionada.requerimientos.join(',')
              : String(semanaSeleccionada.requerimientos);
            paramQuery = `id__in=${idsStr}`;
          } else {
            paramQuery = `saldo_semanal_id=${semanaSeleccionada.id}`;
          }

          const res = await fetchAuth(
            `${API_URL}/Requerimiento_CajaChica/?format=json&${paramQuery}`
          );
          if (res.ok) {
            const data = await res.json();
            const lista = data.results ?? data;
            const ordenadas = Array.isArray(lista) ? lista : [];
            setRequerimientosSemana(ordenadas);
            console.log(`[BalanceSemanal] ✅ Cargados ${ordenadas.length} requerimientos para la semana ${semanaSeleccionada.codigo_cierre || semanaSeleccionada.id}.`);
          } else {
            // Reintento con filtro directo alternativo
            const resAlt = await fetchAuth(
              `${API_URL}/Requerimiento_CajaChica/?format=json&saldo_semanal_id=${semanaSeleccionada.id}`
            );
            if (resAlt.ok) {
              const dataAlt = await resAlt.json();
              const listaAlt = dataAlt.results ?? dataAlt;
              const ordenadasAlt = Array.isArray(listaAlt) ? listaAlt : [];
              setRequerimientosSemana(ordenadasAlt);
              console.log(`[BalanceSemanal] ✅ Cargados ${ordenadasAlt.length} requerimientos para la semana ${semanaSeleccionada.codigo_cierre || semanaSeleccionada.id}.`);
            } else {
              const errorDetallado = await extraerMensajeError(res);
              throw new Error(errorDetallado);
            }
          }
        } catch (err) {
          console.error(`[BalanceSemanal] ❌ Error al cargar requerimientos de la semana:`, err.message || err);
          setRequerimientosSemana([]);
          setNotificacion({
            tipo: 'error',
            titulo: 'Error al Cargar Requerimientos',
            mensaje: err.message || 'No se pudieron obtener los requerimientos asociados.',
          });
        } finally {
          setCargandoRequerimientos(false);
        }
      };
      cargarRequerimientosDeSemana();
    }
  }, [semanaSeleccionada]);

  // Asegurar carga de comprobantes si el requerimiento no traía el detalle anidado
  useEffect(() => {
    if (!solicitudDetalle) {
      setDetallesCargadosManual(null);
      return;
    }

    const itemsExistentes = solicitudDetalle.detalle || solicitudDetalle.detalles;
    if (Array.isArray(itemsExistentes) && itemsExistentes.length > 0) {
      setDetallesCargadosManual(itemsExistentes);
      console.log(`[BalanceSemanal] ✅ Mostrando ${itemsExistentes.length} comprobantes para Requerimiento #${solicitudDetalle.id}.`);
    } else {
      const cargarDetallesRemotos = async () => {
        setCargandoDetalleSolicitud(true);
        try {
          // 1. Probar requerimiento individual serializado
          const resReq = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${solicitudDetalle.id}/?format=json`);
          if (resReq.ok) {
            const dataReq = await resReq.json();
            const itemsReq = dataReq.detalle || dataReq.detalles;
            if (Array.isArray(itemsReq) && itemsReq.length > 0) {
              setDetallesCargadosManual(itemsReq);
              console.log(`[BalanceSemanal] ✅ Cargados ${itemsReq.length} comprobantes para Requerimiento #${solicitudDetalle.id}.`);
              return;
            }
          }

          // 2. Fallback complementario vía RC_Detalle
          const resDet = await fetchAuth(`${API_URL}/RC_Detalle/?requerimiento_id=${solicitudDetalle.id}&format=json`);
          if (resDet.ok) {
            const dataDet = await resDet.json();
            const listaDet = dataDet.results ?? (Array.isArray(dataDet) ? dataDet : []);
            setDetallesCargadosManual(listaDet);
            console.log(`[BalanceSemanal] ✅ Cargados ${listaDet.length} comprobantes desde RC_Detalle para Requerimiento #${solicitudDetalle.id}.`);
          } else {
            console.warn(`[BalanceSemanal] ⚠️ No se encontraron comprobantes para Requerimiento #${solicitudDetalle.id}`);
            setDetallesCargadosManual([]);
          }
        } catch (errDet) {
          console.error(`[BalanceSemanal] ❌ Error al cargar comprobantes de Requerimiento #${solicitudDetalle.id}:`, errDet.message || errDet);
          setDetallesCargadosManual([]);
        } finally {
          setCargandoDetalleSolicitud(false);
        }
      };
      cargarDetallesRemotos();
    }
  }, [solicitudDetalle]);

  // ============================================================================
  // FILTRADO DE SEMANAS Y REQUERIMIENTOS
  // ============================================================================

  const semanasFiltradas = useMemo(() => {
    return saldosSemanales.filter((sem) => {
      if (mesFiltro !== 'TODOS') {
        const mesSemana = sem.fecha_inicio.slice(5, 7);
        if (mesSemana !== mesFiltro) return false;
      }

      if (busqueda.trim() !== '') {
        const query = busqueda.toLowerCase().trim();
        const codigoTexto = (sem.codigo_cierre || '').toLowerCase();
        const tieneReq = (sem.requerimientos || []).some(
          (r) =>
            String(r.id || '').includes(query) ||
            obtenerNombreSolicitante(r.usuario_id).toLowerCase().includes(query)
        );
        return codigoTexto.includes(query) || tieneReq;
      }

      return true;
    });
  }, [saldosSemanales, mesFiltro, busqueda]);

  // Desglose por categorías de gasto de la semana activa
  const desgloseCategoriasSemana = useMemo(() => {
    if (!requerimientosSemana || requerimientosSemana.length === 0) return [];

    const mapaCategorias = {};
    let totalGeneral = 0;

    requerimientosSemana.forEach((req) => {
      const listaDet = req.detalle || req.detalles || [];
      listaDet.forEach((det) => {
        const nombreCat = det.subgasto_id?.tipogasto_id?.nombre || det.subgasto_id?.nombre || (typeof det.subgasto_id === 'string' ? det.subgasto_id : 'Otros Gastos');
        const costo = parseFloat(det.costo || 0);
        mapaCategorias[nombreCat] = (mapaCategorias[nombreCat] || 0) + costo;
        totalGeneral += costo;
      });
    });

    return Object.entries(mapaCategorias)
      .map(([nombre, monto]) => ({
        nombre,
        monto,
        porcentaje: totalGeneral > 0 ? (monto / totalGeneral) * 100 : 0,
      }))
      .sort((a, b) => b.monto - a.monto);
  }, [requerimientosSemana]);

  // ============================================================================
  // IMPRESIÓN DEL REPORTE EN PDF
  // ============================================================================

  const manejarImprimirReporte = () => {
    window.print();
  };

  // ============================================================================
  // RENDERIZADO
  // ============================================================================

  const saldoInicialVal = parseFloat(semanaSeleccionada?.saldo_inicial || 4000);
  const totalGastoVal = parseFloat(semanaSeleccionada?.total_gasto || 0);
  const saldoFinalVal = parseFloat(semanaSeleccionada?.saldo_final || (saldoInicialVal - totalGastoVal));
  const nuevoIngresoVal = parseFloat(semanaSeleccionada?.nuevo_ingreso || totalGastoVal);
  const porcentajeConsumo = saldoInicialVal > 0 ? (totalGastoVal / saldoInicialVal) * 100 : 0;

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
          <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">Balance Histórico Semanal</h1>
          <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
            Control cronológico de cierres de caja, arqueo de fondos y emisión de reportes oficiales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarSaldosSemanales}
            disabled={cargandoSemanas}
            className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-sm"
            title="Recargar balances"
          >
            <RefreshCw size={15} className={cargandoSemanas ? 'animate-spin text-brand-primary' : ''} />
          </button>

          {semanaSeleccionada && (
            <button
              onClick={() => setMostrarModalReporte(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Printer size={15} />
              <span>Reporte Semanal PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl border border-gray-100 shadow-sm shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por código de cierre o ID..."
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

        {/* Filtro por Mes */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0 hidden sm:inline">
            Mes:
          </span>
          {[
            { clave: 'TODOS', etiqueta: 'Todos' },
            { clave: '10', etiqueta: 'Oct' },
            { clave: '09', etiqueta: 'Set' },
            { clave: '08', etiqueta: 'Ago' },
            { clave: '07', etiqueta: 'Jul' },
            { clave: '06', etiqueta: 'Jun' },
          ].map((m) => (
            <button
              key={m.clave}
              onClick={() => setMesFiltro(m.clave)}
              className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                mesFiltro === m.clave
                  ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/20'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Contenedor Principal: Split Panel Desktop / Master-Detail Móvil */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden pb-2">
        {/* Panel Izquierdo: Lista de Semanas Cerradas (4 Columnas en LG) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col min-h-0 overflow-hidden">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary block mb-2 shrink-0">
            Semanas de Cierre ({semanasFiltradas.length})
          </span>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {cargandoSemanas ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <div className="w-8 h-8 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-gray-400 uppercase">Cargando semanas...</span>
              </div>
            ) : semanasFiltradas.length > 0 ? (
              semanasFiltradas.map((sem) => {
                const seleccionada = semanaSeleccionada?.id === sem.id;
                const gasto = parseFloat(sem.total_gasto || 0);
                const saldoIni = parseFloat(sem.saldo_inicial || 4000);
                const pct = saldoIni > 0 ? (gasto / saldoIni) * 100 : 0;

                return (
                  <div
                    key={sem.id}
                    onClick={() => setSemanaSeleccionada(sem)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col gap-2 ${
                      seleccionada
                        ? 'bg-brand-primary text-white border-brand-primary shadow-md shadow-brand-primary/20 scale-[1.01]'
                        : 'bg-white hover:bg-gray-50 border-gray-100 text-brand-dark'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded-lg ${
                          seleccionada ? 'bg-white/20 text-white' : 'bg-brand-light text-brand-dark'
                        }`}
                      >
                        {sem.codigo_cierre || `Cierre #${sem.id}`}
                      </span>

                      <span className={`text-xs font-black ${seleccionada ? 'text-white' : 'text-brand-primary'}`}>
                        S/ {gasto.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] opacity-80 font-medium">
                      <Calendar size={12} />
                      <span>
                        {formatearFechaCorta(sem.fecha_inicio)} al {formatearFechaCorta(sem.fecha_fin)}
                      </span>
                    </div>

                    {/* Barra de Consumo de Presupuesto */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold opacity-70 uppercase">
                        <span>Consumo de Caja</span>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            seleccionada ? 'bg-white' : pct > 80 ? 'bg-red-500' : 'bg-brand-primary'
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 text-gray-400 text-xs">
                No hay semanas cerradas registradas.
              </div>
            )}

            {/* Centinela para Infinite Scroll */}
            <div ref={centinelaRef} className="py-2 text-center">
              {cargandoMas && (
                <div className="flex items-center justify-center gap-1.5 py-1 text-[10px] text-brand-primary font-bold">
                  <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                  <span>Cargando semanas anteriores...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel Derecho: Detalle de Balance y Requerimientos de la Semana (8 Columnas en LG) */}
        <div className="lg:col-span-8 flex flex-col space-y-2.5 min-h-0 overflow-hidden">
          {semanaSeleccionada ? (
            <>
              {/* Tarjeta de Resumen Financiero KPI */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                      {semanaSeleccionada.codigo_cierre || `Semana #${semanaSeleccionada.id}`}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-brand-dark">
                      Balance del {formatearFechaCorta(semanaSeleccionada.fecha_inicio)} al{' '}
                      {formatearFechaCorta(semanaSeleccionada.fecha_fin)}
                    </h3>
                  </div>

                  <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck size={13} />
                    Cerrado
                  </span>
                </div>

                {/* Grid de 4 Indicadores Financieros */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-brand-light/50 p-2.5 rounded-xl border border-brand-primary/10">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Saldo Inicial</span>
                    <span className="text-xs sm:text-sm font-black text-brand-dark">
                      S/ {saldoInicialVal.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-red-50/70 p-2.5 rounded-xl border border-red-200/60">
                    <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider block">Total Gastado</span>
                    <span className="text-xs sm:text-sm font-black text-red-600">
                      S/ {totalGastoVal.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/60">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Saldo Final</span>
                    <span className="text-xs sm:text-sm font-black text-emerald-700">
                      S/ {saldoFinalVal.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-blue-50/70 p-2.5 rounded-xl border border-blue-200/60">
                    <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider block">Reposición Solicitada</span>
                    <span className="text-xs sm:text-sm font-black text-blue-700">
                      S/ {nuevoIngresoVal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Desglose rápido por Categorías de Gasto */}
                {desgloseCategoriasSemana.length > 0 && (
                  <div className="pt-2 border-t border-gray-50">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                      Distribución por Categorías:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {desgloseCategoriasSemana.map((cat, idx) => (
                        <div
                          key={idx}
                          className="bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[10px]"
                        >
                          <span className="font-bold text-brand-dark">{cat.nombre}:</span>
                          <span className="font-black text-brand-primary">S/ {cat.monto.toFixed(2)}</span>
                          <span className="text-gray-400 font-semibold">({cat.porcentaje.toFixed(0)}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Lista Scrollable de Requerimientos de la Semana */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                    Requerimientos Cerrados ({requerimientosSemana.length})
                  </span>
                  <span className="text-[11px] text-gray-400 font-medium">
                    Total: S/ {totalGastoVal.toFixed(2)}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {cargandoRequerimientos ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : requerimientosSemana.length > 0 ? (
                    requerimientosSemana.map((req) => {
                      const totalGast = parseFloat(req.total_gastado || req.monto_solicitado || 0);
                      const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
                      const listaDet = req.detalle || req.detalles || [];
                      const numComprobantes = listaDet.length;

                      return (
                        <div
                          key={req.id}
                          className="p-3 bg-gray-50/70 hover:bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between gap-3 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-brand-dark bg-white border border-gray-200 px-2 py-1 rounded-lg">
                              #{req.id}
                            </span>
                            <div>
                              <h4 className="text-xs font-black text-brand-dark leading-tight">{nombreSolicitante}</h4>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                <span>{req.fecha_solicitud ? req.fecha_solicitud.slice(0, 10) : ''}</span>
                                <span>• {numComprobantes} comprobante(s)</span>
                                {req.obs && <span className="italic line-clamp-1">"{req.obs}"</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-black text-brand-dark">
                              S/ {totalGast.toFixed(2)}
                            </span>

                            <button
                              type="button"
                              onClick={() => setSolicitudDetalle(req)}
                              className="p-1.5 bg-white border border-gray-200 hover:border-brand-primary text-gray-600 hover:text-brand-primary rounded-lg transition-colors"
                              title="Ver detalle y fotos"
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-xs text-gray-400">
                      No hay requerimientos vinculados a esta semana.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl p-12 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2 h-full">
              <PieChart size={32} className="text-gray-300" />
              <h3 className="text-sm font-black text-brand-dark">Seleccione una Semana</h3>
              <p className="text-xs text-gray-400">
                Haga clic en una semana de la lista para visualizar su balance y detalle.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================
          MODAL DE REPORTE OFICIAL EN PDF (VISTA PREVIA E IMPRESIÓN OFICIAL)
         ======================================================================== */}
      {mostrarModalReporte && semanaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-gray-100 flex flex-col max-h-[96vh] overflow-hidden animate-scale-up">
            {/* Cabecera del Modal de Reporte */}
            <div className="px-5 py-3.5 bg-brand-dark text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-brand-accent" />
                <h3 className="text-sm font-black tracking-wide">
                  Reporte Semanal de Caja Chica — {semanaSeleccionada.codigo_cierre}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={manejarImprimirReporte}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-secondary text-white text-xs font-black shadow-md transition-all"
                >
                  <Printer size={14} />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarModalReporte(false)}
                  className="p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Hoja Imprimible Oficial (Estilo A4 Corporativo) */}
            <div className="p-6 sm:p-8 overflow-y-auto bg-white font-sans text-brand-dark print:p-0 space-y-6" id="hoja-reporte-imprimible">
              {/* Encabezado Corporativo Surgicorp */}
              <div className="flex items-start justify-between border-b-2 border-brand-dark pb-4">
                <div>
                  <h2 className="text-xl font-black text-brand-dark tracking-tighter">
                    SURGICORP <span className="text-brand-primary">PERÚ</span>
                  </h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                    Surgery for Life • Control de Gastos de Caja Chica
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black bg-brand-light px-2.5 py-1 rounded-lg border border-brand-primary/20 inline-block mb-1">
                    {semanaSeleccionada.codigo_cierre}
                  </span>
                  <p className="text-[11px] text-gray-500 font-medium">
                    Período: {formatearFechaCorta(semanaSeleccionada.fecha_inicio)} al {formatearFechaCorta(semanaSeleccionada.fecha_fin)}
                  </p>
                </div>
              </div>

              {/* Cuadro de Arqueo y Saldos */}
              <div className="grid grid-cols-4 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs">
                <div>
                  <span className="text-[9px] font-bold text-gray-500 uppercase block">Saldo Inicial</span>
                  <span className="text-sm font-black text-brand-dark">S/ {saldoInicialVal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-red-600 uppercase block">Total Gastado</span>
                  <span className="text-sm font-black text-red-600">S/ {totalGastoVal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-emerald-700 uppercase block">Saldo Final</span>
                  <span className="text-sm font-black text-emerald-700">S/ {saldoFinalVal.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-blue-700 uppercase block">Reposición</span>
                  <span className="text-sm font-black text-blue-700">S/ {nuevoIngresoVal.toFixed(2)}</span>
                </div>
              </div>

              {/* Tabla de Rendiciones de la Semana */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-dark">
                  Detalle de Solicitudes y Comprobantes
                </h4>

                <table className="w-full text-left text-xs border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold">
                      <th className="p-2 border border-gray-200">ID</th>
                      <th className="p-2 border border-gray-200">Solicitante</th>
                      <th className="p-2 border border-gray-200">Fecha</th>
                      <th className="p-2 border border-gray-200">Conceptos / Comprobantes</th>
                      <th className="p-2 border border-gray-200 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requerimientosSemana.map((r) => (
                      <tr key={r.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="p-2 font-black border border-gray-200">#{r.id}</td>
                        <td className="p-2 font-semibold border border-gray-200">{obtenerNombreSolicitante(r.usuario_id)}</td>
                        <td className="p-2 text-gray-500 border border-gray-200">{formatearFechaCorta(r.fecha_solicitud)}</td>
                        <td className="p-2 border border-gray-200 text-[11px]">
                          {(r.detalle || r.detalles || []).map((d, i) => (
                            <div key={i} className="text-gray-600">
                              • {d.subgasto_id?.nombre || (typeof d.subgasto_id === 'string' ? d.subgasto_id : 'Gasto')} {d.nro_factura ? `(Doc: ${d.nro_factura})` : ''} - S/ {parseFloat(d.costo || 0).toFixed(2)}
                            </div>
                          ))}
                        </td>
                        <td className="p-2 font-black text-right border border-gray-200">
                          S/ {parseFloat(r.total_gastado || r.monto_solicitado || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-black text-xs">
                      <td colSpan={4} className="p-2 text-right uppercase border border-gray-200">Total Liquidado en Semana:</td>
                      <td className="p-2 text-right text-brand-primary border border-gray-200 text-sm">
                        S/ {totalGastoVal.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Bloque de Firmas de Aprobación */}
              <div className="grid grid-cols-3 gap-8 pt-12 text-center text-xs">
                <div className="border-t border-gray-400 pt-2">
                  <span className="font-bold block">Responsable de Caja Chica</span>
                  <span className="text-[10px] text-gray-400">Emisión y Arqueo</span>
                </div>
                <div className="border-t border-gray-400 pt-2">
                  <span className="font-bold block">Gerencia de Operaciones</span>
                  <span className="text-[10px] text-gray-400">Visto Bueno y Cierre</span>
                </div>
                <div className="border-t border-gray-400 pt-2">
                  <span className="font-bold block">Contabilidad / Finanzas</span>
                  <span className="text-[10px] text-gray-400">Reposición de Fondo</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL DETALLE DE COMPROBANTES DE LA SOLICITUD
         ======================================================================== */}
      {solicitudDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                  Requerimiento #{solicitudDetalle.id}
                </span>
                <h3 className="text-sm font-black text-brand-dark">Comprobantes Adjuntos</h3>
              </div>
              <button
                type="button"
                onClick={() => setSolicitudDetalle(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-brand-light/50 p-3 rounded-xl">
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold">Solicitante:</span>
                  <span className="font-bold text-brand-dark">{obtenerNombreSolicitante(solicitudDetalle.usuario_id)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block font-bold">Total Gastado:</span>
                  <span className="font-black text-brand-primary">S/ {parseFloat(solicitudDetalle.total_gastado || 0).toFixed(2)}</span>
                </div>
              </div>

              {cargandoDetalleSolicitud ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] text-gray-400 font-bold">Cargando comprobantes...</span>
                </div>
              ) : (() => {
                const listaDetalles = detallesCargadosManual || solicitudDetalle.detalle || solicitudDetalle.detalles || [];
                return listaDetalles.length > 0 ? (
                  listaDetalles.map((det, idx) => {
                    const nombreSubgasto = det.subgasto_id?.nombre || (typeof det.subgasto_id === 'string' ? det.subgasto_id : 'Gasto');
                    const costoVal = parseFloat(det.costo || 0);
                    const rutaOrigenDestino = det.origen_nombre && det.destino_nombre
                      ? `${det.origen_nombre} → ${det.destino_nombre}`
                      : (det.origen_nombre || det.destino_nombre || '');
                    const docTexto = det.nro_factura ? `Doc: ${det.nro_factura}` : (det.nro_ruc ? `RUC: ${det.nro_ruc}` : '');

                    return (
                      <div key={det.id || det.url || idx} className="p-3 bg-white rounded-xl border border-gray-100 flex items-center justify-between gap-3 shadow-xs hover:border-gray-200 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {det.adj_cajachica ? (
                            <button
                              type="button"
                              onClick={() => setImagenModal(det.adj_cajachica)}
                              className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 shrink-0 hover:opacity-85 transition-opacity"
                              title="Ver foto del comprobante"
                            >
                              <img src={det.adj_cajachica} alt="Comprobante" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                              <Receipt size={18} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-black text-brand-dark leading-tight">{nombreSubgasto}</h4>
                              {det.lima_provincia && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-500">
                                  {det.lima_provincia === 'L' ? 'Lima' : 'Provincia'}
                                </span>
                              )}
                            </div>
                            {rutaOrigenDestino && (
                              <p className="text-[11px] text-brand-primary font-semibold mt-0.5 truncate">{rutaOrigenDestino}</p>
                            )}
                            {det.detalle && (
                              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{det.detalle}</p>
                            )}
                            {docTexto && (
                              <span className="text-[10px] text-gray-400 font-medium block mt-0.5">{docTexto}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-black text-brand-dark shrink-0">S/ {costoVal.toFixed(2)}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    No se encontraron comprobantes o detalles registrados para este requerimiento.
                  </div>
                );
              })()}
            </div>

            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSolicitudDetalle(null)}
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
              alt="Comprobante en alta resolución"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Notificación flotante Toast */}
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

export default BalanceSemanal;
