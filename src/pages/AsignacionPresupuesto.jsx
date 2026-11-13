import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet,
  Plus,
  RefreshCw,
  Search,
  DollarSign,
  User,
  Calendar,
  AlertCircle,
  TrendingDown,
  Clock,
  History,
  CheckCircle2,
  X,
  Building2,
  PieChart,
  Banknote,
  Smartphone,
  ArrowDownLeft,
  CreditCard,
  Layers
} from 'lucide-react';
import { fetchAuth, extraerMensajeError } from '../utils/fetchAuth';
import { CLAVES_CATALOGO, leerDeCache, guardarEnCache } from '../utils/catalogoCache';
import { esMandoArea, obtenerAreaLimpia, obtenerPuestoLimpio } from '../utils/permisos';
import { normalizarTexto } from '../utils/reglasAccesos';
import Toast from '../components/Toast';
import Combobox from '../components/Combobox';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// ==============================================================================
// CONSTANTES DE ÁREAS ASIGNADAS AL GERENTE DE OPERACIONES
// ==============================================================================
const AREAS_OPERACIONES = [
  'distribucion',
  'atenciones',
  'facturacion',
  'almacenes',
  'almacen',
  'logistica inversa',
  'desarrollo de software',
  'sistemas'
];

// Opciones de tipo de asignación de presupuesto
const TIPOS_ASIGNACION = [
  { id: 'MANDOS', label: 'Presupuesto a Jefes / Coordinadores', descripcion: 'Entrega de fondos a supervisores para gastos operativos de su área' },
  { id: 'EFECTIVO', label: 'Fondo en Caja (Efectivo Físico)', descripcion: 'Monto disponible en bóveda o caja física de Gerencia' },
  { id: 'DIGITAL', label: 'Dinero en Cuenta / Yape (Digital)', descripcion: 'Fondos en cuenta de la empresa o billeteras digitales' },
  { id: 'REPOSICION', label: 'Reposición Saldo Semanal Anterior', descripcion: 'Reembolso del total gastado en un cierre semanal anterior aún no devuelto' }
];

// ==============================================================================
// FUNCIONES AUXILIARES DE FORMATEO Y PARSEO
// ==============================================================================

/**
 * Extrae el código en string del tipo de asignación recibido de DRF.
 * Soporta formato directo ("MANDOS") o diccionario ({ "MANDOS": "Presupuesto..." }).
 */
const obtenerCodigoTipo = (tipo) => {
  if (!tipo) return 'MANDOS';
  if (typeof tipo === 'string') return tipo.trim().toUpperCase();
  if (typeof tipo === 'object') {
    const keys = Object.keys(tipo);
    if (keys.length > 0) return String(keys[0]).trim().toUpperCase();
  }
  return 'MANDOS';
};

/**
 * Obtiene la etiqueta descriptiva del tipo de asignación para la UI.
 */
const obtenerEtiquetaTipo = (tipo) => {
  if (!tipo) return 'Presupuesto a Mando';
  if (typeof tipo === 'object') {
    const values = Object.values(tipo);
    if (values.length > 0 && typeof values[0] === 'string') return values[0];
  }
  const codigo = obtenerCodigoTipo(tipo);
  const match = TIPOS_ASIGNACION.find((t) => t.id === codigo);
  return match ? match.label : 'Presupuesto a Mando';
};

const formatearSoles = (valor) => {
  const numero = parseFloat(valor);
  if (isNaN(numero)) return 'S/ 0.00';
  return `S/ ${numero.toFixed(2)}`;
};

const formatearFechaHora = (cadenaFecha) => {
  if (!cadenaFecha) return '—';
  try {
    const d = new Date(cadenaFecha);
    if (isNaN(d.getTime())) return String(cadenaFecha);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(cadenaFecha);
  }
};

// ==============================================================================
// COMPONENTE PRINCIPAL: ASIGNACIÓN DE PRESUPUESTO SEMANAL
// ==============================================================================

