import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Trash2,
  Image,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Camera,
  MapPin,
  Car,
  Receipt,
  FileText,
  DollarSign,
  Tag,
  Building,
  Edit2,
  X,
  Upload,
  Eye,
  Loader2
} from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { useCatalogoStore } from '../../store/catalogoStore';
import { fetchAuth } from '../../utils/fetchAuth';
import { obtenerTipoCaja, LISTA_EMPRESAS } from '../../utils/tipoCaja';
import { esArchivoPdf } from '../../utils/archivoUtil';
import ModalVisorComprobante from '../ModalVisorComprobante';
import Combobox from '../Combobox';
import { formatearNombreEntidad, formatearSubtituloEntidad, esEntidadValidaEntrega } from '../../utils/entidades';
import { filtrarSubgastosPorPerfil } from '../../utils/reglasAccesos';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ============================================================================
// CONSTANTES Y CONFIGURACIONES
// ============================================================================

const OPCIONES_ZONA = [
  { valor: 'L', etiqueta: 'Lima' },
  { valor: 'P', etiqueta: 'Provincia' },
];

const PASOS_WIZARD = [
  { id: 1, titulo: 'Concepto', descripcion: 'Tipo y subgasto' },
  { id: 2, titulo: 'Monto y Zona', descripcion: 'Importe y ubicación' },
  { id: 3, titulo: 'Datos Específicos', descripcion: 'Comprobante y ruta' },
  { id: 4, titulo: 'Comprobante', descripcion: 'Foto y descripción' },
];

// Detalle en blanco para iniciar el formulario
const obtenerDetalleVacio = () => ({
  tipogasto_url: null,
  subgasto_url: null,
  subgasto_obj: null,
  lima_provincia: 'L',
  provincia_url: null,
  empresa_id: null,
  nro_factura: '',
  nro_ruc: '',
  razon_social: '',
  placa_id: null,
  placa: '',
  placa_nombre: '',
  origen_url: null,
  destino_url: null,
  costo: '',
  detalle: '',
  fecha_gasto: new Date().toISOString().split('T')[0],
  adj_cajachica: null,
  _preview: null,
});

// ============================================================================
// REGLAS DE ACCESOS Y VISIBILIDAD POR ÁREA Y PUESTO
// Implementadas en ../../utils/reglasAccesos.js según "ACCESOS OPCIONES CAJA CHICA.xlsx"
// ============================================================================

/**
 * Extrae un ID numérico de una URL o valor.
 */
const extraerIdDeUrl = (idOUri) => {
  if (!idOUri) return null;
  if (typeof idOUri === 'number') return idOUri;
  if (typeof idOUri === 'string') {
    const partes = idOUri.split('/').filter(Boolean);
    const ultimo = partes[partes.length - 1];
    const num = parseInt(ultimo, 10);
    return isNaN(num) ? null : num;
  }
  return null;
};

/**
 * Compara dos URLs o identificadores de forma robusta.
 */
const coincidenUrlsOIds = (url1, url2) => {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  const id1 = extraerIdDeUrl(url1);
  const id2 = extraerIdDeUrl(url2);
  return id1 !== null && id2 !== null && id1 === id2;
};

/**
 * Normaliza cadenas de texto para comparaciones seguras de nombres (sin acentos, minúsculas, sin espacios extra).
 */
