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
import { obtenerTipoCaja, LISTA_EMPRESAS, extraerIdEmpresa } from '../../utils/tipoCaja';
import { esArchivoPdf, subgastoExigeAdjunto, resolverUrlAdjunto } from '../../utils/archivoUtil';
import ModalVisorComprobante from '../ModalVisorComprobante';
import Combobox from '../Combobox';
import { formatearNombreEntidad, formatearSubtituloEntidad, esEntidadValidaEntrega } from '../../utils/entidades';
import { filtrarSubgastosPorPerfil } from '../../utils/reglasAccesos';
import { tieneRangoGerencial, esGerenteOperaciones, esSuperusuario, obtenerAreaLimpia } from '../../utils/permisos';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ============================================================================
// CONSTANTES Y CONFIGURACIONES
// ============================================================================

const OPCIONES_ZONA = [
  { valor: 'L', etiqueta: 'Lima' },
  { valor: 'P', etiqueta: 'Provincia' },
];

// 6 destinos más comunes para Distribución Provincia
const DESTINOS_COMUNES_PROVINCIA = [
  { clave: 'AREQUIPA', nombre: 'AREQUIPA' },
  { clave: 'TRUJILLO', nombre: 'TRUJILLO' },
  { clave: 'CHICLAYO', nombre: 'CHICLAYO' },
  { clave: 'PIURA', nombre: 'PIURA' },
  { clave: 'HUARAZ', nombre: 'HUARAZ' },
  { clave: 'CUSCO', nombre: 'CUSCO' },
];

