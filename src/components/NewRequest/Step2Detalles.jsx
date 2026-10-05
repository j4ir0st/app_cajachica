import React, { useState, useRef, useMemo } from 'react';
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
  X
} from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { useCatalogoStore } from '../../store/catalogoStore';
import { fetchAuth } from '../../utils/fetchAuth';

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
  nro_factura: '',
  nro_ruc: '',
  placa: '',
  origen_url: null,
  destino_url: null,
  costo: '',
  detalle: '',
  fecha_gasto: new Date().toISOString().split('T')[0],
  adj_cajachica: null,
  _preview: null,
});

// ============================================================================
// FUNCIONES DE REGLAS DE NEGOCIO Y VISIBILIDAD POR ROL
// ============================================================================

/**
 * Determina si el puesto del usuario corresponde a Jefatura o Gestión.
 */
const esRolGestion = (puesto) => {
  const p = (puesto || '').toLowerCase();
  return ['gerente', 'jefe', 'coordinador', 'supervisor', 'planner'].some((rol) => p.includes(rol));
};

/**
 * Determina si el puesto del usuario corresponde a Personal Operativo.
 */
const esRolOperativo = (puesto) => {
  const p = (puesto || '').toLowerCase();
  return ['auxiliar', 'chofer', 'motorizado', 'conductor'].some((rol) => p.includes(rol));
};

/**
 * Filtra los subgastos según el puesto del usuario:
 * - Jefatura/Gestión: Visualiza todos los subgastos.
 * - Operativo: Visualiza únicamente los marcados con visible_para_operativo === true.
 * - Administrativo/Otros: Visualiza únicamente los marcados con visible_para_operativo === false.
 */
const filtrarSubgastosPorPuesto = (subgastos, puesto) => {
  if (!Array.isArray(subgastos) || subgastos.length === 0) return [];
  if (!puesto || esRolGestion(puesto)) return subgastos;
  if (esRolOperativo(puesto)) {
    const operativos = subgastos.filter((s) => s.visible_para_operativo === true);
    return operativos.length > 0 ? operativos : subgastos;
  }
  const administrativos = subgastos.filter((s) => !s.visible_para_operativo);
  return administrativos.length > 0 ? administrativos : subgastos;
};

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

// ============================================================================
// COMPONENTE PRINCIPAL: STEP 2 DETALLES
// ============================================================================

/**
 * Paso 2: Registro guiado de comprobantes de gasto con sub-wizard móvil y reglas reactivas.
 */
