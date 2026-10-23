import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  Calendar,
  DollarSign,
  Search,
  RefreshCw,
  Printer,
  FileText,
  FileSpreadsheet,
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
import { obtenerTipoCaja, resolverClaveTipoIndividual } from '../utils/tipoCaja';
import { esArchivoPdf } from '../utils/archivoUtil';
import ModalVisorComprobante from '../components/ModalVisorComprobante';
import Toast from '../components/Toast';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const LOGO_PATH = (import.meta.env.VITE_SURGI_LOGO || '').replace(/^\//, '');
const LOGO_URL = API_URL ? `${API_URL}/${LOGO_PATH}` : `/${LOGO_PATH}`;

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
  const [buscandoRemoto, setBuscandoRemoto] = useState(false);

  // Modales y Auditoría de Comprobantes
  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [cargandoDetalleSolicitud, setCargandoDetalleSolicitud] = useState(false);
  const [detallesCargadosManual, setDetallesCargadosManual] = useState(null);
  const [imagenModal, setImagenModal] = useState(null);
  const [mostrarModalReporte, setMostrarModalReporte] = useState(false);
  const [mostrarPopupRequerimientos, setMostrarPopupRequerimientos] = useState(false);

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
        const querySinHash = query.replace(/^#/, '');
        const idTexto = String(sem.id || '').toLowerCase();
        const codigoTexto = (sem.codigo_cierre || '').toLowerCase();
        const tieneReq = (sem.requerimientos || []).some((r) => {
          const idReq = typeof r === 'object' ? String(r.id || '') : String(r);
          const nombreSol = typeof r === 'object' ? obtenerNombreSolicitante(r.usuario_id).toLowerCase() : '';
          return idReq === querySinHash || idReq.includes(querySinHash) || nombreSol.includes(query);
        });
        return idTexto === querySinHash || idTexto.includes(querySinHash) || codigoTexto.includes(query) || tieneReq;
      }

      return true;
    });
  }, [saldosSemanales, mesFiltro, busqueda]);

  // Búsqueda Inteligente: En memoria primero; si no hay coincidencias o se busca por ID no cargado, consultar BD
  useEffect(() => {
    const termino = busqueda.trim();
    if (!termino) {
      setBuscandoRemoto(false);
      return;
    }

    const idLimpio = termino.replace(/^#/, '').trim();
    const esIdNumerico = /^\d+$/.test(idLimpio);
    const idEncontradoEnMemoria = esIdNumerico && saldosSemanales.some((s) => String(s.id) === idLimpio);

    // Si ya existe en memoria el ID o la búsqueda de texto ya tiene resultados locales, evitar consultar a la BD
    if (idEncontradoEnMemoria) return;
    if (!esIdNumerico && semanasFiltradas.length > 0) return;

    const temporizador = setTimeout(async () => {
      setBuscandoRemoto(true);
      try {
        if (esIdNumerico) {
          // 1. Probar si es ID directo de un Saldo Semanal
          const resSemana = await fetchAuth(`${API_URL}/RC_SaldoSemanal/${idLimpio}/?format=json`);
          if (resSemana.ok) {
            const semana = await resSemana.json();
            setSaldosSemanales((prev) => {
              const existe = prev.some((s) => s.id === semana.id);
              return existe ? prev : [semana, ...prev];
            });
            setSemanaSeleccionada(semana);
            return;
          }

          // 2. Si no es saldo semanal, comprobar si es ID de un requerimiento y traer su semana
          const resReq = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${idLimpio}/?format=json`);
          if (resReq.ok) {
            const req = await resReq.json();
            const semanaId = req.saldo_semanal_id || (typeof req.saldo_semanal === 'object' ? req.saldo_semanal?.id : req.saldo_semanal);
            if (semanaId) {
              const resSem = await fetchAuth(`${API_URL}/RC_SaldoSemanal/${semanaId}/?format=json`);
              if (resSem.ok) {
                const semanaEncontrada = await resSem.json();
                setSaldosSemanales((prev) => {
                  const existe = prev.some((s) => s.id === semanaEncontrada.id);
                  return existe ? prev : [semanaEncontrada, ...prev];
                });
                setSemanaSeleccionada(semanaEncontrada);
              }
            }
          }
        } else {
          // Búsqueda general en BD por texto o código de cierre
          const params = new URLSearchParams({
            format: 'json',
            search: termino,
          });
          const res = await fetchAuth(`${API_URL}/RC_SaldoSemanal/?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            const lista = data.results ?? (Array.isArray(data) ? data : []);
            if (lista.length > 0) {
              setSaldosSemanales((prev) => {
                const idsExistentes = new Set(prev.map((s) => s.id));
                const nuevos = lista.filter((s) => !idsExistentes.has(s.id));
                return nuevos.length > 0 ? [...prev, ...nuevos] : prev;
              });
              setSemanaSeleccionada(lista[0]);
            }
          }
        }
      } catch (err) {
        console.warn('[BalanceSemanal] Búsqueda remota sin resultados:', err.message);
      } finally {
        setBuscandoRemoto(false);
      }
    }, 400);

    return () => clearTimeout(temporizador);
  }, [busqueda, saldosSemanales.length, semanasFiltradas.length]);

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

  // Desglose multi-tabla por solicitante para el reporte
  const reportePorSolicitante = useMemo(() => {
    if (!requerimientosSemana || requerimientosSemana.length === 0) return [];

    const grupos = {};

    requerimientosSemana.forEach((req) => {
      const idUsuario = typeof req.usuario_id === 'object' ? req.usuario_id?.id : req.usuario_id;
      const nombreUsuario = obtenerNombreSolicitante(req.usuario_id);
      const clave = String(idUsuario || nombreUsuario);

      if (!grupos[clave]) {
        grupos[clave] = {
          idUsuario,
          nombre: nombreUsuario,
          cantidadSolicitudes: 0,
          totalLiquidado: 0,
          totalGastado: 0,
          gastos: [],
        };
      }

      grupos[clave].cantidadSolicitudes += 1;
      const gastadoReq = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      grupos[clave].totalGastado += gastadoReq;
      grupos[clave].totalLiquidado += gastadoReq;

      const listaDet = req.detalle || req.detalles || [];
      if (listaDet.length > 0) {
        listaDet.forEach((det) => {
          const tipoCajaDet = resolverClaveTipoIndividual(det);
          grupos[clave].gastos.push({
            reqId: req.id,
            fecha: req.fecha_solicitud,
            tipoCaja: tipoCajaDet,
            subgasto: det.subgasto_id?.nombre || (typeof det.subgasto_id === 'string' ? det.subgasto_id : 'Gasto general'),
            categoria: det.subgasto_id?.tipogasto_id?.nombre || '',
            nroFactura: det.nro_factura || det.detalle || 'Comprobante',
            nroRuc: det.nro_ruc || '—',
            costo: parseFloat(det.costo || 0),
          });
        });
      } else {
        grupos[clave].gastos.push({
          reqId: req.id,
          fecha: req.fecha_solicitud,
          tipoCaja: obtenerTipoCaja(req).etiqueta.replace('TIPO: ', ''),
          subgasto: req.obs || 'Rendición de gastos',
          categoria: 'General',
          nroFactura: `Req #${req.id}`,
          nroRuc: '—',
          costo: gastadoReq,
        });
      }
    });

    return Object.values(grupos).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [requerimientosSemana]);

  // ============================================================================
  // EXPORTACIÓN E IMPRESIÓN AISLADA DEL DOCUMENTO
  // ============================================================================

  // Imprime exclusivamente la hoja de reporte dentro de un iframe aislado
  const manejarImprimirSoloDocumento = () => {
    const contenedor = document.getElementById('hoja-reporte-imprimible');
    if (!contenedor) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Reporte_Semanal_${semanaSeleccionada?.codigo_cierre || 'CajaChica'}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 8mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              background: #fff;
              font-size: 11px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 4px 6px;
            }
            th {
              background-color: #f1f5f9;
              font-weight: 700;
            }
            .seccion-solicitante {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 14px;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              overflow: hidden;
            }
            .cabecera-solicitante {
              background-color: #f8fafc;
              padding: 6px 8px;
              font-weight: bold;
              display: flex;
              justify-content: space-between;
              border-bottom: 1px solid #cbd5e1;
            }
          </style>
        </head>
        <body>
          ${contenedor.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 450);
  };

  // Guardar PDF utilizando la ventana de impresión A4 con título asignado
  const manejarGuardarPDF = () => {
    manejarImprimirSoloDocumento();
  };

  // Exportar el desglose semanal en formato Excel CSV compatible
  const manejarDescargarExcel = () => {
    if (!semanaSeleccionada) return;

    const filas = [];
    filas.push(['REPORTE SEMANAL DE CAJA CHICA']);
    filas.push(['Código de Cierre:', semanaSeleccionada.codigo_cierre]);
    filas.push(['Período:', `${formatearFechaCorta(semanaSeleccionada.fecha_inicio)} al ${formatearFechaCorta(semanaSeleccionada.fecha_fin)}`]);
    filas.push(['Saldo Inicial (S/):', saldoInicialVal.toFixed(2)]);
    filas.push(['Total Gastado (S/):', totalGastoVal.toFixed(2)]);
    filas.push(['Saldo Final (S/):', saldoFinalVal.toFixed(2)]);
    filas.push(['Reposición de Fondo (S/):', nuevoIngresoVal.toFixed(2)]);
    filas.push([]);

    reportePorSolicitante.forEach((sol) => {
      filas.push([`SOLICITANTE: ${sol.nombre}`]);
      filas.push([
        `Total Liquidado: S/ ${sol.totalLiquidado.toFixed(2)}`,
        `Total Gastado: S/ ${sol.totalGastado.toFixed(2)}`,
        `Cant. Solicitudes: ${sol.cantidadSolicitudes}`
      ]);
      filas.push(['# Req', 'Fecha', 'Tipo Caja', 'Categoría', 'Concepto / Subgasto', 'N° Factura / Doc', 'RUC', 'Importe S/']);
      sol.gastos.forEach((g) => {
        filas.push([
          `#${g.reqId}`,
          g.fecha || '',
          `Tipo ${g.tipoCaja}`,
          g.categoria || '',
          g.subgasto || '',
          g.nroFactura || '',
          g.nroRuc || '',
          g.costo.toFixed(2)
        ]);
      });
      filas.push(['', '', '', '', '', '', 'TOTAL SOLICITANTE:', sol.totalGastado.toFixed(2)]);
      filas.push([]);
    });

    filas.push(['TOTAL GENERAL SEMANA (S/):', '', '', '', '', '', '', totalGastoVal.toFixed(2)]);

    const csvContenido = filas
      .map((fila) =>
        fila
          .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
          .join(';')
      )
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Semanal_${semanaSeleccionada.codigo_cierre || 'Cierre'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
              className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              title="Reporte Semanal"
            >
              <Printer className="w-5 h-5 sm:w-4 sm:h-4 shrink-0" />
              <span className="tracking-wide">Reporte Semanal</span>
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSemanaSeleccionada(sem);
                          setMostrarPopupRequerimientos(true);
                        }}
                        className={`text-xs font-black px-2 py-0.5 rounded-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-1 group/cod ${
                          seleccionada ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brand-light text-brand-dark hover:bg-brand-primary/10 hover:text-brand-primary'
                        }`}
                        title="Ver requerimientos de este cierre"
                      >
                        <span>{sem.codigo_cierre || `Cierre #${sem.id}`}</span>
                        <Eye size={12} className="opacity-70 group-hover/cod:opacity-100" />
                      </button>

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
                    <button
                      type="button"
                      onClick={() => setMostrarPopupRequerimientos(true)}
                      className="text-[10px] font-black uppercase tracking-widest text-brand-primary hover:underline flex items-center gap-1 group"
                      title="Ver lista de requerimientos en popup"
                    >
                      <span>{semanaSeleccionada.codigo_cierre || `Semana #${semanaSeleccionada.id}`}</span>
                      <Eye size={11} className="opacity-60 group-hover:opacity-100" />
                    </button>
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

                {/* Botón exclusivo móvil para ver los requerimientos cerrados */}
                <div className="lg:hidden pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setMostrarPopupRequerimientos(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-brand-light hover:bg-brand-primary/10 text-brand-dark rounded-xl border border-brand-primary/20 text-xs font-black transition-all shadow-xs"
                  >
                    <Eye size={14} className="text-brand-primary" />
                    <span>Ver {requerimientosSemana.length} Requerimientos Cerrados ({semanaSeleccionada.codigo_cierre})</span>
                  </button>
                </div>
              </div>

              {/* Lista Scrollable de Requerimientos de la Semana (Oculta en celular, visible en escritorio) */}
              <div className="hidden lg:flex bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex-col flex-1 min-h-0 overflow-hidden">
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
                      const tipoCajaInfo = obtenerTipoCaja(req);

                      return (
                        <div
                          key={req.id}
                          className="p-3 bg-gray-50/70 hover:bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between gap-3 transition-all"
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <span className="text-xs font-black text-brand-dark bg-white border border-gray-200 px-2 py-1 rounded-lg shrink-0">
                              #{req.id}
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border shrink-0 ${tipoCajaInfo.claseBadge}`}>
                              {tipoCajaInfo.etiqueta}
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
      {mostrarModalReporte && semanaSeleccionada && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
          onClick={() => setMostrarModalReporte(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-gray-100 flex flex-col max-h-[96vh] overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal de Reporte */}
            <div className="px-5 py-3.5 bg-brand-dark text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-brand-accent" />
                <h3 className="text-sm font-black tracking-wide">
                  Reporte Semanal — {semanaSeleccionada.codigo_cierre}
                </h3>
              </div>

              {/* Botones de Acción Solicitados */}
              <div className="flex items-center gap-2">
                {/* Botón 1: Imprimir Documento Aislado */}
                <button
                  type="button"
                  onClick={manejarImprimirSoloDocumento}
                  title="Imprimir solo el documento"
                  className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-brand-primary hover:bg-brand-secondary text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5"
                >
                  <Printer size={16} />
                  <span className="hidden sm:inline">Imprimir</span>
                </button>

                {/* Botón 2: Guardar PDF */}
                <button
                  type="button"
                  onClick={manejarGuardarPDF}
                  title="Guardar como archivo PDF"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md transition-all"
                >
                  <Download size={14} />
                  <span>Guardar PDF</span>
                </button>

                {/* Botón 3: Descargar en Excel */}
                <button
                  type="button"
                  onClick={manejarDescargarExcel}
                  title="Descargar datos en formato Excel (.csv)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all"
                >
                  <FileSpreadsheet size={14} />
                  <span>Descargar en Excel</span>
                </button>

                {/* Cerrar Modal */}
                <button
                  type="button"
                  onClick={() => setMostrarModalReporte(false)}
                  className="p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors ml-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Hoja Imprimible Oficial (Estilo A4 Corporativo) */}
            <div className="p-6 sm:p-8 overflow-y-auto bg-white font-sans text-brand-dark print:p-0 space-y-6" id="hoja-reporte-imprimible">
              {/* Encabezado Corporativo Surgicorp con Logo Original */}
              <div className="flex items-start justify-between border-b-2 border-brand-dark pb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={LOGO_URL}
                    alt="Surgicorp Logo"
                    className="h-12 w-auto object-contain"
                  />
                  <div className="border-l border-gray-300 pl-3">
                    <h2 className="text-xl font-black text-brand-dark tracking-tighter uppercase leading-none">
                      CAJA <span className="text-brand-primary">CHICA</span>
                    </h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                      Control de Gastos de Caja Chica
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black bg-brand-light px-2.5 py-1 rounded-lg border border-brand-primary/20 inline-block mb-1 font-mono">
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

              {/* Multi-Tablas de Rendición por cada Solicitante (Formato A4 sin cortes) */}
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-gray-200 pb-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-brand-dark">
                    Liquidaciones por Solicitante ({reportePorSolicitante.length})
                  </h3>
                  <span className="text-[11px] text-gray-500 font-medium">
                    Formato A4 • Sin cortes por solicitante
                  </span>
                </div>

                {reportePorSolicitante.map((sol) => (
                  <div
                    key={sol.nombre}
                    className="seccion-solicitante border border-gray-300 rounded-xl overflow-hidden bg-white shadow-sm"
                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                  >
                    {/* Encabezado del Solicitante */}
                    <div className="cabecera-solicitante bg-slate-100/90 px-4 py-2.5 border-b border-gray-300 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                          Solicitante:
                        </span>
                        <span className="text-xs font-black text-brand-dark">
                          {sol.nombre}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                          {sol.cantidadSolicitudes} {sol.cantidadSolicitudes === 1 ? 'solicitud' : 'solicitudes'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-bold">
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase font-semibold mr-1">Total Liquidado:</span>
                          <span className="text-slate-700">S/ {sol.totalLiquidado.toFixed(2)}</span>
                        </div>
                        <div className="border-l border-gray-300 pl-3">
                          <span className="text-[10px] text-gray-500 uppercase font-semibold mr-1">Total Gastado:</span>
                          <span className="text-red-600 font-black">S/ {sol.totalGastado.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Tabla de comprobantes del solicitante */}
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-black text-[10px] uppercase border-b border-gray-200">
                          <th className="p-2 border-r border-gray-200 w-16 text-center"># Req</th>
                          <th className="p-2 border-r border-gray-200 w-24">Fecha</th>
                          <th className="p-2 border-r border-gray-200 w-20 text-center">Tipo Caja</th>
                          <th className="p-2 border-r border-gray-200">Concepto / Subgasto</th>
                          <th className="p-2 border-r border-gray-200">Comprobante / N° Doc</th>
                          <th className="p-2 border-r border-gray-200 w-28">RUC</th>
                          <th className="p-2 text-right w-24">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sol.gastos.map((g, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-slate-50/50">
                            <td className="p-2 border-r border-gray-200 text-center font-bold text-slate-700">#{g.reqId}</td>
                            <td className="p-2 border-r border-gray-200 text-slate-500 text-[11px]">{formatearFechaCorta(g.fecha)}</td>
                            <td className="p-2 border-r border-gray-200 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                                Tipo {g.tipoCaja}
                              </span>
                            </td>
                            <td className="p-2 border-r border-gray-200 text-slate-800 font-medium">
                              {g.subgasto}
                              {g.categoria && <span className="text-[10px] text-gray-400 block">{g.categoria}</span>}
                            </td>
                            <td className="p-2 border-r border-gray-200 text-slate-600 text-[11px] font-mono">{g.nroFactura}</td>
                            <td className="p-2 border-r border-gray-200 text-slate-500 text-[11px] font-mono">{g.nroRuc}</td>
                            <td className="p-2 text-right font-black text-slate-800">S/ {g.costo.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-black text-xs border-t border-gray-200">
                          <td colSpan={6} className="p-2 text-right uppercase text-[10px] text-slate-500">
                            Total Solicitante ({sol.nombre}):
                          </td>
                          <td className="p-2 text-right font-black text-slate-900 border-l border-gray-200">
                            S/ {sol.totalGastado.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}

                {/* Total Consolidado de la Semana */}
                <div
                  className="bg-slate-900 text-white p-3.5 rounded-xl flex items-center justify-between font-black text-sm"
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                >
                  <span className="uppercase tracking-wider text-slate-200">
                    TOTAL GENERAL LIQUIDADO EN SEMANA:
                  </span>
                  <span className="text-emerald-400 text-base">
                    S/ {totalGastoVal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================
          MODAL POPUP DE REQUERIMIENTOS CERRADOS DE LA SEMANA (MÓVIL Y DESKTOP)
         ======================================================================== */}
      {mostrarPopupRequerimientos && semanaSeleccionada && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          onClick={() => setMostrarPopupRequerimientos(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                  {semanaSeleccionada.codigo_cierre || `Cierre #${semanaSeleccionada.id}`}
                </span>
                <h3 className="text-sm font-black text-brand-dark">
                  Requerimientos Cerrados ({requerimientosSemana.length})
                </h3>
                <span className="text-[11px] text-gray-500 font-semibold">
                  Total: S/ {totalGastoVal.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMostrarPopupRequerimientos(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Lista de Requerimientos */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {cargandoRequerimientos ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                  <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-400 font-bold">Cargando requerimientos...</span>
                </div>
              ) : requerimientosSemana.length > 0 ? (
                requerimientosSemana.map((req) => {
                  const totalGast = parseFloat(req.total_gastado || req.monto_solicitado || 0);
                  const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
                  const listaDet = req.detalle || req.detalles || [];
                  const numComprobantes = listaDet.length;
                  const tipoCajaInfo = obtenerTipoCaja(req);

                  return (
                    <div
                      key={req.id}
                      onClick={() => setSolicitudDetalle(req)}
                      className="p-3 bg-gray-50/70 hover:bg-brand-light/60 rounded-xl border border-gray-100 flex items-center justify-between gap-3 transition-all cursor-pointer group hover:border-brand-primary/30"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <span className="text-xs font-black text-brand-dark bg-white border border-gray-200 px-2 py-1 rounded-lg shrink-0 group-hover:border-brand-primary">
                          #{req.id}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border shrink-0 ${tipoCajaInfo.claseBadge}`}>
                          {tipoCajaInfo.etiqueta}
                        </span>
                        <div>
                          <h4 className="text-xs font-black text-brand-dark leading-tight group-hover:text-brand-primary transition-colors">
                            {nombreSolicitante}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                            <span>{req.fecha_solicitud ? req.fecha_solicitud.slice(0, 10) : ''}</span>
                            <span>• {numComprobantes} comprobante(s)</span>
                            {req.obs && <span className="italic line-clamp-1">"{req.obs}"</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-black text-brand-dark">
                          S/ {totalGast.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSolicitudDetalle(req);
                          }}
                          className="p-1.5 bg-white border border-gray-200 group-hover:border-brand-primary text-gray-600 group-hover:text-brand-primary rounded-lg transition-colors"
                          title="Ver detalle y fotos de comprobantes"
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

            {/* Footer */}
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setMostrarPopupRequerimientos(false)}
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
          MODAL DETALLE DE COMPROBANTES DE LA SOLICITUD
         ======================================================================== */}
      {solicitudDetalle && createPortal(
        <div
          className="fixed inset-0 !m-0 z-[60] flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          onClick={() => setSolicitudDetalle(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                    Requerimiento #{solicitudDetalle.id}
                  </span>
                  {(() => {
                    const tipoModal = obtenerTipoCaja(solicitudDetalle);
                    return (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoModal.claseBadge}`}>
                        {tipoModal.etiqueta}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-sm font-black text-brand-dark">Comprobantes Adjuntos</h3>
              </div>
              <button
                type="button"
                onClick={() => setSolicitudDetalle(null)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Cerrar modal"
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
                    const tipoIndividual = obtenerTipoCaja(det);

                    return (
                      <div key={det.id || det.url || idx} className="p-3 bg-white rounded-xl border border-gray-100 flex items-center justify-between gap-3 shadow-xs hover:border-gray-200 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {det.adj_cajachica ? (
                            <button
                              type="button"
                              onClick={() => setImagenModal(det.adj_cajachica)}
                              className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 shrink-0 hover:opacity-85 transition-opacity bg-white"
                              title="Ver comprobante completo"
                            >
                              {esArchivoPdf(det.adj_cajachica) ? (
                                <div className="w-full h-full bg-red-50 text-red-600 flex flex-col items-center justify-center font-bold">
                                  <FileText size={18} />
                                  <span className="text-[7px] font-black uppercase tracking-wider mt-0.5">PDF</span>
                                </div>
                              ) : (
                                <img src={det.adj_cajachica} alt="Comprobante" className="w-full h-full object-cover" />
                              )}
                            </button>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                              <Receipt size={18} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-black text-brand-dark leading-tight">{nombreSubgasto}</h4>
                              {/* Tipo de caja individual por comprobante */}
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${tipoIndividual.claseBadge}`}>
                                {tipoIndividual.etiqueta}
                              </span>
                              {det.lima_provincia && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                  {det.lima_provincia === 'L' ? 'Lima' : 'Provincia'}
                                </span>
                              )}
                            </div>
                            {rutaOrigenDestino && (
                              <p className="text-[11px] text-brand-primary font-semibold mt-0.5 truncate">{rutaOrigenDestino}</p>
                            )}
                            {(det.placa_nombre || det.placa) && (
                              <span className="text-[10px] text-amber-700 font-bold block mt-0.5">
                                Placa: {det.placa_nombre || det.placa}
                              </span>
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
