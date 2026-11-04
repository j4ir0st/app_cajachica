import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  Send,
  FileText,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  CheckSquare,
  Tag,
  Edit2
} from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { useCatalogoStore } from '../store/catalogoStore';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { obtenerTipoCaja, extraerIdEmpresa, clasificarTipoCajaAprobacion } from '../utils/tipoCaja';
import { CLAVES_CATALOGO, leerDeCache, guardarEnCache } from '../utils/catalogoCache';
import { esArchivoPdf } from '../utils/archivoUtil';
import { resolverRutaOEntidad } from '../utils/entidades';
import { esGerenteOperaciones, esSuperusuario, puedeAccederCierreCaja, esMandoArea, obtenerAreaLimpia } from '../utils/permisos';
import { normalizarTexto } from '../utils/reglasAccesos';
import ModalVisorComprobante from '../components/ModalVisorComprobante';
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

/**
 * Extrae la información del subgasto principal (primer registro de detalle) de un requerimiento
 * para que el auditor pueda conocer preliminarmente de qué trata el gasto antes de entrar al detalle.
 */
const obtenerPrimerSubgasto = (req) => {
  if (!req) return null;
  const detalles = req.detalle || req.detalles || [];
  if (!Array.isArray(detalles) || detalles.length === 0) return null;

  const primer = detalles[0];
  if (!primer) return null;

  let nombreSubgasto = '';
  if (typeof primer.subgasto_id === 'object' && primer.subgasto_id) {
    nombreSubgasto = primer.subgasto_id.nombre || primer.subgasto_id.subgasto_nombre || '';
  } else if (typeof primer.subgasto_nombre === 'string') {
    nombreSubgasto = primer.subgasto_nombre;
  } else if (typeof primer.subgasto === 'string') {
    nombreSubgasto = primer.subgasto;
  } else if (typeof primer.subgasto_id === 'string' && !primer.subgasto_id.startsWith('http')) {
    nombreSubgasto = primer.subgasto_id;
  }

  const cantidadOtros = detalles.length - 1;
  const descripcion = (primer.detalle || '').trim();

  return {
    nombreSubgasto: nombreSubgasto || 'Gasto registrado',
    tipoGasto: primer.subgasto_id?.tipogasto_id?.nombre || primer.tipogasto_id?.nombre || null,
    descripcion,
    cantidadOtros,
  };
};

// ============================================================================
// COMPONENTE PRINCIPAL: APROBACIONES
// ============================================================================