// RUCs de empresas administradas internamente (no permitidas como emisor/proveedor)
const RUCS_EMPRESAS_PROPIAS = {
  '20516920123': 'SURGICORP S.R.L.',
  '20522608417': 'RR MEDICAL S.R.L.',
};

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
  proveedor_id: null,
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
  if (typeof idOUri === 'object' && idOUri !== null) {
    if (idOUri.id !== undefined && idOUri.id !== null) {
      const num = parseInt(idOUri.id, 10);
      return isNaN(num) ? null : num;
    }
    if (idOUri.url) return extraerIdDeUrl(idOUri.url);
    return null;
  }
  if (typeof idOUri === 'string') {
    const urlLimpia = idOUri.split('?')[0].replace(/\/+$/, '');
    const partes = urlLimpia.split('/').filter(Boolean);
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
const Step2Detalles = ({ detalles = [], onChangeDetalles, onEliminarDetalle, montoLimite }) => {
  const { user } = useUserStore();
  const { tiposGasto, subgastos, entidades, provincias, empresas, placas, proveedores, agregarProveedorLocal, cargando, error: errorCatalogo, cargarCatalogos } = useCatalogoStore();

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

  // Estados para nuevo proveedor rápido
  const [modoCrearProveedor, setModoCrearProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [consultandoRucProveedorSunat, setConsultandoRucProveedorSunat] = useState(false);
  const [avisoRucProveedor, setAvisoRucProveedor] = useState(null);

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
    const filtrados = filtrarSubgastosPorPerfil(subgastos, user, tiposGasto);
    // En Distribución Provincia deben omitirse los tipos de gastos de courier
    return filtrados.filter((s) => {
      const nombreTipo = s.tipogasto_id?.nombre || '';
      const esDistribucionProvincia =
        normalizarTexto(nombreTipo).includes('distribucion provincia') ||
        normalizarTexto(s.nombre || '').includes('distribucion provincia');
      if (esDistribucionProvincia && normalizarTexto(s.nombre || '').includes('courier')) {
        return false;
      }
      return true;
    });
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

  // Valor normalizado para el select de Subgasto (revisa en lista filtrada y catálogo global)
  const valorSubgastoSeleccionado = useMemo(() => {
    if (!formulario.subgasto_url && !formulario.subgasto_obj) return '';
    const match =
      subgastosPorTipo.find((s) => coincidenUrlsOIds(s.url || s.id, formulario.subgasto_url) || (formulario.subgasto_obj?.id && s.id === formulario.subgasto_obj.id)) ||
      subgastos.find((s) => coincidenUrlsOIds(s.url || s.id, formulario.subgasto_url) || (formulario.subgasto_obj?.id && s.id === formulario.subgasto_obj.id));
    return match?.url || formulario.subgasto_url || '';
  }, [formulario.subgasto_url, formulario.subgasto_obj, subgastosPorTipo, subgastos]);

  // Objeto completo del subgasto activo seleccionado
  const subgastoActivo = useMemo(() => {
    if (!formulario.subgasto_url && !formulario.subgasto_obj) return null;
    return (
      subgastos.find(
        (s) =>
          coincidenUrlsOIds(s.url || s.id, formulario.subgasto_url) ||
          (formulario.subgasto_obj?.id && s.id === formulario.subgasto_obj.id)
      ) ||
      formulario.subgasto_obj ||
      null
    );
  }, [formulario.subgasto_url, formulario.subgasto_obj, subgastos]);

  // Opciones formateadas para Combobox tipo PowerApps
  const opcionesSubgasto = useMemo(() => {
    return subgastosPorTipo.map((s) => ({
      value: s.url || (s.id ? `${API_URL}/RC_SubGasto/${s.id}/` : String(s.id)),
      id: s.id,
      label: s.nombre,
      sublabel: s.mensaje_detalle || '',
    }));
  }, [subgastosPorTipo]);

  const opcionesProvincias = useMemo(() => {
    const lista = (provincias || []).map((p) => {
      const idProv = p.id ?? extraerIdDeUrl(p.url);
      const urlProv = p.url || (idProv ? `${API_URL}/RC_Provincia/${idProv}/` : String(idProv));
      return {
        value: urlProv,
        id: idProv,
        label: p.nombre,
        sublabel: p.departamento ? `Dpto: ${p.departamento}` : '',
        raw: { ...p, id: idProv },
      };
    });

    if (formulario.provincia_id && !lista.some((opt) => opt.id === formulario.provincia_id)) {
      const idF = formulario.provincia_id;
      const nomF = formulario.provincia_nombre || `Provincia #${idF}`;
      lista.unshift({
        value: `${API_URL}/RC_Provincia/${idF}/`,
        id: idF,
        label: nomF,
        sublabel: '',
        raw: { id: idF, nombre: nomF },
      });
    }

    return lista;
  }, [provincias, formulario.provincia_id, formulario.provincia_nombre]);

  // Valor normalizado para el select de Provincia
  const valorProvinciaSeleccionado = useMemo(() => {
    if (!formulario.provincia_url && !formulario.provincia_id && !formulario.provincia_nombre) return '';
    const idBuscado = formulario.provincia_id || extraerIdDeUrl(formulario.provincia_url);
    const nomBuscado = normalizarTexto(formulario.provincia_nombre);

    const match = (opcionesProvincias || []).find((opt) =>
      (idBuscado !== null && (opt.id === idBuscado || extraerIdDeUrl(opt.value) === idBuscado)) ||
      (nomBuscado && normalizarTexto(opt.label) === nomBuscado)
    );

    return match?.value || formulario.provincia_url || (idBuscado ? `${API_URL}/RC_Provincia/${idBuscado}/` : '');
  }, [formulario.provincia_url, formulario.provincia_id, formulario.provincia_nombre, opcionesProvincias]);

  // Determina si el concepto activo o seleccionado corresponde a Distribución Provincia
  const esGastoDistribucionProvincia = useMemo(() => {
    const tipoObj =
      tiposGastoDisponibles.find((t) => coincidenUrlsOIds(t.url, formulario.tipogasto_url)) ||
      subgastoActivo?.tipogasto_id;
    const nombreTipo = tipoObj?.nombre || '';
    const nombreSub = subgastoActivo?.nombre || '';
    const textoCombinado = normalizarTexto(`${nombreTipo} ${nombreSub}`);
    return textoCombinado.includes('distribucion provincia');
  }, [subgastoActivo, formulario.tipogasto_url, tiposGastoDisponibles]);

  // Resuelve el objeto de provincia a partir del nombre o clave común
  const resolverProvinciaPorNombre = (nombreDestino) => {
    if (!Array.isArray(provincias) || provincias.length === 0) return null;
    const busq = normalizarTexto(nombreDestino);
    return (
      provincias.find((p) => {
        const normP = normalizarTexto(p.nombre || '');
        if (busq === 'cuzco' || busq === 'cusco') {
          return normP === 'cusco' || normP === 'cuzco' || normP.includes('cusco') || normP.includes('cuzco');
        }
        return normP === busq || normP.includes(busq) || busq.includes(normP);
      }) || null
    );
  };

  // Asigna directamente una de las provincias más frecuentes y fija la zona en 'P'
  const seleccionarDestinoComun = (claveDestino) => {
    setErrorLocal('');
    const prov = resolverProvinciaPorNombre(claveDestino);
    if (prov) {
      const idProv = prov.id ?? extraerIdDeUrl(prov.url);
      const urlProv = prov.url || (idProv ? `${API_URL}/RC_Provincia/${idProv}/` : null);
      setFormulario((prev) => ({
        ...prev,
        lima_provincia: 'P',
        provincia_url: urlProv,
        provincia_id: idProv,
        provincia_nombre: prov.nombre,
        provincia_obj: { ...prov, id: idProv },
      }));
    } else {
      setFormulario((prev) => ({
        ...prev,
        lima_provincia: 'P',
        provincia_nombre: claveDestino,
      }));
    }
  };

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
    const esMandoOperaciones =
      tieneRangoGerencial(user) ||
      esGerenteOperaciones(user) ||
      esSuperusuario(user) ||
      obtenerAreaLimpia(user).includes('operacion');

    if (esMandoOperaciones) {
      lista = placas;
    } else if (placaDelUsuario) {

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

  // Nombres comerciales de los 4 proveedores más comunes
  const PROVEEDORES_COMUNES = ['OLTURSA', 'LIMA EXPRESA', 'CRUZ DEL SUR', 'INVERSIONES URBANISTICAS'];

  // Opciones para el Combobox de Proveedores
  const opcionesProveedores = useMemo(() => {
    if (!Array.isArray(proveedores) || proveedores.length === 0) return [];
    return proveedores.map((p) => {
      const nombreComercial = (p.nombre_comercial || '').trim();
      const razonSocial = (p.razon_social || '').trim();
      const ruc = (p.nro_ruc || '').trim();

      // Buscador debe permitir buscar y mostrar el nombre comercial, si no tiene recién buscar por razón social
      const label = nombreComercial || razonSocial || `Proveedor #${p.id}`;
      const sublabel = nombreComercial
        ? `${razonSocial} • RUC: ${ruc}`
        : (ruc ? `RUC: ${ruc}` : '');

      return {
        value: p.id,
        label,
        sublabel,
        busquedaExtra: `${nombreComercial} ${razonSocial} ${ruc}`,
        raw: p,
      };
    });
  }, [proveedores]);

  // Proveedores comunes identificados en el catálogo
  const proveedoresComunesEncontrados = useMemo(() => {
    if (!Array.isArray(proveedores) || proveedores.length === 0) return [];
    return PROVEEDORES_COMUNES.map((nomComun) => {
      const nomNorm = normalizarTexto(nomComun);
      const encontrado = proveedores.find((p) => {
        const nc = normalizarTexto(p.nombre_comercial || '');
        const rz = normalizarTexto(p.razon_social || '');
        return nc.includes(nomNorm) || rz.includes(nomNorm);
      });
      return {
        nombre: nomComun,
        proveedor: encontrado || null,
      };
    });
  }, [proveedores]);

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

    const tipoObj = tiposGastoDisponibles.find((t) => coincidenUrlsOIds(t.url, tipoUrl));
    const esDistProv = normalizarTexto(tipoObj?.nombre || '').includes('distribucion provincia');

    // Si solo hay un subgasto disponible para este tipo, se auto-selecciona
    if (subFiltrados.length === 1) {
      seleccionarSubGasto(subFiltrados[0].url, tipoUrl);
    } else {
      setFormulario((prev) => ({
        ...prev,
        tipogasto_url: tipoUrl,
        subgasto_url: null,
        subgasto_obj: null,
        lima_provincia: esDistProv ? 'P' : prev.lima_provincia,
      }));
    }
  };

  const seleccionarSubGasto = (subgastoUrl, tipoUrlOverride = null) => {
    setErrorLocal('');
    const subEncontrado = subgastos.find((s) => s.url === subgastoUrl);
    if (!subEncontrado) return;

    const tipoUrl = tipoUrlOverride || subEncontrado.tipogasto_id?.url || subEncontrado.tipogasto_id;
    const tipoObj = tiposGastoDisponibles.find((t) => coincidenUrlsOIds(t.url, tipoUrl)) || subEncontrado.tipogasto_id;
    const nombreTipo = tipoObj?.nombre || '';
    const esDistProv = normalizarTexto(`${nombreTipo} ${subEncontrado.nombre}`).includes('distribucion provincia');

    // Regla Reactiva de Localidad Permitida ('L', 'P', 'A')
    let zonaCalculada = formulario.lima_provincia;
    if (esDistProv || subEncontrado.localidad_permitida === 'P') {
      zonaCalculada = 'P';
    } else if (subEncontrado.localidad_permitida === 'L') {
      zonaCalculada = 'L';
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
      empresa_id: subEncontrado.requiere_comprobante ? prev.empresa_id : null,
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

    // Validación de empresas propias: Surgicorp y RR Medical
    if (RUCS_EMPRESAS_PROPIAS[rucLimpio]) {
      const nombreEmpresa = RUCS_EMPRESAS_PROPIAS[rucLimpio];
      setFormulario((prev) => ({
        ...prev,
        razon_social: '',
      }));
      setMensajeRuc({
        tipo: 'error',
        texto: `Está ingresando el RUC de ${nombreEmpresa}. Recuerde que en el campo anterior ("Factura a Nombre De") se selecciona a nombre de quién se emite la factura, pero en este campo debe ingresar el RUC de la factura del negocio del cual se hizo la compra.`,
      });
      setErrorLocal(`El RUC ${rucLimpio} pertenece a ${nombreEmpresa}. Ingrese el RUC del negocio proveedor donde realizó la compra.`);
      setMostrarCampoManualRazonSocial(false);
      return;
    }

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

  // Manejador para seleccionar proveedor desde Combobox o botones directos
  const seleccionarProveedor = (provId, opt = null) => {
    setErrorLocal('');
    if (!provId) {
      setFormulario((prev) => ({
        ...prev,
        proveedor_id: null,
        nro_ruc: '',
        razon_social: '',
      }));
      return;
    }

    const provObj = opt?.raw || (proveedores || []).find((p) => p.id === provId || String(p.id) === String(provId));
    if (provObj) {
      setFormulario((prev) => ({
        ...prev,
        proveedor_id: provObj.id,
        nro_ruc: provObj.nro_ruc || '',
        razon_social: provObj.razon_social || '',
      }));
    }
  };

  /**
   * Consulta de RUC SUNAT para nuevo proveedor rápido en Step2Detalles.
   */
  const consultarRucNuevoProveedor = async (ruc) => {
    const rucLimpio = String(ruc || '').trim();
    if (rucLimpio.length !== 11) return;

    if (RUCS_EMPRESAS_PROPIAS[rucLimpio]) {
      setAvisoRucProveedor({
        tipo: 'error',
        texto: `El RUC ingresado pertenece a ${RUCS_EMPRESAS_PROPIAS[rucLimpio]}. Ingrese el RUC del proveedor externo.`,
      });
      return;
    }

    if (rucLimpio.startsWith('10')) {
      setAvisoRucProveedor({
        tipo: 'advertencia',
        texto: 'La consulta automática solo permite RUC 20. Ingrese la Razón Social de forma manual.',
      });
      return;
    }

    if (rucLimpio.startsWith('20')) {
      setConsultandoRucProveedorSunat(true);
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
            texto: 'No se encontró información en SUNAT. Ingrese la razón social manualmente.',
          });
        }
      } catch (err) {
        setAvisoRucProveedor({
          tipo: 'error',
          texto: 'Error al consultar SUNAT. Ingrese la razón social manualmente.',
        });
      } finally {
        setConsultandoRucProveedorSunat(false);
      }
      return;
    }

    setAvisoRucProveedor({
      tipo: 'advertencia',
      texto: 'RUC con formato no estándar. Ingrese la razón social manualmente.',
    });
  };

  /**
   * Creación rápida de proveedor desde Step2Detalles.
   */
  const manejarCrearProveedorRapido = async (e) => {
    if (e) e.preventDefault();
    if (!nuevoProveedor.nro_ruc.trim() || !nuevoProveedor.razon_social.trim()) {
      setErrorLocal('Ingrese el RUC y la Razón Social del nuevo proveedor.');
      return;
    }

    setGuardandoProveedor(true);
    setErrorLocal('');
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
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || errJson.nro_ruc || 'Error al guardar proveedor.');
      }

      const provCreado = await res.json();
      agregarProveedorLocal(provCreado);
      seleccionarProveedor(provCreado.id, { raw: provCreado });
      setModoCrearProveedor(false);
      setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
      setAvisoRucProveedor(null);
    } catch (err) {
      setErrorLocal(err.message || 'No se pudo crear el proveedor.');
    } finally {
      setGuardandoProveedor(false);
    }
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
      if (formulario.costo === '' || formulario.costo === null || formulario.costo === undefined || isNaN(costoNum) || costoNum < 0) {
        setErrorLocal('Ingrese un importe válido mayor o igual a S/ 0.00.');
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
        if (!extraerIdEmpresa(formulario.empresa_id)) {
          setErrorLocal('Debe seleccionar a nombre de qué empresa está facturando.');
          return false;
        }
        if (!formulario.nro_ruc || formulario.nro_ruc.trim().length !== 11) {
          setErrorLocal('El RUC es obligatorio y debe contener exactamente 11 dígitos numéricos.');
          return false;
        }
        const rucIngresado = (formulario.nro_ruc || '').trim();
        if (RUCS_EMPRESAS_PROPIAS[rucIngresado]) {
          const nombreEmpresa = RUCS_EMPRESAS_PROPIAS[rucIngresado];
          setErrorLocal(`El RUC ${rucIngresado} pertenece a ${nombreEmpresa}. En el campo anterior ("Factura a Nombre De") se selecciona la empresa a nombre de quién se emite la factura, pero en este campo debe ingresar el RUC del negocio del cual se hizo la compra.`);
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
    return (detalles || []).reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);
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
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
    setAvisoRucProveedor(null);
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

    const tipoMatch = tiposGasto.find((t) =>
      coincidenUrlsOIds(t.url, item.tipogasto_url) ||
      coincidenUrlsOIds(t.url, sub?.tipogasto_id) ||
      (sub?.tipogasto_id?.id && t.id === sub.tipogasto_id.id)
    );

    const tipoUrl =
      tipoMatch?.url ||
      item.tipogasto_url ||
      sub?.tipogasto_id?.url ||
      (sub?.tipogasto_id?.id ? `${API_URL}/RC_TipoGasto/${sub.tipogasto_id.id}/` : null) ||
      sub?.tipogasto_id;

    // Normalizar provincia_url usando el catálogo de provincias
    const provRawItem = item.provincia_obj || item.provincia_id || item.provincia_url || item.provincia;
    const idProvItem = typeof provRawItem === 'object' && provRawItem !== null ? provRawItem.id : (typeof provRawItem === 'number' ? provRawItem : extraerIdDeUrl(provRawItem));
    const nomProvItem = typeof provRawItem === 'object' && provRawItem !== null ? (provRawItem.nombre || '') : (item.provincia_nombre || '');

    const matchProvincia = (provincias || []).find((p) =>
      (idProvItem !== null && (p.id === idProvItem || extraerIdDeUrl(p.url) === idProvItem)) ||
      (nomProvItem && normalizarTexto(p.nombre) === normalizarTexto(nomProvItem))
    );

    const provinciaUrl =
      matchProvincia?.url ||
      (matchProvincia?.id ? `${API_URL}/RC_Provincia/${matchProvincia.id}/` : null) ||
      (idProvItem ? `${API_URL}/RC_Provincia/${idProvItem}/` : null) ||
      item.provincia_url ||
      null;
    const provinciaId = matchProvincia?.id || idProvItem || null;
    const provinciaNombre = matchProvincia?.nombre || nomProvItem || '';

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

    // Buscar proveedor correspondiente en el catálogo si existe
    let provId = item.proveedor_id || null;
    if (!provId && item.nro_ruc && Array.isArray(proveedores)) {
      const matchProv = proveedores.find((p) => p.nro_ruc === item.nro_ruc);
      if (matchProv) provId = matchProv.id;
    }

    setFormulario({
      ...item,
      proveedor_id: provId,
      empresa_id: extraerIdEmpresa(item.empresa_id !== undefined ? item.empresa_id : item.empresa),
      razon_social: item.razon_social || '',
      placa_id: placaId || null,
      placa: placaTexto,
      placa_nombre: placaNombre,
      tipogasto_url: tipoUrl || item.tipogasto_url,
      subgasto_url: sub?.url || item.subgasto_url,
      subgasto_obj: sub || item.subgasto_obj,
      provincia_url: provinciaUrl,
      provincia_id: provinciaId,
      provincia_nombre: provinciaNombre,
    });
    setEditandoIdx(idx);
    setPasoWizard(1);
    setErrorLocal('');
    setConsultandoRuc(false);
    setMensajeRuc(null);
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
    setAvisoRucProveedor(null);
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
    setModoCrearProveedor(false);
    setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
    setAvisoRucProveedor(null);
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

      {/* Aviso si existen gastos registrados que exigen comprobante pero no lo tienen */}
      {detalles.some((d) => subgastoExigeAdjunto(d, subgastos) && !d.adj_cajachica && !d._preview) && (
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
                            src={resolverUrlAdjunto(det._preview || det.adj_cajachica)}
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
                    subgastoExigeAdjunto(det, subgastos) ? (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                        <AlertCircle size={11} className="text-amber-500" />
                        Sin comprobante (Obligatorio para liquidar)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-emerald-500" />
                        No requiere comprobante
                      </span>
                    )
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
                  className={`h-1.5 rounded-full transition-all duration-300 ${paso.id <= pasoWizard ? 'bg-brand-primary' : 'bg-gray-200'
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
                      Fecha de "EMISIÓN" del Comprobante *
                    </label>
                    <input
                      type="date"
                      value={formulario.fecha_gasto}
                      onChange={(e) => manejarCambio('fecha_gasto', e.target.value)}
                      className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
                    />
                  </div>

                  {/* Selector de Ubicación / Destino */}
                  {esGastoDistribucionProvincia ? (
                    <div className="space-y-3.5 animate-fade-in">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-black text-brand-dark uppercase tracking-wider">
                            Destino en Provincia *
                          </label>
                          <span className="text-[10px] font-bold text-brand-primary bg-brand-light px-2 py-0.5 rounded-lg border border-brand-primary/20">
                            Distribución Provincia
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mb-2">
                          Elija uno de los 6 destinos más comunes:
                        </p>

                        {/* Set de botones con los 6 destinos más comunes */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {DESTINOS_COMUNES_PROVINCIA.map((destino) => {
                            const provItem = resolverProvinciaPorNombre(destino.clave);
                            const seleccionado = Boolean(
                              provItem &&
                              (
                                (formulario.provincia_url && coincidenUrlsOIds(formulario.provincia_url, provItem.url || provItem.id)) ||
                                (formulario.provincia_id && provItem.id === formulario.provincia_id) ||
                                (formulario.provincia_nombre && normalizarTexto(formulario.provincia_nombre) === normalizarTexto(destino.nombre))
                              )
                            );

                            return (
                              <button
                                key={destino.clave}
                                type="button"
                                onClick={() => seleccionarDestinoComun(destino.clave)}
                                className={`py-2.5 px-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2 flex items-center justify-between gap-1.5 cursor-pointer active:scale-95 ${
                                  seleccionado
                                    ? 'bg-brand-primary text-white border-brand-primary shadow-md shadow-brand-primary/20 ring-2 ring-brand-primary/20'
                                    : 'bg-white border-gray-100 text-brand-dark hover:border-brand-primary/40 hover:bg-brand-light/40'
                                }`}
                              >
                                <span className="truncate">{destino.nombre}</span>
                                {seleccionado ? (
                                  <CheckCircle2 size={14} className="shrink-0 text-white" />
                                ) : (
                                  <MapPin size={13} className="shrink-0 text-gray-400" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* En caso de que no sea ninguno de los 6 más comunes, buscar en combobox provincias */}
                      <div className="pt-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">
                          ¿Otro destino? Buscar en todas las provincias:
                        </label>
                        <Combobox
                          options={opcionesProvincias}
                          value={valorProvinciaSeleccionado}
                          onChange={(val, opt) => {
                            const provObj = opt?.raw || (provincias || []).find((p) => p.id === opt?.id || coincidenUrlsOIds(p.url, val));
                            const idProv = opt?.id ?? provObj?.id ?? extraerIdDeUrl(val) ?? null;
                            setFormulario((prev) => ({
                              ...prev,
                              lima_provincia: 'P',
                              provincia_url: val,
                              provincia_id: idProv,
                              provincia_nombre: opt?.label || provObj?.nombre || '',
                              provincia_obj: provObj ? { ...provObj, id: idProv } : null,
                            }));
                          }}
                          placeholder="Buscar entre todas las provincias..."
                          icon={<MapPin size={14} className="text-brand-primary" />}
                          minParaBusqueda={4}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
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
                                className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2 ${seleccionado
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
                            value={valorProvinciaSeleccionado}
                            onChange={(val, opt) => {
                              const provObj = opt?.raw || (provincias || []).find((p) => p.id === opt?.id || coincidenUrlsOIds(p.url, val));
                              const idProv = opt?.id ?? provObj?.id ?? extraerIdDeUrl(val) ?? null;
                              setFormulario((prev) => ({
                                ...prev,
                                lima_provincia: 'P',
                                provincia_url: val,
                                provincia_id: idProv,
                                provincia_nombre: opt?.label || provObj?.nombre || '',
                                provincia_obj: provObj ? { ...provObj, id: idProv } : null,
                              }));
                            }}
                            placeholder="Buscar provincia..."
                            icon={<MapPin size={14} className="text-brand-primary" />}
                            minParaBusqueda={6}
                          />
                        </div>
                      )}
                    </>
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
                          if (!extraerIdEmpresa(formulario.empresa_id)) {
                            return (
                              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border bg-red-100 text-red-700 border-red-300 animate-pulse">
                                Empresa Requerida
                              </span>
                            );
                          }
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
                        <label className={`block text-xs font-bold mb-1 uppercase tracking-wider flex items-center justify-between ${!extraerIdEmpresa(formulario.empresa_id) ? 'text-red-600 font-black' : 'text-gray-500'
                          }`}>
                          <span>Factura a Nombre De: *</span>
                          {!extraerIdEmpresa(formulario.empresa_id) && (
                            <span className="text-[10px] text-red-600 font-bold lowercase tracking-normal">
                              (Obligatorio: seleccione empresa)
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <select
                            value={extraerIdEmpresa(formulario.empresa_id) || ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              manejarCambio('empresa_id', val);
                            }}
                            className={`w-full appearance-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none transition-all ${!extraerIdEmpresa(formulario.empresa_id)
                              ? 'bg-red-50/70 border-2 border-red-500 text-red-700 ring-2 ring-red-100 focus:border-red-600 focus:ring-red-200'
                              : 'bg-white border-2 border-gray-100 focus:border-brand-primary text-brand-dark'
                              }`}
                          >
                            <option value="" className="text-gray-400 font-medium">
                              -- Seleccione a nombre de quién facturó --
                            </option>
                            {listaEmpresasDisponibles.map((emp) => (
                              <option key={emp.id} value={emp.id} className="text-gray-900 font-semibold">
                                {emp.nombre} {emp.tipo ? `(Tipo ${emp.tipo})` : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className={`absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${!extraerIdEmpresa(formulario.empresa_id) ? 'text-red-500' : 'text-gray-400'
                            }`} />
                        </div>
                        {!extraerIdEmpresa(formulario.empresa_id) && (
                          <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                            <AlertCircle size={12} className="shrink-0" />
                            Debe indicar a nombre de qué empresa está facturando para continuar.
                          </p>
                        )}
                      </div>

                      {/* Selector y Gestión de Proveedor */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Proveedor *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setModoCrearProveedor(!modoCrearProveedor);
                              setNuevoProveedor({ nro_ruc: '', razon_social: '', nombre_comercial: '' });
                              setAvisoRucProveedor(null);
                            }}
                            className="text-[10px] font-bold text-brand-primary hover:underline"
                          >
                            {modoCrearProveedor ? 'Cancelar' : '+ Nuevo Proveedor'}
                          </button>
                        </div>

                        {/* Botones directos con los 4 proveedores más comunes */}
                        {!modoCrearProveedor && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                              Proveedores frecuentes:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {proveedoresComunesEncontrados.map((item) => {
                                const estaSeleccionado = item.proveedor && formulario.proveedor_id === item.proveedor.id;
                                return (
                                  <button
                                    key={item.nombre}
                                    type="button"
                                    onClick={() => {
                                      if (item.proveedor) {
                                        seleccionarProveedor(item.proveedor.id, { raw: item.proveedor });
                                      } else {
                                        // Si aún no está en la BD con ese nombre, preparamos el formulario de nuevo proveedor
                                        setModoCrearProveedor(true);
                                        setNuevoProveedor((prev) => ({
                                          ...prev,
                                          nombre_comercial: item.nombre,
                                        }));
                                      }
                                    }}
                                    className={`px-2 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border text-center truncate ${
                                      estaSeleccionado
                                        ? 'bg-brand-primary text-white border-brand-primary shadow-xs ring-2 ring-brand-primary/20'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-brand-primary hover:bg-brand-light/40'
                                    }`}
                                    title={item.nombre}
                                  >
                                    {item.nombre}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Formulario de creación rápida de Proveedor */}
                        {modoCrearProveedor ? (
                          <div className="p-3 bg-brand-light/60 border border-brand-primary/20 rounded-xl space-y-2.5 animate-fade-in">
                            <span className="text-[11px] font-black text-brand-dark uppercase tracking-wider block">
                              Registrar Nuevo Proveedor
                            </span>

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
                                      consultarRucNuevoProveedor(val);
                                    } else {
                                      setAvisoRucProveedor(null);
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none font-mono focus:border-brand-primary bg-white"
                                />
                                {consultandoRucProveedorSunat && (
                                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                    <Loader2 size={13} className="animate-spin text-brand-primary" />
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

                            {/* Nombre comercial opcional */}
                            <div>
                              <input
                                type="text"
                                placeholder="Nombre Comercial (Opcional)"
                                value={nuevoProveedor.nombre_comercial}
                                onChange={(e) => setNuevoProveedor({ ...nuevoProveedor, nombre_comercial: e.target.value.toUpperCase() })}
                                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 outline-none uppercase focus:border-brand-primary bg-white"
                              />
                            </div>

                            {/* Aviso de validación RUC / SUNAT */}
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

                            <div className="flex justify-end gap-2 pt-1">
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
                                disabled={guardandoProveedor || consultandoRucProveedorSunat}
                                className="px-3.5 py-1 bg-brand-primary text-white rounded-lg text-xs font-bold hover:bg-brand-secondary transition-all disabled:opacity-50"
                              >
                                {guardandoProveedor ? 'Guardando...' : 'Crear y Asignar'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Combobox buscador de Proveedor */
                          <Combobox
                            options={opcionesProveedores}
                            value={formulario.proveedor_id}
                            onChange={(val, opt) => seleccionarProveedor(val, opt)}
                            placeholder="Buscar proveedor por nombre comercial o razón social..."
                            icon={<Building size={14} className="text-brand-primary" />}
                            minParaBusqueda={3}
                          />
                        )}

                        {/* Ficha resumen del proveedor seleccionado */}
                        {formulario.nro_ruc && formulario.razon_social && !modoCrearProveedor && (
                          <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 text-emerald-900 flex items-center justify-between text-xs animate-fade-in">
                            <div className="min-w-0 pr-2">
                              <span className="font-black block truncate uppercase">
                                {formulario.razon_social}
                              </span>
                              <span className="text-[10px] text-emerald-700 font-mono block">
                                RUC: {formulario.nro_ruc}
                              </span>
                            </div>
                            <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-800">
                              Asignado
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                          N° Factura / Boleta *
                        </label>
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
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                          Sede / Origen *
                        </label>
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
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">
                          Sede / Destino *
                        </label>
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
                        Foto o Ticket del Comprobante {subgastoExigeAdjunto(subgastoActivo) && '*'}
                        {subgastoExigeAdjunto(subgastoActivo) ? (
                          <span className="text-[10px] text-red-500 font-bold">(Obligatorio)</span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-bold">(Opcional para este concepto)</span>
                        )}
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
                    <div className={`mb-3 p-2.5 rounded-xl flex items-start gap-2 text-xs ${subgastoExigeAdjunto(subgastoActivo)
                      ? 'bg-amber-50/90 border border-amber-200/90 text-amber-900'
                      : 'bg-emerald-50/90 border border-emerald-200/90 text-emerald-900'
                      }`}>
                      {subgastoExigeAdjunto(subgastoActivo) ? (
                        <>
                          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] leading-snug">
                            <strong>Aviso:</strong> El comprobante es obligatorio al <strong>Liquidar</strong>. Si desea guardar este detalle como <strong>Borrador</strong>, puede registrarlo sin comprobante, pero recuerde que para liquidar se debe actualizar el registro con el adjunto correspondiente.
                          </p>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] leading-snug">
                            <strong>Concepto exento:</strong> Este subgasto no requiere adjuntar foto ni comprobante físico para poder ser liquidado.
                          </p>
                        </>
                      )}
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
                            src={resolverUrlAdjunto(formulario._preview || formulario.adj_cajachica)}
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
