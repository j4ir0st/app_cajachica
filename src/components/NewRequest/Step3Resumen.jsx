import React from 'react';
import { CheckCircle, User, Building, Calendar, DollarSign, FileText, AlertCircle } from 'lucide-react';

/**
 * Fila de resumen con etiqueta e ícono para el Paso 3.
 */
const FilaResumen = ({ icono: Icono, etiqueta, valor, color = 'text-brand-dark' }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-xl bg-brand-light flex items-center justify-center">
        <Icono size={14} className="text-brand-primary" />
      </div>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{etiqueta}</span>
    </div>
    <span className={`text-sm font-black ${color}`}>{valor}</span>
  </div>
);

/**
 * Paso 3: Resumen final del requerimiento antes de enviar.
 * @param {Object} cabecera - Datos del paso 1.
 * @param {Array} detalles - Lista de gastos del paso 2.
 * @param {boolean} enviando - Indica si la solicitud se está procesando.
 * @param {string|null} errorEnvio - Mensaje de error al enviar (o null).
 */
const Step3Resumen = ({ cabecera, detalles, enviando, errorEnvio }) => {
  const totalGastos = detalles.reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);
  const montoFinal = cabecera.monto_solicitado
    ? parseFloat(cabecera.monto_solicitado)
    : totalGastos;
  const hayImagen = detalles.some((d) => d.adj_cajachica);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-black text-brand-dark tracking-tight">Resumen de la Solicitud</h2>
        <p className="text-sm text-gray-400 mt-0.5">Revise los datos antes de enviar su requerimiento.</p>
      </div>

      {/* Error de envío */}
      {errorEnvio && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-2xl px-4 py-3">
          <AlertCircle size={16} />
          {errorEnvio}
        </div>
      )}

      {/* Datos de cabecera */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
        <p className="text-xs font-black text-brand-primary uppercase tracking-widest mb-3">Datos Generales</p>
        <FilaResumen icono={User} etiqueta="Solicitante" valor={cabecera.usuario_nombre || '—'} />
        <FilaResumen icono={Building} etiqueta="Área" valor={cabecera.area_nombre || '—'} />
        <FilaResumen icono={Calendar} etiqueta="Fecha" valor={cabecera.fecha_solicitud || '—'} />
        <FilaResumen
          icono={DollarSign}
          etiqueta="Monto Solicitado"
          valor={`S/. ${montoFinal.toFixed(2)}`}
          color="text-brand-primary"
        />
        {cabecera.obs && (
          <FilaResumen icono={FileText} etiqueta="Observaciones" valor={cabecera.obs} />
        )}
      </div>

      {/* Tabla de gastos resumida */}
      <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-5 pt-5 pb-3 border-b border-gray-50">
          <p className="text-xs font-black text-brand-primary uppercase tracking-widest">
            Detalle de Gastos ({detalles.length} ítems)
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {detalles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No hay gastos registrados.</p>
          ) : detalles.map((det, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                {det._preview ? (
                  <img src={det._preview} alt="adj" className="w-8 h-8 rounded-xl object-cover border border-gray-100" />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-brand-light flex items-center justify-center text-xs font-black text-brand-primary">{i + 1}</div>
                )}
                <div>
                  <p className="text-sm font-bold text-brand-dark">{det.detalle || '—'}</p>
                  <p className="text-xs text-gray-400">{det.fecha_gasto} {det.nro_factura ? `• ${det.nro_factura}` : ''}</p>
                </div>
              </div>
              <span className="text-sm font-black text-brand-dark">S/. {parseFloat(det.costo || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
        {/* Totales */}
        <div className="px-5 py-4 bg-brand-light border-t-2 border-brand-primary/10 flex items-center justify-between">
          <span className="text-sm font-black text-brand-dark uppercase tracking-wider">Total Gastos</span>
          <span className="text-lg font-black text-brand-primary">S/. {totalGastos.toFixed(2)}</span>
        </div>

      </div>

      {/* Aviso de imágenes adjuntas */}
      {hayImagen && (
        <div className="flex items-center gap-2 bg-brand-light border border-brand-primary/20 text-brand-primary text-sm font-semibold rounded-2xl px-4 py-3">
          <CheckCircle size={16} />
          Se adjuntarán {detalles.filter(d => d.adj_cajachica).length} imagen(es) de comprobantes.
        </div>
      )}

      {/* Indicador de carga al enviar */}
      {enviando && (
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="w-6 h-6 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold text-brand-primary">Enviando solicitud...</span>
        </div>
      )}
    </div>
  );
};

export default Step3Resumen;
