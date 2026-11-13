import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Fuel,
  Plus,
  Search,
  Filter,
  RefreshCw,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  AlertCircle,
  Eye,
  Trash2,
  Edit2,
  X,
  UploadCloud,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CreditCard,
  FileSpreadsheet,
  Download,
  Upload,
  CheckSquare,
  Square,
  User,
  Car
} from 'lucide-react';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { resolverUrlAdjunto } from '../utils/archivoUtil';
import { CLAVES_CATALOGO, leerDeCache, guardarEnCache } from '../utils/catalogoCache';
import ModalVisorComprobante from '../components/ModalVisorComprobante';
import Combobox from '../components/Combobox';
import Toast from '../components/Toast';
import { useUserStore } from '../store/userStore';
import { puedeCambiarResponsableCombustible, obtenerAreaLimpia, obtenerPuestoLimpio } from '../utils/permisos';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ==============================================================================
// FUNCIONES AUXILIARES DE FORMATEO Y NORMALIZACIÓN
// ==============================================================================

/**
 * Formatea un número como moneda en Soles (PEN).
 */
const formatearSoles = (valor) => {
  const numero = parseFloat(valor);
  if (isNaN(numero)) return 'S/ 0.00';
  return `S/ ${numero.toFixed(2)}`;
};

/**
 * Formatea fecha y hora concisa (DD/MM/AAAA HH:mm).
 */
const formatearFechaHora = (cadenaFecha) => {
  if (!cadenaFecha) return '';
  try {
    const d = new Date(cadenaFecha);
    if (isNaN(d.getTime())) return String(cadenaFecha);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(cadenaFecha);
  }
};

/**
 * Obtiene el nombre representativo del usuario a partir de su ID u objeto.
 */
const obtenerNombreUsuario = (usr, listaUsuarios = []) => {
  if (!usr) return '';
  if (typeof usr === 'object') {
    return usr.full_name || `${usr.first_name || ''} ${usr.last_name || ''}`.trim() || usr.username || '';
  }
  if (Array.isArray(listaUsuarios) && listaUsuarios.length > 0) {
    const idNum = typeof usr === 'number' ? usr : parseInt(String(usr).replace(/\D/g, ''), 10);
    const encontrado = listaUsuarios.find((u) => u.id === idNum);
    if (encontrado) {
      return encontrado.full_name || `${encontrado.first_name || ''} ${encontrado.last_name || ''}`.trim() || encontrado.username || '';
    }
  }
  return typeof usr === 'string' && !usr.startsWith('http') ? usr : '';
};

/**
 * Formatea fechas a formato legible local (DD/MM/AAAA).
 */
const formatearFecha = (cadenaFecha) => {
  if (!cadenaFecha) return '—';
  try {
    const partes = cadenaFecha.split('T')[0].split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const fecha = new Date(cadenaFecha);
    return isNaN(fecha.getTime()) ? cadenaFecha : fecha.toLocaleDateString('es-PE');
  } catch {
    return cadenaFecha;
  }
};

/**
 * Obtiene el ID numérico a partir de un valor que puede ser número, string o URL de DRF.
 */
const extraerId = (item) => {
  if (!item) return null;
  if (typeof item === 'number') return item;
  if (typeof item === 'object' && item.id) return item.id;
  if (typeof item === 'string') {
    const partes = item.trim().replace(/\/$/, '').split('/');
    const posibleId = parseInt(partes[partes.length - 1], 10);
    return isNaN(posibleId) ? null : posibleId;
  }
  return null;
};

// ==============================================================================
// COMPONENTE PRINCIPAL: GASTOS DE COMBUSTIBLES (TARJETA)
// ==============================================================================

