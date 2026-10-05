import React from 'react';
import {
  CheckCircle2,
  User,
  Building,
  Calendar,
  DollarSign,
  FileText,
  AlertCircle,
  Receipt,
  Clock,
  Send,
  Save,
  AlertTriangle
} from 'lucide-react';
import { useCatalogoStore } from '../../store/catalogoStore';

// ============================================================================
// COMPONENTE AUXILIAR: FILA DE RESUMEN
// ============================================================================

const FilaResumen = ({ icono: Icono, etiqueta, valor, color = 'text-brand-dark' }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-xl bg-brand-light flex items-center justify-center shrink-0">
        <Icono size={14} className="text-brand-primary" />
      </div>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{etiqueta}</span>
    </div>
    <span className={`text-sm font-black ${color} text-right`}>{valor}</span>
  </div>
);

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

const coincidenUrlsOIds = (url1, url2) => {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  const id1 = extraerIdDeUrl(url1);
  const id2 = extraerIdDeUrl(url2);
  return id1 !== null && id2 !== null && id1 === id2;
};

// ============================================================================
// COMPONENTE PRINCIPAL: STEP 3 RESUMEN
// ============================================================================

/**
 * Paso 3: Resumen final y selección de acción (Guardar Pendiente vs Enviar y Liquidar).
 */
