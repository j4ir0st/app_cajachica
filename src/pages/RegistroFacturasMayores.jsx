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
  ChevronDown
} from 'lucide-react';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { resolverUrlAdjunto } from '../utils/archivoUtil';
import ModalVisorComprobante from '../components/ModalVisorComprobante';
import Toast from '../components/Toast';

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
// COMPONENTE PRINCIPAL: REGISTRO DE FACTURAS S/. +
// ==============================================================================

const RegistroFacturasMayores = () => {
  // Estados de datos principales
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [paginaActual, setPaginaActual] = useState(1);
  const limitePorPagina = 60; // Paginación por defecto de Django

  // Catálogos
  const [areas, setAreas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);

  // Filtros reactivos
  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTipoPago, setFiltroTipoPago] = useState('');
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false);

  // Modales
  const [modalFormularioAbierto, setModalFormularioAbierto] = useState(false);
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
    } catch (error) {
      console.error('[RegistroFacturasMayores] Error al cargar catálogos:', error);
    } finally {
      setCargandoCatalogos(false);
    }
  }, []);

  /**
   * Carga el listado de facturas / otros gastos con filtros aplicados.
   */
  const cargarOtrosGastos = useCallback(async (pagina = 1) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagina.toString());
      params.append('format', 'json');

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
      setGastos(Array.isArray(lista) ? lista : []);
      setTotalRegistros(data.count ?? (Array.isArray(data) ? data.length : 0));
      setPaginaActual(pagina);
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

  // ============================================================================
  // CÁLCULOS Y RESÚMENES (KPIS)
  // ============================================================================

  const metricas = useMemo(() => {
    let totalGeneral = 0;
    let totalContado = 0;
    let totalCredito = 0;

    gastos.forEach((g) => {
      const monto = parseFloat(g.monto) || 0;
      totalGeneral += monto;
      if (g.tipo_pago === 'CREDITO') {
        totalCredito += monto;
      } else {
        totalContado += monto;
      }
    });

    return {
      totalGeneral,
      totalContado,
      totalCredito,
      cantidad: totalRegistros || gastos.length,
    };
  }, [gastos, totalRegistros]);

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
   * Valida el paso 1 antes de avanzar al paso 2.
   */
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
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">
            Registro de Facturas S/. +
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
            Facturas mayores a S/ 400 y gastos de servicios directos o al crédito corporativo.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
      {/* PANEL SUPERIOR DE KPIS FINANCIEROS (ADAPTABLE MÓVIL / DESKTOP) */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-100 shadow-sm shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {/* Total Facturado */}
          <div className="bg-brand-light/70 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Total Facturado
            </span>
            <span className="text-sm sm:text-base font-black text-brand-dark">
              {formatearSoles(metricas.totalGeneral)}
            </span>
          </div>

          {/* Al Contado */}
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
              Al Contado
            </span>
            <span className="text-sm sm:text-base font-black text-emerald-800">
              {formatearSoles(metricas.totalContado)}
            </span>
          </div>

          {/* A Crédito */}
          <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
              A Crédito
            </span>
            <span className="text-sm sm:text-base font-black text-amber-800">
              {formatearSoles(metricas.totalCredito)}
            </span>
          </div>

          {/* Cantidad */}
          <div className="bg-gray-50 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Comprobantes
            </span>
            <span className="text-sm sm:text-base font-black text-brand-secondary">
              {metricas.cantidad} <span className="text-[10px] font-normal text-gray-400">regs</span>
            </span>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* BUSCADOR Y FILTROS COMPACTOS */}
      {/* ==================================================================== */}
      <div className="bg-white px-3 py-2 rounded-2xl border border-gray-100 shadow-sm shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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

          <button
            type="button"
            onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              filtroArea || filtroTipoPago || mostrarFiltrosAvanzados
                ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Filter size={13} />
            <span className="hidden sm:inline">Filtros</span>
            {(filtroArea || filtroTipoPago) && (
              <span className="w-2 h-2 rounded-full bg-brand-primary"></span>
            )}
          </button>
        </div>

        {/* Desplegable de filtros en móvil / desktop */}
        {mostrarFiltrosAvanzados && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-gray-100 animate-fade-in">
            <select
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-primary outline-none bg-white"
            >
              <option value="">Todas las Áreas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>

            <select
              value={filtroTipoPago}
              onChange={(e) => setFiltroTipoPago(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold focus:border-brand-primary outline-none bg-white"
            >
              <option value="">Todos los Tipos de Pago</option>
              <option value="AL CONTADO">AL CONTADO</option>
              <option value="CREDITO">CRÉDITO</option>
            </select>
          </div>
        )}
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
        ) : gastos.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center text-brand-primary">
              <Receipt size={24} />
            </div>
            <h3 className="text-sm font-black text-brand-dark">No se encontraron facturas registradas</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              Presione "+ Nueva Factura" para registrar facturas mayores a S/ 400 o gastos de servicios directos.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {gastos.map((g) => {
              const razonProv = g.proveedor?.razon_social || 'Proveedor';
              const rucProv = g.proveedor?.nro_ruc || '';
              const nombreArea = g.area?.nombre || 'General';
              const esCredito = g.tipo_pago === 'CREDITO';
              const montoNum = parseFloat(g.monto) || 0;

              return (
                <div
                  key={g.id}
                  className="p-3 bg-white hover:bg-blue-50/20 rounded-2xl border border-gray-100 hover:border-brand-primary/30 transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* Info principal: N° Factura, Proveedor y Área */}
                  <div className="flex items-start gap-3 min-w-0">
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
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {g.tipo_pago}
                        </span>
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          {nombreArea}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-gray-800 truncate mt-0.5" title={razonProv}>
                        {razonProv} {rucProv && <span className="text-gray-400 font-mono text-[11px]">({rucProv})</span>}
                      </div>

                      <div className="text-[11px] text-gray-500 truncate mt-0.5" title={g.motivo}>
                        {g.motivo}
                      </div>
                    </div>
                  </div>

                  {/* Lado derecho: Monto, Fecha y Botones de acción */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                        {formatearFecha(g.fecha_emision)}
                      </span>
                      <span className="text-xs sm:text-sm font-black text-brand-dark">
                        {formatearSoles(montoNum)}
                      </span>
                    </div>

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
          onClick={() => setModalFormularioAbierto(false)}
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
                onClick={() => setModalFormularioAbierto(false)}
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
                      <select
                        required
                        value={formData.proveedor_id}
                        onChange={(e) => setFormData({ ...formData, proveedor_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold focus:border-brand-primary outline-none bg-white"
                      >
                        <option value="">Seleccione Proveedor...</option>
                        {proveedores.map((p) => {
                          const nombrePrincipal = p.nombre_comercial || p.razon_social;
                          const detalleSecundario = p.nombre_comercial ? ` (${p.razon_social} - ${p.nro_ruc || ''})` : (p.nro_ruc ? ` (${p.nro_ruc})` : '');
                          return (
                            <option key={p.id} value={p.id}>
                              {nombrePrincipal}{detalleSecundario}
                            </option>
                          );
                        })}
                      </select>
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
                        onClick={() => setFormData({ ...formData, tipo_pago: 'AL CONTADO' })}
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
                            ? 'bg-amber-50 border-amber-500 text-amber-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        CRÉDITO
                      </button>
                    </div>
                  </div>

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

                  {/* Detalle Explicativo */}
                  <div>
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                      Detalle Explicativo (Opcional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Observaciones adicionales o justificación..."
                      value={formData.detalle}
                      onChange={(e) => setFormData({ ...formData, detalle: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:border-brand-primary outline-none resize-none"
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