const RegistroCombustibles = () => {
  // Usuario autenticado y control de permisos
  const { user } = useUserStore();
  const puedeModificarResponsable = puedeCambiarResponsableCombustible(user);

  // Estados de datos principales
  const [combustibles, setCombustibles] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [paginaActual, setPaginaActual] = useState(1);
  const limitePorPagina = 100; // Top 100 por requerimiento

  // Catálogos
  const [proveedores, setProveedores] = useState([]);
  const [placas, setPlacas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);

  // Filtros reactivos (similar a Aprobaciones: PENDIENTES, REVISADOS, ENVIADOS)
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('PENDIENTES'); // 'PENDIENTES' (por defecto) | 'REVISADOS' | 'ENVIADOS'
  const [filtroTipoCombustible, setFiltroTipoCombustible] = useState(''); // '' | 'GAS' | 'GLP'
  const [filtroPlaca, setFiltroPlaca] = useState('');

  // Selección de filas para acciones masivas / exportación
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [conmutandoMasivo, setConmutandoMasivo] = useState(false);
  const [conmutandoId, setConmutandoId] = useState(null);

  // Modales
  const [modalFormularioAbierto, setModalFormularioAbierto] = useState(false);
  const [modalConfirmarCerrar, setModalConfirmarCerrar] = useState(false);
  const [pasoFormulario, setPasoFormulario] = useState(1); // Wizard de 2 pasos
  const [gastoSeleccionado, setGastoSeleccionado] = useState(null);
  const [archivoComprobanteVisor, setArchivoComprobanteVisor] = useState(null);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(null);

  // Modal y estado de Importación Excel
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false);
  const [archivoExcelImportar, setArchivoExcelImportar] = useState(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [descargandoExcel, setDescargandoExcel] = useState(false);
  const inputExcelRef = useRef(null);

  // Notificaciones Toast
  const [notificacion, setNotificacion] = useState(null);

  const mostrarMensaje = useCallback((mensaje, tipo = 'info', titulo = '') => {
    setNotificacion({
      tipo: tipo === 'error' ? 'error' : tipo === 'success' ? 'exito' : 'info',
      titulo: titulo || (tipo === 'error' ? 'Error' : tipo === 'success' ? 'Operación Exitosa' : 'Aviso'),
      mensaje,
    });
  }, []);

  // Formulario de creación / edición
  const estadoInicialForm = {
    nro_factura: '',
    fecha_emision: new Date().toISOString().split('T')[0],
    proveedor_id: '',
    placa_id: '',
    responsable_id: '',
    tipo_combustible: 'GAS', // 'GAS': Gasolina, 'GLP': GLP
    total: '',
    adj_gasto: null,
  };

  const [formData, setFormData] = useState(estadoInicialForm);
  const [guardando, setGuardando] = useState(false);

  // Estados para creación rápida de Proveedor dentro del modal
  const [modoCrearProveedor, setModoCrearProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [consultandoRucSunat, setConsultandoRucSunat] = useState(false);
  const [avisoRucProveedor, setAvisoRucProveedor] = useState(null);

  // ============================================================================
  // CARGA DE CATÁLOGOS
  // ============================================================================

  const cargarCatalogos = useCallback(async () => {
    setCargandoCatalogos(true);
    try {
      const [resProv, resPlacas] = await Promise.all([
        fetchAuth(`${API_URL}/RC_Proveedor/?top=1000&format=json`),
        fetchAuth(`${API_URL}/RC_Placas/?top=1000&format=json`),
      ]);

      if (resProv.ok) {
        const dataProv = await resProv.json();
        setProveedores(dataProv.results || dataProv || []);
      }

      if (resPlacas.ok) {
        const dataPlacas = await resPlacas.json();
        setPlacas(dataPlacas.results || dataPlacas || []);
      }

      // Catálogo de usuarios activos (usando caché para minimizar RAM del servidor)
      const usuariosEnCache = leerDeCache(CLAVES_CATALOGO.usuarios);
      if (usuariosEnCache && usuariosEnCache.length > 0) {
        setUsuarios(usuariosEnCache);
      } else {
        const resUser = await fetchAuth(`${API_URL}/users/?is_active=true&top=1000&format=json`);
        if (resUser.ok) {
          const dataUser = await resUser.json();
          const listaUsers = dataUser.results || dataUser || [];
          guardarEnCache(CLAVES_CATALOGO.usuarios, listaUsers);
          setUsuarios(listaUsers);
        }
      }
    } catch (error) {
      console.error('[RegistroCombustibles] Error al cargar catálogos:', error);
    } finally {
      setCargandoCatalogos(false);
    }
  }, []);

  // ============================================================================
  // CARGA DE REGISTROS DE COMBUSTIBLE (TOP 100)
  // ============================================================================

  const cargarCombustibles = useCallback(async (pagina = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagina.toString());
      params.append('format', 'json');
      params.append('top', '100'); // Top 100 indicado

      if (busqueda.trim()) {
        params.append('search', busqueda.trim());
      }
      if (filtroTipoCombustible) {
        params.append('tipo_combustible', filtroTipoCombustible);
      }
      if (filtroPlaca) {
        params.append('placa', filtroPlaca);
      }

      const respuesta = await fetchAuth(`${API_URL}/RC_GastosCombustibles/?${params.toString()}`);
      if (!respuesta.ok) {
        throw new Error(`Error ${respuesta.status} al obtener gastos de combustible`);
      }

      const data = await respuesta.json();
      const lista = data.results || data || [];
      const listaSegura = Array.isArray(lista) ? lista : [];
      setCombustibles(listaSegura);
      setTotalRegistros(data.count ?? listaSegura.length);
      setPaginaActual(pagina);
      setSeleccionados(new Set()); // Limpiar selección al recargar
    } catch (error) {
      console.error('[RegistroCombustibles] Error al cargar combustibles:', error);
      mostrarMensaje('No se pudieron cargar los registros de combustible.', 'error');
    } finally {
      setCargando(false);
    }
  }, [busqueda, filtroTipoCombustible, filtroPlaca, mostrarMensaje]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    cargarCombustibles(1);
  }, [cargarCombustibles]);

  // Escuchar evento global desde el Header para abrir el modal
  useEffect(() => {
    const manejarAbrirNuevo = () => {
      abrirModalCrear();
    };
    window.addEventListener('abrir-modal-nuevo-combustible', manejarAbrirNuevo);
    return () => {
      window.removeEventListener('abrir-modal-nuevo-combustible', manejarAbrirNuevo);
    };
  }, []);

  // Opciones formateadas para el Combobox de Proveedores (búsqueda por nombre comercial, razón social o RUC)
  const opcionesProveedores = useMemo(() => {
    if (!Array.isArray(proveedores) || proveedores.length === 0) return [];
    return proveedores.map((p) => {
      const nombreComercial = (p.nombre_comercial || '').trim();
      const razonSocial = (p.razon_social || '').trim();
      const ruc = (p.nro_ruc || '').trim();

      const label = nombreComercial || razonSocial || `Proveedor #${p.id}`;
      const sublabel = nombreComercial
        ? `${razonSocial} • RUC: ${ruc}`
        : (ruc ? `RUC: ${ruc}` : '');

      return {
        value: String(p.id),
        id: p.id,
        label,
        sublabel,
        busquedaExtra: `${nombreComercial} ${razonSocial} ${ruc}`,
        raw: p,
      };
    });
  }, [proveedores]);

  // Filtro de usuarios responsables:
  // Solo choferes de distribución (area = Distribución y puesto = Chofer).
  // Si el usuario logueado no está en la lista de choferes (ej. un supervisor o gerente que registra),
  // se incluye también para que aparezca por defecto sin romperse la selección.
  const choferesDistribucion = useMemo(() => {
    if (!Array.isArray(usuarios) || usuarios.length === 0) return [];

    const listaFiltrada = usuarios.filter((u) => {
      const area = obtenerAreaLimpia(u);
      const puesto = obtenerPuestoLimpio(u);
      const esDistribucion = area.includes('distribucion') || area.includes('distribución');
      const esChofer = puesto.includes('chofer') || puesto.includes('conductor');
      return esDistribucion && esChofer;
    });

    // Si el usuario logueado tiene acceso y no está en la lista, agregarlo como opción seleccionable
    if (user?.id && !listaFiltrada.some((u) => u.id === user.id)) {
      return [user, ...listaFiltrada];
    }

    return listaFiltrada;
  }, [usuarios, user]);

  // ============================================================================
  // FILTRADO REACTIVO EN MEMORIA Y KPIS DINÁMICOS
  // ============================================================================

  const registrosFiltrados = useMemo(() => {
    return combustibles.filter((item) => {
      const esEnviado = Boolean(item.enviado);
      const esRevisado = Boolean(item.revisado);

      if (filtroEstado === 'PENDIENTES') {
        // Falta revisar (revisado=false y enviado=false)
        return !esRevisado && !esEnviado;
      }
      if (filtroEstado === 'REVISADOS') {
        // Revisados listos (revisado=true y enviado=false)
        return esRevisado && !esEnviado;
      }
      if (filtroEstado === 'ENVIADOS') {
        // Enviados / Descargados
        return esEnviado;
      }
      return !esRevisado && !esEnviado; // Fallback por defecto: Falta revisar
    });
  }, [combustibles, filtroEstado]);

  // KPIs dinámicos calculados en base a la lista completa cargada
  const metricas = useMemo(() => {
    let totalGeneral = 0;
    let totalGasolina = 0;
    let totalGLP = 0;

    let pendientesCount = 0;
    let pendientesMonto = 0;

    let revisadosCount = 0;
    let revisadosMonto = 0;

    let enviadosCount = 0;
    let enviadosMonto = 0;

    combustibles.forEach((g) => {
      const monto = parseFloat(g.total || g.monto) || 0;
      totalGeneral += monto;

      const tipo = String(g.tipo_combustible || '').toUpperCase();
      if (tipo === 'GLP') {
        totalGLP += monto;
      } else {
        totalGasolina += monto;
      }

      if (g.enviado) {
        enviadosCount += 1;
        enviadosMonto += monto;
      } else if (g.revisado) {
        revisadosCount += 1;
        revisadosMonto += monto;
      } else {
        pendientesCount += 1;
        pendientesMonto += monto;
      }
    });

    return {
      totalGeneral,
      totalGasolina,
      totalGLP,
      pendientesCount,
      pendientesMonto,
      revisadosCount,
      revisadosMonto,
      enviadosCount,
      enviadosMonto,
      cantidad: combustibles.length,
    };
  }, [combustibles]);

  // ============================================================================
  // ACCIONES DE REVISIÓN Y LIMPIEZA MASIVA
  // Regla: Solo aplica para registros con enviado=false. No se modifican enviados.
  // ============================================================================

  /**
   * Conmuta individualmente el estado revisado de un registro (solo si enviado === false).
   */
  const handleToggleRevisado = async (item, e) => {
    if (e) e.stopPropagation();
    if (item.enviado) {
      mostrarMensaje('Este registro ya fue enviado/descargado y no puede ser modificado.', 'advertencia');
      return;
    }
    if (conmutandoId === item.id || conmutandoMasivo) return;

    const valorActual = Boolean(item.revisado);
    const nuevoValor = !valorActual;
    const ahoraIso = new Date().toISOString();
    setConmutandoId(item.id);

    // Actualización optimista incluyendo trazabilidad (revisado_por y fecha_revision)
    setCombustibles((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? {
              ...c,
              revisado: nuevoValor,
              revisado_por: nuevoValor ? user?.id : null,
              revisado_por_nombre: nuevoValor ? (user?.full_name || user?.username) : null,
              fecha_revision: nuevoValor ? ahoraIso : null,
            }
          : c
      )
    );

    try {
      const cuerpoPatch = {
        revisado: nuevoValor,
        revisado_por: nuevoValor ? user?.id : null,
        fecha_revision: nuevoValor ? ahoraIso : null,
      };

      const res = await fetchAuth(`${API_URL}/RC_GastosCombustibles/${item.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoPatch),
      });

      if (!res.ok) {
        // Revertir optimismo
        setCombustibles((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, revisado: valorActual } : c))
        );
        throw new Error(await extraerMensajeError(res));
      }
    } catch (err) {
      console.error('[RegistroCombustibles] Error al conmutar revisión:', err);
      mostrarMensaje(err.message || 'No se pudo actualizar el estado de revisión.', 'error');
    } finally {
      setConmutandoId(null);
    }
  };

  /**
   * Revisar todos: marca revisado=true solo a los que tienen enviado=false y revisado=false.
   * Limpiar todos: marca revisado=false solo a los que tienen revisado=true y enviado=false.
   */
  const handleRevisarMasivo = async (marcarComoRevisado = true) => {
    if (conmutandoMasivo) return;

    // Filtrar estrictamente: solo registros no enviados cuyo estado revisado difiera del objetivo
    const afectables = registrosFiltrados.filter(
      (item) => !item.enviado && Boolean(item.revisado) !== marcarComoRevisado
    );

    if (afectables.length === 0) {
      mostrarMensaje(
        marcarComoRevisado
          ? 'No hay registros pendientes de revisión para marcar.'
          : 'No hay registros revisados pendientes de envío para limpiar.',
        'info'
      );
      return;
    }

    const idsAfectables = afectables.map((i) => i.id);
    const idSet = new Set(idsAfectables);
    const ahoraIso = new Date().toISOString();
    setConmutandoMasivo(true);

    // Optimismo inmediato con trazabilidad
    setCombustibles((prev) =>
      prev.map((c) =>
        idSet.has(c.id)
          ? {
              ...c,
              revisado: marcarComoRevisado,
              revisado_por: marcarComoRevisado ? user?.id : null,
              revisado_por_nombre: marcarComoRevisado ? (user?.full_name || user?.username) : null,
              fecha_revision: marcarComoRevisado ? ahoraIso : null,
            }
          : c
      )
    );

    try {
      const cuerpoPatchMasivo = {
        ids: idsAfectables,
        revisado: marcarComoRevisado,
        revisado_por: marcarComoRevisado ? user?.id : null,
        fecha_revision: marcarComoRevisado ? ahoraIso : null,
      };

      // Intento de endpoint masivo en DRF; fallback a Promise.all de parches
      const resMasivo = await fetchAuth(`${API_URL}/RC_GastosCombustibles/revisar_masivo/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoPatchMasivo),
      });

      if (!resMasivo.ok) {
        // Fallback: actualizar vía PATCH concurrente individual
        await Promise.all(
          idsAfectables.map((id) =>
            fetchAuth(`${API_URL}/RC_GastosCombustibles/${id}/`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                revisado: marcarComoRevisado,
                revisado_por: marcarComoRevisado ? user?.id : null,
                fecha_revision: marcarComoRevisado ? ahoraIso : null,
              }),
            })
          )
        );
      }

      mostrarMensaje(
        marcarComoRevisado
          ? `Se marcaron ${idsAfectables.length} registros como revisados.`
          : `Se limpió la revisión de ${idsAfectables.length} registros.`,
        'success'
      );
    } catch (err) {
      console.error('[RegistroCombustibles] Error en revisión masiva:', err);
      mostrarMensaje('Ocurrió un error al procesar la acción masiva.', 'error');
      cargarCombustibles(paginaActual);
    } finally {
      setConmutandoMasivo(false);
    }
  };

  // ============================================================================
  // EXPORTACIÓN A EXCEL
  // Si hay seleccionados se envía ?ids=...; de lo contrario el backend filtra revisados=true & enviados=false
  // ============================================================================

  const manejarExportarExcel = async () => {
    setDescargandoExcel(true);
    try {
      const params = new URLSearchParams();
      if (seleccionados.size > 0) {
        params.append('ids', Array.from(seleccionados).join(','));
      }

      const queryUrl = params.toString()
        ? `${API_URL}/RC_GastosCombustibles/descargar_excel/?${params.toString()}`
        : `${API_URL}/RC_GastosCombustibles/descargar_excel/`;

      const respuesta = await fetchAuth(queryUrl, {
        headers: {
          Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*',
        },
      });

      if (!respuesta.ok) {
        const errorMsg = await extraerMensajeError(respuesta);
        throw new Error(errorMsg || 'No se pudo exportar el archivo Excel.');
      }

      const blob = await respuesta.blob();
      let nombreArchivo = `Reporte_Combustibles_${new Date().toISOString().split('T')[0]}.xlsx`;
      const disposicion = respuesta.headers.get('content-disposition');
      if (disposicion) {
        const match = disposicion.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          nombreArchivo = match[1].replace(/['"]/g, '').trim();
        }
      }

      const urlBlob = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = urlBlob;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(urlBlob);

      mostrarMensaje(`Archivo "${nombreArchivo}" descargado correctamente.`, 'success', 'Exportación Exitosa');
      setSeleccionados(new Set());
      await cargarCombustibles(paginaActual); // Recargar para reflejar enviado=true
    } catch (err) {
      console.error('[RegistroCombustibles] Error al exportar Excel:', err);
      mostrarMensaje(err.message || 'Error al exportar registros a Excel.', 'error');
    } finally {
      setDescargandoExcel(false);
    }
  };

  // ============================================================================
  // IMPORTACIÓN DESDE EXCEL
  // ============================================================================

  const manejarImportarExcel = async (e) => {
    if (e) e.preventDefault();
    if (!archivoExcelImportar) {
      mostrarMensaje('Seleccione un archivo Excel (.xlsx o .xls).', 'error');
      return;
    }

    setImportandoExcel(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append('archivo', archivoExcelImportar);

      const res = await fetchAuth(`${API_URL}/RC_GastosCombustibles/importar_excel/`, {
        method: 'POST',
        body: cuerpo,
      });

      if (!res.ok) {
        throw new Error(await extraerMensajeError(res));
      }

      const resultado = await res.json().catch(() => ({}));
      const creados = resultado.creados || resultado.cantidad || 'varios';
      mostrarMensaje(`Se importaron ${creados} registros de combustible correctamente.`, 'success', 'Importación Completada');
      setModalImportarAbierto(false);
      setArchivoExcelImportar(null);
      await cargarCombustibles(1);
    } catch (err) {
      console.error('[RegistroCombustibles] Error al importar Excel:', err);
      mostrarMensaje(err.message || 'Error al importar archivo Excel.', 'error');
    } finally {
      setImportandoExcel(false);
    }
  };

  // ============================================================================
  // GESTIÓN DE SELECCIÓN MÚLTIPLE DE FILAS
  // ============================================================================

  const alternarSeleccion = (id) => {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });
  };

  const seleccionarTodosVisibles = () => {
    if (seleccionados.size === registrosFiltrados.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(registrosFiltrados.map((i) => i.id)));
    }
  };

  // ============================================================================
  // ACCIONES DEL FORMULARIO (MODAL POR PASOS)
  // ============================================================================

  const abrirModalCrear = () => {
    setGastoSeleccionado(null);
    setFormData({
      ...estadoInicialForm,
      responsable_id: user?.id ? String(user.id) : '',
    });
    setPasoFormulario(1);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
    setAvisoRucProveedor(null);
    setModalFormularioAbierto(true);
  };

  const abrirModalEditar = (item) => {
    if (item.enviado) {
      mostrarMensaje('No se puede editar un registro que ya fue enviado/descargado.', 'advertencia');
      return;
    }
    setGastoSeleccionado(item);
    const idProv = item.proveedor?.id || extraerId(item.proveedor) || '';
    const idPlaca = item.placa?.id || extraerId(item.placa) || '';
    const idUser = item.responsable?.id || extraerId(item.responsable) || '';

    setFormData({
      nro_factura: item.nro_factura || '',
      fecha_emision: item.fecha_emision || '',
      proveedor_id: idProv.toString(),
      placa_id: idPlaca.toString(),
      responsable_id: idUser.toString(),
      tipo_combustible: item.tipo_combustible || 'GAS',
      total: item.total || item.monto || '',
      adj_gasto: null,
    });
    setPasoFormulario(1);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
    setAvisoRucProveedor(null);
    setModalFormularioAbierto(true);
  };

  /**
   * Determina si el formulario contiene información ingresada por el usuario.
   */
  const formularioTieneDatos = useCallback(() => {
    if (gastoSeleccionado) return true;
    return Boolean(
      formData.nro_factura.trim() ||
      formData.proveedor_id ||
      formData.placa_id ||
      formData.total ||
      formData.adj_gasto ||
      nuevoProveedor.nro_ruc.trim() ||
      nuevoProveedor.razon_social.trim()
    );
  }, [formData, gastoSeleccionado, nuevoProveedor]);

  const intentarCerrarModalFormulario = () => {
    if (formularioTieneDatos()) {
      setModalConfirmarCerrar(true);
    } else {
      setModalFormularioAbierto(false);
    }
  };

  const confirmarDescarteYCerrar = () => {
    setModalConfirmarCerrar(false);
    setModalFormularioAbierto(false);
    setFormData(estadoInicialForm);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
  };

  /**
   * Valida el paso 1 del asistente.
   */
  const validarPaso1 = () => {
    if (!formData.nro_factura.trim()) {
      mostrarMensaje('El número de factura es obligatorio (Ej: F001-12345).', 'error');
      return false;
    }
    if (!formData.proveedor_id) {
      mostrarMensaje('Debe seleccionar el proveedor.', 'error');
      return false;
    }
    if (!formData.placa_id) {
      mostrarMensaje('Debe seleccionar la placa del vehículo.', 'error');
      return false;
    }
    if (!formData.responsable_id) {
      mostrarMensaje('Debe asignar el usuario responsable.', 'error');
      return false;
    }
    return true;
  };

  /**
   * Guarda o actualiza el registro en DRF.
   */
  const manejarGuardarGasto = async (e) => {
    if (e) e.preventDefault();

    if (!validarPaso1()) {
      setPasoFormulario(1);
      return;
    }

    const totalNumerico = parseFloat(formData.total);
    if (isNaN(totalNumerico) || totalNumerico <= 0) {
      mostrarMensaje('Ingrese un importe total válido mayor a 0.', 'error');
      setPasoFormulario(2);
      return;
    }

    setGuardando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append('nro_factura', formData.nro_factura.trim().toUpperCase());
      cuerpo.append('fecha_emision', formData.fecha_emision);
      cuerpo.append('proveedor', formData.proveedor_id);
      cuerpo.append('placa', formData.placa_id);
      cuerpo.append('responsable', formData.responsable_id);
      cuerpo.append('tipo_combustible', formData.tipo_combustible);
      cuerpo.append('total', totalNumerico.toFixed(2));

      if (formData.adj_gasto instanceof File) {
        cuerpo.append('adj_gasto', formData.adj_gasto);
      }

      let urlPeticion = `${API_URL}/RC_GastosCombustibles/`;
      let metodo = 'POST';

      if (gastoSeleccionado?.id) {
        urlPeticion = `${API_URL}/RC_GastosCombustibles/${gastoSeleccionado.id}/`;
        metodo = 'PATCH';
      }

      const respuesta = await fetchAuth(urlPeticion, {
        method: metodo,
        body: cuerpo,
      });

      if (!respuesta.ok) {
        throw new Error(await extraerMensajeError(respuesta));
      }

      mostrarMensaje(
        gastoSeleccionado ? 'Gasto de combustible actualizado.' : 'Gasto de combustible registrado con éxito.',
        'success'
      );
      setModalFormularioAbierto(false);
      await cargarCombustibles(paginaActual);
    } catch (error) {
      console.error('[RegistroCombustibles] Error al guardar:', error);
      mostrarMensaje(error.message || 'Error al guardar el gasto de combustible.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Elimina un registro de combustible.
   */
  const manejarEliminarGasto = async () => {
    if (!modalConfirmarEliminar?.id) return;
    try {
      const respuesta = await fetchAuth(`${API_URL}/RC_GastosCombustibles/${modalConfirmarEliminar.id}/`, {
        method: 'DELETE',
      });

      if (!respuesta.ok && respuesta.status !== 204) {
        throw new Error('No se pudo eliminar el registro.');
      }

      mostrarMensaje('Registro eliminado correctamente.', 'success');
      setModalConfirmarEliminar(null);
      await cargarCombustibles(paginaActual);
    } catch (error) {
      console.error('[RegistroCombustibles] Error al eliminar:', error);
      mostrarMensaje(error.message || 'Error al eliminar registro.', 'error');
    }
  };

  /**
   * Consulta SUNAT rápida para el modal de nuevo proveedor.
   */
  const consultarRucProveedorSunat = async (ruc) => {
    const rucLimpio = String(ruc || '').trim();
    if (rucLimpio.length !== 11) return;

    if (rucLimpio.startsWith('10')) {
      setAvisoRucProveedor({
        tipo: 'advertencia',
        texto: 'La consulta SUNAT solo admite RUC 20. Ingrese la Razón Social manualmente.',
      });
      return;
    }

    if (rucLimpio.startsWith('20')) {
      setConsultandoRucSunat(true);
      setAvisoRucProveedor(null);
      try {
        const respuesta = await fetchAuth(`https://open.sunat.pe/api/v1/ruc/${rucLimpio}`, {
          headers: { Accept: 'application/json' },
        });

        if (respuesta.ok) {
          const datos = await respuesta.json();
          const razon = datos.razon_social || datos.nombre_o_razon_social || '';
          if (razon) {
            setNuevoProveedor((prev) => ({
              ...prev,
              razon_social: razon.toUpperCase(),
              nombre_comercial: prev.nombre_comercial || (datos.nombre_comercial || '').toUpperCase(),
            }));
            setAvisoRucProveedor({
              tipo: 'exito',
              texto: `Razón social obtenida: ${razon}`,
            });
          }
        }
      } catch (err) {
        console.warn('[RegistroCombustibles] Fallo consulta SUNAT:', err);
      } finally {
        setConsultandoRucSunat(false);
      }
    }
  };

  /**
   * Creación rápida de proveedor.
   */
  const manejarCrearProveedorRapido = async (e) => {
    e.preventDefault();
    if (!nuevoProveedor.nro_ruc || nuevoProveedor.nro_ruc.length !== 11) {
      mostrarMensaje('El RUC debe tener 11 dígitos.', 'error');
      return;
    }
    if (!nuevoProveedor.razon_social.trim()) {
      mostrarMensaje('Ingrese la razón social.', 'error');
      return;
    }

    setGuardandoProveedor(true);
    try {
      const cuerpo = {
        nro_ruc: nuevoProveedor.nro_ruc.trim(),
        razon_social: nuevoProveedor.razon_social.trim().toUpperCase(),
      };
      if (nuevoProveedor.nombre_comercial && nuevoProveedor.nombre_comercial.trim()) {
        cuerpo.nombre_comercial = nuevoProveedor.nombre_comercial.trim().toUpperCase();
      }

      const res = await fetchAuth(`${API_URL}/RC_Proveedor/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });

      if (!res.ok) {
        throw new Error(await extraerMensajeError(res));
      }

      const provCreado = await res.json();
      setProveedores((prev) => [provCreado, ...prev]);
      setFormData((prev) => ({ ...prev, proveedor_id: provCreado.id.toString() }));
      setModoCrearProveedor(false);
      setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
      setAvisoRucProveedor(null);
      mostrarMensaje('Proveedor creado y asignado.', 'success');
    } catch (error) {
      mostrarMensaje(error.message || 'Error al crear proveedor.', 'error');
    } finally {
      setGuardandoProveedor(false);
    }
  };

  // ============================================================================
  // RENDERIZADO
  // ============================================================================

  return (
    <div className="h-[calc(100vh-5.5rem)] md:h-[calc(100vh-6rem)] flex flex-col pt-3 pb-3 px-3 sm:px-6 md:px-8 space-y-2.5 animate-fade-in font-outfit w-full overflow-hidden relative">
      {/* Notificación Toast */}
      {notificacion && (
        <Toast
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          alCerrar={() => setNotificacion(null)}
        />
      )}

      {/* ==================================================================== */}
      {/* ENCABEZADO PRINCIPAL */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-xl font-black text-brand-dark tracking-tight flex items-center gap-2">
            <Fuel size={22} className="text-amber-600" />
            <span>Gastos de Combustibles con Tarjeta</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Control de consumos de combustible (Gasolina / GLP), revisión gerencial y descargas a Excel.
          </p>
        </div>

        {/* Acciones principales del encabezado */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Importar Excel */}
          <button
            type="button"
            onClick={() => setModalImportarAbierto(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-gray-200 hover:border-brand-primary text-gray-700 hover:text-brand-primary text-xs font-bold shadow-xs hover:scale-102 active:scale-98 transition-all"
            title="Importar consumos desde Excel (.xlsx)"
          >
            <Upload size={14} className="text-brand-primary" />
            <span className="hidden sm:inline">Importar Excel</span>
          </button>

          {/* Botón Exportar Excel */}
          <button
            type="button"
            onClick={manejarExportarExcel}
            disabled={descargandoExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 hover:scale-102 active:scale-98 transition-all disabled:opacity-50"
            title={
              seleccionados.size > 0
                ? `Exportar ${seleccionados.size} registros seleccionados`
                : 'Exportar registros revisados pendientes de envío'
            }
          >
            <FileSpreadsheet size={15} className={descargandoExcel ? 'animate-spin' : ''} />
            <span>
              {descargandoExcel
                ? 'Exportando...'
                : seleccionados.size > 0
                ? `Exportar (${seleccionados.size})`
                : 'Descargar Excel'}
            </span>
          </button>

          {/* Botón Recargar */}
          <button
            type="button"
            onClick={() => cargarCombustibles(paginaActual)}
            disabled={cargando}
            className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-xs"
            title="Recargar registros"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin text-brand-primary' : ''} />
          </button>

          {/* Botón Nuevo Combustible */}
          <button
            type="button"
            onClick={abrirModalCrear}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-700 hover:to-orange-800 text-white text-xs font-black shadow-md shadow-amber-600/20 hover:scale-102 active:scale-98 transition-all"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Nuevo Combustible</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* KPIS DINÁMICOS Y ACCIONES MASIVAS (SIMILAR A BANDEJA DE APROBACIONES) */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm shrink-0 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* KPI 1: Falta Revisar (Pendientes) - Estado por defecto */}
          <div
            onClick={() => setFiltroEstado('PENDIENTES')}
            className={`border rounded-xl p-3 flex flex-col justify-between cursor-pointer transition-all ${
              filtroEstado === 'PENDIENTES'
                ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/30'
                : 'bg-amber-50/70 border-amber-100 hover:border-amber-300'
            }`}
            title="Filtrar consumos pendientes de revisión"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                Falta Revisar
              </span>
              <span className="text-[10px] font-black text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                {metricas.pendientesCount} reg.
              </span>
            </div>
            <div className="mt-1.5">
              <span className="text-lg sm:text-xl font-black text-amber-600 block">
                {formatearSoles(metricas.pendientesMonto)}
              </span>
              <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
                Pendientes de visto bueno
              </span>
            </div>
          </div>

          {/* KPI 2: Revisados Listos */}
          <div
            onClick={() => setFiltroEstado('REVISADOS')}
            className={`border rounded-xl p-3 flex flex-col justify-between cursor-pointer transition-all ${
              filtroEstado === 'REVISADOS'
                ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-400/30'
                : 'bg-emerald-50/70 border-emerald-100 hover:border-emerald-300'
            }`}
            title="Filtrar consumos revisados listos para descargar"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                Revisados Listos
              </span>
              <span className="text-[10px] font-black text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                {metricas.revisadosCount} reg.
              </span>
            </div>
            <div className="mt-1.5">
              <span className="text-lg sm:text-xl font-black text-emerald-600 block">
                {formatearSoles(metricas.revisadosMonto)}
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                Listos para Excel o envío
              </span>
            </div>
          </div>

          {/* KPI 3: Enviados / Histórico con acciones de Revisión Masiva */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col justify-between">
            <div
              onClick={() => setFiltroEstado('ENVIADOS')}
              className={`flex items-center justify-between cursor-pointer p-1 rounded-lg transition-all ${
                filtroEstado === 'ENVIADOS' ? 'bg-purple-100/60' : 'hover:bg-gray-100/60'
              }`}
              title="Filtrar consumos ya enviados o descargados"
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                Enviados / Histórico
              </span>
              <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                {metricas.enviadosCount} reg.
              </span>
            </div>

            <div className="my-1 flex items-center justify-between">
              <span className="text-xs font-black text-gray-700">
                {formatearSoles(metricas.enviadosMonto)}
              </span>
              <span className="text-[10px] text-gray-400 font-bold">
                (No modificables)
              </span>
            </div>

            {/* Acciones de Revisar Todos y Limpiar Todos */}
            <div className="flex items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => handleRevisarMasivo(true)}
                disabled={conmutandoMasivo || metricas.pendientesCount === 0}
                className="flex-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-lg transition-all disabled:opacity-40 truncate shadow-xs"
                title="Marcar todos los pendientes como revisados (excluye enviados)"
              >
                {conmutandoMasivo ? 'Procesando...' : 'Revisar Todo'}
              </button>

              <button
                type="button"
                onClick={() => handleRevisarMasivo(false)}
                disabled={conmutandoMasivo || metricas.revisadosCount === 0}
                className="py-1 px-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-[10px] rounded-lg transition-all disabled:opacity-40 truncate"
                title="Limpiar revisión de los revisados no enviados"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-gray-100 shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          {/* Selector de estado rápido (Pestañas - Sin 'TODOS', por defecto Falta Revisar) */}
          <div className="flex items-center bg-gray-100/80 p-0.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setFiltroEstado('PENDIENTES')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filtroEstado === 'PENDIENTES' ? 'bg-amber-500 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Falta Revisar ({metricas.pendientesCount})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstado('REVISADOS')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filtroEstado === 'REVISADOS' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Revisados ({metricas.revisadosCount})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstado('ENVIADOS')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filtroEstado === 'ENVIADOS' ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Enviados ({metricas.enviadosCount})
            </button>
          </div>

          {/* Campo de búsqueda */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar factura, placa, responsable o proveedor..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-gray-50 border border-gray-200 outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
            />
          </div>
        </div>

        {/* Filtros secundarios */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro Combustible */}
          <select
            value={filtroTipoCombustible}
            onChange={(e) => setFiltroTipoCombustible(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white text-gray-700 outline-none"
          >
            <option value="">Tipo Combustible: Todos</option>
            <option value="GAS">Gasolina</option>
            <option value="GLP">GLP</option>
          </select>

          {/* Filtro Placa */}
          <select
            value={filtroPlaca}
            onChange={(e) => setFiltroPlaca(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white text-gray-700 outline-none max-w-[140px]"
          >
            <option value="">Placa: Todas</option>
            {placas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.placa || p.nombre || `Placa #${p.id}`}
              </option>
            ))}
          </select>

          {/* Checkbox seleccionar todos visibles */}
          <button
            type="button"
            onClick={seleccionarTodosVisibles}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
            title="Seleccionar o deseleccionar todos los registros de la lista"
          >
            {seleccionados.size === registrosFiltrados.length && registrosFiltrados.length > 0 ? (
              <CheckSquare size={14} className="text-brand-primary" />
            ) : (
              <Square size={14} className="text-gray-400" />
            )}
            <span className="hidden sm:inline">Todos ({seleccionados.size})</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LISTADO / TABLA DE REGISTROS DE COMBUSTIBLE */}
      {/* ==================================================================== */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">
        {cargando ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
            <RefreshCw size={28} className="animate-spin text-amber-600" />
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
              Cargando consumos de combustible...
            </p>
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
            <Fuel size={36} className="text-gray-300" />
            <h3 className="text-sm font-bold text-gray-700">No se encontraron registros de combustible</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              {busqueda.trim() || filtroEstado !== 'PENDIENTES' || filtroTipoCombustible
                ? 'Prueba modificando los filtros o el texto de búsqueda.'
                : 'Comienza registrando un nuevo gasto de combustible con tarjeta.'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {registrosFiltrados.map((item) => {
              const estaSeleccionado = seleccionados.has(item.id);
              const esEnviado = Boolean(item.enviado);
              const esRevisado = Boolean(item.revisado);

              const nombreProv =
                item.proveedor?.nombre_comercial ||
                item.proveedor?.razon_social ||
                item.proveedor_nombre ||
                'Proveedor';

              const nombrePlaca =
                item.placa?.placa ||
                item.placa?.nombre ||
                item.placa_nombre ||
                'S/P';

              const nombreResponsable =
                item.responsable?.full_name ||
                item.responsable?.username ||
                item.responsable_nombre ||
                obtenerNombreUsuario(item.responsable, usuarios) ||
                'Usuario';

              const nombreRevisor = obtenerNombreUsuario(item.revisado_por, usuarios) || item.revisado_por_nombre || '';
              const detalleRevision = esRevisado && (item.fecha_revision || nombreRevisor)
                ? `Revisado por ${nombreRevisor || 'Gerencia'}${item.fecha_revision ? ` - ${formatearFechaHora(item.fecha_revision)}` : ''}`
                : '';
              const detalleEnvio = esEnviado && (item.fecha_envio || item.enviado_por)
                ? `Enviado${item.enviado_por ? ` por ${obtenerNombreUsuario(item.enviado_por, usuarios) || item.enviado_por}` : ''}${item.fecha_envio ? ` - ${formatearFechaHora(item.fecha_envio)}` : ''}`
                : '';

              return (
                <div
                  key={item.id}
                  className={`p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all hover:bg-gray-50/80 ${
                    estaSeleccionado ? 'bg-brand-light/30' : ''
                  }`}
                >
                  {/* Bloque Izquierdo: Selección, Ícono y Datos del Comprobante */}
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* Checkbox de selección */}
                    <button
                      type="button"
                      onClick={() => alternarSeleccion(item.id)}
                      className="mt-1 text-gray-400 hover:text-brand-primary"
                    >
                      {estaSeleccionado ? (
                        <CheckSquare size={16} className="text-brand-primary" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>

                    {/* Ícono de combustible */}
                    <div
                      className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        item.tipo_combustible === 'GLP'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      <Fuel size={18} />
                    </div>

                    {/* Información principal */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-brand-dark tracking-tight">
                          {item.nro_factura || `ID #${item.id}`}
                        </span>

                        {/* Badge Tipo Combustible */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            item.tipo_combustible === 'GLP'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.tipo_combustible === 'GLP' ? 'GLP' : 'GASOLINA'}
                        </span>

                        {/* Badge Enviado */}
                        {esEnviado && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800"
                            title={detalleEnvio || 'Consumo enviado / exportado'}
                          >
                            ENVIADO / EXPORTADO
                          </span>
                        )}
                      </div>

                      {/* Proveedor y Placa */}
                      <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5 flex-wrap">
                        <span className="font-bold text-gray-800 truncate" title={nombreProv}>
                          {nombreProv}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono font-bold text-brand-primary">
                          <Car size={12} />
                          {nombrePlaca}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-gray-500 truncate" title={nombreResponsable}>
                          <User size={12} />
                          {nombreResponsable}
                        </span>
                      </div>

                      {/* Fechas de emisión */}
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Emisión: {formatearFecha(item.fecha_emision)}
                        </span>
                        {detalleRevision && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium" title={detalleRevision}>
                            ✓ {detalleRevision}
                          </span>
                        )}
                        {detalleEnvio && (
                          <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium" title={detalleEnvio}>
                            ↗ {detalleEnvio}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bloque Derecho: Importe, Estado Revisado y Botones de Acción */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    {/* Monto */}
                    <div className="text-right">
                      <span className="text-sm font-black text-brand-dark block">
                        {formatearSoles(item.total || item.monto)}
                      </span>
                    </div>

                    {/* Botón Switch de Revisión Gerencial */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleRevisado(item, e)}
                      disabled={esEnviado || conmutandoId === item.id || conmutandoMasivo}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                        esEnviado
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : esRevisado
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                      }`}
                      title={
                        esEnviado
                          ? (detalleEnvio || 'Registro ya enviado/descargado')
                          : esRevisado
                          ? (detalleRevision ? `${detalleRevision} • Clic para desmarcar` : 'Clic para desmarcar revisión')
                          : 'Clic para marcar como revisado'
                      }
                    >
                      {conmutandoId === item.id ? (
                        <RefreshCw size={13} className="animate-spin text-amber-600" />
                      ) : esRevisado ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Clock size={13} className="text-amber-600" />
                      )}
                      <span>{esRevisado ? 'Revisado' : 'Falta Revisar'}</span>
                    </button>

                    {/* Acciones Rápidas: Ver Adjunto, Editar, Eliminar */}
                    <div className="flex items-center gap-1">
                      {item.adj_gasto && (
                        <button
                          type="button"
                          onClick={() => setArchivoComprobanteVisor(resolverUrlAdjunto(item.adj_gasto))}
                          className="p-1.5 text-gray-400 hover:text-brand-primary hover:bg-brand-light rounded-lg transition-colors"
                          title="Ver comprobante adjunto"
                        >
                          <Eye size={16} />
                        </button>
                      )}

                      {!esEnviado && (
                        <>
                          <button
                            type="button"
                            onClick={() => abrirModalEditar(item)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar gasto"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setModalConfirmarEliminar(item)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar gasto"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* PAGINACIÓN COMPACTA INFERIOR */}
      {/* ==================================================================== */}
      {totalRegistros > limitePorPagina && (
        <div className="bg-white px-3 py-2 rounded-xl border border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
          <span>{registrosFiltrados.length} de {totalRegistros} consumos</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => cargarCombustibles(paginaActual - 1)}
              disabled={paginaActual <= 1 || cargando}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="font-bold text-gray-700">Pág. {paginaActual}</span>
            <button
              onClick={() => cargarCombustibles(paginaActual + 1)}
              disabled={paginaActual * limitePorPagina >= totalRegistros || cargando}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL ASISTENTE POR PASOS (MOBILE-FIRST) */}
      {/* ==================================================================== */}
      {modalFormularioAbierto && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in"
          onClick={intentarCerrarModalFormulario}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del modal */}
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Fuel size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-brand-dark">
                    {gastoSeleccionado ? 'Editar Combustible' : 'Registro de Combustible'}
                  </h3>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Paso {pasoFormulario} de 2: {pasoFormulario === 1 ? 'Factura & Vehículo' : 'Consumo & Tipo de Pago'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={intentarCerrarModalFormulario}
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Stepper de 2 pasos */}
            <div className="grid grid-cols-2 gap-1 p-2 bg-gray-50/70 border-b border-gray-100 text-center text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setPasoFormulario(1)}
                className={`py-1.5 rounded-lg transition-all ${
                  pasoFormulario === 1
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-gray-500 hover:text-brand-dark'
                }`}
              >
                1. Factura & Vehículo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (validarPaso1()) setPasoFormulario(2);
                }}
                className={`py-1.5 rounded-lg transition-all ${
                  pasoFormulario === 2
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-gray-500 hover:text-brand-dark'
                }`}
              >
                2. Importe & Crédito
              </button>
            </div>

            {/* Contenido con scroll independiente */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
              {pasoFormulario === 1 && (
                <div className="space-y-3 animate-fade-in">
                  {/* N° Factura */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      N° Factura / Comprobante <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. F001-00012345"
                      value={formData.nro_factura}
                      onChange={(e) => setFormData({ ...formData, nro_factura: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono font-bold focus:border-brand-primary outline-none uppercase"
                    />
                  </div>

                  {/* Fecha de Emisión */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Fecha de Emisión <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.fecha_emision}
                      onChange={(e) => setFormData({ ...formData, fecha_emision: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none"
                    />
                  </div>

                  {/* Proveedor con creación rápida */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider">
                        Proveedor <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setModoCrearProveedor(!modoCrearProveedor);
                          setAvisoRucProveedor(null);
                        }}
                        className="text-[11px] font-bold text-brand-primary hover:underline"
                      >
                        {modoCrearProveedor ? '✕ Cancelar' : '+ Nuevo Proveedor'}
                      </button>
                    </div>

                    {modoCrearProveedor ? (
                      <div className="p-3 bg-brand-light/50 border border-brand-primary/20 rounded-xl space-y-2 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="N° RUC (11 dígitos) *"
                              maxLength={11}
                              value={nuevoProveedor.nro_ruc}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setNuevoProveedor((prev) => ({ ...prev, nro_ruc: val }));
                                if (val.length === 11) {
                                  consultarRucProveedorSunat(val);
                                } else {
                                  setAvisoRucProveedor(null);
                                }
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none font-mono focus:border-brand-primary bg-white"
                            />
                            {consultandoRucSunat && (
                              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                <RefreshCw size={13} className="animate-spin text-brand-primary" />
                              </div>
                            )}
                          </div>

                          <input
                            type="text"
                            placeholder="Razón Social *"
                            value={nuevoProveedor.razon_social}
                            onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, razon_social: e.target.value.toUpperCase() })}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none uppercase focus:border-brand-primary bg-white"
                          />
                        </div>

                        <div>
                          <input
                            type="text"
                            placeholder="Nombre Comercial (Opcional)"
                            value={nuevoProveedor.nombre_comercial}
                            onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombre_comercial: e.target.value.toUpperCase() })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none uppercase focus:border-brand-primary bg-white"
                          />
                        </div>

                        {avisoRucProveedor && (
                          <div
                            className={`p-2 rounded-lg border text-[11px] font-semibold leading-relaxed flex items-start gap-1.5 ${
                              avisoRucProveedor.tipo === 'advertencia'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <span>{avisoRucProveedor.texto}</span>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setModoCrearProveedor(false);
                              setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
                              setAvisoRucProveedor(null);
                            }}
                            className="px-2.5 py-1 text-gray-500 text-xs font-semibold hover:text-gray-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={manejarCrearProveedorRapido}
                            disabled={guardandoProveedor || consultandoRucSunat}
                            className="px-3.5 py-1 bg-brand-primary text-white rounded-lg text-xs font-bold hover:bg-brand-secondary transition-all disabled:opacity-50"
                          >
                            {guardandoProveedor ? 'Guardando...' : 'Crear y Asignar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Combobox
                        options={opcionesProveedores}
                        value={formData.proveedor_id}
                        onChange={(nuevoValor) => setFormData({ ...formData, proveedor_id: nuevoValor ? String(nuevoValor) : '' })}
                        placeholder="Buscar por nombre comercial, razón social o RUC..."
                        icon={<Building2 size={14} className="text-brand-primary" />}
                      />
                    )}
                  </div>

                  {/* Placa del Vehículo */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Placa del Vehículo <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.placa_id}
                      onChange={(e) => setFormData({ ...formData, placa_id: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none bg-white font-mono"
                    >
                      <option value="">Seleccione Placa...</option>
                      {placas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.placa || p.nombre || `Placa #${p.id}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Responsable (Chofer de Distribución o Usuario Logueado) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider">
                        Responsable <span className="text-rose-500">*</span>
                      </label>
                      {!puedeModificarResponsable && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-semibold">
                          Asignado automáticamente
                        </span>
                      )}
                    </div>
                    <select
                      required
                      disabled={!puedeModificarResponsable}
                      value={formData.responsable_id}
                      onChange={(e) => setFormData({ ...formData, responsable_id: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none ${
                        !puedeModificarResponsable ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'
                      }`}
                    >
                      <option value="">Seleccione Chofer Responsable...</option>
                      {choferesDistribucion.map((u) => {
                        const nombreUser = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                        const esLogueado = u.id === user?.id;
                        return (
                          <option key={u.id} value={u.id}>
                            {nombreUser} ({u.username}){esLogueado ? ' (Tú)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {pasoFormulario === 2 && (
                <div className="space-y-3 animate-fade-in">
                  {/* Tipo de Combustible */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Tipo de Combustible <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tipo_combustible: 'GAS' })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          formData.tipo_combustible === 'GAS'
                            ? 'bg-amber-50 border-amber-500 text-amber-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        GASOLINA (GAS)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tipo_combustible: 'GLP' })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          formData.tipo_combustible === 'GLP'
                            ? 'bg-blue-50 border-blue-500 text-blue-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        GLP
                      </button>
                    </div>
                  </div>

                  {/* Importe Total */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Costo Total (S/) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={formData.total}
                      onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-black text-brand-dark focus:border-brand-primary outline-none"
                    />
                  </div>

                  {/* Comprobante Adjunto */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Comprobante Adjunto (PDF o Imagen)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-200 hover:border-brand-primary/50 rounded-xl cursor-pointer bg-gray-50 hover:bg-white transition-all text-xs font-bold text-gray-600 truncate">
                        <UploadCloud size={16} className="text-brand-primary shrink-0" />
                        <span className="truncate">
                          {formData.adj_gasto instanceof File
                            ? formData.adj_gasto.name
                            : gastoSeleccionado?.adj_gasto
                            ? 'Cambiar comprobante actual'
                            : 'Seleccionar archivo (PDF, JPG, PNG)'}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.jfif"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setFormData({ ...formData, adj_gasto: e.target.files[0] });
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {formData.adj_gasto && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, adj_gasto: null })}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                          title="Quitar archivo"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pie de navegación del modal */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              {pasoFormulario === 1 ? (
                <button
                  type="button"
                  onClick={intentarCerrarModalFormulario}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPasoFormulario(1)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  ← Volver
                </button>
              )}

              {pasoFormulario === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (validarPaso1()) setPasoFormulario(2);
                  }}
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20"
                >
                  Siguiente paso →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={manejarGuardarGasto}
                  disabled={guardando}
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-all flex items-center gap-1.5 shadow-md shadow-amber-600/20 disabled:opacity-50"
                >
                  {guardando ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{gastoSeleccionado ? 'Guardar Cambios' : 'Registrar Combustible'}</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ==================================================================== */}
      {/* MODAL DE IMPORTACIÓN DE EXCEL */}
      {/* ==================================================================== */}
      {modalImportarAbierto && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => !importandoExcel && setModalImportarAbierto(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl border border-gray-100 flex flex-col space-y-4 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-brand-dark">Importar Gastos de Combustible</h3>
                  <span className="text-[10px] text-gray-400 font-bold">Carga masiva vía Excel (.xlsx, .xls)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalImportarAbierto(false)}
                disabled={importandoExcel}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed">
                Seleccione el archivo Excel con las columnas requeridas (fecha_emision, nro_factura, ruc_proveedor, placa, responsable, tipo_combustible, total, etc.).
              </p>

              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl cursor-pointer bg-gray-50 hover:bg-emerald-50/30 transition-all text-center">
                <Upload size={24} className="text-emerald-600 mb-2" />
                <span className="text-xs font-black text-gray-700">
                  {archivoExcelImportar ? archivoExcelImportar.name : 'Haz clic para seleccionar el archivo'}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">Formatos soportados: .xlsx, .xls</span>
                <input
                  ref={inputExcelRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setArchivoExcelImportar(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={importandoExcel}
                onClick={() => setModalImportarAbierto(false)}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold transition-all text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!archivoExcelImportar || importandoExcel}
                onClick={manejarImportarExcel}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {importandoExcel ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <span>Subir e Importar</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ==================================================================== */}
      {/* MODAL DE CONFIRMACIÓN PARA DESCARTAR CAMBIOS AL SALIR */}
      {/* ==================================================================== */}
      {modalConfirmarCerrar && createPortal(
        <div
          className="fixed inset-0 !m-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setModalConfirmarCerrar(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-100 text-center animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={26} />
            </div>
            <h3 className="text-base font-black text-gray-900 mb-1">
              ¿Deseas salir del registro?
            </h3>
            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Tienes datos ingresados en el formulario de combustible. Si sales ahora, se perderá todo tu avance.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalConfirmarCerrar(false)}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold transition-all text-xs"
              >
                Continuar Editando
              </button>
              <button
                type="button"
                onClick={confirmarDescarteYCerrar}
                className="py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/20 transition-all"
              >
                Sí, Salir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ==================================================================== */}
      {/* MODAL DE CONFIRMACIÓN PARA ELIMINAR */}
      {/* ==================================================================== */}
      {modalConfirmarEliminar && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setModalConfirmarEliminar(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-100 text-center animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-gray-900 mb-1">
              ¿Eliminar gasto de combustible?
            </h3>
            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Esta acción no se puede deshacer. Se eliminará el registro de la factura{' '}
              <strong>{modalConfirmarEliminar.nro_factura}</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalConfirmarEliminar(null)}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold transition-all text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={manejarEliminarGasto}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-600/20 transition-all"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ==================================================================== */}
      {/* VISOR MODAL DE COMPROBANTE ADJUNTO */}
      {/* ==================================================================== */}
      {archivoComprobanteVisor && (
        <ModalVisorComprobante
          archivo={archivoComprobanteVisor}
          onClose={() => setArchivoComprobanteVisor(null)}
          titulo="Comprobante de Combustible"
        />
      )}
    </div>
  );
};

export default RegistroCombustibles;