const normalizarTexto = (texto) => {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/**
 * Determina si una unidad de transporte corresponde a una Minivan según el chofer o la placa.
 */
const esPlacaMinivan = (placaItem) => {
  if (!placaItem) return false;
  const textoChofer = normalizarTexto(placaItem.chofer).replace(/[-\s]/g, '');
  const textoPlaca = normalizarTexto(placaItem.placa).replace(/[-\s]/g, '');
  return textoChofer.includes('minivan') || textoPlaca.includes('minivan');
};

/**
 * Determina si el registro de la placa corresponde al chofer del usuario en sesión.
 */
const esChoferDelUsuario = (placaItem, user) => {
  if (!placaItem || !user) return false;

  // 1. Verificación por ID si está disponible
  if (placaItem.chofer_id && String(placaItem.chofer_id) === String(user.id)) return true;
  if (typeof placaItem.chofer === 'number' && String(placaItem.chofer) === String(user.id)) return true;
  if (typeof placaItem.chofer === 'object' && placaItem.chofer?.id && String(placaItem.chofer.id) === String(user.id)) return true;

  const textoChofer = normalizarTexto(
    typeof placaItem.chofer === 'object'
      ? (placaItem.chofer?.full_name || placaItem.chofer?.nombre || `${placaItem.chofer?.first_name || ''} ${placaItem.chofer?.last_name || ''}`)
      : placaItem.chofer
  );

  // Si no hay texto o es explícitamente "minivan", no es chofer personal
  if (!textoChofer || textoChofer.replace(/[-\s]/g, '').includes('minivan')) return false;

  // 2. Candidatos de nombres del usuario autenticado
  const candidatosUsuario = [
    normalizarTexto(user.username),
    normalizarTexto(user.full_name),
    normalizarTexto(user.nombre),
    normalizarTexto(`${user.first_name || ''} ${user.last_name || ''}`),
    normalizarTexto(`${user.last_name || ''} ${user.first_name || ''}`),
    user.email ? normalizarTexto(user.email.split('@')[0]) : null,
  ].filter(Boolean);

  // Coincidencia exacta
  if (candidatosUsuario.some((cand) => cand === textoChofer)) return true;

  // Coincidencia por username si tiene longitud suficiente
  if (user.username && user.username.length >= 3 && textoChofer.includes(normalizarTexto(user.username))) {
    return true;
  }

  // Coincidencia por palabras completas (ej: "JUAN PEREZ" coincidiendo con "JUAN CARLOS PEREZ GOMEZ")
  const tokensChofer = textoChofer.split(/\s+/).filter((t) => t.length >= 3);
  if (tokensChofer.length >= 2) {
    for (const cand of candidatosUsuario) {
      if (tokensChofer.every((tok) => cand.includes(tok))) return true;
    }
  }

  const tokensUsuario = [
    normalizarTexto(user.first_name),
    normalizarTexto(user.last_name),
  ].filter((t) => t && t.length >= 3);
  if (tokensUsuario.length >= 2) {
    if (tokensUsuario.every((tok) => textoChofer.includes(tok))) return true;
  }

  return false;
};

// ============================================================================
// COMPONENTE PRINCIPAL: STEP 2 DETALLES
// ============================================================================

/**
 * Paso 2: Registro guiado de comprobantes de gasto con sub-wizard móvil y reglas reactivas.
 */
const Step2Detalles = ({ detalles, onChangeDetalles, onEliminarDetalle, montoLimite }) => {
  const { user } = useUserStore();
  const { tiposGasto, subgastos, entidades, provincias, empresas, placas, cargando, error: errorCatalogo, cargarCatalogos } = useCatalogoStore();

  const listaEmpresasDisponibles = useMemo(() => {
    return Array.isArray(empresas) && empresas.length > 0 ? empresas : LISTA_EMPRESAS;
  }, [empresas]);

  const [formulario, setFormulario] = useState(obtenerDetalleVacio());
  const [pasoWizard, setPasoWizard] = useState(1);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [errorLocal, setErrorLocal] = useState('');
  const [archivoVisor, setArchivoVisor] = useState(null);
  const [consultandoRuc, setConsultandoRuc] = useState(false);
  const [mensajeRuc, setMensajeRuc] = useState(null);
  const [mostrarCampoManualRazonSocial, setMostrarCampoManualRazonSocial] = useState(false);

  const referenciaCamara = useRef(null);
  const referenciaArchivo = useRef(null);

  // Carga reactiva de catálogos si no están presentes en memoria
  React.useEffect(() => {
    if ((!tiposGasto || tiposGasto.length === 0 || !subgastos || subgastos.length === 0) && cargarCatalogos) {
      cargarCatalogos();
    }
  }, [tiposGasto, subgastos, cargarCatalogos]);

  // Subgastos visibles según la matriz de accesos por Área y Puesto (ACCESOS OPCIONES CAJA CHICA.xlsx)
  const subgastosDisponibles = useMemo(() => {
    return filtrarSubgastosPorPerfil(subgastos, user, tiposGasto);
  }, [subgastos, user, tiposGasto]);

  // Tipos de gasto disponibles (vinculados a los subgastos o catálogo completo)
  const tiposGastoDisponibles = useMemo(() => {
    if (!Array.isArray(tiposGasto) || tiposGasto.length === 0) return [];
    if (!subgastosDisponibles || subgastosDisponibles.length === 0) return tiposGasto;

    const tiposConSubgasto = tiposGasto.filter((t) => {
      const tipoUrl = t.url || (t.id ? `${API_URL}/RC_TipoGasto/${t.id}/` : null);
      return subgastosDisponibles.some((s) => {
        const sTipoUrl = s.tipogasto_id?.url || s.tipogasto_id;
        return coincidenUrlsOIds(tipoUrl, sTipoUrl);
      });
    });

    return tiposConSubgasto.length > 0 ? tiposConSubgasto : tiposGasto;
  }, [tiposGasto, subgastosDisponibles]);

  // Subgastos filtrados por el tipo de gasto actualmente seleccionado
  const subgastosPorTipo = useMemo(() => {
    if (!formulario.tipogasto_url) return [];
    return subgastosDisponibles.filter((s) => {
      const tipoUrl = s.tipogasto_id?.url || s.tipogasto_id;
      return coincidenUrlsOIds(tipoUrl, formulario.tipogasto_url);
    });
  }, [formulario.tipogasto_url, subgastosDisponibles]);

  // Valor normalizado para el select de Tipo de Gasto
  const valorTipoSeleccionado = useMemo(() => {
    if (!formulario.tipogasto_url) return '';
    const match = tiposGastoDisponibles.find((t) => coincidenUrlsOIds(t.url, formulario.tipogasto_url));
    return match?.url || formulario.tipogasto_url;
  }, [formulario.tipogasto_url, tiposGastoDisponibles]);

  // Valor normalizado para el select de Subgasto
  const valorSubgastoSeleccionado = useMemo(() => {
    if (!formulario.subgasto_url) return '';
    const match = subgastosPorTipo.find((s) => coincidenUrlsOIds(s.url, formulario.subgasto_url));
    return match?.url || formulario.subgasto_url;
  }, [formulario.subgasto_url, subgastosPorTipo]);

  // Objeto completo del subgasto activo seleccionado
  const subgastoActivo = useMemo(() => {
    if (!formulario.subgasto_url && !formulario.subgasto_obj) return null;
    return (
      subgastos.find(
        (s) =>
          coincidenUrlsOIds(s.url, formulario.subgasto_url) ||
          (formulario.subgasto_obj?.id && s.id === formulario.subgasto_obj.id)
      ) ||
      formulario.subgasto_obj ||
      null
    );
  }, [formulario.subgasto_url, formulario.subgasto_obj, subgastos]);

  // Opciones formateadas para Combobox tipo PowerApps
  const opcionesSubgasto = useMemo(() => {
    return subgastosPorTipo.map((s) => ({
      value: s.url,
      label: s.nombre,
      sublabel: s.mensaje_detalle || '',
    }));
  }, [subgastosPorTipo]);

  const opcionesProvincias = useMemo(() => {
    return provincias.map((p) => ({
      value: p.url,
      label: p.nombre,
      sublabel: p.departamento ? `Dpto: ${p.departamento}` : '',
    }));
  }, [provincias]);

  const opcionesEntidades = useMemo(() => {
    return (entidades || [])
      .filter(esEntidadValidaEntrega)
      .map((e) => ({
        value: e.url,
        label: formatearNombreEntidad(e),
        sublabel: formatearSubtituloEntidad(e),
        busquedaExtra: `${e.ruc || ''} ${e.razon_social || ''} ${e.sede || ''} ${e.codigo_sede || ''}`,
      }));
  }, [entidades]);

  // Determinar si el usuario en sesión está registrado como chofer en rc_placas
  const placaDelUsuario = useMemo(() => {
    if (!user || !Array.isArray(placas) || placas.length === 0) return null;
    return placas.find((p) => esChoferDelUsuario(p, user)) || null;
  }, [placas, user]);

  // Opciones de placas: Si el usuario = chofer se incluye su placa; si no, solo las que tienen chofer = minivan
  const opcionesPlacas = useMemo(() => {
    if (!Array.isArray(placas) || placas.length === 0) return [];

    let lista = [];
    if (placaDelUsuario) {
      const minivans = placas.filter((p) => p.id !== placaDelUsuario.id && esPlacaMinivan(p));
      lista = [placaDelUsuario, ...minivans];
    } else {
      lista = placas.filter(esPlacaMinivan);
      // Fallback si no hay registros clasificados como minivan para no bloquear el formulario
      if (lista.length === 0) {
        lista = placas;
      }
    }

    // Si se está editando un registro existente, asegurar que la placa previa esté presente en las opciones
    if (formulario.placa_id && !lista.some((p) => p.id === formulario.placa_id || String(p.id) === String(formulario.placa_id))) {
      const previa = placas.find((p) => p.id === formulario.placa_id || String(p.id) === String(formulario.placa_id));
      if (previa) {
        lista = [previa, ...lista];
      }
    }

    return lista.map((p) => ({
      value: p.id,
      label: p.placa || `Placa #${p.id}`,
      sublabel: p.chofer ? `Chofer: ${p.chofer}` : '',
      busquedaExtra: `${p.placa || ''} ${p.chofer || ''}`,
      raw: p,
    }));
  }, [placas, placaDelUsuario, formulario.placa_id]);

  // ============================================================================
  // MANEJADORES DE CAMBIO Y REGLAS REACTIVAS DEL FORMULARIO
  // ============================================================================

  const manejarCambio = (campo, valor) => {
    setErrorLocal('');
    setFormulario((prev) => ({ ...prev, [campo]: valor }));
  };

  const seleccionarPlaca = (val, opt) => {
    setErrorLocal('');
    if (!val) {
      setFormulario((prev) => ({
        ...prev,
        placa_id: null,
        placa: '',
        placa_nombre: '',
      }));
      return;
    }
    const placaItem = opt?.raw || (placas || []).find((p) => p.id === val || String(p.id) === String(val));
    const placaTexto = placaItem?.placa || '';
    const placaNombre = placaItem ? (placaItem.chofer ? `${placaItem.placa} - ${placaItem.chofer}` : placaItem.placa) : '';
    setFormulario((prev) => ({
      ...prev,
      placa_id: val,
      placa: placaTexto,
      placa_nombre: placaNombre,
    }));
  };

  const seleccionarTipoGasto = (tipoUrl) => {
    setErrorLocal('');
    const subFiltrados = subgastosDisponibles.filter((s) => {
      const tUrl = s.tipogasto_id?.url || s.tipogasto_id;
      return coincidenUrlsOIds(tUrl, tipoUrl);
    });

    // Si solo hay un subgasto disponible para este tipo, se auto-selecciona
    if (subFiltrados.length === 1) {
      seleccionarSubGasto(subFiltrados[0].url, tipoUrl);
    } else {
      setFormulario((prev) => ({
        ...prev,
        tipogasto_url: tipoUrl,
        subgasto_url: null,
        subgasto_obj: null,
      }));
    }
  };

  const seleccionarSubGasto = (subgastoUrl, tipoUrlOverride = null) => {
    setErrorLocal('');
    const subEncontrado = subgastos.find((s) => s.url === subgastoUrl);
    if (!subEncontrado) return;

    const tipoUrl = tipoUrlOverride || subEncontrado.tipogasto_id?.url || subEncontrado.tipogasto_id;

    // Regla Reactiva de Localidad Permitida ('L', 'P', 'A')
    let zonaCalculada = formulario.lima_provincia;
    if (subEncontrado.localidad_permitida === 'L') {
      zonaCalculada = 'L';
    } else if (subEncontrado.localidad_permitida === 'P') {
      zonaCalculada = 'P';
    }

    setFormulario((prev) => ({
      ...prev,
      tipogasto_url: tipoUrl || prev.tipogasto_url,
      subgasto_url: subgastoUrl,
      subgasto_obj: subEncontrado,
      lima_provincia: zonaCalculada,
      provincia_url: zonaCalculada === 'L' ? null : prev.provincia_url,
      origen_url: subEncontrado.requiere_origen_destino || subEncontrado.requiere_entidad ? prev.origen_url : null,
      destino_url: subEncontrado.requiere_origen_destino ? prev.destino_url : null,
      placa_id: subEncontrado.requiere_placa
        ? (placaDelUsuario ? placaDelUsuario.id : prev.placa_id)
        : null,
      placa: subEncontrado.requiere_placa
        ? (placaDelUsuario ? (placaDelUsuario.placa || '') : prev.placa)
        : '',
      placa_nombre: subEncontrado.requiere_placa
        ? (placaDelUsuario
            ? (placaDelUsuario.chofer ? `${placaDelUsuario.placa} - ${placaDelUsuario.chofer}` : placaDelUsuario.placa)
            : prev.placa_nombre)
        : '',
      nro_ruc: subEncontrado.requiere_comprobante ? prev.nro_ruc : '',
      nro_factura: subEncontrado.requiere_comprobante ? prev.nro_factura : '',
    }));
  };

  const manejarArchivo = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorLocal('');
    const esPdf = esArchivoPdf(archivo);
    const vistaPrevia = URL.createObjectURL(archivo);
    setFormulario((prev) => ({
      ...prev,
      adj_cajachica: archivo,
      _preview: vistaPrevia,
      _esPdf: esPdf,
    }));
  };

  // Consulta automática de RUC en openruc.com (solo soporta RUC 20)
  const consultarRucOpenRuc = async (ruc) => {
    const rucLimpio = String(ruc || '').trim();
    if (rucLimpio.length !== 11) return;

    // RUC 10: Persona Natural (OpenRUC responde 404 out_of_scope)
    if (rucLimpio.startsWith('10')) {
      setMensajeRuc({
        tipo: 'advertencia',
        texto: 'OpenRUC solo consulta RUC 20 (Personas Jurídicas). Por favor, ingrese la razón social o nombre manualmente.',
      });
      setMostrarCampoManualRazonSocial(true);
      return;
    }

    // RUC 20: Persona Jurídica
    if (rucLimpio.startsWith('20')) {
      setConsultandoRuc(true);
      setMensajeRuc(null);
      try {
        const respuesta = await fetch(`https://openruc.com/api/ruc/${rucLimpio}`);
        if (respuesta.ok) {
          const datos = await respuesta.json();
          if (datos && datos.razon_social) {
            const rz = String(datos.razon_social).trim();
            setFormulario((prev) => ({
              ...prev,
              razon_social: rz,
            }));
            setMensajeRuc({
              tipo: 'exito',
              texto: rz,
            });
            setMostrarCampoManualRazonSocial(false);
          } else {
            setMensajeRuc({
              tipo: 'error',
              texto: 'No se obtuvo razón social de SUNAT. Ingrésela manualmente.',
            });
            setMostrarCampoManualRazonSocial(true);
          }
        } else {
          setMensajeRuc({
            tipo: 'error',
            texto: 'No se encontró información para este RUC en OpenRUC. Ingrese la razón social manualmente.',
          });
          setMostrarCampoManualRazonSocial(true);
        }
      } catch (err) {
        console.warn('[OpenRUC] Error en consulta:', err);
        setMensajeRuc({
          tipo: 'error',
          texto: 'Error al consultar OpenRUC. Ingrese la razón social manualmente.',
        });
        setMostrarCampoManualRazonSocial(true);
      } finally {
        setConsultandoRuc(false);
      }
      return;
    }

    // Prefijos distintos de 10 o 20
    setMensajeRuc({
      tipo: 'advertencia',
      texto: 'RUC no estándar para consulta automática. Ingrese la razón social manualmente.',
    });
    setMostrarCampoManualRazonSocial(true);
  };

  // Auto-selección automática de placa si el subgasto exige placa y el usuario = chofer
  React.useEffect(() => {
    if (modalAbierto && subgastoActivo?.requiere_placa && placaDelUsuario) {
      if (!formulario.placa_id) {
        setFormulario((prev) => ({
          ...prev,
          placa_id: placaDelUsuario.id,
          placa: placaDelUsuario.placa || '',
          placa_nombre: placaDelUsuario.chofer
            ? `${placaDelUsuario.placa} - ${placaDelUsuario.chofer}`
            : placaDelUsuario.placa,
        }));
      }
    }
  }, [modalAbierto, subgastoActivo?.requiere_placa, placaDelUsuario, formulario.placa_id]);

  // ============================================================================
  // VALIDACIONES INMEDIATAS DEL FRONTEND
  // ============================================================================

  const validarPasoWizard = (paso) => {
    setErrorLocal('');
    if (paso === 1) {
      if (!formulario.tipogasto_url) {
        setErrorLocal('Debe seleccionar un Tipo de Gasto.');
        return false;
      }
      if (!formulario.subgasto_url) {
        setErrorLocal('Debe seleccionar un Subgasto / Concepto.');
        return false;
      }
      return true;
    }

    if (paso === 2) {
      const costoNum = parseFloat(formulario.costo);
      if (!formulario.costo || isNaN(costoNum) || costoNum <= 0) {
        setErrorLocal('Ingrese un importe válido mayor a S/ 0.00.');
        return false;
      }
      if (formulario.lima_provincia === 'P' && !formulario.provincia_url) {
        setErrorLocal('Debe seleccionar la provincia correspondiente al gasto.');
        return false;
      }
      return true;
    }

    if (paso === 3) {
      if (!subgastoActivo) return true;

      if (subgastoActivo.requiere_comprobante) {
        if (!formulario.nro_ruc || formulario.nro_ruc.trim().length !== 11) {
          setErrorLocal('El RUC es obligatorio y debe contener exactamente 11 dígitos numéricos.');
          return false;
        }
        if (!formulario.razon_social || formulario.razon_social.trim() === '') {
          setMostrarCampoManualRazonSocial(true);
          setErrorLocal('Debe ingresar la razón social o nombre de la empresa emisora.');
          return false;
        }
        if (!formulario.nro_factura || formulario.nro_factura.trim() === '') {
          setErrorLocal('El número de comprobante/factura es obligatorio.');
          return false;
        }
      }

      if (subgastoActivo.requiere_placa) {
        if (!formulario.placa_id && (!formulario.placa || formulario.placa.trim().length < 3)) {
          setErrorLocal('Debe seleccionar la unidad de transporte (placa).');
          return false;
        }
      }

      if (subgastoActivo.requiere_origen_destino) {
        if (!formulario.origen_url) {
          setErrorLocal('Debe seleccionar la sede u origen del traslado.');
          return false;
        }
        if (!formulario.destino_url) {
          setErrorLocal('Debe seleccionar la sede o destino del traslado.');
          return false;
        }
      } else if (subgastoActivo.requiere_entidad) {
        if (!formulario.origen_url) {
          setErrorLocal('Debe seleccionar la entidad o sede correspondiente al gasto.');
          return false;
        }
      }
      return true;
    }

    if (paso === 4) {
      if (subgastoActivo?.requiere_detalle && (!formulario.detalle || formulario.detalle.trim() === '')) {
        setErrorLocal('La descripción detallada es obligatoria para este concepto.');
        return false;
      }
      return true;
    }

    return true;
  };

  const avanzarPasoWizard = () => {
    if (validarPasoWizard(pasoWizard)) {
      setPasoWizard((p) => Math.min(4, p + 1));
    }
  };

  const retrocederPasoWizard = () => {
    setErrorLocal('');
    setPasoWizard((p) => Math.max(1, p - 1));
  };

  // ============================================================================
  // GESTIÓN DE LÍNEAS DE GASTO
  // ============================================================================

  const totalActual = useMemo(() => {
    return detalles.reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);
  }, [detalles]);

  const superaLimite = montoLimite && totalActual > parseFloat(montoLimite);

  const abrirModalNuevo = () => {
    if (referenciaCamara.current) {
      referenciaCamara.current.value = '';
    }
    if (referenciaArchivo.current) {
      referenciaArchivo.current.value = '';
    }
    const nuevo = obtenerDetalleVacio();
    if (placaDelUsuario) {
      nuevo.placa_id = placaDelUsuario.id;
      nuevo.placa = placaDelUsuario.placa || '';
      nuevo.placa_nombre = placaDelUsuario.chofer
        ? `${placaDelUsuario.placa} - ${placaDelUsuario.chofer}`
        : placaDelUsuario.placa;
    }
    setFormulario(nuevo);
    setEditandoIdx(null);
    setPasoWizard(1);
    setErrorLocal('');
    setConsultandoRuc(false);
    setMensajeRuc(null);
    setMostrarCampoManualRazonSocial(false);
    setModalAbierto(true);
  };

  const abrirModalEdicion = (idx) => {
    if (referenciaCamara.current) {
      referenciaCamara.current.value = '';
    }
    if (referenciaArchivo.current) {
      referenciaArchivo.current.value = '';
    }
    const item = detalles[idx];
    const sub = subgastos.find(
      (s) =>
        coincidenUrlsOIds(s.url, item.subgasto_url) ||
        (item.subgasto_obj?.id && s.id === item.subgasto_obj.id)
    ) || item.subgasto_obj;

    const tipoUrl =
      item.tipogasto_url ||
      sub?.tipogasto_id?.url ||
      (sub?.tipogasto_id?.id ? `${API_URL}/RC_TipoGasto/${sub.tipogasto_id.id}/` : null) ||
      sub?.tipogasto_id;

    let placaId = item.placa_id;
    let placaTexto = item.placa || '';
    let placaNombre = item.placa_nombre || '';

    if (!placaId && placaTexto && Array.isArray(placas)) {
      const matchPlaca = placas.find((p) => (p.placa || '').toUpperCase() === placaTexto.toUpperCase());
      if (matchPlaca) {
        placaId = matchPlaca.id;
        placaTexto = matchPlaca.placa;
        placaNombre = matchPlaca.chofer ? `${matchPlaca.placa} - ${matchPlaca.chofer}` : matchPlaca.placa;
      }
    } else if (placaId && !placaNombre && Array.isArray(placas)) {
      const matchPlaca = placas.find((p) => p.id === placaId || String(p.id) === String(placaId));
      if (matchPlaca) {
        placaTexto = matchPlaca.placa;
        placaNombre = matchPlaca.chofer ? `${matchPlaca.placa} - ${matchPlaca.chofer}` : matchPlaca.placa;
      }
    }

    setFormulario({
      ...item,
      razon_social: item.razon_social || '',
      placa_id: placaId || null,
      placa: placaTexto,
      placa_nombre: placaNombre,
      tipogasto_url: tipoUrl || item.tipogasto_url,
      subgasto_url: item.subgasto_url || sub?.url,
      subgasto_obj: sub || item.subgasto_obj,
    });
    setEditandoIdx(idx);
    setPasoWizard(1);
    setErrorLocal('');
    setConsultandoRuc(false);
    setMensajeRuc(null);
    setMostrarCampoManualRazonSocial(!item.razon_social && !!item.nro_ruc);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (referenciaCamara.current) {
      referenciaCamara.current.value = '';
    }
    if (referenciaArchivo.current) {
      referenciaArchivo.current.value = '';
    }
    setModalAbierto(false);
    setFormulario(obtenerDetalleVacio());
    setEditandoIdx(null);
    setErrorLocal('');
    setConsultandoRuc(false);
    setMensajeRuc(null);
    setMostrarCampoManualRazonSocial(false);
  };

  const guardarLineaGasto = () => {
    for (let p = 1; p <= 4; p++) {
      if (!validarPasoWizard(p)) {
        setPasoWizard(p);
        return;
      }
    }

    // Validación de presupuesto límite
    if (montoLimite) {
      const costoNuevo = parseFloat(formulario.costo) || 0;
      const totalSinActual = editandoIdx !== null
        ? totalActual - (parseFloat(detalles[editandoIdx]?.costo) || 0)
        : totalActual;

      if (totalSinActual + costoNuevo > parseFloat(montoLimite)) {
        setErrorLocal(`El monto total (S/ ${(totalSinActual + costoNuevo).toFixed(2)}) excede el presupuesto solicitado (S/ ${parseFloat(montoLimite).toFixed(2)}).`);
        setPasoWizard(2);
        return;
      }
    }

    const nuevosDetalles = [...detalles];
    if (editandoIdx !== null) {
      const idExistente = detalles[editandoIdx]?.id || extraerIdDeUrl(detalles[editandoIdx]?.url);
      const urlExistente = detalles[editandoIdx]?.url;
      nuevosDetalles[editandoIdx] = {
        ...formulario,
        id: idExistente,
        url: urlExistente,
      };
    } else {
      nuevosDetalles.push(formulario);
    }

    onChangeDetalles(nuevosDetalles);
    cerrarModal();
  };

  const eliminarLinea = async (idx) => {
    if (onEliminarDetalle) {
      await onEliminarDetalle(idx);
    } else {
      const det = detalles[idx];
      const idDetalle = det?.id || extraerIdDeUrl(det?.url);
      if (idDetalle) {
        try {
          await fetchAuth(`${API_URL}/RC_Detalle/${idDetalle}/?format=json`, {
            method: 'DELETE',
          });
        } catch (err) {
          console.error(`Error al eliminar comprobante #${idDetalle}:`, err);
        }
      }
      onChangeDetalles(detalles.filter((_, i) => i !== idx));
    }
  };

  // ============================================================================
  // RENDERIZADO
  // ============================================================================

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center h-48 space-y-3">
        <div className="w-10 h-10 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cargando catálogos de gasto...</span>
      </div>
    );
  }

  const errorMostrar = errorLocal || errorCatalogo;

  return (
    <div className="space-y-4 animate-fade-in font-outfit pb-4">
      {/* Cabecera del Paso 2 (Idéntica estructura y altura que Paso 1 y Paso 3) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h2 className="text-lg font-black text-brand-dark tracking-tight">Comprobantes de Gasto</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {detalles.length === 0
              ? 'Aún no ha registrado ningún gasto. Presione el botón para agregar.'
              : `${detalles.length} comprobante(s) registrado(s)`}
          </p>
        </div>

        {/* Resumen de Presupuesto Compacto */}
        <div className="flex items-center justify-between sm:justify-end gap-3 bg-brand-light/70 px-3.5 py-1.5 rounded-xl border border-brand-primary/15 self-start sm:self-auto">
          <div className="text-left sm:text-right">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Total Acumulado</span>
            <span className={`text-xs font-black ${superaLimite ? 'text-red-500' : 'text-brand-primary'}`}>
              S/ {totalActual.toFixed(2)}
            </span>
          </div>
          {montoLimite && (
            <div className="border-l border-gray-200 pl-3 text-left sm:text-right">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Límite Solicitado</span>
              <span className="text-xs font-bold text-gray-600">S/ {parseFloat(montoLimite).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Botón Principal para Agregar Gasto (Móvil First) */}
      <button
        type="button"
        onClick={abrirModalNuevo}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-black text-sm rounded-2xl shadow-lg shadow-brand-primary/20 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
      >
        <Plus size={18} strokeWidth={3} />
        AGREGAR DETALLE DE GASTO
      </button>

      {/* Aviso si existen gastos registrados sin comprobante */}
      {detalles.some((d) => !d.adj_cajachica && !d._preview) && (
        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p>
            <span className="font-bold">Aviso:</span> Tiene comprobantes pendientes de adjuntar. Puede guardar la solicitud como <strong>Borrador</strong>, pero para <strong>Liquidar</strong> se debe actualizar el registro con el adjunto correspondiente.
          </p>
        </div>
      )}

      {/* Lista de Comprobantes Registrados (Tarjetas para Móvil) */}
      {detalles.length > 0 ? (
        <div className="space-y-3">
          {detalles.map((det, idx) => {
            const sub = subgastos.find((s) => coincidenUrlsOIds(s.url, det.subgasto_url)) || det.subgasto_obj;
            const tipo = tiposGasto.find((t) => coincidenUrlsOIds(t.url, det.tipogasto_url));
            const prov = provincias.find((p) => coincidenUrlsOIds(p.url, det.provincia_url));
            const orig = entidades.find((e) => coincidenUrlsOIds(e.url, det.origen_url));
            const dest = entidades.find((e) => coincidenUrlsOIds(e.url, det.destino_url));

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-brand-primary/30 transition-all flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {det._preview || det.adj_cajachica ? (
                      <button
                        type="button"
                        onClick={() => setArchivoVisor(det._preview || det.adj_cajachica)}
                        className="group/thumb relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 hover:opacity-90 transition-opacity bg-white"
                        title="Ver comprobante completo"
                      >
                        {esArchivoPdf(det.adj_cajachica, det._preview) ? (
                          <div className="w-full h-full bg-red-50 text-red-600 flex flex-col items-center justify-center font-bold">
                            <FileText size={20} />
                            <span className="text-[8px] font-black uppercase tracking-wider mt-0.5">PDF</span>
                          </div>
                        ) : (
                          <img
                            src={det._preview || (typeof det.adj_cajachica === 'string' ? det.adj_cajachica : '')}
                            alt="Comprobante"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div className="absolute inset-0 bg-brand-dark/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Eye size={16} />
                        </div>
                      </button>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-black shrink-0">
                        <Receipt size={22} />
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-light text-brand-primary inline-block mb-1">
                        {tipo?.nombre || 'Gasto'}
                      </span>
                      <h4 className="text-sm font-black text-brand-dark leading-snug">
                        {sub?.nombre || det.detalle || 'Comprobante de gasto'}
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">{det.detalle || 'Sin descripción adicional'}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-brand-dark block">
                      S/ {parseFloat(det.costo || 0).toFixed(2)}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">{det.fecha_gasto}</span>
                  </div>
                </div>

                {/* Etiquetas de Información Específica */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-50 text-[11px]">
                  {!det.adj_cajachica && !det._preview && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                      <AlertCircle size={11} className="text-amber-500" />
                      Sin comprobante (Obligatorio para liquidar)
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md font-semibold flex items-center gap-1">
                    <MapPin size={11} className="text-brand-primary" />
                    {det.lima_provincia === 'L' ? 'Lima' : `Provincia (${prov?.nombre || '—'})`}
                  </span>

                  {/* Badge de Tipo de Caja del comprobante */}
                  {(() => {
                    const tipoDet = obtenerTipoCaja(det);
                    return (
                      <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase border ${tipoDet.claseBadge}`}>
                        {tipoDet.etiqueta} {tipoDet.nombreEmpresa !== 'Sin Factura' ? `• ${tipoDet.nombreEmpresa}` : ''}
                      </span>
                    );
                  })()}

                  {det.nro_factura && (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md font-semibold flex items-center gap-1">
                      <Receipt size={11} className="text-brand-primary" />
                      {det.nro_factura}
                    </span>
                  )}

                  {det.nro_ruc && (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md font-semibold">
                      RUC: {det.nro_ruc}{det.razon_social ? ` • ${det.razon_social}` : ''}
                    </span>
                  )}

                  {(det.placa_nombre || det.placa) && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-bold flex items-center gap-1">
                      <Car size={11} />
                      {det.placa_nombre || det.placa}
                    </span>
                  )}

                  {orig && dest && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold">
                      {formatearNombreEntidad(orig)} ➔ {formatearNombreEntidad(dest)}
                    </span>
                  )}

                  {orig && !dest && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold flex items-center gap-1">
                      <Building size={11} />
                      {formatearNombreEntidad(orig)}
                    </span>
                  )}
                </div>

                {/* Acciones de Tarjeta */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => abrirModalEdicion(idx)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 hover:text-brand-primary hover:bg-brand-light text-xs font-bold transition-all"
                  >
                    <Edit2 size={13} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminarLinea(idx)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-all"
                  >
                    <Trash2 size={13} />
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-light flex items-center justify-center text-brand-primary mb-1">
            <Receipt size={24} />
          </div>
          <p className="text-sm font-bold text-brand-dark">No hay gastos ingresados</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Registre uno a uno los comprobantes y fotos de sus gastos para completar su liquidación.
          </p>
        </div>
      )}

      {/* ========================================================================
          MODAL ASISTENTE GUIADO (SUB-WIZARD MÓVIL)
         ======================================================================== */}
      {modalAbierto && createPortal(
        <div className="fixed inset-0 !m-0 z-[100] flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            {/* Cabecera del Modal */}
            <div className="px-5 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                  {editandoIdx !== null ? `Editando Gasto #${editandoIdx + 1}` : 'Nuevo Comprobante'}
                </span>
                <h3 className="text-base font-black text-brand-dark">
                  Paso {pasoWizard} de 4: {PASOS_WIZARD[pasoWizard - 1].titulo}
                </h3>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Barra de Progreso del Sub-Wizard */}
            <div className="grid grid-cols-4 gap-1 px-5 pt-3 pb-2 bg-gray-50/70 shrink-0">
              {PASOS_WIZARD.map((paso) => (
                <div
                  key={paso.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    paso.id <= pasoWizard ? 'bg-brand-primary' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Mensaje de Error Inmediato en el Modal */}
            {errorMostrar && (
              <div className="mx-5 mt-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl p-3 shrink-0 animate-shake">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{errorMostrar}</span>
              </div>
            )}

            {/* Contenido Dinámico según el Micro-Paso */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* MICRO-PASO 1: Concepto y Tipo */}
              {pasoWizard === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5">
                      1. Tipo de Gasto *
                    </label>
                    <div className="relative">
                      <select
                        value={valorTipoSeleccionado}
                        onChange={(e) => seleccionarTipoGasto(e.target.value || null)}
                        className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
                      >
                        <option value="">Seleccione grupo de gasto...</option>
                        {tiposGastoDisponibles.map((t) => (
                          <option key={t.url} value={t.url}>
                            {t.nombre}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5">
                      2. Subgasto / Concepto Específico *
                    </label>
                    <Combobox
                      options={opcionesSubgasto}
                      value={valorSubgastoSeleccionado}
                      onChange={(val) => seleccionarSubGasto(val)}
                      placeholder={subgastosPorTipo.length === 0 ? 'Seleccione primero un Tipo' : 'Seleccione o busque concepto...'}
                      disabled={subgastosPorTipo.length === 0}
                      minParaBusqueda={6}
                    />
                  </div>

                  {subgastoActivo && (
                    <div className="bg-brand-light/50 border border-brand-primary/20 rounded-2xl p-3.5 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-brand-primary block">
                        Requisitos del Concepto
                      </span>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-gray-600">
                        {subgastoActivo.requiere_comprobante && (
                          <span className="bg-white px-2 py-0.5 rounded-md border border-gray-100">Exige RUC/Factura</span>
                        )}
                        {subgastoActivo.requiere_placa && (
                          <span className="bg-white px-2 py-0.5 rounded-md border border-gray-100">Exige Placa</span>
                        )}
                        {subgastoActivo.requiere_origen_destino && (
                          <span className="bg-white px-2 py-0.5 rounded-md border border-gray-100">Exige Origen y Destino</span>
                        )}
                        {subgastoActivo.requiere_entidad && (
                          <span className="bg-white px-2 py-0.5 rounded-md border border-gray-100">Exige Sede/Entidad</span>
                        )}
                        <span className="bg-white px-2 py-0.5 rounded-md border border-gray-100">
                          {subgastoActivo.localidad_permitida === 'L' ? 'Solo Lima' : subgastoActivo.localidad_permitida === 'P' ? 'Solo Provincia' : 'Lima o Provincia'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MICRO-PASO 2: Monto y Ubicación */}
              {pasoWizard === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5">
                      Importe del Gasto (S/.) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-brand-primary">S/.</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={formulario.costo}
                        onChange={(e) => manejarCambio('costo', e.target.value)}
                        className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl pl-12 pr-4 py-3 text-lg font-black text-brand-dark outline-none transition-colors"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5">
                      Fecha del Comprobante *
                    </label>
                    <input
                      type="date"
                      value={formulario.fecha_gasto}
                      onChange={(e) => manejarCambio('fecha_gasto', e.target.value)}
                      className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
                    />
                  </div>

                  {/* Selector de Zona según regla localidad_permitida */}
                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5">
                      Zona del Gasto
                      {subgastoActivo?.localidad_permitida !== 'A' && (
                        <span className="text-[10px] font-bold text-gray-400 ml-1.5 normal-case">
                          (Fijado por el concepto)
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {OPCIONES_ZONA.map((op) => {
                        const bloqueado = subgastoActivo?.localidad_permitida !== 'A';
                        const seleccionado = formulario.lima_provincia === op.valor;
                        return (
                          <button
                            key={op.valor}
                            type="button"
                            disabled={bloqueado}
                            onClick={() => manejarCambio('lima_provincia', op.valor)}
                            className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2 ${
                              seleccionado
                                ? 'bg-brand-primary text-white border-brand-primary shadow-md shadow-brand-primary/20'
                                : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                            } ${bloqueado ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}
                          >
                            {op.etiqueta}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selector de Provincia si aplica */}
                  {formulario.lima_provincia === 'P' && (
                    <div className="animate-fade-in">
                      <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5">
                        Provincia de Destino *
                      </label>
                      <Combobox
                        options={opcionesProvincias}
                        value={formulario.provincia_url}
                        onChange={(val) => manejarCambio('provincia_url', val)}
                        placeholder="Buscar provincia..."
                        icon={<MapPin size={14} className="text-brand-primary" />}
                        minParaBusqueda={6}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* MICRO-PASO 3: Datos Específicos Reactivos */}
              {pasoWizard === 3 && (
                <div className="space-y-4 animate-fade-in">
                  {!subgastoActivo?.requiere_comprobante &&
                   !subgastoActivo?.requiere_placa &&
                   !subgastoActivo?.requiere_origen_destino &&
                   !subgastoActivo?.requiere_entidad ? (
                    <div className="bg-brand-light/50 border border-brand-primary/20 rounded-2xl p-5 text-center space-y-2">
                      <CheckCircle2 size={30} className="text-brand-primary mx-auto" />
                      <p className="text-sm font-black text-brand-dark">No requiere datos fiscales o vehiculares</p>
                      <p className="text-xs text-gray-400">
                        Este concepto no exige RUC, placa ni rutas. Puede continuar al paso de comprobante.
                      </p>
                    </div>
                  ) : null}

                  {/* Comprobante Fiscal (Empresa Destino, RUC y Factura/Boleta) */}
                  {subgastoActivo?.requiere_comprobante && (
                    <div className="space-y-3 bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-brand-dark flex items-center gap-1.5">
                          <Receipt size={14} className="text-brand-primary" />
                          Comprobante Fiscal Electrónico
                        </span>
                        {(() => {
                          const tipoInfo = obtenerTipoCaja(formulario.empresa_id);
                          return (
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoInfo.claseBadge}`}>
                              {tipoInfo.etiqueta}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Selector de Factura a Nombre De */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                          Factura a Nombre De:
                        </label>
                        <div className="relative">
                          <select
                            value={formulario.empresa_id || ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              manejarCambio('empresa_id', val);
                            }}
                            className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-xs font-semibold text-brand-dark outline-none transition-colors"
                          >
                            <option value="">Sin Factura / No requiere factura (Tipo C)</option>
                            {listaEmpresasDisponibles.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.nombre} {emp.tipo ? `(Tipo ${emp.tipo})` : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                            N° RUC *
                          </label>
                          {consultandoRuc && (
                            <span className="text-[10px] text-brand-primary font-bold flex items-center gap-1 animate-pulse">
                              <Loader2 size={11} className="animate-spin" /> Consultando SUNAT...
                            </span>
                          )}
                        </div>

                        <input
                          type="text"
                          maxLength={11}
                          placeholder="20XXXXXXXXX o 10XXXXXXXXX"
                          value={formulario.nro_ruc}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            manejarCambio('nro_ruc', val);
                            if (val.length === 11) {
                              consultarRucOpenRuc(val);
                            } else {
                              setMensajeRuc(null);
                            }
                          }}
                          className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                        />

                        {/* Razón Social detectada en pequeño debajo del RUC */}
                        {formulario.razon_social && !mostrarCampoManualRazonSocial && (
                          <div className="mt-1.5 flex items-center justify-between text-xs text-emerald-800 bg-emerald-50/90 border border-emerald-200 rounded-xl px-3 py-1.5 animate-fade-in">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Building size={13} className="text-emerald-600 shrink-0" />
                              <span className="font-bold text-[11px] truncate uppercase tracking-tight">
                                {formulario.razon_social}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMostrarCampoManualRazonSocial(true)}
                              className="text-[10px] text-brand-primary hover:underline ml-2 font-bold shrink-0"
                            >
                              Editar
                            </button>
                          </div>
                        )}

                        {/* Mensaje de aviso de OpenRUC (ej: RUC 10 o error 404) */}
                        {mensajeRuc && mensajeRuc.tipo !== 'exito' && (
                          <p className={`text-[10px] sm:text-[11px] font-medium mt-1 leading-tight ${
                            mensajeRuc.tipo === 'advertencia' ? 'text-amber-700' : 'text-red-500'
                          }`}>
                            ⚠️ {mensajeRuc.texto}
                          </p>
                        )}
                      </div>

                      {/* Campo Manual para Razón Social (si no se obtiene automáticamente, es RUC 10 o el usuario desea editarlo) */}
                      {(mostrarCampoManualRazonSocial || (!formulario.razon_social && formulario.nro_ruc?.length === 11)) && (
                        <div className="animate-fade-in">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                              Razón Social / Proveedor (Manual) *
                            </label>
                            {formulario.razon_social && (
                              <button
                                type="button"
                                onClick={() => setMostrarCampoManualRazonSocial(false)}
                                className="text-[10px] text-gray-400 hover:text-gray-600 font-bold"
                              >
                                Ocultar
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder="Ingrese el nombre o razón social del proveedor..."
                            value={formulario.razon_social}
                            onChange={(e) => manejarCambio('razon_social', e.target.value.toUpperCase())}
                            className="w-full bg-white border-2 border-amber-200 focus:border-brand-primary rounded-xl px-4 py-2 text-xs font-semibold text-brand-dark outline-none transition-colors"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">N° Factura / Boleta *</label>
                        <input
                          type="text"
                          placeholder="Ej: F001-0002345"
                          value={formulario.nro_factura}
                          onChange={(e) => manejarCambio('nro_factura', e.target.value.toUpperCase())}
                          className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                        />
                      </div>
                    </div>
                  )}

                  {/* Placa Vehicular */}
                  {subgastoActivo?.requiere_placa && (
                    <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-black text-brand-dark uppercase tracking-wider flex items-center gap-1.5">
                          <Car size={14} className="text-brand-primary" />
                          Placa / Unidad de Transporte *
                        </label>
                        {placaDelUsuario && formulario.placa_id === placaDelUsuario.id && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            Asignada a su usuario
                          </span>
                        )}
                        {!placaDelUsuario && (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                            Unidades Minivan
                          </span>
                        )}
                      </div>
                      <Combobox
                        options={opcionesPlacas}
                        value={formulario.placa_id}
                        onChange={(val, opt) => seleccionarPlaca(val, opt)}
                        placeholder={placaDelUsuario ? "Placa asignada..." : "Buscar o seleccionar minivan..."}
                        icon={<Car size={14} className="text-brand-primary" />}
                        minParaBusqueda={6}
                      />
                    </div>
                  )}

                  {/* Origen y Destino (Taxis) */}
                  {subgastoActivo?.requiere_origen_destino && (
                    <div className="space-y-3 bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-brand-dark flex items-center gap-1.5">
                        <MapPin size={14} className="text-brand-primary" />
                        Ruta de Traslado
                      </span>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Sede / Origen *</label>
                        <Combobox
                          options={opcionesEntidades}
                          value={formulario.origen_url}
                          onChange={(val) => manejarCambio('origen_url', val)}
                          placeholder="Buscar sede de origen..."
                          icon={<MapPin size={14} className="text-brand-primary" />}
                          minParaBusqueda={6}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Sede / Destino *</label>
                        <Combobox
                          options={opcionesEntidades}
                          value={formulario.destino_url}
                          onChange={(val) => manejarCambio('destino_url', val)}
                          placeholder="Buscar sede de destino..."
                          icon={<MapPin size={14} className="text-brand-primary" />}
                          minParaBusqueda={6}
                        />
                      </div>
                    </div>
                  )}

                  {/* Sede / Entidad Única */}
                  {subgastoActivo?.requiere_entidad && !subgastoActivo?.requiere_origen_destino && (
                    <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-2">
                      <label className="block text-xs font-black text-brand-dark uppercase tracking-wider flex items-center gap-1.5">
                        <Building size={14} className="text-brand-primary" />
                        Sede / Entidad *
                      </label>
                      <Combobox
                        options={opcionesEntidades}
                        value={formulario.origen_url}
                        onChange={(val) => manejarCambio('origen_url', val)}
                        placeholder="Buscar sede o entidad..."
                        icon={<Building size={14} className="text-brand-primary" />}
                        minParaBusqueda={6}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* MICRO-PASO 4: Foto / Comprobante Obligatorio y Detalle */}
              {pasoWizard === 4 && (
                <div className="space-y-4 animate-fade-in">
                  {/* Foto / Comprobante (Obligatorio) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black text-brand-dark uppercase tracking-wider flex items-center gap-1.5">
                        <Camera size={14} className="text-brand-primary" />
                        Foto o Ticket del Comprobante *
                        <span className="text-[10px] text-red-500 font-bold">(Obligatorio)</span>
                      </label>
                      {(formulario.adj_cajachica || formulario._preview) && (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                          <CheckCircle2 size={11} /> Adjuntado
                        </span>
                      )}
                    </div>

                    {/* Inputs ocultos: Cámara directa vs Archivos/Galería del dispositivo */}
                    <input
                      ref={referenciaCamara}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={manejarArchivo}
                      className="hidden"
                    />
                    <input
                      ref={referenciaArchivo}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={manejarArchivo}
                      className="hidden"
                    />

                    {/* Aviso informativo de borrador vs liquidación */}
                    <div className="mb-3 p-2.5 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-start gap-2 text-xs text-amber-900">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] leading-snug">
                        <strong>Aviso:</strong> El comprobante es obligatorio al <strong>Liquidar</strong>. Si desea guardar este detalle como <strong>Borrador</strong>, puede registrarlo sin comprobante, pero recuerde que para liquidar se debe actualizar el registro con el adjunto correspondiente.
                      </p>
                    </div>

                    {formulario._preview || formulario.adj_cajachica ? (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-brand-primary/30 p-2.5 bg-brand-light/20 flex items-center gap-3.5">
                        {esArchivoPdf(formulario.adj_cajachica, formulario._preview) ? (
                          <div className="w-16 h-16 rounded-xl bg-red-50 border border-red-200 flex flex-col items-center justify-center shrink-0 text-red-500 font-bold">
                            <FileText size={26} />
                            <span className="text-[9px] font-black uppercase mt-0.5">PDF</span>
                          </div>
                        ) : (
                          <img
                            src={formulario._preview || (typeof formulario.adj_cajachica === 'string' ? formulario.adj_cajachica : '')}
                            alt="Vista previa comprobante"
                            className="w-16 h-16 object-cover rounded-xl border border-gray-200 shrink-0 bg-white"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-brand-dark truncate">
                            {formulario.adj_cajachica?.name || (typeof formulario.adj_cajachica === 'string' ? 'Comprobante guardado' : 'Archivo adjuntado')}
                          </p>
                          <p className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Comprobante seleccionado
                          </p>

                          {/* Opciones de reemplazo o eliminación */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setArchivoVisor(formulario._preview || formulario.adj_cajachica)}
                              className="text-[11px] text-emerald-600 font-bold hover:underline flex items-center gap-1"
                            >
                              <Eye size={12} /> Ver documento
                            </button>
                            <span className="text-gray-300">•</span>
                            <button
                              type="button"
                              onClick={() => referenciaCamara.current?.click()}
                              className="text-[11px] text-brand-primary font-bold hover:underline flex items-center gap-1"
                            >
                              <Camera size={12} /> Tomar otra foto
                            </button>
                            <span className="text-gray-300">•</span>
                            <button
                              type="button"
                              onClick={() => referenciaArchivo.current?.click()}
                              className="text-[11px] text-blue-600 font-bold hover:underline flex items-center gap-1"
                            >
                              <Upload size={12} /> Subir archivo
                            </button>
                            <span className="text-gray-300">•</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormulario((prev) => ({ ...prev, adj_cajachica: null, _preview: null, _esPdf: false }));
                                if (referenciaCamara.current) referenciaCamara.current.value = '';
                                if (referenciaArchivo.current) referenciaArchivo.current.value = '';
                              }}
                              className="text-[11px] text-red-500 font-bold hover:underline flex items-center gap-1"
                            >
                              <X size={12} /> Quitar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Opciones Mobile First: Cámara directa o Archivos/Galería */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => referenciaCamara.current?.click()}
                            className="py-4 px-3 rounded-2xl border-2 border-dashed border-brand-primary/40 bg-brand-light/30 hover:bg-brand-light/60 active:bg-brand-light/80 flex items-center sm:flex-col justify-center gap-3 sm:gap-2 transition-all group active:scale-[0.98]"
                          >
                            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform shrink-0">
                              <Camera size={20} />
                            </div>
                            <div className="text-left sm:text-center">
                              <span className="text-xs font-black text-brand-primary block">Tomar Foto</span>
                              <span className="text-[10px] text-gray-500 font-medium">Abrir cámara directa</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => referenciaArchivo.current?.click()}
                            className="py-4 px-3 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50/80 active:bg-blue-100 flex items-center sm:flex-col justify-center gap-3 sm:gap-2 transition-all group active:scale-[0.98]"
                          >
                            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform shrink-0">
                              <Upload size={20} />
                            </div>
                            <div className="text-left sm:text-center">
                              <span className="text-xs font-black text-blue-700 block">Subir Archivo o Galería</span>
                              <span className="text-[10px] text-gray-500 font-medium">Fotos guardadas, JPG, PNG o PDF</span>
                            </div>
                          </button>
                        </div>
                        <p className="text-[10px] text-center text-gray-400">
                          En celulares use "Subir Archivo o Galería" para adjuntar comprobantes previamente guardados
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Detalle o Glosa */}
                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Descripción / Motivo {subgastoActivo?.requiere_detalle && '*'}</span>
                      {subgastoActivo?.requiere_detalle && (
                        <span className="text-[10px] text-brand-primary font-bold">Obligatorio</span>
                      )}
                    </label>
                    <textarea
                      rows={3}
                      placeholder={subgastoActivo?.mensaje_detalle || 'Describa el motivo o justificación del gasto...'}
                      value={formulario.detalle}
                      onChange={(e) => manejarCambio('detalle', e.target.value)}
                      className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl p-3 text-sm font-medium text-brand-dark outline-none transition-colors resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Acciones de Navegación del Sub-Wizard */}
            <div className="px-5 py-3.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between shrink-0">
              {pasoWizard > 1 ? (
                <button
                  type="button"
                  onClick={retrocederPasoWizard}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-white transition-all"
                >
                  <ChevronLeft size={16} />
                  Atrás
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-white transition-all"
                >
                  Cancelar
                </button>
              )}

              {pasoWizard < 4 ? (
                <button
                  type="button"
                  onClick={avanzarPasoWizard}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-primary text-white text-xs font-black shadow-md shadow-brand-primary/20 hover:bg-brand-secondary transition-all"
                >
                  Siguiente
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={guardarLineaGasto}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white text-xs font-black shadow-lg shadow-brand-primary/20 hover:scale-[1.02] transition-all"
                >
                  <CheckCircle2 size={16} />
                  {editandoIdx !== null ? 'Guardar Cambios' : 'Agregar Gasto'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Modal Visor Universal de Comprobante (Imágenes y PDFs) */}
      {archivoVisor && (
        <ModalVisorComprobante
          archivo={archivoVisor}
          onClose={() => setArchivoVisor(null)}
          titulo="Comprobante de Gasto"
        />
      )}
    </div>
  );
};

export default Step2Detalles;