const Step2Detalles = ({ detalles, onChangeDetalles, onEliminarDetalle, montoLimite }) => {
  const { user } = useUserStore();
  const { tiposGasto, subgastos, entidades, provincias, cargando, error: errorCatalogo, cargarCatalogos } = useCatalogoStore();

  const [formulario, setFormulario] = useState(obtenerDetalleVacio());
  const [pasoWizard, setPasoWizard] = useState(1);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [errorLocal, setErrorLocal] = useState('');

  const referenciaArchivo = useRef(null);

  // Carga reactiva de catálogos si no están presentes en memoria
  React.useEffect(() => {
    if ((!tiposGasto || tiposGasto.length === 0 || !subgastos || subgastos.length === 0) && cargarCatalogos) {
      cargarCatalogos();
    }
  }, [tiposGasto, subgastos, cargarCatalogos]);

  // Subgastos visibles según el rol del usuario (con fallback seguro)
  const subgastosDisponibles = useMemo(() => {
    return filtrarSubgastosPorPuesto(subgastos, user?.puesto);
  }, [subgastos, user?.puesto]);

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

  // ============================================================================
  // MANEJADORES DE CAMBIO Y REGLAS REACTIVAS DEL FORMULARIO
  // ============================================================================

  const manejarCambio = (campo, valor) => {
    setErrorLocal('');
    setFormulario((prev) => ({ ...prev, [campo]: valor }));
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
      placa: subEncontrado.requiere_placa ? prev.placa : '',
      nro_ruc: subEncontrado.requiere_comprobante ? prev.nro_ruc : '',
      nro_factura: subEncontrado.requiere_comprobante ? prev.nro_factura : '',
    }));
  };

  const manejarArchivoImagen = (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    setErrorLocal('');
    const vistaPrevia = URL.createObjectURL(archivo);
    setFormulario((prev) => ({
      ...prev,
      adj_cajachica: archivo,
      _preview: vistaPrevia,
    }));
  };

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
        if (!formulario.nro_factura || formulario.nro_factura.trim() === '') {
          setErrorLocal('El número de comprobante/factura es obligatorio.');
          return false;
        }
      }

      if (subgastoActivo.requiere_placa) {
        if (!formulario.placa || formulario.placa.trim().length < 5) {
          setErrorLocal('Debe ingresar un número de placa vehicular válido.');
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
      if (!formulario.adj_cajachica && !formulario._preview) {
        setErrorLocal('Adjuntar la foto o comprobante es OBLIGATORIO para todo gasto.');
        return false;
      }
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
    setFormulario(obtenerDetalleVacio());
    setEditandoIdx(null);
    setPasoWizard(1);
    setErrorLocal('');
    setModalAbierto(true);
  };

  const abrirModalEdicion = (idx) => {
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

    setFormulario({
      ...item,
      tipogasto_url: tipoUrl || item.tipogasto_url,
      subgasto_url: item.subgasto_url || sub?.url,
      subgasto_obj: sub || item.subgasto_obj,
    });
    setEditandoIdx(idx);
    setPasoWizard(1);
    setErrorLocal('');
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setFormulario(obtenerDetalleVacio());
    setEditandoIdx(null);
    setErrorLocal('');
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
      {/* Cabecera y Resumen de Presupuesto */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-brand-dark tracking-tight">Comprobantes de Gasto</h2>
          <p className="text-xs text-gray-400">
            {detalles.length === 0
              ? 'Aún no ha registrado ningún gasto. Presione el botón para agregar.'
              : `${detalles.length} comprobante(s) registrado(s)`}
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 bg-brand-light/60 px-4 py-2.5 rounded-xl border border-brand-primary/10">
          <div className="text-left sm:text-right">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Acumulado</span>
            <span className={`text-base font-black ${superaLimite ? 'text-red-500' : 'text-brand-primary'}`}>
              S/ {totalActual.toFixed(2)}
            </span>
          </div>
          {montoLimite && (
            <div className="border-l border-gray-200 pl-4 text-left sm:text-right">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Límite Solicitado</span>
              <span className="text-sm font-bold text-gray-600">S/ {parseFloat(montoLimite).toFixed(2)}</span>
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
        AGREGAR COMPROBANTE DE GASTO
      </button>

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
                    {det._preview ? (
                      <img
                        src={det._preview}
                        alt="Comprobante"
                        className="w-14 h-14 object-cover rounded-xl border border-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-brand-light flex items-center justify-center text-brand-primary font-black shrink-0">
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
                  <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md font-semibold flex items-center gap-1">
                    <MapPin size={11} className="text-brand-primary" />
                    {det.lima_provincia === 'L' ? 'Lima' : `Provincia (${prov?.nombre || '—'})`}
                  </span>

                  {det.nro_factura && (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md font-semibold flex items-center gap-1">
                      <Receipt size={11} className="text-brand-primary" />
                      {det.nro_factura}
                    </span>
                  )}

                  {det.nro_ruc && (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-md font-semibold">
                      RUC: {det.nro_ruc}
                    </span>
                  )}

                  {det.placa && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-bold flex items-center gap-1">
                      <Car size={11} />
                      {det.placa}
                    </span>
                  )}

                  {orig && dest && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold">
                      {orig.sede || orig.nombre} ➔ {dest.sede || dest.nombre}
                    </span>
                  )}

                  {orig && !dest && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold flex items-center gap-1">
                      <Building size={11} />
                      {orig.sede || orig.nombre}
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
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
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
                    <div className="relative">
                      <select
                        value={valorSubgastoSeleccionado}
                        onChange={(e) => seleccionarSubGasto(e.target.value || null)}
                        disabled={subgastosPorTipo.length === 0}
                        className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors disabled:opacity-50 disabled:bg-gray-50"
                      >
                        <option value="">
                          {subgastosPorTipo.length === 0 ? 'Seleccione primero un Tipo' : 'Seleccione concepto...'}
                        </option>
                        {subgastosPorTipo.map((s) => (
                          <option key={s.url} value={s.url}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
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
                      <div className="relative">
                        <select
                          value={formulario.provincia_url || ''}
                          onChange={(e) => manejarCambio('provincia_url', e.target.value || null)}
                          className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-3 text-sm font-semibold text-brand-dark outline-none transition-colors"
                        >
                          <option value="">Seleccione provincia...</option>
                          {provincias.map((p) => (
                            <option key={p.url} value={p.url}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
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

                  {/* Comprobante Fiscal (RUC y Factura/Boleta) */}
                  {subgastoActivo?.requiere_comprobante && (
                    <div className="space-y-3 bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-brand-dark flex items-center gap-1.5">
                        <Receipt size={14} className="text-brand-primary" />
                        Comprobante Fiscal Electrónico
                      </span>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">N° RUC *</label>
                        <input
                          type="text"
                          maxLength={11}
                          placeholder="20XXXXXXXXX (11 dígitos)"
                          value={formulario.nro_ruc}
                          onChange={(e) => manejarCambio('nro_ruc', e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                        />
                      </div>
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
                      <label className="block text-xs font-black text-brand-dark uppercase tracking-wider flex items-center gap-1.5">
                        <Car size={14} className="text-brand-primary" />
                        Placa del Vehículo *
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        placeholder="Ej: ABC-123"
                        value={formulario.placa}
                        onChange={(e) => manejarCambio('placa', e.target.value.toUpperCase())}
                        className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-bold text-brand-dark outline-none transition-colors"
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
                        <div className="relative">
                          <select
                            value={formulario.origen_url || ''}
                            onChange={(e) => manejarCambio('origen_url', e.target.value || null)}
                            className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                          >
                            <option value="">Seleccione origen...</option>
                            {entidades.map((ent) => (
                              <option key={ent.url} value={ent.url}>
                                {ent.codigo_sede ? `${ent.codigo_sede} - ` : ''}{ent.sede || ent.nombre}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Sede / Destino *</label>
                        <div className="relative">
                          <select
                            value={formulario.destino_url || ''}
                            onChange={(e) => manejarCambio('destino_url', e.target.value || null)}
                            className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                          >
                            <option value="">Seleccione destino...</option>
                            {entidades.map((ent) => (
                              <option key={ent.url} value={ent.url}>
                                {ent.codigo_sede ? `${ent.codigo_sede} - ` : ''}{ent.sede || ent.nombre}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
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
                      <div className="relative">
                        <select
                          value={formulario.origen_url || ''}
                          onChange={(e) => manejarCambio('origen_url', e.target.value || null)}
                          className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                        >
                          <option value="">Seleccione sede...</option>
                          {entidades.map((ent) => (
                            <option key={ent.url} value={ent.url}>
                              {ent.codigo_sede ? `${ent.codigo_sede} - ` : ''}{ent.sede || ent.nombre}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MICRO-PASO 4: Foto / Comprobante Obligatorio y Detalle */}
              {pasoWizard === 4 && (
                <div className="space-y-4 animate-fade-in">
                  {/* Foto / Comprobante (Obligatorio) */}
                  <div>
                    <label className="block text-xs font-black text-brand-dark uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Camera size={14} className="text-brand-primary" />
                      Foto o Ticket del Comprobante *
                      <span className="text-[10px] text-red-500 font-bold">(Obligatorio)</span>
                    </label>

                    <input
                      ref={referenciaArchivo}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={manejarArchivoImagen}
                      className="hidden"
                    />

                    {formulario._preview ? (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-brand-primary/30 p-2 bg-brand-light/30 flex items-center gap-4">
                        <img
                          src={formulario._preview}
                          alt="Vista previa"
                          className="w-20 h-20 object-cover rounded-xl border border-gray-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-brand-dark truncate">
                            {formulario.adj_cajachica?.name || 'Foto capturada'}
                          </p>
                          <p className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Comprobante cargado
                          </p>
                          <button
                            type="button"
                            onClick={() => referenciaArchivo.current?.click()}
                            className="mt-2 text-xs text-brand-primary font-bold hover:underline"
                          >
                            Cambiar imagen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => referenciaArchivo.current?.click()}
                        className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-brand-primary/40 bg-brand-light/30 hover:bg-brand-light/60 flex flex-col items-center justify-center gap-2 transition-all group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                          <Camera size={24} />
                        </div>
                        <span className="text-xs font-bold text-brand-primary">Tomar Foto o Subir Archivo</span>
                        <span className="text-[10px] text-gray-400">JPG, PNG o foto directa desde celular</span>
                      </button>
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
        </div>
      )}
    </div>
  );
};

export default Step2Detalles;