const AsignacionPresupuesto = () => {
  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [ultimoSaldoSemanal, setUltimoSaldoSemanal] = useState(null);
  const [saldosSemanalesAnteriores, setSaldosSemanalesAnteriores] = useState([]);

  // Estados del modal de asignación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formData, setFormData] = useState({
    tipo_asignacion: 'MANDOS', // 'MANDOS' | 'EFECTIVO' | 'DIGITAL' | 'REPOSICION'
    responsable_id: '',
    monto_efectivo: '',
    monto_digital: '',
    saldo_anterior_id: '',
    motivo: '',
  });

  // Notificaciones Toast
  const [notificacion, setNotificacion] = useState(null);
  const mostrarMensaje = useCallback((mensaje, tipo = 'info', titulo = '') => {
    setNotificacion({
      tipo: tipo === 'error' ? 'error' : tipo === 'success' ? 'exito' : 'info',
      titulo: titulo || (tipo === 'error' ? 'Error' : tipo === 'success' ? 'Operación Exitosa' : 'Aviso'),
      mensaje,
    });
  }, []);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);

  // ============================================================================
  // CARGA DE DATOS (USUARIOS, ASIGNACIONES Y SALDOS SEMANALES)
  // ============================================================================

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // 1. Cargar usuarios activos
      const enCache = leerDeCache(CLAVES_CATALOGO.usuarios);
      let listaUsuarios = enCache || [];
      if (!enCache || enCache.length === 0) {
        const resUsers = await fetchAuth(`${API_URL}/users/?is_active=true&top=1000&format=json`);
        if (resUsers.ok) {
          const dataU = await resUsers.json();
          listaUsuarios = dataU.results || dataU || [];
          guardarEnCache(CLAVES_CATALOGO.usuarios, listaUsuarios);
        }
      }
      setUsuarios(listaUsuarios);

      // 2. Cargar saldos semanales (últimos para reposición y saldo vigente)
      const resSaldo = await fetchAuth(`${API_URL}/RC_SaldoSemanal/?top=20&format=json&ordering=-fecha_fin`);
      if (resSaldo.ok) {
        const dataSaldo = await resSaldo.json();
        const listaS = dataSaldo.results || dataSaldo || [];
        if (listaS.length > 0) {
          setUltimoSaldoSemanal(listaS[0]);
          setSaldosSemanalesAnteriores(listaS);
        }
      }

      // 3. Cargar Asignaciones de Presupuesto
      const resAsig = await fetchAuth(`${API_URL}/RC_AsignacionPresupuesto/?top=500&format=json`);
      if (resAsig.ok) {
        const dataAsig = await resAsig.json();
        const listaA = dataAsig.results || dataAsig || [];
        setAsignaciones(listaA);
      } else {
        setAsignaciones([]);
      }
    } catch (err) {
      console.warn('[AsignacionPresupuesto] Error al cargar información:', err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Lista de usuarios que son Mandos (Jefes, Coordinadores, Supervisores)
  // de las áreas asignadas al Gerente de Operaciones
  const listaMandos = useMemo(() => {
    if (!Array.isArray(usuarios)) return [];
    return usuarios.filter((u) => {
      if (!esMandoArea(u)) return false;
      const area = obtenerAreaLimpia(u).toLowerCase();
      return AREAS_OPERACIONES.some((ao) => area.includes(ao));
    });
  }, [usuarios]);

  // Opciones para el Combobox de mandos
  const opcionesMandos = useMemo(() => {
    return listaMandos.map((u) => {
      const nombreCompleto = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
      const cargo = obtenerPuestoLimpio(u);
      const area = obtenerAreaLimpia(u);
      return {
        value: String(u.id),
        label: nombreCompleto,
        descripcion: `${cargo ? cargo.toUpperCase() : 'MANDO'} • ${area ? area.toUpperCase() : 'OPERACIONES'}`,
      };
    });
  }, [listaMandos]);

  // Opciones de saldos semanales anteriores para reposición
  const opcionesSaldosAnteriores = useMemo(() => {
    return saldosSemanalesAnteriores.map((s) => {
      const codigo = s.codigo_cierre || `#${s.id}`;
      const gasto = parseFloat(s.total_gasto || 0);
      const fechaF = s.fecha_fin ? s.fecha_fin.slice(0, 10) : '';
      return {
        value: String(s.id),
        label: `Cierre ${codigo} — Total Gastado: ${formatearSoles(gasto)}`,
        descripcion: `Fecha: ${fechaF || 'Semana previa'} • Saldo Final en Caja: ${formatearSoles(s.saldo_final || 0)}`,
        gastoTotal: gasto,
      };
    });
  }, [saldosSemanalesAnteriores]);

  // Manejador al seleccionar un saldo anterior para autocompletar el monto de reposición con total_gasto
  const manejarSeleccionarSaldoAnterior = (saldoId) => {
    const seleccionado = saldosSemanalesAnteriores.find((s) => String(s.id) === String(saldoId));
    if (seleccionado) {
      const totalGasto = parseFloat(seleccionado.total_gasto || 0);
      setFormData((prev) => ({
        ...prev,
        saldo_anterior_id: String(saldoId),
        monto_efectivo: totalGasto > 0 ? totalGasto.toFixed(2) : prev.monto_efectivo,
        monto_digital: '0.00',
        motivo: `Reposición de efectivo gastado en cierre ${seleccionado.codigo_cierre || '#' + seleccionado.id} (${formatearSoles(totalGasto)})`,
      }));
    } else {
      setFormData((prev) => ({ ...prev, saldo_anterior_id: String(saldoId) }));
    }
  };

  // Métricas calculadas para los KPI de la semana vigente
  const metricas = useMemo(() => {
    const asignacionesVigentes = asignaciones.filter((a) => a.activo !== false && !a.cerrado);
    let totalAsignado = 0;
    let totalEfectivo = 0;
    let totalDigital = 0;
    let totalRendido = 0;

    // Presupuestos según tipo
    let totalCajaFisica = 0;
    let totalCuentaDigital = 0;
    let totalPresupuestoMandos = 0;
    let totalReposiciones = 0;

    asignacionesVigentes.forEach((a) => {
      const ef = parseFloat(a.monto_efectivo || 0);
      const dig = parseFloat(a.monto_digital || 0);
      const asig = parseFloat(a.monto_asignado || a.monto || (ef + dig) || 0);

      totalAsignado += asig;
      totalEfectivo += ef;
      totalDigital += dig;
      totalRendido += parseFloat(a.monto_rendido || 0);

      const tipo = obtenerCodigoTipo(a.tipo_asignacion);
      if (tipo === 'EFECTIVO') totalCajaFisica += asig;
      else if (tipo === 'DIGITAL') totalCuentaDigital += asig;
      else if (tipo === 'REPOSICION') totalReposiciones += asig;
      else totalPresupuestoMandos += asig;
    });

    const saldoDisponible = Math.max(0, totalAsignado - totalRendido);
    return {
      totalAsignado,
      totalEfectivo,
      totalDigital,
      totalRendido,
      saldoDisponible,
      totalCajaFisica,
      totalCuentaDigital,
      totalPresupuestoMandos,
      totalReposiciones,
      cantidadRegistros: asignacionesVigentes.length,
    };
  }, [asignaciones]);

  // Filtrado de la tabla según vigencia e input de búsqueda
  const asignacionesFiltradas = useMemo(() => {
    return asignaciones.filter((a) => {
      if (!verHistorial && (a.activo === false || a.cerrado)) return false;
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim();
        const respNombre = (a.responsable_nombre || a.responsable?.full_name || a.responsable?.username || '').toLowerCase();
        const area = (a.area_nombre || a.area || '').toLowerCase();
        const motivo = (a.motivo || '').toLowerCase();
        const tipoTexto = typeof a.tipo_asignacion === 'object' && a.tipo_asignacion
          ? Object.values(a.tipo_asignacion).join(' ').toLowerCase()
          : String(a.tipo_asignacion || '').toLowerCase();
        return respNombre.includes(query) || area.includes(query) || motivo.includes(query) || tipoTexto.includes(query);
      }
      return true;
    });
  }, [asignaciones, verHistorial, busqueda]);

  // Manejador para guardar una nueva asignación o fondo
  const manejarGuardarAsignacion = async (e) => {
    if (e) e.preventDefault();

    // 1. Si es asignación a mandos, requiere responsable obligatorio
    if (formData.tipo_asignacion === 'MANDOS' && !formData.responsable_id) {
      mostrarMensaje('Debe seleccionar a un jefe, coordinador o supervisor de área.', 'error');
      return;
    }

    // 2. Si es reposición de saldo semanal anterior, requiere haber seleccionado la semana
    if (formData.tipo_asignacion === 'REPOSICION' && !formData.saldo_anterior_id) {
      mostrarMensaje('Debe seleccionar el cierre semanal anterior a reponer.', 'error');
      return;
    }

    const efectivoNum = parseFloat(formData.monto_efectivo) || 0;
    const digitalNum = parseFloat(formData.monto_digital) || 0;
    const totalNum = efectivoNum + digitalNum;

    if (totalNum <= 0) {
      mostrarMensaje('Debe ingresar un importe mayor a 0 en efectivo o efectivo digital.', 'error');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        tipo_asignacion: formData.tipo_asignacion,
        responsable: formData.tipo_asignacion === 'MANDOS' ? formData.responsable_id : null,
        monto_asignado: totalNum.toFixed(2),
        monto_efectivo: efectivoNum.toFixed(2),
        monto_digital: digitalNum.toFixed(2),
        motivo: formData.motivo.trim() || `Registro de presupuesto (${formData.tipo_asignacion})`,
        saldo_semanal: ultimoSaldoSemanal?.id || null,
        saldo_anterior: formData.tipo_asignacion === 'REPOSICION' ? formData.saldo_anterior_id : null,
      };

      const res = await fetchAuth(`${API_URL}/RC_AsignacionPresupuesto/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await extraerMensajeError(res));
      }

      mostrarMensaje('Presupuesto registrado correctamente.', 'success');
      setModalAbierto(false);
      setFormData({
        tipo_asignacion: 'MANDOS',
        responsable_id: '',
        monto_efectivo: '',
        monto_digital: '',
        saldo_anterior_id: '',
        motivo: '',
      });
      await cargarDatos();
    } catch (err) {
      mostrarMensaje(err.message || 'No se pudo registrar la asignación.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3 p-2 sm:p-4 animate-fade-in font-sans">
      {/* Toast de Notificaciones */}
      {notificacion && (
        <Toast
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          onClose={() => setNotificacion(null)}
        />
      )}

      {/* Header de la vista */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-100 shadow-sm shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-primary/10 rounded-xl text-brand-primary">
              <Wallet size={20} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-brand-dark tracking-tight">
                Control y Asignación de Presupuesto
              </h1>
              <p className="text-xs text-gray-400 font-medium">
                Gestión de fondos en efectivo físico, cuenta bancaria/digital, entregas a jefes y reposiciones
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cargarDatos}
            disabled={cargando}
            className="p-2 rounded-xl border border-gray-200 hover:border-brand-primary text-gray-500 hover:text-brand-primary bg-white transition-all shadow-xs"
            title="Recargar datos"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin text-brand-primary' : ''} />
          </button>

          <button
            type="button"
            onClick={() => {
              setFormData({
                tipo_asignacion: 'MANDOS',
                responsable_id: '',
                monto_efectivo: '',
                monto_digital: '',
                saldo_anterior_id: '',
                motivo: '',
              });
              setModalAbierto(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-primary hover:bg-brand-secondary text-white text-xs font-black shadow-md shadow-brand-primary/20 transition-all hover:scale-102 active:scale-98"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Nueva Asignación</span>
          </button>
        </div>
      </div>

      {/* Tarjetas KPI de Saldo y Asignaciones Semanales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
        <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Fondos Registrados</span>
            <span className="text-[10px] font-bold text-brand-primary bg-brand-light px-2 py-0.5 rounded-md">
              {metricas.cantidadRegistros} reg.
            </span>
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-xl font-black text-brand-dark block">
              {formatearSoles(metricas.totalAsignado)}
            </span>
            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 mt-1">
              <span>Efec: {formatearSoles(metricas.totalEfectivo)}</span>
              <span>•</span>
              <span>Dig: {formatearSoles(metricas.totalDigital)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">En Caja (Efectivo Físico)</span>
            <Banknote size={14} className="text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-xl font-black text-emerald-600 block">
              {formatearSoles(metricas.totalEfectivo)}
            </span>
            <span className="text-[10px] text-emerald-700 font-medium">
              Dinero en efectivo / billetes disponibles
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Cuenta Bancaria / Yape</span>
            <Smartphone size={14} className="text-blue-600" />
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-xl font-black text-blue-600 block">
              {formatearSoles(metricas.totalDigital)}
            </span>
            <span className="text-[10px] text-blue-700 font-medium">
              Efectivo digital / transferencias en cuenta
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Asignado a Mandos</span>
            <User size={14} className="text-amber-600" />
          </div>
          <div className="mt-2">
            <span className="text-lg sm:text-xl font-black text-amber-600 block">
              {formatearSoles(metricas.totalPresupuestoMandos)}
            </span>
            <span className="text-[10px] text-amber-700 font-medium">
              Entregado a jefes y coordinadores
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por tipo, responsable, área o concepto..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-gray-50 border border-gray-200 outline-none focus:border-brand-primary focus:bg-white font-medium transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVerHistorial(!verHistorial)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
              verHistorial
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <History size={13} />
            <span>{verHistorial ? 'Viendo Historial Completo' : 'Ver Solo Semana Vigente'}</span>
          </button>
        </div>
      </div>

      {/* Listado de Asignaciones */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        {cargando ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cargando asignaciones...
            </span>
          </div>
        ) : asignacionesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
            <Wallet size={36} className="text-gray-300" />
            <h3 className="text-sm font-bold text-gray-700">No hay registros de presupuesto</h3>
            <p className="text-xs text-gray-400 max-w-sm">
              Presione "+ Nueva Asignación" para registrar efectivo en caja, fondos en cuenta, entrega a mandos o reposición de semanas anteriores.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {asignacionesFiltradas.map((asig) => {
              const asignadoNum = parseFloat(asig.monto_asignado || asig.monto || 0);
              const rendidoNum = parseFloat(asig.monto_rendido || 0);
              const restanteNum = Math.max(0, asignadoNum - rendidoNum);
              const porcentajeConsumido = asignadoNum > 0 ? Math.min(100, Math.round((rendidoNum / asignadoNum) * 100)) : 0;
              const tipoUpper = obtenerCodigoTipo(asig.tipo_asignacion);
              const etiqueta = obtenerEtiquetaTipo(asig.tipo_asignacion);

              // Icono y badge según el tipo
              let badgeColor = 'bg-brand-light text-brand-primary';
              let badgeTexto = etiqueta;
              let iconoTipo = <User size={18} />;

              if (tipoUpper === 'EFECTIVO') {
                badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                badgeTexto = etiqueta;
                iconoTipo = <Banknote size={18} className="text-emerald-600" />;
              } else if (tipoUpper === 'DIGITAL') {
                badgeColor = 'bg-blue-50 text-blue-700 border border-blue-200';
                badgeTexto = etiqueta;
                iconoTipo = <Smartphone size={18} className="text-blue-600" />;
              } else if (tipoUpper === 'REPOSICION') {
                badgeColor = 'bg-purple-50 text-purple-700 border border-purple-200';
                badgeTexto = etiqueta;
                iconoTipo = <ArrowDownLeft size={18} className="text-purple-600" />;
              }

              return (
                <div
                  key={asig.id}
                  className="p-3 sm:p-3.5 rounded-2xl border border-gray-100 hover:border-brand-primary/30 hover:bg-blue-50/15 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2.5 rounded-xl bg-gray-50 shrink-0 mt-0.5">
                      {iconoTipo}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeColor}`}>
                          {badgeTexto}
                        </span>
                        {asig.responsable && (
                          <span className="text-xs font-black text-brand-dark">
                            {asig.responsable_nombre || asig.responsable?.full_name || asig.responsable?.username}
                          </span>
                        )}
                        {asig.area_nombre && (
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                            {asig.area_nombre}
                          </span>
                        )}
                        {asig.cerrado && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                            Semana Cerrada
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-gray-600 mt-1 font-medium" title={asig.motivo}>
                        {asig.motivo || 'Fondo para gastos operativos'}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1 flex-wrap">
                        <span>Registrado: {formatearFechaHora(asig.fecha_asignacion || asig.created_at)}</span>
                        <span>•</span>
                        <span>Por: {asig.asignado_por_nombre || 'Gerente de Operaciones'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Derecho: Desglose de Montos y Rendición */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50 flex-wrap">
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Total Registrado</span>
                      <span className="text-xs sm:text-sm font-black text-brand-dark">
                        {formatearSoles(asignadoNum)}
                      </span>
                      <div className="flex items-center gap-1.5 justify-end text-[9px] font-bold text-gray-400 mt-0.5">
                        <span className="text-emerald-700 bg-emerald-50 px-1 rounded">Ef: {formatearSoles(asig.monto_efectivo || 0)}</span>
                        <span className="text-blue-700 bg-blue-50 px-1 rounded">Dig: {formatearSoles(asig.monto_digital || 0)}</span>
                      </div>
                    </div>

                    {tipoUpper === 'MANDOS' && (
                      <>
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-600 block font-bold uppercase">Rendido</span>
                          <span className="text-xs sm:text-sm font-black text-emerald-700">
                            {formatearSoles(rendidoNum)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-amber-600 block font-bold uppercase">Por Rendir</span>
                          <span className="text-xs sm:text-sm font-black text-amber-700">
                            {formatearSoles(restanteNum)}
                          </span>
                        </div>

                        <div className="w-16 hidden lg:block">
                          <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 mb-1">
                            <span>Uso</span>
                            <span>{porcentajeConsumido}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-primary rounded-full transition-all duration-500"
                              style={{ width: `${porcentajeConsumido}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para Asignar Presupuesto / Fondo */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-brand-dark/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-4 bg-brand-dark text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-brand-accent" />
                <h3 className="text-sm font-black tracking-tight">Gestión y Asignación de Presupuesto</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={manejarGuardarAsignacion} className="p-4 space-y-3.5">
              {/* Selector de Tipo de Asignación */}
              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Tipo de Registro de Presupuesto <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_ASIGNACION.map((tipo) => {
                    const esActivo = formData.tipo_asignacion === tipo.id;
                    return (
                      <button
                        key={tipo.id}
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            tipo_asignacion: tipo.id,
                            responsable_id: tipo.id === 'MANDOS' ? formData.responsable_id : '',
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          esActivo
                            ? 'border-brand-primary bg-brand-light/60 text-brand-dark shadow-xs'
                            : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black ${esActivo ? 'text-brand-primary' : 'text-gray-700'}`}>
                            {tipo.label}
                          </span>
                          {esActivo && <CheckCircle2 size={13} className="text-brand-primary shrink-0" />}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 line-clamp-2">
                          {tipo.descripcion}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Si es asignación a Mandos: Selector de Jefe / Coordinador */}
              {formData.tipo_asignacion === 'MANDOS' && (
                <div>
                  <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                    Mando Responsable (Jefe / Coordinador / Supervisor) <span className="text-rose-500">*</span>
                  </label>
                  <Combobox
                    options={opcionesMandos}
                    value={formData.responsable_id}
                    onChange={(val) => setFormData({ ...formData, responsable_id: val ? String(val) : '' })}
                    placeholder="Buscar jefe o coordinador por nombre o área..."
                    icon={<User size={14} className="text-brand-primary" />}
                  />
                  <span className="text-[10px] text-gray-400 font-medium block mt-1">
                    Solo se muestran mandos de: Distribución, Atenciones, Facturación, Almacenes, Logística Inversa y Desarrollo de Software.
                  </span>
                </div>
              )}

              {/* Si es reposición de saldo semanal anterior: Selector de Saldo Semanal */}
              {formData.tipo_asignacion === 'REPOSICION' && (
                <div>
                  <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                    Cierre Semanal Anterior a Reponer <span className="text-rose-500">*</span>
                  </label>
                  <Combobox
                    options={opcionesSaldosAnteriores}
                    value={formData.saldo_anterior_id}
                    onChange={manejarSeleccionarSaldoAnterior}
                    placeholder="Seleccione el cierre semanal anterior..."
                    icon={<ArrowDownLeft size={14} className="text-purple-600" />}
                  />
                  <span className="text-[10px] text-purple-600 font-bold block mt-1">
                    Se obtiene automáticamente el "Total Gasto" de la semana para cargarlo como reposición en efectivo.
                  </span>
                </div>
              )}

              {/* Desglose de Montos: Efectivo Físico y Efectivo Digital */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                    Efectivo Físico (S/)
                  </label>
                  <div className="relative">
                    <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.monto_efectivo}
                      onChange={(e) => setFormData({ ...formData, monto_efectivo: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm font-black text-brand-dark focus:border-brand-primary outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium block mt-0.5">
                    En caja / billetes físicos
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                    Efectivo Digital (S/)
                  </label>
                  <div className="relative">
                    <Smartphone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.monto_digital}
                      onChange={(e) => setFormData({ ...formData, monto_digital: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-sm font-black text-brand-dark focus:border-brand-primary outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium block mt-0.5">
                    Yape / Plin / Transferencia
                  </span>
                </div>
              </div>

              {/* Total Calculado Automático */}
              <div className="p-2.5 bg-brand-light/60 border border-brand-primary/20 rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold text-gray-600">Total Importe Registrado:</span>
                <span className="font-black text-brand-dark text-sm">
                  {formatearSoles((parseFloat(formData.monto_efectivo) || 0) + (parseFloat(formData.monto_digital) || 0))}
                </span>
              </div>

              {/* Motivo o Justificación */}
              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1">
                  Concepto / Justificación de Fondos
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalle o justificación de la asignación o reposición..."
                  value={formData.motivo}
                  onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:border-brand-primary outline-none resize-none font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-secondary text-white text-xs font-bold shadow-md shadow-brand-primary/20 disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Confirmar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AsignacionPresupuesto;
