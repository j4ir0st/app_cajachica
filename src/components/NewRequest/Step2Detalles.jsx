import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Plus, Trash2, Image, AlertCircle, ChevronDown } from 'lucide-react';
import { useUserStore } from '../../store/userStore';
import { useCatalogoStore } from '../../store/catalogoStore';

const TIPO_LIMA_PROVINCIA = [
  { valor: 'L', etiqueta: 'L', titulo: 'Lima' },
  { valor: 'P', etiqueta: 'P', titulo: 'Provincia' },
];

// Detalle en blanco para iniciar el formulario de una nueva línea
const detalleVacio = () => ({
  tipogasto_url: null,
  subgasto_url: null,
  lima_provincia: 'L',
  provincia_url: null,
  nro_factura: '',
  nro_ruc: '',
  origen_url: null,
  destino_url: null,
  costo: '',
  detalle: '',
  fecha_gasto: new Date().toISOString().split('T')[0],
  adj_cajachica: null,
  _preview: null,  // vista previa local de la imagen
});

/**
 * Paso 2: Ingreso y gestión de líneas de detalle del requerimiento.
 * Los catálogos se leen del store global (cargados al inicio).
 */
const Step2Detalles = ({ detalles, onChangeDetalles, montoLimite }) => {
  const { user } = useUserStore();
  const { tiposGasto, subgastos, entidades, provincias, cargando, error: errorCatalogo } = useCatalogoStore();

  const [formulario, setFormulario] = useState(detalleVacio());
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  // Filtrado de Tipos de Gasto según el puesto del usuario
  const tiposGastoFiltrados = useMemo(() => {
    if (!tiposGasto) return [];
    const puesto = user?.puesto?.toLowerCase() || '';

    // Si es auxiliar, solo ve is_aux = true
    if (puesto.includes('auxiliar')) {
      return tiposGasto.filter(t => t.is_aux === true);
    }

    // Si es supervisor, jefe o gerente, ve todos
    if (['supervisor', 'jefe', 'gerente'].some(rol => puesto.includes(rol))) {
      return tiposGasto;
    }

    // Si no cumple ninguna, ve is_aux = false o null
    return tiposGasto.filter(t => t.is_aux === false || t.is_aux === null);
  }, [tiposGasto, user]);

  // Filtrado de Subgastos según el Tipo de Gasto seleccionado
  const subgastosFiltrados = useMemo(() => {
    if (!formulario.tipogasto_url || !subgastos) return [];
    return subgastos.filter(s => s.tipogasto_id?.url === formulario.tipogasto_url);
  }, [formulario.tipogasto_url, subgastos]);

  // Auto-selección de Subgasto si solo hay una opción disponible
  useEffect(() => {
    if (subgastosFiltrados.length === 1) {
      const unicaOpcion = subgastosFiltrados[0].url;
      if (formulario.subgasto_url !== unicaOpcion) {
        setFormulario(prev => ({ ...prev, subgasto_url: unicaOpcion }));
      }
    } else if (subgastosFiltrados.length === 0) {
      if (formulario.subgasto_url !== null) {
        setFormulario(prev => ({ ...prev, subgasto_url: null }));
      }
    }
  }, [subgastosFiltrados, formulario.subgasto_url]);

  // Auto-selección de Lima ('L') o Provincia ('P') según el Tipo de Gasto seleccionado
  useEffect(() => {
    if (!formulario.tipogasto_url || !tiposGasto) return;
    const tipoSeleccionado = tiposGasto.find((t) => t.url === formulario.tipogasto_url);
    if (tipoSeleccionado) {
      const nombreNorm = (tipoSeleccionado.nombre || '').trim().toLowerCase();
      const esDistribucion = nombreNorm.startsWith('distribuci');
      const nuevaZona = esDistribucion ? 'P' : 'L';
      if (formulario.lima_provincia !== nuevaZona) {
        setFormulario((prev) => ({
          ...prev,
          lima_provincia: nuevaZona,
          provincia_url: nuevaZona === 'L' ? null : prev.provincia_url,
        }));
      }
    }
  }, [formulario.tipogasto_url, tiposGasto]);

  const totalActual = detalles.reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);
  const superaLimite = montoLimite && totalActual > parseFloat(montoLimite);

  const manejarCambioFormulario = (campo, valor) => {
    setFormulario((prev) => ({ ...prev, [campo]: valor }));
  };

  const cambiarZona = (valor) => {
    setFormulario((prev) => ({
      ...prev,
      lima_provincia: valor,
      provincia_url: valor === 'L' ? null : prev.provincia_url,
    }));
  };

  const manejarImagen = (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const preview = URL.createObjectURL(archivo);
    setFormulario((prev) => ({ ...prev, adj_cajachica: archivo, _preview: preview }));
  };

  const agregarOActualizarLinea = () => {
    setError('');
    if (!formulario.tipogasto_url || !formulario.costo || !formulario.detalle) {
      setError('Tipo de gasto, costo y detalle son obligatorios.');
      return;
    }
    if (formulario.lima_provincia === 'P' && !formulario.provincia_url) {
      setError('Debe seleccionar una provincia para los gastos de Provincia.');
      return;
    }
    if (montoLimite) {
      const costoNuevo = parseFloat(formulario.costo) || 0;
      const totalSinCurrent = editandoIdx !== null
        ? totalActual - (parseFloat(detalles[editandoIdx]?.costo) || 0)
        : totalActual;
      if (totalSinCurrent + costoNuevo > parseFloat(montoLimite)) {
        setError(`El total (S/ ${(totalSinCurrent + costoNuevo).toFixed(2)}) supera el monto solicitado (S/ ${parseFloat(montoLimite).toFixed(2)}).`);
        return;
      }
    }

    const nuevosDetalles = [...detalles];
    if (editandoIdx !== null) {
      nuevosDetalles[editandoIdx] = formulario;
      setEditandoIdx(null);
    } else {
      nuevosDetalles.push(formulario);
    }
    onChangeDetalles(nuevosDetalles);
    setFormulario(detalleVacio());
  };

  const editarLinea = (idx) => {
    setFormulario(detalles[idx]);
    setEditandoIdx(idx);
  };

  const eliminarLinea = (idx) => {
    onChangeDetalles(detalles.filter((_, i) => i !== idx));
    if (editandoIdx === idx) {
      setFormulario(detalleVacio());
      setEditandoIdx(null);
    }
  };

  const cancelarEdicion = () => {
    setFormulario(detalleVacio());
    setEditandoIdx(null);
    setError('');
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-sm text-gray-400 font-medium">Cargando catálogos...</span>
      </div>
    );
  }

  const errorMostrar = error || errorCatalogo;

  return (
    <div className="space-y-2 animate-fade-in m-0 p-0">
      <div className="flex items-center justify-between m-0 p-0">
        <div className="m-0 p-0">
          <h2 className="text-xl font-black text-brand-dark tracking-tight">Detalle de Gastos</h2>
          {/* <p className="text-sm text-gray-400 mt-0.5">Registre cada comprobante de gasto por separado.</p> */}
          <p className="text-xs font-black text-brand-primary uppercase tracking-widest">
            {editandoIdx !== null ? `Editando línea #${editandoIdx + 1}` : 'Nueva Línea de Gasto'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 font-medium">Total ingresado</p>
          <p className={`text-lg font-black ${superaLimite ? 'text-red-500' : 'text-brand-primary'}`}>
            S/ {totalActual.toFixed(2)}
          </p>
          {montoLimite && (
            <p className="text-xs text-gray-400">de S/ {parseFloat(montoLimite).toFixed(2)}</p>
          )}
        </div>
      </div>

      {/* Alerta de error */}
      {errorMostrar && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-2xl px-4 py-3">
          <AlertCircle size={16} />
          {errorMostrar}
        </div>
      )}

      {/* Formulario de nueva línea */}
      <div className="bg-brand-light border-2 border-dashed border-brand-primary/30 rounded-3xl p-5 space-y-4">
        {/* <p className="text-xs font-black text-brand-primary uppercase tracking-widest">
          {editandoIdx !== null ? `Editando línea #${editandoIdx + 1}` : 'Nueva Línea de Gasto'}
        </p> */}

        {/* Tipo gasto, Subgasto, Lima/Provincia y Provincia */}
        <div className={`grid grid-cols-1 ${formulario.lima_provincia === 'P' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 transition-all`}>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Tipo de Gasto *</label>
            <div className="relative">
              <select
                value={formulario.tipogasto_url || ''}
                onChange={(e) => manejarCambioFormulario('tipogasto_url', e.target.value || null)}
                className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
              >
                <option value="">Seleccionar...</option>
                {tiposGastoFiltrados.map((t) => <option key={t.url} value={t.url}>{t.nombre}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Subgasto</label>
            <div className="relative">
              <select
                value={formulario.subgasto_url || ''}
                onChange={(e) => manejarCambioFormulario('subgasto_url', e.target.value || null)}
                disabled={subgastosFiltrados.length === 0}
                className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors disabled:opacity-50 disabled:bg-gray-50"
              >
                <option value="">{subgastosFiltrados.length === 0 ? 'Sin opciones' : 'Ninguno'}</option>
                {subgastosFiltrados.map((s) => <option key={s.url} value={s.url}>{s.nombre}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Zona</label>
            <div className="flex gap-2">
              {TIPO_LIMA_PROVINCIA.map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  title={op.titulo}
                  onClick={() => cambiarZona(op.valor)}
                  className={`w-10 py-2.5 rounded-xl text-sm font-black transition-all ${formulario.lima_provincia === op.valor
                    ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                    : 'bg-white border-2 border-gray-100 text-gray-400 hover:border-brand-primary/50'
                    }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {formulario.lima_provincia === 'P' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Provincia *</label>
              <div className="relative">
                <select
                  value={formulario.provincia_url || ''}
                  onChange={(e) => manejarCambioFormulario('provincia_url', e.target.value || null)}
                  className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
                >
                  <option value="">Seleccionar...</option>
                  {provincias.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* RUC, Factura, Origen, Destino */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">N° RUC</label>
            <input
              type="text"
              maxLength={11}
              placeholder="20XXXXXXXXX"
              value={formulario.nro_ruc}
              onChange={(e) => manejarCambioFormulario('nro_ruc', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">N° Factura</label>
            <input
              type="text"
              placeholder="F001-000001"
              value={formulario.nro_factura}
              onChange={(e) => manejarCambioFormulario('nro_factura', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Origen</label>
            <div className="relative">
              <select
                value={formulario.origen_url || ''}
                onChange={(e) => manejarCambioFormulario('origen_url', e.target.value || null)}
                className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
              >
                <option value="">N/A</option>
                {entidades.map((ent) => <option key={ent.url} value={ent.url}>{ent.nombre}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Destino</label>
            <div className="relative">
              <select
                value={formulario.destino_url || ''}
                onChange={(e) => manejarCambioFormulario('destino_url', e.target.value || null)}
                className="w-full appearance-none bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
              >
                <option value="">N/A</option>
                {entidades.map((ent) => <option key={ent.url} value={ent.url}>{ent.nombre}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Detalle, Costo, Fecha y Adjunto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Descripción *</label>
            <input
              type="text"
              placeholder="¿Qué comprobante es este?"
              value={formulario.detalle}
              onChange={(e) => manejarCambioFormulario('detalle', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Costo (S/) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={formulario.costo}
              onChange={(e) => manejarCambioFormulario('costo', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Fecha del Gasto</label>
            <input
              type="date"
              value={formulario.fecha_gasto}
              onChange={(e) => manejarCambioFormulario('fecha_gasto', e.target.value)}
              className="w-full bg-white border-2 border-gray-100 focus:border-brand-primary rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-dark outline-none transition-colors"
            />
          </div>
        </div>

        {/* Adjunto de imagen */}
        <div className="flex items-center gap-4">
          <input ref={fileRef} type="file" accept="image/*" onChange={manejarImagen} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-brand-primary/40 text-brand-primary text-sm font-bold hover:bg-brand-light transition-colors"
          >
            <Image size={16} />
            {formulario.adj_cajachica ? 'Cambiar imagen' : 'Adjuntar comprobante'}
          </button>
          {formulario._preview && (
            <img src={formulario._preview} alt="preview" className="h-12 w-12 object-cover rounded-xl border-2 border-brand-primary/20" />
          )}
          {formulario.adj_cajachica && (
            <span className="text-xs text-gray-500 font-medium">{formulario.adj_cajachica.name}</span>
          )}
        </div>

        {/* Botones del formulario de línea */}
        <div className="flex items-center gap-3 pt-2 border-t border-brand-primary/10">
          {editandoIdx !== null && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="px-5 py-2.5 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={agregarOActualizarLinea}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-secondary hover:shadow-lg hover:shadow-brand-primary/20 transition-all"
          >
            <Plus size={16} />
            {editandoIdx !== null ? 'Actualizar línea' : 'Agregar gasto'}
          </button>
        </div>
      </div>

      {/* Tabla de detalles ingresados */}
      {detalles.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-light">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">#</th>
                <th className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">Descripción</th>
                <th className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="text-right px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider">Costo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {detalles.map((det, i) => {
                const tipoNombre = tiposGasto.find((t) => t.url === det.tipogasto_url)?.nombre || 'Sin tipo';
                return (
                  <tr key={i} className="hover:bg-brand-light/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-brand-dark">{det.detalle || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-brand-primary/10 text-brand-primary text-xs font-bold px-3 py-1 rounded-full">{tipoNombre}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{det.fecha_gasto}</td>
                    <td className="px-4 py-3 text-right font-black text-brand-dark">S/ {parseFloat(det.costo || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => editarLinea(i)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-primary hover:bg-brand-light transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarLinea(i)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-brand-light border-t-2 border-brand-primary/10">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-sm font-black text-brand-dark uppercase tracking-wide">Total</td>
                <td className={`px-4 py-3 text-right text-base font-black ${superaLimite ? 'text-red-500' : 'text-brand-primary'}`}>
                  S/ {totalActual.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default Step2Detalles;