const Aprobaciones = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { entidades } = useCatalogoStore();

  const esGerente = useMemo(() => esGerenteOperaciones(user), [user]);
  const esSuper = useMemo(() => esSuperusuario(user), [user]);
  const esMando = useMemo(() => esMandoArea(user), [user]);
  const areaUsuarioLimpia = useMemo(() => obtenerAreaLimpia(user), [user]);

  const puedeEditarRequerimientos = useMemo(() => {
    return esGerenteOperaciones(user) || esSuperusuario(user);
  }, [user]);

  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  // Catálogo de usuarios en memoria para resolución de empr_id
  const [usuarios, setUsuarios] = useState(() => leerDeCache(CLAVES_CATALOGO.usuarios) || []);

  // Filtros y Búsqueda: Por defecto siempre se muestra lo pendiente de revisión o aprobación
  const [busqueda, setBusqueda] = useState('');
  const [buscandoRemoto, setBuscandoRemoto] = useState(false);
  const [filtroRevision, setFiltroRevision] = useState('PENDIENTES'); // 'PENDIENTES' | 'REVISADOS'
  const [filtroTipoCaja, setFiltroTipoCaja] = useState(null); // null | 'A' | 'B' | 'C_SGC' | 'C_RRM'

  // Estados de conmutación de revisión gerencial y aprobación de jefatura
  const [conmutandoId, setConmutandoId] = useState(null);
  const [conmutandoMasivo, setConmutandoMasivo] = useState(false);
  const [conmutandoAprobacionId, setConmutandoAprobacionId] = useState(null);

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
        top: '100',
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

  // Carga perezosa de usuarios si no están en memoria/caché para la clasificación por empresa
  useEffect(() => {
    if (usuarios && usuarios.length > 0) return;
    const cargarUsuariosRespaldo = async () => {
      try {
        const enCache = leerDeCache(CLAVES_CATALOGO.usuarios);
        if (enCache && enCache.length > 0) {
          setUsuarios(enCache);
          return;
        }
        const res = await fetchAuth(`${API_URL}/users/?format=json&is_active=true&top=1000`);
        if (res.ok) {
          const json = await res.json();
          const lista = json.results ?? (Array.isArray(json) ? json : []);
          guardarEnCache(CLAVES_CATALOGO.usuarios, lista);
          setUsuarios(lista);
        }
      } catch (err) {
        console.warn('[Aprobaciones] No se pudo cargar catálogo de usuarios para clasificación:', err);
      }
    };
    cargarUsuariosRespaldo();
  }, [usuarios]);

  // ============================================================================
  // GESTIÓN DE REVISIÓN GERENCIAL (CAMPO REVISADO / REVISION)
  // ============================================================================

  const handleToggleRevision = async (req, e) => {
    if (e) e.stopPropagation();
    if (conmutandoId === req.id || conmutandoMasivo) return;

    const valorActual = Boolean(req.revisado || req.revision);
    const nuevoValor = !valorActual;
    setConmutandoId(req.id);

    // Actualización optimista inmediata en memoria
    setSolicitudes((prev) =>
      prev.map((s) => (s.id === req.id ? { ...s, revisado: nuevoValor, revision: nuevoValor } : s))
    );
    if (solicitudAuditoria && solicitudAuditoria.id === req.id) {
      setSolicitudAuditoria((prev) => ({ ...prev, revisado: nuevoValor, revision: nuevoValor }));
    }

    try {
      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${req.id}/revisar/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisado: nuevoValor }),
      });

      if (!res.ok) {
        // Revertir en caso de error
        setSolicitudes((prev) =>
          prev.map((s) => (s.id === req.id ? { ...s, revisado: valorActual, revision: valorActual } : s))
        );
        if (solicitudAuditoria && solicitudAuditoria.id === req.id) {
          setSolicitudAuditoria((prev) => ({ ...prev, revisado: valorActual, revision: valorActual }));
        }
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }
    } catch (err) {
      console.error('[Aprobaciones] Error al conmutar revisión:', err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Marcar Revisión',
        mensaje: err.message || 'No se pudo actualizar el estado de revisión.',
      });
    } finally {
      setConmutandoId(null);
    }
  };

  // ============================================================================
  // GESTIÓN DE PRE-APROBACIÓN DE JEFE DE ÁREA (OPCIÓN B: /aprobar-jefe/)
  // ============================================================================

  const handleToggleAprobacionJefe = async (req, e) => {
    if (e) e.stopPropagation();
    if (conmutandoAprobacionId === req.id) return;

    const valorActual = Boolean(req.aprobado);
    const nuevoValor = !valorActual;
    setConmutandoAprobacionId(req.id);

    const ahoraIso = new Date().toISOString();
    const nombreJefe = user?.full_name || user?.nombre || user?.username || 'Jefe de Área';

    // Actualización optimista inmediata en memoria
    setSolicitudes((prev) =>
      prev.map((s) =>
        s.id === req.id
          ? {
              ...s,
              aprobado: nuevoValor,
              aprobado_por: nuevoValor ? user?.id : null,
              aprobado_por_nombre: nuevoValor ? nombreJefe : null,
              fecha_aprobacion: nuevoValor ? ahoraIso : null,
            }
          : s
      )
    );
    if (solicitudAuditoria && solicitudAuditoria.id === req.id) {
      setSolicitudAuditoria((prev) => ({
        ...prev,
        aprobado: nuevoValor,
        aprobado_por: nuevoValor ? user?.id : null,
        aprobado_por_nombre: nuevoValor ? nombreJefe : null,
        fecha_aprobacion: nuevoValor ? ahoraIso : null,
      }));
    }

    try {
      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${req.id}/aprobar-jefe/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobado: nuevoValor }),
      });

      if (!res.ok) {
        // Revertir optimismo en caso de error
        setSolicitudes((prev) =>
          prev.map((s) =>
            s.id === req.id
              ? {
                  ...s,
                  aprobado: valorActual,
                  aprobado_por: req.aprobado_por,
                  aprobado_por_nombre: req.aprobado_por_nombre,
                  fecha_aprobacion: req.fecha_aprobacion,
                }
              : s
          )
        );
        if (solicitudAuditoria && solicitudAuditoria.id === req.id) {
          setSolicitudAuditoria((prev) => ({
            ...prev,
            aprobado: valorActual,
            aprobado_por: req.aprobado_por,
            aprobado_por_nombre: req.aprobado_por_nombre,
            fecha_aprobacion: req.fecha_aprobacion,
          }));
        }
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      const respuestaData = await res.json().catch(() => null);
      if (respuestaData) {
        setSolicitudes((prev) =>
          prev.map((s) => (s.id === req.id ? { ...s, ...respuestaData } : s))
        );
        if (solicitudAuditoria && solicitudAuditoria.id === req.id) {
          setSolicitudAuditoria((prev) => ({ ...prev, ...respuestaData }));
        }
      }

      setNotificacion({
        tipo: 'exito',
        titulo: nuevoValor ? 'Requerimiento Pre-Aprobado' : 'Aprobación Removida',
        mensaje: nuevoValor
          ? `El requerimiento #${req.id} fue pre-aprobado exitosamente.`
          : `Se removió la pre-aprobación del requerimiento #${req.id}.`,
      });
    } catch (err) {
      console.error('[Aprobaciones] Error al conmutar aprobación:', err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error en Aprobación',
        mensaje: err.message || 'No se pudo actualizar el estado de aprobación.',
      });
    } finally {
      setConmutandoAprobacionId(null);
    }
  };

  const handleRevisarMasivo = async (marcarComo = true) => {
    if (conmutandoMasivo) return;

    const requerimientosAfectados = solicitudesFiltradas.filter(
      (r) => Boolean(r.revisado || r.revision) !== marcarComo
    );

    if (requerimientosAfectados.length === 0) return;

    const ids = requerimientosAfectados.map((r) => r.id);
    const idSet = new Set(ids);
    setConmutandoMasivo(true);

    // Actualización optimista inmediata
    setSolicitudes((prev) =>
      prev.map((s) => (idSet.has(s.id) ? { ...s, revisado: marcarComo, revision: marcarComo } : s))
    );

    try {
      const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/revisar-masivo/?format=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, revisado: marcarComo }),
      });

      if (!res.ok) {
        // Revertir optimismo
        setSolicitudes((prev) =>
          prev.map((s) => (idSet.has(s.id) ? { ...s, revisado: !marcarComo, revision: !marcarComo } : s))
        );
        const errorDetallado = await extraerMensajeError(res);
        throw new Error(errorDetallado);
      }

      setNotificacion({
        tipo: 'exito',
        titulo: marcarComo ? 'Revisión Masiva Aplicada' : 'Revisión Limpiada',
        mensaje: `Se actualizaron ${ids.length} requerimiento(s) como ${marcarComo ? 'revisados' : 'pendientes de revisión'}.`,
      });
    } catch (err) {
      console.error('[Aprobaciones] Error en revisión masiva:', err);
      setNotificacion({
        tipo: 'error',
        titulo: 'Error en Acción Masiva',
        mensaje: err.message || 'No se pudo aplicar la revisión en lote.',
      });
    } finally {
      setConmutandoMasivo(false);
    }
  };

  // ============================================================================
  // FILTRADO REACTIVO EN MEMORIA
  // ============================================================================

  const solicitudesFiltradas = useMemo(() => {
    let base = solicitudes;

    // 1. Filtrar por área si el usuario es Coordinador, Jefe o Supervisor (y no es Gerente ni Superusuario)
    if (!esGerente && !esSuper && esMando && areaUsuarioLimpia) {
      base = base.filter((req) => {
        const areaReq = normalizarTexto(
          typeof req.area_id === 'object'
            ? (req.area_id?.nombre || req.area_id?.area_nombre || '')
            : String(req.area_id || req.area || '')
        );
        return areaReq.includes(areaUsuarioLimpia) || areaUsuarioLimpia.includes(areaReq);
      });
    }

    // 2. Búsqueda por texto o ID
    if (busqueda.trim()) {
      const query = busqueda.toLowerCase().trim();
      const querySinHash = query.replace(/^#/, '');
      base = base.filter((req) => {
        const idTexto = String(req.id || '').toLowerCase();
        const solicitanteTexto = obtenerNombreSolicitante(req.usuario_id).toLowerCase();
        const obsTexto = (req.obs || '').toLowerCase();
        const areaTexto = String(req.area_id || '').toLowerCase();
        const detallesTexto = (req.detalle || req.detalles || [])
          .map((d) => `${d.detalle || ''} ${d.nro_factura || ''} ${d.nro_ruc || ''} ${d.placa_nombre || d.placa || ''} ${d.subgasto_id?.nombre || ''}`)
          .join(' ')
          .toLowerCase();

        return (
          idTexto === querySinHash ||
          idTexto.includes(querySinHash) ||
          idTexto.includes(query) ||
          solicitanteTexto.includes(query) ||
          obsTexto.includes(query) ||
          areaTexto.includes(query) ||
          detallesTexto.includes(query)
        );
      });
    }

    // 3. Filtrado por estado de revisión/aprobación
    if (esGerente) {
      if (filtroRevision === 'REVISADOS') {
        base = base.filter((r) => Boolean(r.revisado || r.revision));
      } else if (filtroRevision === 'PENDIENTES') {
        base = base.filter((r) => !Boolean(r.revisado || r.revision));
      }
    } else if (esMando) {
      if (filtroRevision === 'REVISADOS') {
        base = base.filter((r) => Boolean(r.aprobado));
      } else if (filtroRevision === 'PENDIENTES') {
        base = base.filter((r) => !Boolean(r.aprobado));
      }
    }

    // 4. Filtrado por tipo de caja
    if (filtroTipoCaja) {
      base = base.filter((req) => clasificarTipoCajaAprobacion(req, usuarios)?.tipo === filtroTipoCaja);
    }

    return base;
  }, [solicitudes, busqueda, esGerente, esSuper, esMando, areaUsuarioLimpia, filtroRevision, filtroTipoCaja, usuarios]);

  // Conteo reactivo por tipo de caja (SURGICORP: A, RRMEDICAL: B, SIN FACTURA SGC: C_SGC, SIN FACTURA RRM: C_RRM)
  const conteoTiposCaja = useMemo(() => {
    let base = solicitudes;

    if (busqueda.trim()) {
      const query = busqueda.toLowerCase().trim();
      const querySinHash = query.replace(/^#/, '');
      base = base.filter((req) => {
        const idTexto = String(req.id || '').toLowerCase();
        const solicitanteTexto = obtenerNombreSolicitante(req.usuario_id).toLowerCase();
        const obsTexto = (req.obs || '').toLowerCase();
        const areaTexto = String(req.area_id || '').toLowerCase();
        const detallesTexto = (req.detalle || req.detalles || [])
          .map((d) => `${d.detalle || ''} ${d.nro_factura || ''} ${d.nro_ruc || ''} ${d.placa_nombre || d.placa || ''} ${d.subgasto_id?.nombre || ''}`)
          .join(' ')
          .toLowerCase();

        return (
          idTexto === querySinHash ||
          idTexto.includes(querySinHash) ||
          idTexto.includes(query) ||
          solicitanteTexto.includes(query) ||
          obsTexto.includes(query) ||
          areaTexto.includes(query) ||
          detallesTexto.includes(query)
        );
      });
    }

    if (esGerente) {
      if (filtroRevision === 'REVISADOS') {
        base = base.filter((r) => Boolean(r.revisado || r.revision));
      } else {
        base = base.filter((r) => !Boolean(r.revisado || r.revision));
      }
    }

    const c = {
      A: { count: 0, monto: 0 },
      B: { count: 0, monto: 0 },
      C_SGC: { count: 0, monto: 0 },
      C_RRM: { count: 0, monto: 0 },
    };
    for (const req of base) {
      const t = clasificarTipoCajaAprobacion(req, usuarios)?.tipo;
      const gasto = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      const monto = isNaN(gasto) ? 0 : gasto;
      if (t && c[t]) {
        c[t].count += 1;
        c[t].monto += monto;
      }
    }
    return c;
  }, [solicitudes, busqueda, esGerente, filtroRevision, usuarios]);

  // Identificador textual del tipo de caja actualmente filtrado
  const etiquetaTipoCajaFiltro = useMemo(() => {
    if (filtroTipoCaja === 'A') return 'Surgicorp';
    if (filtroTipoCaja === 'B') return 'RR Medical';
    if (filtroTipoCaja === 'C_SGC') return 'Sin Factura SGC';
    if (filtroTipoCaja === 'C_RRM') return 'Sin Factura RRM';
    return '';
  }, [filtroTipoCaja]);

  // Búsqueda Inteligente: En memoria primero; si no hay coincidencias o se busca por ID no cargado, consultar BD
  useEffect(() => {
    const termino = busqueda.trim();
    if (!termino) {
      setBuscandoRemoto(false);
      return;
    }

    const idLimpio = termino.replace(/^#/, '').trim();
    const esIdNumerico = /^\d+$/.test(idLimpio);
    const idEncontradoEnMemoria = esIdNumerico && solicitudes.some((s) => String(s.id) === idLimpio);

    // Si ya existe en memoria el ID o la búsqueda de texto ya tiene resultados locales, evitar consultar a la BD
    if (idEncontradoEnMemoria) return;
    if (!esIdNumerico && solicitudesFiltradas.length > 0) return;

    const temporizador = setTimeout(async () => {
      setBuscandoRemoto(true);
      try {
        if (esIdNumerico) {
          const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${idLimpio}/?format=json`);
          if (res.ok) {
            const req = await res.json();
            setSolicitudes((prev) => {
              const existe = prev.some((s) => s.id === req.id);
              return existe ? prev : [req, ...prev];
            });
          }
        } else {
          const params = new URLSearchParams({
            format: 'json',
            estado_requerimiento: 'LQ',
            search: termino,
            top: '100',
          });
          const res = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            const lista = data.results ?? (Array.isArray(data) ? data : []);
            if (lista.length > 0) {
              setSolicitudes((prev) => {
                const idsExistentes = new Set(prev.map((s) => s.id));
                const nuevos = lista.filter((s) => !idsExistentes.has(s.id));
                return nuevos.length > 0 ? [...prev, ...nuevos] : prev;
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Aprobaciones] Búsqueda remota sin resultados:', err.message);
      } finally {
        setBuscandoRemoto(false);
      }
    }, 400);

    return () => clearTimeout(temporizador);
  }, [busqueda, solicitudes.length, solicitudesFiltradas.length]);

  // ============================================================================
  // TOTALES Y KPIS DE REVISIÓN GERENCIAL Y AUDITORÍA
  // ============================================================================

  const metricasRevision = useMemo(() => {
    // Si hay un filtro por tipo de caja activo, calculamos los KPIs en base a dicho tipo
    const base = filtroTipoCaja
      ? solicitudes.filter((req) => clasificarTipoCajaAprobacion(req, usuarios)?.tipo === filtroTipoCaja)
      : solicitudes;

    const totalCount = base.length;
    let totalMonto = 0;
    let revisadosCount = 0;
    let revisadosMonto = 0;

    for (const req of base) {
      const gasto = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      const montoValido = isNaN(gasto) ? 0 : gasto;
      totalMonto += montoValido;

      if (req.revisado || req.revision) {
        revisadosCount += 1;
        revisadosMonto += montoValido;
      }
    }

    const faltantesCount = totalCount - revisadosCount;
    const faltantesMonto = Math.max(0, totalMonto - revisadosMonto);
    const porcentajeRevisado = totalCount > 0 ? Math.round((revisadosCount / totalCount) * 100) : 0;

    return {
      totalCount,
      totalMonto,
      revisadosCount,
      revisadosMonto,
      faltantesCount,
      faltantesMonto,
      porcentajeRevisado,
    };
  }, [solicitudes, filtroTipoCaja, usuarios]);

  // Métricas reactivas de pre-aprobación para Jefes, Coordinadores y Supervisores de área
  const metricasAprobacionArea = useMemo(() => {
    let base = solicitudes;
    if (!esGerente && !esSuper && esMando && areaUsuarioLimpia) {
      base = base.filter((req) => {
        const areaReq = normalizarTexto(
          typeof req.area_id === 'object'
            ? (req.area_id?.nombre || req.area_id?.area_nombre || '')
            : String(req.area_id || req.area || '')
        );
        return areaReq.includes(areaUsuarioLimpia) || areaUsuarioLimpia.includes(areaReq);
      });
    }

    if (filtroTipoCaja) {
      base = base.filter((req) => clasificarTipoCajaAprobacion(req, usuarios)?.tipo === filtroTipoCaja);
    }

    const totalCount = base.length;
    let totalMonto = 0;
    let aprobadosCount = 0;
    let aprobadosMonto = 0;

    for (const req of base) {
      const gasto = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      const montoValido = isNaN(gasto) ? 0 : gasto;
      totalMonto += montoValido;

      if (req.aprobado) {
        aprobadosCount += 1;
        aprobadosMonto += montoValido;
      }
    }

    const faltantesCount = totalCount - aprobadosCount;
    const faltantesMonto = Math.max(0, totalMonto - aprobadosMonto);
    const porcentajeAprobado = totalCount > 0 ? Math.round((aprobadosCount / totalCount) * 100) : 0;

    return {
      totalCount,
      totalMonto,
      aprobadosCount,
      aprobadosMonto,
      faltantesCount,
      faltantesMonto,
      porcentajeAprobado,
    };
  }, [solicitudes, filtroTipoCaja, usuarios, esGerente, esSuper, esMando, areaUsuarioLimpia]);

  const totalMontoAuditoria = useMemo(() => {
    const base = filtroTipoCaja
      ? solicitudes.filter((req) => clasificarTipoCajaAprobacion(req, usuarios)?.tipo === filtroTipoCaja)
      : solicitudes;
    return base.reduce((acc, req) => {
      const gasto = parseFloat(req.total_gastado || req.monto_solicitado || 0);
      return acc + (isNaN(gasto) ? 0 : gasto);
    }, 0);
  }, [solicitudes, filtroTipoCaja, usuarios]);

  const totalComprobantes = useMemo(() => {
    const base = filtroTipoCaja
      ? solicitudes.filter((req) => clasificarTipoCajaAprobacion(req, usuarios)?.tipo === filtroTipoCaja)
      : solicitudes;
    return base.reduce((acc, req) => acc + (req.detalle || req.detalles || []).length, 0);
  }, [solicitudes, filtroTipoCaja, usuarios]);

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
  // GESTIÓN DE EDICIÓN DE REQUERIMIENTOS (GERENTE DE OPERACIONES / SUPERUSUARIOS)
  // ============================================================================

  const manejarEditarRequerimiento = async (req) => {
    if (!puedeEditarRequerimientos || !req) return;

    // Si ya tiene los comprobantes completos en memoria como array de objetos
    const detallesExistentes = req.detalle || req.detalles;
    if (
      Array.isArray(detallesExistentes) &&
      detallesExistentes.length > 0 &&
      typeof detallesExistentes[0] === 'object'
    ) {
      navigate('/nueva-solicitud', { state: { requerimientoAEditar: req, desdeRuta: '/aprobaciones' } });
      return;
    }

    // Si solo tiene IDs o URLs, obtener el requerimiento completo con sus comprobantes
    try {
      const resReq = await fetchAuth(`${API_URL}/Requerimiento_CajaChica/${req.id}/?format=json`);
      if (resReq.ok) {
        const dataReq = await resReq.json();
        const itemsReq = dataReq.detalle || dataReq.detalles;
        if (Array.isArray(itemsReq) && itemsReq.length > 0 && typeof itemsReq[0] === 'object') {
          navigate('/nueva-solicitud', { state: { requerimientoAEditar: dataReq, desdeRuta: '/aprobaciones' } });
          return;
        }
      }

      // Fallback complementario desde RC_Detalle
      const resDet = await fetchAuth(`${API_URL}/RC_Detalle/?requerimiento_id=${req.id}&format=json`);
      if (resDet.ok) {
        const dataDet = await resDet.json();
        const listaDet = dataDet.results ?? (Array.isArray(dataDet) ? dataDet : []);
        const reqConDetalles = {
          ...req,
          detalle: listaDet,
          detalles: listaDet,
        };
        navigate('/nueva-solicitud', { state: { requerimientoAEditar: reqConDetalles, desdeRuta: '/aprobaciones' } });
        return;
      }

      navigate('/nueva-solicitud', { state: { requerimientoAEditar: req, desdeRuta: '/aprobaciones' } });
    } catch (err) {
      console.error(`[Aprobaciones] Error al obtener detalles del requerimiento #${req.id} para edición:`, err);
      navigate('/nueva-solicitud', { state: { requerimientoAEditar: req, desdeRuta: '/aprobaciones' } });
    }
  };

  // ============================================================================
  // ACCIÓN: POSTERGAR A LA SIGUIENTE SEMANA
  // ============================================================================

  const ejecutarPostergacion = async () => {
    if (!modalPostergar || (!esGerente && !esSuper)) return;
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
            const idEmp = extraerIdEmpresa(det.empresa_id || det.empresa);
            const empVal = idEmp ? `${API_URL}/Empresa/${idEmp}/` : null;
            if (empVal) formDataDetalle.append('empresa_id', empVal);
            const placaVal = det.placa_id?.url || (typeof det.placa_id === 'string' && det.placa_id.startsWith('http') ? det.placa_id : (det.placa_id ? `${API_URL}/RC_Placas/${det.placa_id}/` : null));
            if (placaVal) {
              formDataDetalle.append('placa_id', placaVal);
            } else if (det.placa) {
              formDataDetalle.append('placa', det.placa);
            }
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
          <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">
            {esGerente ? 'Auditoría y Aprobaciones Gerenciales' : 'Bandeja de Aprobaciones'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
            {esGerente
              ? 'Control gerencial de rendiciones liquidadas, revisión de comprobantes y validación previa al cierre.'
              : 'Revisión y visto bueno previo de rendiciones liquidadas antes del cierre semanal.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarSolicitudes}
            disabled={cargando || procesandoAccion || conmutandoMasivo}
            className="p-2 rounded-2xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all disabled:opacity-50 shadow-sm"
            title="Recargar rendiciones"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin text-brand-primary' : ''} />
          </button>

          {puedeAccederCierreCaja(user) && (
            <button
              onClick={() => navigate('/cierre-caja')}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-md shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span>Ir a Cierre de Caja</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Panel Superior de Métricas: Solo el Gerente de Operaciones ve el recuento de revisados vs faltantes */}
      {esGerente ? (
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm shrink-0 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* 1. Total por Revisar / Aprobar */}
            <div className="bg-brand-light/50 border border-gray-100 rounded-xl p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <span>Total por Aprobar</span>
                  {etiquetaTipoCajaFiltro && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-brand-primary/10 text-brand-primary normal-case">
                      ({etiquetaTipoCajaFiltro})
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-bold text-brand-primary bg-white px-2 py-0.5 rounded-md border border-gray-100">
                  {metricasRevision.totalCount} reg.
                </span>
              </div>
              <div className="mt-1">
                <span className="text-base sm:text-lg font-black text-brand-dark">
                  S/ {metricasRevision.totalMonto.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 2. Revisados por el Gerente */}
            <div
              onClick={() => setFiltroRevision('REVISADOS')}
              className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                filtroRevision === 'REVISADOS'
                  ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-400/30'
                  : 'bg-emerald-50/70 border-emerald-100 hover:border-emerald-300'
              }`}
              title="Filtrar rendiciones ya revisadas"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  <span>Revisados por Gerente</span>
                  {etiquetaTipoCajaFiltro && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-200/70 text-emerald-800 normal-case">
                      ({etiquetaTipoCajaFiltro})
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-black text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                  {metricasRevision.revisadosCount} ({metricasRevision.porcentajeRevisado}%)
                </span>
              </div>
              <div className="mt-1">
                <span className="text-base sm:text-lg font-black text-emerald-600">
                  S/ {metricasRevision.revisadosMonto.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 3. Falta Revisar */}
            <div
              onClick={() => setFiltroRevision('PENDIENTES')}
              className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                filtroRevision === 'PENDIENTES'
                  ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/30'
                  : 'bg-amber-50/70 border-amber-100 hover:border-amber-300'
              }`}
              title="Filtrar rendiciones pendientes de revisión"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                  <span>Falta Revisar</span>
                  {etiquetaTipoCajaFiltro && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-900 normal-case">
                      ({etiquetaTipoCajaFiltro})
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-black text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                  {metricasRevision.faltantesCount} reg.
                </span>
              </div>
              <div className="mt-1">
                <span className="text-base sm:text-lg font-black text-amber-600">
                  S/ {metricasRevision.faltantesMonto.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 4. Avance y Acciones Rápidas Masivas */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <span>Progreso Gerencial</span>
                  {etiquetaTipoCajaFiltro && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-200 text-gray-700 normal-case">
                      ({etiquetaTipoCajaFiltro})
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-black text-brand-dark">
                  {metricasRevision.revisadosCount} / {metricasRevision.totalCount}
                </span>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 my-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${metricasRevision.porcentajeRevisado}%` }}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRevisarMasivo(true)}
                  disabled={conmutandoMasivo || metricasRevision.faltantesCount === 0}
                  className="flex-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-lg transition-all disabled:opacity-40 truncate shadow-xs"
                  title="Marcar todos los requerimientos pendientes como revisados"
                >
                  {conmutandoMasivo ? 'Procesando...' : 'Revisar Todo'}
                </button>

                {metricasRevision.revisadosCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRevisarMasivo(false)}
                    disabled={conmutandoMasivo}
                    className="py-1 px-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-[10px] rounded-lg transition-all disabled:opacity-40 truncate"
                    title="Desmarcar revisión de todos los requerimientos"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : esMando ? (
        /* Panel de Métricas para Jefes, Coordinadores y Supervisores de Área */
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm shrink-0 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* 1. Total del Área */}
            <div className="bg-brand-light/50 border border-gray-100 rounded-xl p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <span>Rendiciones de mi Área</span>
                </span>
                <span className="text-[10px] font-bold text-brand-primary bg-white px-2 py-0.5 rounded-md border border-gray-100">
                  {metricasAprobacionArea.totalCount} reg.
                </span>
              </div>
              <div className="mt-1">
                <span className="text-base sm:text-lg font-black text-brand-dark">
                  S/ {metricasAprobacionArea.totalMonto.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 2. Pre-Aprobadas por Jefatura */}
            <div
              onClick={() => setFiltroRevision('REVISADOS')}
              className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                filtroRevision === 'REVISADOS'
                  ? 'bg-emerald-100/70 border-emerald-400 ring-2 ring-emerald-400/30'
                  : 'bg-emerald-50/70 border-emerald-100 hover:border-emerald-300'
              }`}
              title="Filtrar rendiciones ya pre-aprobadas"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  <span>Pre-Aprobadas</span>
                </span>
                <span className="text-[10px] font-black text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                  {metricasAprobacionArea.aprobadosCount} ({metricasAprobacionArea.porcentajeAprobado}%)
                </span>
              </div>
              <div className="mt-1">
                <span className="text-base sm:text-lg font-black text-emerald-600">
                  S/ {metricasAprobacionArea.aprobadosMonto.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 3. Falta Pre-Aprobar */}
            <div
              onClick={() => setFiltroRevision('PENDIENTES')}
              className={`border rounded-xl p-2.5 flex flex-col justify-between cursor-pointer transition-all ${
                filtroRevision === 'PENDIENTES'
                  ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/30'
                  : 'bg-amber-50/70 border-amber-100 hover:border-amber-300'
              }`}
              title="Filtrar rendiciones pendientes de pre-aprobación"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                  <span>Falta Aprobar</span>
                </span>
                <span className="text-[10px] font-black text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                  {metricasAprobacionArea.faltantesCount} reg.
                </span>
              </div>
              <div className="mt-1">
                <span className="text-base sm:text-lg font-black text-amber-600">
                  S/ {metricasAprobacionArea.faltantesMonto.toFixed(2)}
                </span>
              </div>
            </div>

            {/* 4. Progreso de Aprobación */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                  Progreso Aprobación
                </span>
                <span className="text-[10px] font-black text-brand-dark">
                  {metricasAprobacionArea.aprobadosCount} / {metricasAprobacionArea.totalCount}
                </span>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-gray-200 rounded-full h-1.5 my-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${metricasAprobacionArea.porcentajeAprobado}%` }}
                />
              </div>

              <div className="text-[10px] font-bold text-gray-400 text-right">
                {metricasAprobacionArea.porcentajeAprobado}% completado
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Panel Estándar de Métricas para otros roles */
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
      )}

      {/* Buscador de Solicitudes y Filtros de Estado */}
      <div className="bg-white px-3 py-2 rounded-2xl border border-gray-100 shadow-sm shrink-0 flex flex-wrap lg:flex-nowrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] w-full">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ID, solicitante, factura, motivo o placa..."
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

        {/* Botones de Filtro por Tipo de Caja (SURGICORP: Tipo A, RRMEDICAL: Tipo B, SIN FACTURA SGC: C_SGC, SIN FACTURA RRM: C_RRM) */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0 bg-brand-light/60 p-1 rounded-xl w-full sm:w-auto justify-center">
          <button
            type="button"
            onClick={() => setFiltroTipoCaja((prev) => (prev === 'A' ? null : 'A'))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
              filtroTipoCaja === 'A'
                ? 'bg-red-600 text-white border-red-600 shadow-xs ring-2 ring-red-400/40'
                : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100/80'
            }`}
            title={
              filtroTipoCaja === 'A'
                ? 'Quitar filtro Surgicorp (Tipo A)'
                : `Filtrar Surgicorp: ${conteoTiposCaja.A.count} reg. • S/ ${conteoTiposCaja.A.monto.toFixed(2)}`
            }
          >
            <span>SURGICORP</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                filtroTipoCaja === 'A' ? 'bg-red-700 text-white' : 'bg-red-100/90 text-red-700 font-bold'
              }`}
            >
              {conteoTiposCaja.A.count} • S/ {conteoTiposCaja.A.monto.toFixed(2)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipoCaja((prev) => (prev === 'B' ? null : 'B'))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
              filtroTipoCaja === 'B'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-400/40'
                : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100/80'
            }`}
            title={
              filtroTipoCaja === 'B'
                ? 'Quitar filtro RR Medical (Tipo B)'
                : `Filtrar RR Medical: ${conteoTiposCaja.B.count} reg. • S/ ${conteoTiposCaja.B.monto.toFixed(2)}`
            }
          >
            <span>RRMEDICAL</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                filtroTipoCaja === 'B' ? 'bg-blue-700 text-white' : 'bg-blue-100/90 text-blue-700 font-bold'
              }`}
            >
              {conteoTiposCaja.B.count} • S/ {conteoTiposCaja.B.monto.toFixed(2)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipoCaja((prev) => (prev === 'C_SGC' ? null : 'C_SGC'))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
              filtroTipoCaja === 'C_SGC'
                ? 'bg-orange-500 text-white border-orange-500 shadow-xs ring-2 ring-orange-400/40'
                : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100/80'
            }`}
            title={
              filtroTipoCaja === 'C_SGC'
                ? 'Quitar filtro Sin Factura SGC'
                : `Filtrar Sin Factura SGC: ${conteoTiposCaja.C_SGC.count} reg. • S/ ${conteoTiposCaja.C_SGC.monto.toFixed(2)}`
            }
          >
            <span>SIN FACTURA SGC</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                filtroTipoCaja === 'C_SGC' ? 'bg-orange-600 text-white' : 'bg-orange-100/90 text-orange-800 font-bold'
              }`}
            >
              {conteoTiposCaja.C_SGC.count} • S/ {conteoTiposCaja.C_SGC.monto.toFixed(2)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltroTipoCaja((prev) => (prev === 'C_RRM' ? null : 'C_RRM'))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
              filtroTipoCaja === 'C_RRM'
                ? 'bg-teal-600 text-white border-teal-600 shadow-xs ring-2 ring-teal-400/40'
                : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100/80'
            }`}
            title={
              filtroTipoCaja === 'C_RRM'
                ? 'Quitar filtro Sin Factura RRM'
                : `Filtrar Sin Factura RRM: ${conteoTiposCaja.C_RRM.count} reg. • S/ ${conteoTiposCaja.C_RRM.monto.toFixed(2)}`
            }
          >
            <span>SIN FACTURA RRM</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                filtroTipoCaja === 'C_RRM' ? 'bg-teal-700 text-white' : 'bg-teal-100/90 text-teal-800 font-bold'
              }`}
            >
              {conteoTiposCaja.C_RRM.count} • S/ {conteoTiposCaja.C_RRM.monto.toFixed(2)}
            </span>
          </button>
        </div>

        {/* Pestañas de Filtro de Revisión / Aprobación */}
        {esGerente ? (
          <div className="flex items-center gap-1 shrink-0 bg-brand-light/60 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              type="button"
              onClick={() => setFiltroRevision('PENDIENTES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroRevision === 'PENDIENTES'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-100/70'
              }`}
            >
              <Clock size={13} />
              <span>Falta revisar ({metricasRevision.faltantesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroRevision('REVISADOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroRevision === 'REVISADOS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-800 hover:bg-emerald-100/70'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Revisados ({metricasRevision.revisadosCount})</span>
            </button>
          </div>
        ) : esMando ? (
          <div className="flex items-center gap-1 shrink-0 bg-brand-light/60 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              type="button"
              onClick={() => setFiltroRevision('PENDIENTES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroRevision === 'PENDIENTES'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-100/70'
              }`}
            >
              <Clock size={13} />
              <span>Falta aprobar ({metricasAprobacionArea.faltantesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFiltroRevision('REVISADOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                filtroRevision === 'REVISADOS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-800 hover:bg-emerald-100/70'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Aprobados ({metricasAprobacionArea.aprobadosCount})</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Contenedor Scrollable de Solicitudes */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 pb-2">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-9 h-9 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cargando bandeja de aprobaciones...
            </span>
          </div>
        ) : solicitudesFiltradas.length > 0 ? (
          <>
            {/* ================================================================
                1. VISTA LISTA EN PC / DESKTOP (Similar a Cierre de Caja)
               ================================================================ */}
            <div className="hidden md:flex flex-col space-y-2">
              {solicitudesFiltradas.map((req) => {
                const estaRevisado = Boolean(req.revisado || req.revision);
                const totalGast = parseFloat(req.total_gastado || req.monto_solicitado || 0);
                const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
                const listaDetalles = req.detalle || req.detalles || [];
                const numComprobantes = listaDetalles.length;
                const facturasTexto = Array.from(
                  new Set(
                    listaDetalles
                      .map((d) => (d.nro_factura ? String(d.nro_factura).trim() : ''))
                      .filter((f) => f && f !== '-' && f !== '—' && f.toLowerCase() !== 'null' && f.toLowerCase() !== 'undefined')
                  )
                ).join(', ');
                const tipoCajaInfo = clasificarTipoCajaAprobacion(req, usuarios);
                const primerSubgasto = obtenerPrimerSubgasto(req);

                return (
                  <div
                    key={req.id}
                    onClick={() => setSolicitudAuditoria(req)}
                    className={`p-3 bg-white hover:bg-blue-50/30 rounded-2xl border ${
                      estaRevisado && esGerente ? 'border-emerald-200 bg-emerald-50/15' : 'border-gray-100'
                    } hover:border-blue-200 flex items-center justify-between gap-4 transition-all cursor-pointer group shadow-xs`}
                  >
                    {/* Lado izquierdo: Switch revisión (si es gerente), Switch aprobación (si es mando), ID, Badge Tipo, Solicitante e info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {esGerente && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleRevision(req, e)}
                          disabled={conmutandoId === req.id || conmutandoMasivo}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border font-black text-[10px] transition-all shrink-0 cursor-pointer shadow-xs active:scale-95 ${
                            estaRevisado
                              ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600'
                              : 'bg-gray-50 hover:bg-emerald-50 text-gray-500 hover:text-emerald-700 border-gray-200 hover:border-emerald-300'
                          }`}
                          title={
                            estaRevisado
                              ? 'Revisado por Gerencia. Clic para desmarcar'
                              : 'Pendiente de revisión. Clic para marcar como revisado'
                          }
                        >
                          {conmutandoId === req.id ? (
                            <RefreshCw size={12} className="animate-spin text-current" />
                          ) : estaRevisado ? (
                            <CheckCircle2 size={13} className="text-white" />
                          ) : (
                            <Clock size={13} className="text-gray-400" />
                          )}
                          <span>{estaRevisado ? 'Revisado' : 'Por revisar'}</span>
                        </button>
                      )}

                      {/* Control exclusivo para Jefes, Coordinadores y Supervisores de Área */}
                      {esMando && !esGerente && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleAprobacionJefe(req, e)}
                          disabled={conmutandoAprobacionId === req.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border font-black text-[10px] transition-all shrink-0 cursor-pointer shadow-xs active:scale-95 ${
                            Boolean(req.aprobado)
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                              : 'bg-amber-50 hover:bg-emerald-50 text-amber-800 hover:text-emerald-700 border-amber-200 hover:border-emerald-300'
                          }`}
                          title={
                            Boolean(req.aprobado)
                              ? `Pre-aprobado por ${req.aprobado_por_nombre || 'Jefatura'}. Clic para desmarcar`
                              : 'Requerimiento pendiente de pre-aprobación. Clic para pre-aprobar'
                          }
                        >
                          {conmutandoAprobacionId === req.id ? (
                            <RefreshCw size={12} className="animate-spin text-current" />
                          ) : Boolean(req.aprobado) ? (
                            <CheckCircle2 size={13} className="text-white" />
                          ) : (
                            <Clock size={13} className="text-amber-600" />
                          )}
                          <span>{Boolean(req.aprobado) ? 'Aprobado' : 'Por Aprobar'}</span>
                        </button>
                      )}

                      <span className="text-xs font-black text-brand-dark bg-brand-light border border-gray-200/60 px-2 py-1 rounded-lg shrink-0">
                        #{req.id}
                      </span>

                      <span
                        className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border shrink-0 ${tipoCajaInfo.claseBadge}`}
                      >
                        {tipoCajaInfo.etiqueta}
                      </span>

                      {/* Badge de pre-aprobación visible para gerencia */}
                      {esGerente && Boolean(req.aprobado) && (
                        <span
                          className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black shrink-0"
                          title={`Pre-aprobado por Jefatura: ${req.aprobado_por_nombre || ''}`}
                        >
                          <ShieldCheck size={11} className="text-emerald-600" />
                          <span>Pre-aprobado</span>
                        </span>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-black text-brand-dark leading-tight truncate group-hover:text-brand-primary transition-colors">
                            {nombreSolicitante}
                          </h4>
                          <span className="text-[10px] font-bold text-gray-400 shrink-0">
                            • {req.area_id || 'Área'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          <span className="shrink-0">{req.fecha_solicitud ? req.fecha_solicitud.slice(0, 10) : '—'}</span>
                          <span
                            className="shrink-0 max-w-[260px] lg:max-w-[450px] truncate"
                            title={facturasTexto ? `${numComprobantes} doc(s): ${facturasTexto}` : `${numComprobantes} doc(s)`}
                          >
                            • {numComprobantes} doc(s){facturasTexto ? `: ${facturasTexto}` : ''}
                          </span>
                          {req.obs && (
                            <span className="italic truncate max-w-xs lg:max-w-md text-gray-500">
                              "{req.obs}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lado derecho: Subgasto a la izquierda del costo, Monto Total y Botones de acción */}
                    <div className="flex items-center gap-3.5 shrink-0">
                      {/* Detalle del subgasto (a la izquierda del costo en PC) */}
                      {primerSubgasto ? (
                        <div className="hidden md:flex flex-col items-end text-right max-w-[200px] lg:max-w-[280px] xl:max-w-[340px] pr-3.5 border-r border-gray-100">
                          <div className="flex items-center gap-1.5 justify-end w-full">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/80 text-[10px] font-black uppercase tracking-wide truncate shadow-2xs">
                              <Tag size={10} className="text-blue-600 shrink-0" />
                              <span className="truncate">{primerSubgasto.nombreSubgasto}</span>
                            </span>
                            {primerSubgasto.cantidadOtros > 0 && (
                              <span className="text-[9px] font-black text-gray-500 bg-gray-100 border border-gray-200/70 px-1.5 py-0.5 rounded-md shrink-0">
                                +{primerSubgasto.cantidadOtros} {primerSubgasto.cantidadOtros === 1 ? 'doc' : 'docs'}
                              </span>
                            )}
                          </div>
                          {primerSubgasto.descripcion && (
                            <span className="text-[10px] text-gray-500 italic truncate w-full mt-0.5" title={primerSubgasto.descripcion}>
                              "{primerSubgasto.descripcion}"
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="hidden md:flex items-center pr-3.5 border-r border-gray-100 text-[10px] font-bold text-gray-400 italic">
                          Sin comprobante
                        </div>
                      )}

                      {/* Monto Total */}
                      <div className="text-right shrink-0">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                          Gasto Total
                        </span>
                        <span className="text-xs sm:text-sm font-black text-brand-dark">
                          S/ {totalGast.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSolicitudAuditoria(req);
                          }}
                          className="px-2.5 py-1.5 bg-brand-light hover:bg-brand-primary/10 text-brand-primary rounded-xl transition-colors border border-gray-100 font-black text-xs flex items-center gap-1 shadow-xs"
                          title="Auditar comprobantes"
                        >
                          <Eye size={13} />
                          <span className="hidden xl:inline">Auditar</span>
                        </button>

                        {puedeEditarRequerimientos && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              manejarEditarRequerimiento(req);
                            }}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-colors border border-amber-200 font-black text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                            title="Editar requerimiento (Errores de registro)"
                          >
                            <Edit2 size={13} />
                            <span className="hidden xl:inline">Editar</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalRechazo(req);
                            setMotivoRechazo('');
                          }}
                          className="p-1.5 sm:px-2.5 sm:py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors border border-red-200 font-black text-xs flex items-center gap-1 shadow-xs"
                          title="Rechazar y devolver"
                        >
                          <X size={13} />
                          <span className="hidden xl:inline">Rechazar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ================================================================
                2. VISTA TARJETAS EN MÓVIL
               ================================================================ */}
            <div className="md:hidden flex flex-col space-y-2.5">
              {solicitudesFiltradas.map((req) => {
                const estaRevisado = Boolean(req.revisado || req.revision);
                const totalGast = parseFloat(req.total_gastado || req.monto_solicitado || 0);
                const nombreSolicitante = obtenerNombreSolicitante(req.usuario_id);
                const numComprobantes = (req.detalle || req.detalles || []).length;
                const tieneFotosCompletas = (req.detalle || req.detalles || []).every((d) => d.adj_cajachica);
                const tipoCajaInfo = clasificarTipoCajaAprobacion(req, usuarios);
                const primerSubgasto = obtenerPrimerSubgasto(req);

                return (
                  <div
                    key={req.id}
                    className={`bg-white rounded-2xl p-3.5 border ${
                      estaRevisado && esGerente ? 'border-emerald-300 bg-emerald-50/10' : 'border-gray-100'
                    } shadow-sm flex flex-col justify-between border-l-4 ${
                      estaRevisado && esGerente ? 'border-l-emerald-500' : 'border-l-blue-500'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-black text-brand-dark bg-brand-light px-2 py-0.5 rounded-lg">
                            #{req.id}
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoCajaInfo.claseBadge}`}
                          >
                            {tipoCajaInfo.etiqueta}
                          </span>
                        </div>

                        {esGerente ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleRevision(req, e)}
                            disabled={conmutandoId === req.id || conmutandoMasivo}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border font-black text-[9px] transition-all shadow-xs ${
                              estaRevisado
                                ? 'bg-emerald-500 text-white border-emerald-600'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {estaRevisado ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                            <span>{estaRevisado ? 'Revisado' : 'Por revisar'}</span>
                          </button>
                        ) : esMando ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleAprobacionJefe(req, e)}
                            disabled={conmutandoAprobacionId === req.id}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border font-black text-[10px] transition-all shadow-xs ${
                              Boolean(req.aprobado)
                                ? 'bg-emerald-600 text-white border-emerald-700'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {Boolean(req.aprobado) ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                            <span>{Boolean(req.aprobado) ? 'Aprobado' : 'Por Aprobar'}</span>
                          </button>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border bg-blue-50 text-blue-600 border-blue-200 flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            Liquidado
                          </span>
                        )}
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

                        {/* Subgasto preliminar en móvil */}
                        {primerSubgasto && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200/70 text-[10px] font-black uppercase tracking-wide truncate max-w-[240px]">
                              <Tag size={10} className="text-blue-600 shrink-0" />
                              <span className="truncate">{primerSubgasto.nombreSubgasto}</span>
                            </span>
                            {primerSubgasto.cantidadOtros > 0 && (
                              <span className="text-[9px] font-black text-gray-500 bg-gray-100 border border-gray-200/60 px-1.5 py-0.5 rounded-md shrink-0">
                                +{primerSubgasto.cantidadOtros} más
                              </span>
                            )}
                          </div>
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

                      {puedeEditarRequerimientos ? (
                        <button
                          type="button"
                          onClick={() => manejarEditarRequerimiento(req)}
                          className="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-black text-[10px] rounded-lg border border-amber-200 flex items-center justify-center gap-1 transition-all truncate cursor-pointer"
                          title="Editar requerimiento (Errores de registro)"
                        >
                          <Edit2 size={12} />
                          <span>Editar</span>
                        </button>
                      ) : (
                        <div />
                      )}

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

            {/* Barra Resumen de Totales al final de la lista */}
            <div className="mt-3 p-3 bg-white rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-500">Total en lista:</span>
                <span className="font-black text-brand-dark bg-brand-light px-2.5 py-0.5 rounded-lg border border-gray-200">
                  {solicitudesFiltradas.length} rendición(es)
                </span>
                {etiquetaTipoCajaFiltro && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                    Filtro: {etiquetaTipoCajaFiltro}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Monto Total Filtrado:
                </span>
                <span className="text-base sm:text-lg font-black text-brand-primary">
                  S/{' '}
                  {solicitudesFiltradas
                    .reduce((acc, r) => acc + (parseFloat(r.total_gastado || r.monto_solicitado || 0) || 0), 0)
                    .toFixed(2)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl p-8 border-2 border-dashed border-gray-200 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <FileCheck size={24} />
            </div>
            <h3 className="text-sm font-black text-brand-dark">Sin rendiciones pendientes de revisión</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              {busqueda || filtroRevision !== 'TODOS'
                ? 'No se encontraron solicitudes con los filtros aplicados.'
                : 'Todas las rendiciones liquidadas están listas para el Cierre Semanal de Caja.'}
            </p>
            {puedeAccederCierreCaja(user) && (
              <button
                onClick={() => navigate('/cierre-caja')}
                className="mt-1 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all"
              >
                Ir a Cierre de Caja
              </button>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================
          MODAL DETALLE COMPLETO DE AUDITORÍA Y COMPROBANTES
         ======================================================================== */}
      {solicitudAuditoria && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          onClick={() => setSolicitudAuditoria(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary">
                    Auditoría Requerimiento #{solicitudAuditoria.id}
                  </span>
                  {(() => {
                    const tipoModal = clasificarTipoCajaAprobacion(solicitudAuditoria, usuarios);
                    return (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${tipoModal.claseBadge}`}>
                        {tipoModal.etiqueta}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-sm font-black text-brand-dark">Revisión de Gastos y Comprobantes</h3>
              </div>

              <div className="flex items-center gap-2">
                {puedeEditarRequerimientos && (
                  <button
                    type="button"
                    onClick={() => {
                      const reqParaEditar = {
                        ...solicitudAuditoria,
                        detalle: solicitudAuditoria.detalle || solicitudAuditoria.detalles || [],
                        detalles: solicitudAuditoria.detalle || solicitudAuditoria.detalles || [],
                      };
                      setSolicitudAuditoria(null);
                      manejarEditarRequerimiento(reqParaEditar);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-black text-xs transition-all shadow-xs active:scale-95 cursor-pointer"
                    title="Editar requerimiento completo en el formulario"
                  >
                    <Edit2 size={13} />
                    <span>Editar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSolicitudAuditoria(null)}
                  className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
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
                  const { ruta } = resolverRutaOEntidad(det, entidades);

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
                          const tipoDet = obtenerTipoCaja(
                            det?.empresa_id ? det : (solicitudAuditoria?.empresa_id ? { ...det, empresa_id: solicitudAuditoria.empresa_id } : det),
                            true
                          );
                          return (
                            <span className={`px-2 py-0.5 rounded-md font-black text-[9px] uppercase border ${tipoDet.claseBadge}`}>
                              {tipoDet.etiqueta} {tipoDet.nombreEmpresa !== 'Sin Factura' ? `• ${tipoDet.nombreEmpresa}` : ''}
                            </span>
                          );
                        })()}
                        <span className="px-2 py-0.5 bg-gray-50 rounded-md">
                          {det.lima_provincia === 'L' ? 'Lima' : 'Provincia'}
                        </span>
                        {det.nro_factura && <span className="px-2 py-0.5 bg-gray-50 rounded-md">Doc: {det.nro_factura}</span>}
                        {det.nro_ruc && (
                          <span className="px-2 py-0.5 bg-gray-50 rounded-md">
                            RUC: {det.nro_ruc}{det.razon_social ? ` • ${det.razon_social}` : ''}
                          </span>
                        )}
                        {(det.placa_nombre || det.placa) && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">Placa: {det.placa_nombre || det.placa}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer de Acciones del Modal */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {esGerente && (
                  <button
                    type="button"
                    onClick={(e) => handleToggleRevision(solicitudAuditoria, e)}
                    disabled={conmutandoId === solicitudAuditoria.id || conmutandoMasivo}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 ${
                      Boolean(solicitudAuditoria.revisado || solicitudAuditoria.revision)
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                    title={
                      Boolean(solicitudAuditoria.revisado || solicitudAuditoria.revision)
                        ? 'Solicitud revisada/aprobada. Clic para desmarcar.'
                        : 'Marcar solicitud como revisada/aprobada.'
                    }
                  >
                    {conmutandoId === solicitudAuditoria.id ? (
                      <RefreshCw size={13} className="animate-spin text-current" />
                    ) : Boolean(solicitudAuditoria.revisado || solicitudAuditoria.revision) ? (
                      <CheckCircle2 size={14} className="text-white" />
                    ) : (
                      <Clock size={14} className="text-emerald-700" />
                    )}
                    <span>
                      {Boolean(solicitudAuditoria.revisado || solicitudAuditoria.revision)
                        ? 'Revisado / Aprobado'
                        : 'Aprobar / Marcar Revisado'}
                    </span>
                  </button>
                )}

                {/* Pre-Aprobación exclusiva para Jefe / Coordinador / Supervisor de Área */}
                {esMando && !esGerente && (
                  <button
                    type="button"
                    onClick={(e) => handleToggleAprobacionJefe(solicitudAuditoria, e)}
                    disabled={conmutandoAprobacionId === solicitudAuditoria.id}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 ${
                      Boolean(solicitudAuditoria.aprobado)
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                    title={
                      Boolean(solicitudAuditoria.aprobado)
                        ? `Pre-aprobado por ${solicitudAuditoria.aprobado_por_nombre || 'Jefatura'}. Clic para desmarcar.`
                        : 'Pre-aprobar requerimiento como jefe de área.'
                    }
                  >
                    {conmutandoAprobacionId === solicitudAuditoria.id ? (
                      <RefreshCw size={13} className="animate-spin text-current" />
                    ) : Boolean(solicitudAuditoria.aprobado) ? (
                      <CheckCircle2 size={14} className="text-white" />
                    ) : (
                      <Clock size={14} className="text-emerald-700" />
                    )}
                    <span>
                      {Boolean(solicitudAuditoria.aprobado)
                        ? 'Pre-Aprobado por Jefatura'
                        : 'Pre-Aprobar Requerimiento'}
                    </span>
                  </button>
                )}

                {(esGerente || esSuper) && (
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
                )}

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
        </div>,
        document.body
      )}

      {/* ========================================================================
          MODAL DE CONFIRMACIÓN PARA POSTERGAR A SIGUIENTE SEMANA
         ======================================================================== */}
      {modalPostergar && (esGerente || esSuper) && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setModalPostergar(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 p-6 space-y-3.5 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
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
        </div>,
        document.body
      )}

      {/* ========================================================================
          MODAL DE CONFIRMACIÓN PARA RECHAZAR / DEVOLVER
         ======================================================================== */}
      {modalRechazo && createPortal(
        <div
          className="fixed inset-0 !m-0 z-50 flex items-center justify-center bg-brand-dark/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setModalRechazo(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 p-6 space-y-3.5 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
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

export default Aprobaciones;