const Step3Resumen = ({ cabecera, detalles, enviando, errorEnvio, onEnviarSolicitud }) => {
  const { tiposGasto, subgastos, entidades, provincias } = useCatalogoStore();

  const totalGastos = detalles.reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);
  const montoSolicitadoNum = parseFloat(cabecera.monto_solicitado || 0);
  const montoFinal = montoSolicitadoNum > 0 ? montoSolicitadoNum : totalGastos;
  const saldoRestante = montoFinal - totalGastos;
  const tieneSaldoSobrante = saldoRestante > 0.01;
  const totalImagenes = detalles.filter((d) => d.adj_cajachica).length;

  return (
    <div className="space-y-4 animate-fade-in font-outfit pb-4">
      <div>
        <h2 className="text-lg font-black text-brand-dark tracking-tight">Resumen de la Solicitud</h2>
        <p className="text-xs text-gray-400">Verifique los datos antes de registrar o liquidar su requerimiento.</p>
      </div>

      {/* Alerta de Error de Envío */}
      {errorEnvio && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-2xl p-4 animate-shake">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{errorEnvio}</span>
        </div>
      )}

      {/* Tarjeta de Datos Generales de la Cabecera */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-1">
        <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest block mb-2">
          Datos de la Solicitud
        </span>
        <FilaResumen icono={User} etiqueta="Solicitante" valor={cabecera.usuario_nombre || '—'} />
        <FilaResumen icono={Building} etiqueta="Área" valor={cabecera.area_nombre || '—'} />
        <FilaResumen icono={Calendar} etiqueta="Fecha" valor={cabecera.fecha_solicitud?.replace('T', ' ') || '—'} />
        <FilaResumen
          icono={DollarSign}
          etiqueta="Monto Solicitado"
          valor={`S/. ${montoFinal.toFixed(2)}`}
          color="text-brand-dark"
        />
        <FilaResumen
          icono={DollarSign}
          etiqueta="Total Gastado"
          valor={`S/. ${totalGastos.toFixed(2)}`}
          color="text-brand-primary"
        />
        {tieneSaldoSobrante && (
          <FilaResumen
            icono={AlertTriangle}
            etiqueta="Saldo Pendiente de Rendir"
            valor={`S/. ${saldoRestante.toFixed(2)}`}
            color="text-amber-600"
          />
        )}
        {cabecera.obs && (
          <FilaResumen icono={FileText} etiqueta="Observaciones" valor={cabecera.obs} />
        )}
      </div>

      {/* Tarjeta Explicativa de Estados (Pendiente vs Liquidado) */}
      <div className={`p-4 rounded-3xl border ${tieneSaldoSobrante ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-blue-50/70 border-blue-200 text-blue-900'} space-y-2`}>
        <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider">
          {tieneSaldoSobrante ? <Clock size={16} className="text-amber-600" /> : <CheckCircle2 size={16} className="text-blue-600" />}
          <span>{tieneSaldoSobrante ? 'Saldo Pendiente por Justificar' : 'Listo para Liquidar'}</span>
        </div>
        <p className="text-xs leading-relaxed opacity-90">
          {tieneSaldoSobrante
            ? `Aún queda un saldo de S/ ${saldoRestante.toFixed(2)} por justificar. Por política de gerencia no se permiten vueltos para liquidar. Puede guardar su solicitud como Pendiente (Borrador) para completarla luego.`
            : `Se ha justificado la totalidad del monto solicitado (S/ ${totalGastos.toFixed(2)}). Puede proceder a enviar y liquidar formalmente la solicitud.`}
        </p>
      </div>

      {/* Lista Resumida de Comprobantes de Gasto */}
      <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[10px] font-black text-brand-dark uppercase tracking-widest">
            Comprobantes Registrados ({detalles.length} ítems)
          </span>
          <span className="text-xs font-black text-brand-primary">
            S/. {totalGastos.toFixed(2)}
          </span>
        </div>

        <div className="divide-y divide-gray-50 p-2 space-y-1">
          {detalles.map((det, i) => {
            const sub = subgastos.find((s) => coincidenUrlsOIds(s.url, det.subgasto_url)) || det.subgasto_obj;
            const tipo = tiposGasto.find((t) => coincidenUrlsOIds(t.url, det.tipogasto_url));
            const prov = provincias.find((p) => coincidenUrlsOIds(p.url, det.provincia_url));
            const orig = entidades.find((e) => coincidenUrlsOIds(e.url, det.origen_url));
            const dest = entidades.find((e) => coincidenUrlsOIds(e.url, det.destino_url));

            return (
              <div key={i} className="p-3 rounded-2xl hover:bg-brand-light/30 transition-colors flex items-start gap-3">
                {det._preview ? (
                  <img
                    src={det._preview}
                    alt="Adjunto"
                    className="w-12 h-12 rounded-xl object-cover border border-gray-100 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-brand-light flex items-center justify-center text-xs font-black text-brand-primary shrink-0">
                    <Receipt size={18} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-brand-dark truncate">
                      {sub?.nombre || tipo?.nombre || 'Gasto'}
                    </span>
                    <span className="text-xs font-black text-brand-dark shrink-0">
                      S/. {parseFloat(det.costo || 0).toFixed(2)}
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                    {det.detalle || 'Sin descripción'}
                  </p>

                  <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-gray-400 font-semibold">
                    <span>{det.fecha_gasto}</span>
                    <span>• {det.lima_provincia === 'L' ? 'Lima' : `Provincia (${prov?.nombre || '—'})`}</span>
                    {det.nro_factura && <span>• Doc: {det.nro_factura}</span>}
                    {det.placa && <span>• Placa: {det.placa}</span>}
                    {orig && dest && <span>• Ruta: {orig.sede || orig.nombre} ➔ {dest.sede || dest.nombre}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumen de Total */}
        <div className="px-5 py-3.5 bg-brand-light/60 border-t border-brand-primary/10 flex items-center justify-between">
          <span className="text-xs font-black text-brand-dark uppercase tracking-wider">Total Justificado</span>
          <span className="text-base font-black text-brand-primary">S/. {totalGastos.toFixed(2)}</span>
        </div>
      </div>

      {/* Indicador de Comprobantes Adjuntos */}
      <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-xs font-bold rounded-2xl p-3.5">
        <CheckCircle2 size={16} className="shrink-0" />
        <span>Se enviarán {totalImagenes} foto(s)/ticket(s) adjuntos al requerimiento.</span>
      </div>

      {/* Botones de Acción en el Paso 3 */}
      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onEnviarSolicitud('PD')}
          disabled={enviando}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl border-2 border-amber-400/80 bg-amber-50 hover:bg-amber-100 text-amber-800 font-black text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
        >
          <Save size={16} />
          <span>Guardar Pendiente (Borrador)</span>
        </button>

        <button
          type="button"
          onClick={() => onEnviarSolicitud('LQ')}
          disabled={enviando || tieneSaldoSobrante}
          className={`w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all ${
            tieneSaldoSobrante
              ? 'bg-gray-300 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20 hover:scale-[1.01]'
          } disabled:opacity-50`}
        >
          <Send size={16} />
          <span>Enviar y Liquidar</span>
        </button>
      </div>

      {/* Animación de Envío */}
      {enviando && (
        <div className="flex items-center justify-center gap-3 py-3 bg-white rounded-2xl border border-brand-primary/20 shadow-sm">
          <div className="w-5 h-5 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-brand-primary">Procesando solicitud y comprobantes...</span>
        </div>
      )}
    </div>
  );
};

export default Step3Resumen;
