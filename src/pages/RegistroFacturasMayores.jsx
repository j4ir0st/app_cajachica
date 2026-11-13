import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Receipt,
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
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CreditCard,
  ChevronDown,
  FileSpreadsheet,
  Upload,
  CheckSquare,
  Square
} from 'lucide-react';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { resolverUrlAdjunto } from '../utils/archivoUtil';
import ModalVisorComprobante from '../components/ModalVisorComprobante';
import Combobox from '../components/Combobox';
import Toast from '../components/Toast';
import { useUserStore } from '../store/userStore';
import { CLAVES_CATALOGO, leerDeCache, guardarEnCache } from '../utils/catalogoCache';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ==============================================================================
// FUNCIONES AUXILIARES DE FORMATEO Y VALIDACIÓN
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
// COMPONENTE PRINCIPAL: REGISTRO DE FACTURAS S/. +
// ==============================================================================

const RegistroFacturasMayores = () => {
  // Estados de datos principales
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [paginaActual, setPaginaActual] = useState(1);
  const limitePorPagina = 100; // Top 100

  // Catálogos y Usuarios
  const { user } = useUserStore();
  const [areas, setAreas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);

  // Filtros reactivos (similar a Aprobaciones: PENDIENTES, REVISADOS, ENVIADOS)
  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTipoPago, setFiltroTipoPago] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // 'TODOS' | 'PENDIENTES' | 'REVISADOS' | 'ENVIADOS'
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);

  // Selección de filas y conmutación masiva
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [conmutandoMasivo, setConmutandoMasivo] = useState(false);
  const [conmutandoId, setConmutandoId] = useState(null);

  // Modal y estado de Importación / Exportación Excel
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false);
  const [archivoExcelImportar, setArchivoExcelImportar] = useState(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [descargandoExcel, setDescargandoExcel] = useState(false);

  // Modales
  const [modalFormularioAbierto, setModalFormularioAbierto] = useState(false);
  const [modalConfirmarCerrar, setModalConfirmarCerrar] = useState(false);
  const [pasoFormulario, setPasoFormulario] = useState(1); // Wizard de 2 pasos para no desbordar en móvil
  const [gastoSeleccionado, setGastoSeleccionado] = useState(null);
  const [archivoComprobanteVisor, setArchivoComprobanteVisor] = useState(null);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(null);

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
    area_id: '',
    tipo_pago: 'AL CONTADO',
    fecha_expiracion: '', // Solo se usa y envía si tipo_pago === 'CREDITO'
    monto: '',
    motivo: '',
    detalle: '',
    adjunto: null,
  };

  const [formData, setFormData] = useState(estadoInicialForm);
  const [guardando, setGuardando] = useState(false);

  // Estados para creación rápida de Proveedor dentro del modal
  const [modoCrearProveedor, setModoCrearProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [consultandoRucSunat, setConsultandoRucSunat] = useState(false);
  const [avisoRucProveedor, setAvisoRucProveedor] = useState(null);

  // Estados para creación rápida de Área dentro del modal
  const [modoCrearArea, setModoCrearArea] = useState(false);
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState('');
  const [guardandoArea, setGuardandoArea] = useState(false);

  // ============================================================================
  // CARGA DE DATOS DE API (ÁREAS, PROVEEDORES, OTROS GASTOS)
  // ============================================================================

  /**
   * Carga los catálogos de Proveedores y Áreas de la empresa.
   */
  const cargarCatalogos = useCallback(async () => {
    setCargandoCatalogos(true);
    try {
      const [resProv, resArea] = await Promise.all([
        fetchAuth(`${API_URL}/RC_Proveedor/?top=1000&format=json`),
        fetchAuth(`${API_URL}/RC_Area/?top=1000&format=json`),
      ]);

      if (resProv.ok) {
        const dataProv = await resProv.json();
        setProveedores(dataProv.results || dataProv || []);
      }

      if (resArea.ok) {
        const dataArea = await resArea.json();
        setAreas(dataArea.results || dataArea || []);
      }

      // Catálogo de usuarios (para mostrar nombres en aprobaciones / revisiones)
      const usersEnCache = leerDeCache(CLAVES_CATALOGO.usuarios);
      if (usersEnCache && usersEnCache.length > 0) {
        setUsuarios(usersEnCache);
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
      console.error('[RegistroFacturasMayores] Error al cargar catálogos:', error);
    } finally {
      setCargandoCatalogos(false);
    }
  }, []);

  /**
   * Carga el listado de facturas / otros gastos con filtros aplicados (Top 100).
   */
  const cargarOtrosGastos = useCallback(async (pagina = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagina.toString());
      params.append('format', 'json');
      params.append('top', '100'); // Top 100

      if (busqueda.trim()) {
        params.append('search', busqueda.trim());
      }
      if (filtroArea) {
        params.append('area', filtroArea);
      }
      if (filtroTipoPago) {
        params.append('tipo_pago', filtroTipoPago);
      }

      const respuesta = await fetchAuth(`${API_URL}/RC_OtrosGastos/?${params.toString()}`);
      if (!respuesta.ok) {
        throw new Error(`Error ${respuesta.status} al obtener registros`);
      }

      const data = await respuesta.json();
      const lista = data.results || data || [];
      const listaSegura = Array.isArray(lista) ? lista : [];
      setGastos(listaSegura);
      setTotalRegistros(data.count ?? listaSegura.length);
      setPaginaActual(pagina);
      setSeleccionados(new Set()); // Limpiar selección
    } catch (error) {
      console.error('[RegistroFacturasMayores] Error al cargar facturas:', error);
      mostrarMensaje('No se pudieron cargar los registros de facturas.', 'error');
    } finally {
      setCargando(false);
    }
  }, [busqueda, filtroArea, filtroTipoPago, mostrarMensaje]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    cargarOtrosGastos(1);
  }, [cargarOtrosGastos]);

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

  // Escuchar evento para abrir nueva factura desde el Header
  useEffect(() => {
    const manejarAbrirNuevaFactura = () => {
      abrirModalCrear();
    };

    window.addEventListener('abrir-modal-nueva-factura', manejarAbrirNuevaFactura);
    return () => {
      window.removeEventListener('abrir-modal-nueva-factura', manejarAbrirNuevaFactura);
    };
  }, []);

  // ============================================================================
  // FILTRADO REACTIVO EN MEMORIA Y KPIS DINÁMICOS
  // ============================================================================

  const registrosFiltrados = useMemo(() => {
    return gastos.filter((item) => {
      const esEnviado = Boolean(item.enviado);
      const esRevisado = Boolean(item.revisado);

      if (filtroEstado === 'PENDIENTES') {
        return !esRevisado && !esEnviado;
      }
      if (filtroEstado === 'REVISADOS') {
        return esRevisado && !esEnviado;
      }
      if (filtroEstado === 'ENVIADOS') {
        return esEnviado;
      }
      return true; // TODOS
    });
  }, [gastos, filtroEstado]);

  const metricas = useMemo(() => {
    let totalGeneral = 0;
    let totalContado = 0;
    let totalCredito = 0;

    let pendientesCount = 0;
    let pendientesMonto = 0;

    let revisadosCount = 0;
    let revisadosMonto = 0;

    let enviadosCount = 0;
    let enviadosMonto = 0;

    gastos.forEach((g) => {
      const monto = parseFloat(g.monto) || 0;
      totalGeneral += monto;

      if (g.tipo_pago === 'CREDITO') {
        totalCredito += monto;
      } else {
        totalContado += monto;
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
      totalContado,
      totalCredito,
      pendientesCount,
      pendientesMonto,
      revisadosCount,
      revisadosMonto,
      enviadosCount,
      enviadosMonto,
      cantidad: totalRegistros || gastos.length,
    };
  }, [gastos, totalRegistros]);

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
    setGastos((prev) =>
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

      const res = await fetchAuth(`${API_URL}/RC_OtrosGastos/${item.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoPatch),
      });

      if (!res.ok) {
        // Revertir optimismo
        setGastos((prev) =>
          prev.map((c) =>
            c.id === item.id
              ? {
                  ...c,
                  revisado: valorActual,
                  revisado_por: item.revisado_por,
                  revisado_por_nombre: item.revisado_por_nombre,
                  fecha_revision: item.fecha_revision,
                }
              : c
          )
        );
        throw new Error(await extraerMensajeError(res));
      }
    } catch (err) {
      console.error('[RegistroFacturasMayores] Error al conmutar revisión:', err);
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
    const nombreUsuario = user?.full_name || user?.username;
    setConmutandoMasivo(true);

    // Optimismo inmediato con datos de trazabilidad
    setGastos((prev) =>
      prev.map((c) =>
        idSet.has(c.id)
          ? {
              ...c,
              revisado: marcarComoRevisado,
              revisado_por: marcarComoRevisado ? user?.id : null,
              revisado_por_nombre: marcarComoRevisado ? nombreUsuario : null,
              fecha_revision: marcarComoRevisado ? ahoraIso : null,
            }
          : c
      )
    );

    try {
      const cuerpoMasivo = {
        ids: idsAfectables,
        revisado: marcarComoRevisado,
        revisado_por: marcarComoRevisado ? user?.id : null,
        fecha_revision: marcarComoRevisado ? ahoraIso : null,
      };

      const resMasivo = await fetchAuth(`${API_URL}/RC_OtrosGastos/revisar_masivo/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoMasivo),
      });

      if (!resMasivo.ok) {
        // Fallback: actualizar vía PATCH concurrente individual
        await Promise.all(
          idsAfectables.map((id) =>
            fetchAuth(`${API_URL}/RC_OtrosGastos/${id}/`, {
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
          ? `Se marcaron ${idsAfectables.length} facturas como revisadas.`
          : `Se limpió la revisión de ${idsAfectables.length} facturas.`,
        'success'
      );
    } catch (err) {
      console.error('[RegistroFacturasMayores] Error en revisión masiva:', err);
      mostrarMensaje('Ocurrió un error al procesar la acción masiva.', 'error');
      cargarOtrosGastos(paginaActual);
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
        ? `${API_URL}/RC_OtrosGastos/descargar_excel/?${params.toString()}`
        : `${API_URL}/RC_OtrosGastos/descargar_excel/`;

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
      let nombreArchivo = `Reporte_FacturasMayores_${new Date().toISOString().split('T')[0]}.xlsx`;
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
      await cargarOtrosGastos(paginaActual); // Recargar para reflejar enviado=true
    } catch (err) {
      console.error('[RegistroFacturasMayores] Error al exportar Excel:', err);
      mostrarMensaje(err.message || 'Error al exportar facturas a Excel.', 'error');
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

      const res = await fetchAuth(`${API_URL}/RC_OtrosGastos/importar_excel/`, {
        method: 'POST',
        body: cuerpo,
      });

      if (!res.ok) {
        throw new Error(await extraerMensajeError(res));
      }

      const resultado = await res.json().catch(() => ({}));
      const creados = resultado.creados || resultado.cantidad || 'varias';
      mostrarMensaje(`Se importaron ${creados} facturas correctamente.`, 'success', 'Importación Completada');
      setModalImportarAbierto(false);
      setArchivoExcelImportar(null);
      await cargarOtrosGastos(1);
    } catch (err) {
      console.error('[RegistroFacturasMayores] Error al importar Excel:', err);
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
  // ACCIONES DE FORMULARIO (CREAR / EDITAR / ELIMINAR)
  // ============================================================================

  /**
   * Abre el modal para registrar una nueva factura.
   */
  const abrirModalCrear = () => {
    setGastoSeleccionado(null);
    setFormData(estadoInicialForm);
    setPasoFormulario(1);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '' });
    setAvisoRucProveedor(null);
    setModoCrearArea(false);
    setModalFormularioAbierto(true);
  };

  /**
   * Abre el modal para editar una factura existente.
   */
  const abrirModalEditar = (gasto) => {
    setGastoSeleccionado(gasto);
    const idProv = gasto.proveedor?.id || extraerId(gasto.proveedor) || '';
    const idArea = gasto.area?.id || extraerId(gasto.area) || '';

    setFormData({
      nro_factura: gasto.nro_factura || '',
      fecha_emision: gasto.fecha_emision || '',
      proveedor_id: idProv.toString(),
      area_id: idArea.toString(),
      tipo_pago: gasto.tipo_pago || 'AL CONTADO',
      fecha_expiracion: gasto.fecha_expiracion || '',
      monto: gasto.monto || '',
      motivo: gasto.motivo || '',
      detalle: gasto.detalle || '',
      adjunto: null,
    });
    setPasoFormulario(1);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '' });
    setAvisoRucProveedor(null);
    setModoCrearArea(false);
    setModalFormularioAbierto(true);
  };

  /**
   * Determina si el formulario contiene información ingresada por el usuario.
   */
  const formularioTieneDatos = useCallback(() => {
    if (gastoSeleccionado) {
      // En modo edición verificamos si hubo algún cambio relevante
      return true;
    }
    return Boolean(
      formData.nro_factura.trim() ||
      formData.proveedor_id ||
      formData.area_id ||
      (formData.monto && formData.monto !== '') ||
      formData.motivo.trim() ||
      formData.detalle.trim() ||
      formData.adjunto ||
      nuevoProveedor.nro_ruc.trim() ||
      nuevoProveedor.razon_social.trim()
    );
  }, [formData, gastoSeleccionado, nuevoProveedor]);

  /**
   * Intenta cerrar el modal del formulario. Si hay datos, pide confirmación.
   */
  const intentarCerrarModalFormulario = () => {
    if (formularioTieneDatos()) {
      setModalConfirmarCerrar(true);
    } else {
      setModalFormularioAbierto(false);
    }
  };

  /**
   * Confirma descartar cambios y cerrar el modal.
   */
  const confirmarDescarteYCerrar = () => {
    setModalConfirmarCerrar(false);
    setModalFormularioAbierto(false);
    setFormData(estadoInicialForm);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
  };
  const validarPaso1 = () => {
    if (!formData.nro_factura.trim()) {
      mostrarMensaje('El número de factura o comprobante es obligatorio.', 'error');
      return false;
    }
    if (!formData.proveedor_id) {
      mostrarMensaje('Debe seleccionar un proveedor.', 'error');
      return false;
    }
    if (!formData.area_id) {
      mostrarMensaje('Debe asignar el área encargada del gasto.', 'error');
      return false;
    }
    return true;
  };

  /**
   * Envía el formulario para guardar o actualizar la factura en DRF.
   */
  const manejarGuardarGasto = async (e) => {
    if (e) e.preventDefault();

    if (!validarPaso1()) {
      setPasoFormulario(1);
      return;
    }

    const montoNumerico = parseFloat(formData.monto);
    if (isNaN(montoNumerico) || montoNumerico <= 0) {
      mostrarMensaje('Ingrese un monto válido mayor a 0.', 'error');
      setPasoFormulario(2);
      return;
    }
    if (!formData.motivo.trim()) {
      mostrarMensaje('Ingrese el motivo o concepto del gasto.', 'error');
      setPasoFormulario(2);
      return;
    }
    if (!formData.detalle.trim()) {
      mostrarMensaje('El campo DETALLE / GLOSA es obligatorio.', 'error');
      setPasoFormulario(2);
      return;
    }

    setGuardando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append('nro_factura', formData.nro_factura.trim().toUpperCase());
      cuerpo.append('fecha_emision', formData.fecha_emision);
      cuerpo.append('proveedor', formData.proveedor_id);
      cuerpo.append('area', formData.area_id);
      cuerpo.append('tipo_pago', formData.tipo_pago);
      cuerpo.append('monto', montoNumerico.toFixed(2));
      cuerpo.append('motivo', formData.motivo.trim());
      cuerpo.append('detalle', formData.detalle.trim());

      // Solo enviar fecha_expiracion si es crédito; de lo contrario omitir / vacío
      if (formData.tipo_pago === 'CREDITO' && formData.fecha_expiracion) {
        cuerpo.append('fecha_expiracion', formData.fecha_expiracion);
      }

      if (formData.adjunto instanceof File) {
        cuerpo.append('adjunto', formData.adjunto);
      }

      let urlPeticion = `${API_URL}/RC_OtrosGastos/`;
      let metodo = 'POST';

      if (gastoSeleccionado?.id) {
        urlPeticion = `${API_URL}/RC_OtrosGastos/${gastoSeleccionado.id}/`;
        metodo = 'PATCH';
      }

      const respuesta = await fetchAuth(urlPeticion, {
        method: metodo,
        body: cuerpo,
      });

      if (!respuesta.ok) {
        const errorData = await respuesta.json().catch(() => ({}));
        throw new Error(extraerMensajeError(errorData, 'No se pudo guardar la factura.'));
      }

      mostrarMensaje(
        gastoSeleccionado ? 'Factura actualizada con éxito.' : 'Factura registrada con éxito.',
        'success'
      );
      setModalFormularioAbierto(false);
      cargarOtrosGastos(paginaActual);
    } catch (error) {
      console.error('[RegistroFacturasMayores] Error al guardar factura:', error);
      mostrarMensaje(error.message || 'Error al guardar factura.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Elimina un registro de factura seleccionado.
   */
  const manejarEliminarGasto = async () => {
    if (!modalConfirmarEliminar?.id) return;
    try {
      const respuesta = await fetchAuth(`${API_URL}/RC_OtrosGastos/${modalConfirmarEliminar.id}/`, {
        method: 'DELETE',
      });

      if (!respuesta.ok && respuesta.status !== 204) {
        throw new Error('No se pudo eliminar el registro.');
      }

      mostrarMensaje('Factura eliminada correctamente.', 'success');
      setModalConfirmarEliminar(null);
      cargarOtrosGastos(paginaActual);
    } catch (error) {
      console.error('[RegistroFacturasMayores] Error al eliminar:', error);
      mostrarMensaje(error.message || 'Error al eliminar factura.', 'error');
    }
  };

  /**
   * Consulta automática de RUC en SUNAT (a través de OpenRUC) al crear un nuevo proveedor.
   * Regla institucional:
   * - Si empieza con 20: consulta automática y autocompleta la Razón Social.
   * - Si empieza con 10 (persona natural): advierte que la API solo soporta RUC 20 y permite ingreso manual.
   * - Si es un RUC interno propio (Surgicorp / RR Medical): alerta de advertencia.
   */
  const consultarRucProveedorSunat = async (ruc) => {
    const rucLimpio = String(ruc || '').trim();
    if (rucLimpio.length !== 11) return;

    // Validación de empresas propias (Surgicorp / RR Medical)
    const RUCS_PROPIOS = {
      '20516920123': 'SURGICORP S.R.L.',
      '20522608417': 'RR MEDICAL S.R.L.',
    };
    if (RUCS_PROPIOS[rucLimpio]) {
      setAvisoRucProveedor({
        tipo: 'error',
        texto: `El RUC ingresado pertenece a ${RUCS_PROPIOS[rucLimpio]}. Debe ingresar el RUC del proveedor externo.`,
      });
      return;
    }

    // RUC 10: Persona Natural
    if (rucLimpio.startsWith('10')) {
      setAvisoRucProveedor({
        tipo: 'advertencia',
        texto: 'La API de SUNAT solo permite consultar RUC 20 (Personas Jurídicas). Ingrese la Razón Social o Nombre de manera manual.',
      });
      return;
    }

    // RUC 20: Persona Jurídica
    if (rucLimpio.startsWith('20')) {
      setConsultandoRucSunat(true);
      setAvisoRucProveedor(null);
      try {
        const res = await fetch(`https://openruc.com/api/ruc/${rucLimpio}`);
        if (res.ok) {
          const datos = await res.json();
          if (datos && datos.razon_social) {
            const rz = String(datos.razon_social).trim();
            setNuevoProveedor((prev) => ({ ...prev, razon_social: rz }));
            setAvisoRucProveedor({
              tipo: 'exito',
              texto: `SUNAT: ${rz}`,
            });
          } else {
            setAvisoRucProveedor({
              tipo: 'error',
              texto: 'No se obtuvo razón social de SUNAT. Ingrésela manualmente.',
            });
          }
        } else {
          setAvisoRucProveedor({
            tipo: 'error',
            texto: 'No se encontró información en SUNAT para este RUC. Ingrese la razón social manualmente.',
          });
        }
      } catch (err) {
        console.warn('[RegistroFacturasMayores] Error al consultar SUNAT:', err);
        setAvisoRucProveedor({
          tipo: 'error',
          texto: 'Error de conexión con SUNAT. Ingrese la razón social manualmente.',
        });
      } finally {
        setConsultandoRucSunat(false);
      }
      return;
    }

    // Otros prefijos
    setAvisoRucProveedor({
      tipo: 'advertencia',
      texto: 'RUC con prefijo no estándar. Por favor ingrese la razón social manualmente.',
    });
  };

  /**
   * Creación rápida de proveedor desde el formulario.
   */
  const manejarCrearProveedorRapido = async (e) => {
    e.preventDefault();
    if (!nuevoProveedor.nro_ruc.trim() || !nuevoProveedor.razon_social.trim()) {
      mostrarMensaje('Ingrese el RUC y la Razón Social del proveedor.', 'error');
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
        const errorData = await res.json().catch(() => ({}));
        throw new Error(extraerMensajeError(errorData, 'No se pudo registrar el proveedor.'));
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

  /**
   * Creación rápida de área desde el formulario.
   */
  const manejarCrearAreaRapida = async (e) => {
    e.preventDefault();
    if (!nuevaAreaNombre.trim()) {
      mostrarMensaje('Ingrese el nombre del área.', 'error');
      return;
    }

    setGuardandoArea(true);
    try {
      const res = await fetchAuth(`${API_URL}/RC_Area/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevaAreaNombre.trim().toUpperCase(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(extraerMensajeError(errorData, 'No se pudo registrar el área.'));
      }

      const areaCreada = await res.json();
      setAreas((prev) => [areaCreada, ...prev]);
      setFormData((prev) => ({ ...prev, area_id: areaCreada.id.toString() }));
      setModoCrearArea(false);
      setNuevaAreaNombre('');
      mostrarMensaje('Área creada y asignada.', 'success');
    } catch (error) {
      mostrarMensaje(error.message || 'Error al crear área.', 'error');
    } finally {
      setGuardandoArea(false);
    }
  };

  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-6rem)] flex flex-col pt-3 pb-3 px-4 md:px-8 space-y-2.5 animate-fade-in font-outfit w-full overflow-hidden relative">
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
      {/* ENCABEZADO PRINCIPAL (FIJO, CONSISTENTE CON CIERRE DE CAJA) */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">
            Registro de Facturas S/. +
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
            Facturas mayores a S/ 400 y gastos de servicios directos o al crédito corporativo.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Importar Excel */}
          <button
            type="button"
            onClick={() => setModalImportarAbierto(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-gray-200 hover:border-brand-primary text-gray-700 hover:text-brand-primary text-xs font-bold shadow-xs hover:scale-102 active:scale-98 transition-all"
            title="Importar facturas desde Excel (.xlsx)"
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
                ? `Exportar ${seleccionados.size} facturas seleccionadas`
                : 'Exportar facturas revisadas pendientes de envío'
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

          <button
            onClick={() => cargarOtrosGastos(paginaActual)}
            disabled={cargando}
            className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-sm"
            title="Recargar listado"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin text-brand-primary' : ''} />
          </button>

          <button
            onClick={abrirModalCrear}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-brand-primary hover:bg-brand-secondary text-white text-xs font-black shadow-md shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nueva Factura</span>
            <span className="sm:hidden">Factura</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PANEL SUPERIOR DE KPIS DINÁMICOS Y ACCIONES MASIVAS */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm shrink-0 space-y-2.5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {/* KPI 1: Total Facturado */}
          <div
            onClick={() => setFiltroEstado('TODOS')}
            className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
              filtroEstado === 'TODOS'
                ? 'bg-brand-light/70 border-brand-primary ring-2 ring-brand-primary/20'
                : 'bg-brand-light/30 border-gray-100 hover:border-brand-primary/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                Total Facturas
              </span>
              <span className="text-[10px] font-bold text-brand-primary bg-white px-2 py-0.5 rounded-md border border-gray-100">
                {metricas.cantidad} reg.
              </span>
            </div>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-black text-brand-dark">
                {formatearSoles(metricas.totalGeneral)}
              </span>
              <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 mt-0.5">
                <span>Contado: {formatearSoles(metricas.totalContado)}</span>
                <span>•</span>
                <span>Crédito: {formatearSoles(metricas.totalCredito)}</span>
              </div>
            </div>
          </div>

          {/* KPI 2: Falta Revisar (Pendientes) */}
          <div
            onClick={() => setFiltroEstado('PENDIENTES')}
            className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
              filtroEstado === 'PENDIENTES'
                ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/30'
                : 'bg-amber-50/70 border-amber-100 hover:border-amber-300'
            }`}
            title="Filtrar facturas pendientes de revisión"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                Falta Revisar
              </span>
              <span className="text-[10px] font-black text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                {metricas.pendientesCount} reg.
              </span>
            </div>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-black text-amber-600">
                {formatearSoles(metricas.pendientesMonto)}
              </span>
              <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
                Pendientes de visto bueno
              </span>
            </div>
          </div>

          {/* KPI 3: Revisados (Listos para enviar o exportar) */}
          <div
            onClick={() => setFiltroEstado('REVISADOS')}
            className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
              filtroEstado === 'REVISADOS'
                ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-400/30'
                : 'bg-emerald-50/70 border-emerald-100 hover:border-emerald-300'
            }`}
            title="Filtrar facturas revisadas listas para descargar"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                Revisados Listos
              </span>
              <span className="text-[10px] font-black text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                {metricas.revisadosCount} reg.
              </span>
            </div>
            <div className="mt-1">
              <span className="text-base sm:text-lg font-black text-emerald-600">
                {formatearSoles(metricas.revisadosMonto)}
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                Listos para Excel o envío
              </span>
            </div>
          </div>

          {/* KPI 4: Enviados / Histórico y Acciones Masivas */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex flex-col justify-between">
            <div
              onClick={() => setFiltroEstado('ENVIADOS')}
              className="flex items-center justify-between cursor-pointer"
              title="Filtrar facturas ya enviadas o descargadas"
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
            <div className="flex items-center gap-1.5 mt-0.5">
              <button
                type="button"
                onClick={() => handleRevisarMasivo(true)}
                disabled={conmutandoMasivo || metricas.pendientesCount === 0}
                className="flex-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-lg transition-all disabled:opacity-40 truncate shadow-xs"
                title="Marcar todas las facturas pendientes como revisadas (excluye enviadas)"
              >
                {conmutandoMasivo ? 'Procesando...' : 'Revisar Todo'}
              </button>

              <button
                type="button"
                onClick={() => handleRevisarMasivo(false)}
                disabled={conmutandoMasivo || metricas.revisadosCount === 0}
                className="py-1 px-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-[10px] rounded-lg transition-all disabled:opacity-40 truncate"
                title="Limpiar revisión de las facturas revisadas no enviadas"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* BUSCADOR Y FILTROS COMPACTOS */}
      {/* ==================================================================== */}
      <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-gray-100 shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          {/* Selector de estado rápido (Pestañas similar a Aprobaciones) */}
          <div className="flex items-center bg-gray-100/80 p-0.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setFiltroEstado('TODOS')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filtroEstado === 'TODOS' ? 'bg-white text-brand-dark shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Todos ({gastos.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstado('PENDIENTES')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filtroEstado === 'PENDIENTES' ? 'bg-amber-500 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Falta Revisar ({metricas.pendientesCount})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstado('REVISADOS')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filtroEstado === 'REVISADOS' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Revisados ({metricas.revisadosCount})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstado('ENVIADOS')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filtroEstado === 'ENVIADOS' ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Enviados ({metricas.enviadosCount})
            </button>
          </div>

          {/* Campo de búsqueda */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por N° Factura, RUC, Proveedor o motivo..."
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

        {/* Acciones derechas: Filtros y Selección */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-primary outline-none bg-white"
          >
            <option value="">Área: Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>

          <select
            value={filtroTipoPago}
            onChange={(e) => setFiltroTipoPago(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-primary outline-none bg-white"
          >
            <option value="">Pago: Todos</option>
            <option value="AL CONTADO">Al Contado</option>
            <option value="CREDITO">Crédito</option>
          </select>

          <button
            type="button"
            onClick={seleccionarTodosVisibles}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700"
            title="Seleccionar o deseleccionar todas las facturas visibles"
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
      {/* LISTADO RESPONSIVO SCROLLABLE (TARJETAS EN MÓVIL, FILAS EN DESKTOP) */}
      {/* ==================================================================== */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 pb-2">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-9 h-9 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cargando facturas mayores...
            </span>
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center text-brand-primary">
              <Receipt size={24} />
            </div>
            <h3 className="text-sm font-black text-brand-dark">No se encontraron facturas registradas</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              {busqueda.trim() || filtroEstado !== 'TODOS'
                ? 'Prueba modificando los filtros o el texto de búsqueda.'
                : 'Presione "+ Nueva Factura" para registrar facturas mayores a S/ 400.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {registrosFiltrados.map((g) => {
              const estaSeleccionado = seleccionados.has(g.id);
              const esEnviado = Boolean(g.enviado);
              const esRevisado = Boolean(g.revisado);
              const razonProv = g.proveedor?.razon_social || 'Proveedor';
              const rucProv = g.proveedor?.nro_ruc || '';
              const nombreArea = g.area?.nombre || 'General';
              const esCredito = g.tipo_pago === 'CREDITO';
              const montoNum = parseFloat(g.monto) || 0;

              const nombreRevisor = obtenerNombreUsuario(g.revisado_por, usuarios) || g.revisado_por_nombre || '';
              const detalleRevision = esRevisado && (g.fecha_revision || nombreRevisor)
                ? `Revisado por ${nombreRevisor || 'Gerencia'}${g.fecha_revision ? ` - ${formatearFechaHora(g.fecha_revision)}` : ''}`
                : '';
              const detalleEnvio = esEnviado && (g.fecha_envio || g.enviado_por)
                ? `Enviado${g.enviado_por ? ` por ${obtenerNombreUsuario(g.enviado_por, usuarios) || g.enviado_por}` : ''}${g.fecha_envio ? ` - ${formatearFechaHora(g.fecha_envio)}` : ''}`
                : '';

              return (
                <div
                  key={g.id}
                  className={`p-3 rounded-2xl border transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    estaSeleccionado
                      ? 'bg-brand-light/40 border-brand-primary'
                      : 'bg-white hover:bg-blue-50/20 border-gray-100 hover:border-brand-primary/30'
                  }`}
                >
                  {/* Info principal: Checkbox, Ícono, N° Factura, Proveedor y Área */}
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => alternarSeleccion(g.id)}
                      className="mt-1 text-gray-400 hover:text-brand-primary"
                    >
                      {estaSeleccionado ? (
                        <CheckSquare size={16} className="text-brand-primary" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Receipt size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-brand-dark tracking-tight">
                          {g.nro_factura}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                            esCredito
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {g.tipo_pago}
                        </span>
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {nombreArea}
                        </span>
                        {esEnviado && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800"
                            title={detalleEnvio || 'Factura enviada / exportada'}
                          >
                            ENVIADO / EXPORTADO
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-gray-800 truncate mt-0.5" title={razonProv}>
                        {razonProv} {rucProv && <span className="text-gray-400 font-mono text-[11px]">({rucProv})</span>}
                      </div>

                      <div className="text-[11px] text-gray-500 truncate mt-0.5" title={g.motivo}>
                        {g.motivo}
                      </div>

                      {/* Fechas de emisión y vencimiento en caso de crédito */}
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                        <span>Emisión: {formatearFecha(g.fecha_emision)}</span>
                        {esCredito && g.fecha_expiracion && (
                          <span className="text-rose-600 font-bold">
                            Vence: {formatearFecha(g.fecha_expiracion)}
                          </span>
                        )}
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

                  {/* Lado derecho: Monto, Estado Revisado y Botones de acción */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                    <div className="text-left sm:text-right">
                      <span className="text-xs sm:text-sm font-black text-brand-dark">
                        {formatearSoles(montoNum)}
                      </span>
                    </div>

                    {/* Botón Switch de Revisión */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleRevisado(g, e)}
                      disabled={esEnviado || conmutandoId === g.id || conmutandoMasivo}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                        esEnviado
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : esRevisado
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                      }`}
                      title={
                        esEnviado
                          ? (detalleEnvio || 'Factura ya enviada/descargada')
                          : esRevisado
                          ? (detalleRevision ? `${detalleRevision} • Clic para desmarcar` : 'Clic para desmarcar revisión')
                          : 'Clic para marcar como revisada'
                      }
                    >
                      {conmutandoId === g.id ? (
                        <RefreshCw size={13} className="animate-spin text-amber-600" />
                      ) : esRevisado ? (
                        <CheckCircle2 size={13} className="text-emerald-600" />
                      ) : (
                        <Clock size={13} className="text-amber-600" />
                      )}
                      <span>{esRevisado ? 'Revisado' : 'Falta Revisar'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {g.adjunto ? (
                        <button
                          type="button"
                          onClick={() => setArchivoComprobanteVisor(g.adjunto)}
                          className="p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                          title="Ver comprobante adjunto"
                        >
                          <Eye size={16} />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 px-1">—</span>
                      )}

                      {!esEnviado && (
                        <>
                          <button
                            type="button"
                            onClick={() => abrirModalEditar(g)}
                            className="p-1.5 text-gray-500 hover:text-brand-primary hover:bg-gray-100 rounded-lg transition-colors"
                            title="Editar factura"
                          >
                            <Edit2 size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setModalConfirmarEliminar(g)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar factura"
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
          <span>{gastos.length} de {totalRegistros} facturas</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => cargarOtrosGastos(paginaActual - 1)}
              disabled={paginaActual <= 1 || cargando}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="font-bold text-gray-700">Pág. {paginaActual}</span>
            <button
              onClick={() => cargarOtrosGastos(paginaActual + 1)}
              disabled={paginaActual * limitePorPagina >= totalRegistros || cargando}
              className="p-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL RESPONSIVO CON ASISTENTE POR PASOS (MOBILE-FIRST) */}
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
                <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-xl">
                  <Receipt size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-brand-dark">
                    {gastoSeleccionado ? 'Editar Factura' : 'Registro de Factura S/. +'}
                  </h3>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Paso {pasoFormulario} de 2: {pasoFormulario === 1 ? 'Datos del Comprobante' : 'Monto y Justificación'}
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

            {/* Indicador de pasos visual tipo Stepper */}
            <div className="grid grid-cols-2 gap-1 p-2 bg-gray-50/70 border-b border-gray-100 text-center text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setPasoFormulario(1)}
                className={`py-1.5 rounded-lg transition-all ${
                  pasoFormulario === 1
                    ? 'bg-brand-primary text-white shadow-xs'
                    : 'text-gray-500 hover:text-brand-dark'
                }`}
              >
                1. Comprobante & Entidades
              </button>
              <button
                type="button"
                onClick={() => {
                  if (validarPaso1()) setPasoFormulario(2);
                }}
                className={`py-1.5 rounded-lg transition-all ${
                  pasoFormulario === 2
                    ? 'bg-brand-primary text-white shadow-xs'
                    : 'text-gray-500 hover:text-brand-dark'
                }`}
              >
                2. Importe & Sustento
              </button>
            </div>

            {/* Contenido del formulario con scroll interno independiente */}
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
                      onChange={(e) => setFormData({ ...formData, nro_factura: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-wider focus:border-brand-primary outline-none"
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
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none bg-white"
                    />
                  </div>

                  {/* Proveedor */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider">
                        Proveedor <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setModoCrearProveedor(!modoCrearProveedor)}
                        className="text-[10px] font-bold text-brand-primary hover:underline"
                      >
                        {modoCrearProveedor ? 'Cancelar' : '+ Nuevo Proveedor'}
                      </button>
                    </div>

                    {modoCrearProveedor ? (
                      <div className="p-3 bg-brand-light/60 border border-brand-primary/20 rounded-xl space-y-2.5 animate-fade-in">
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

                        {/* Campo Opcional: Nombre Comercial */}
                        <div>
                          <input
                            type="text"
                            placeholder="Nombre Comercial (Opcional)"
                            value={nuevoProveedor.nombre_comercial}
                            onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombre_comercial: e.target.value.toUpperCase() })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none uppercase focus:border-brand-primary bg-white"
                          />
                        </div>

                        {/* Mensaje de consulta SUNAT o advertencia */}
                        {avisoRucProveedor && (
                          <div
                            className={`p-2 rounded-lg border text-[11px] font-semibold leading-relaxed animate-fade-in flex items-start gap-1.5 ${
                              avisoRucProveedor.tipo === 'error'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : avisoRucProveedor.tipo === 'advertencia'
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

                  {/* Área Encargada */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider">
                        Área Encargada <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setModoCrearArea(!modoCrearArea)}
                        className="text-[10px] font-bold text-brand-primary hover:underline"
                      >
                        {modoCrearArea ? 'Cancelar' : '+ Nueva Área'}
                      </button>
                    </div>

                    {modoCrearArea ? (
                      <div className="p-2.5 bg-brand-light/60 border border-brand-primary/20 rounded-xl space-y-2 animate-fade-in">
                        <input
                          type="text"
                          placeholder="Nombre del Área"
                          value={nuevaAreaNombre}
                          onChange={(e) => setNuevaAreaNombre(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none uppercase"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={manejarCrearAreaRapida}
                            disabled={guardandoArea}
                            className="px-3 py-1 bg-brand-primary text-white rounded-lg text-xs font-bold hover:bg-brand-secondary transition-all"
                          >
                            {guardandoArea ? 'Guardando...' : 'Crear y Asignar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <select
                        required
                        value={formData.area_id}
                        onChange={(e) => setFormData({ ...formData, area_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none bg-white"
                      >
                        <option value="">Seleccione Área...</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {pasoFormulario === 2 && (
                <div className="space-y-3 animate-fade-in">
                  {/* Tipo de Pago */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Tipo de Pago <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tipo_pago: 'AL CONTADO', fecha_expiracion: '' })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          formData.tipo_pago === 'AL CONTADO'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        AL CONTADO
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, tipo_pago: 'CREDITO' })}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          formData.tipo_pago === 'CREDITO'
                            ? 'bg-rose-50 border-rose-500 text-rose-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        CRÉDITO
                      </button>
                    </div>
                  </div>

                  {/* Fecha de Expiración (SOLO SI ES CRÉDITO) */}
                  {formData.tipo_pago === 'CREDITO' && (
                    <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl animate-fade-in">
                      <label className="block text-[11px] font-black text-rose-900 uppercase tracking-wider mb-1">
                        Fecha de Expiración / Vencimiento <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.fecha_expiracion}
                        onChange={(e) => setFormData({ ...formData, fecha_expiracion: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-rose-300 text-xs font-bold focus:border-rose-500 outline-none bg-white"
                      />
                      <span className="text-[10px] text-rose-700 font-semibold block mt-1">
                        Campo obligatorio únicamente para facturas a crédito corporativo.
                      </span>
                    </div>
                  )}

                  {/* Monto Total */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Monto Total (S/) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={formData.monto}
                      onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-black text-brand-dark focus:border-brand-primary outline-none"
                    />
                    {parseFloat(formData.monto) > 0 && parseFloat(formData.monto) < 400 && (
                      <span className="text-[10px] text-amber-600 font-semibold block mt-1">
                        Nota: Menor a S/ 400 (se registra aquí si es servicio directo o crédito corporativo).
                      </span>
                    )}
                  </div>

                  {/* Motivo / Concepto */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Motivo / Concepto <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Servicio de mensajería, Mantenimiento..."
                      value={formData.motivo}
                      onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none"
                    />
                  </div>

                  {/* Detalle / Glosa */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      DETALLE / GLOSA <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required
                      placeholder="Ingrese el detalle o glosa de la factura (obligatorio)..."
                      value={formData.detalle}
                      onChange={(e) => setFormData({ ...formData, detalle: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:border-brand-primary outline-none resize-none font-medium"
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
                          {formData.adjunto instanceof File
                            ? formData.adjunto.name
                            : gastoSeleccionado?.adjunto
                            ? 'Cambiar comprobante actual'
                            : 'Seleccionar archivo'}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.jfif"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setFormData({ ...formData, adjunto: e.target.files[0] });
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {formData.adjunto && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, adjunto: null })}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer con botones de navegación / guardado */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              {pasoFormulario === 1 ? (
                <button
                  type="button"
                  onClick={() => setModalFormularioAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-white transition-all"
                >
                  Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPasoFormulario(1)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-white transition-all flex items-center gap-1"
                >
                  <ChevronLeft size={14} />
                  <span>Anterior</span>
                </button>
              )}

              {pasoFormulario === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (validarPaso1()) setPasoFormulario(2);
                  }}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:bg-brand-secondary transition-all flex items-center gap-1 shadow-xs"
                >
                  <span>Siguiente</span>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={manejarGuardarGasto}
                  disabled={guardando}
                  className="px-5 py-2 rounded-xl bg-brand-primary text-white text-xs font-black hover:bg-brand-secondary transition-all flex items-center gap-1.5 shadow-md shadow-brand-primary/20 disabled:opacity-50"
                >
                  {guardando ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{gastoSeleccionado ? 'Guardar Cambios' : 'Registrar Factura'}</span>
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
                  <h3 className="text-sm font-black text-brand-dark">Importar Facturas S/. +</h3>
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
                Seleccione el archivo Excel con las columnas requeridas (nro_factura, fecha_emision, ruc_proveedor, area, tipo_pago, monto, motivo, etc.).
              </p>

              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 hover:border-emerald-500 rounded-2xl cursor-pointer bg-gray-50 hover:bg-emerald-50/30 transition-all text-center">
                <Upload size={24} className="text-emerald-600 mb-2" />
                <span className="text-xs font-black text-gray-700">
                  {archivoExcelImportar ? archivoExcelImportar.name : 'Haz clic para seleccionar el archivo'}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">Formatos soportados: .xlsx, .xls</span>
                <input
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
      {/* MODAL DE CONFIRMACIÓN PARA DESCARTAR Y CERRAR */}
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
              Tienes datos ingresados en el formulario. Si sales ahora, se perderá todo tu avance.
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
              ¿Eliminar factura {modalConfirmarEliminar.nro_factura}?
            </h3>
            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Esta acción no se puede deshacer. Se eliminará el registro de este gasto y su comprobante asociado.
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
          titulo="Comprobante de Factura"
        />
      )}
    </div>
  );
};

export default RegistroFacturasMayores;
