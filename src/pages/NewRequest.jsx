import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Send, X } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth } from '../utils/fetchAuth';
import Stepper from '../components/NewRequest/Stepper';
import Step1Cabecera from '../components/NewRequest/Step1Cabecera';
import Step2Detalles from '../components/NewRequest/Step2Detalles';
import Step3Resumen from '../components/NewRequest/Step3Resumen';

const API_URL = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL;

const PASOS = [
  { etiqueta: 'Solicitud' },
  { etiqueta: 'Gastos' },
  { etiqueta: 'Resumen' },
];

// Estado inicial vacío de la cabecera del formulario
const cabeceraInicial = {
  area_id: null,
  area_url: null,       // URL hyperlinked del área para la API
  area_nombre: '',
  usuario_id: null,
  usuario_url: null,    // URL hyperlinked del usuario para la API
  usuario_nombre: '',
  monto_solicitado: '',
  obs: '',
  fecha_solicitud: '',
};

/**
 * Página principal del módulo de Nueva Solicitud de Caja Chica.
 * Coordina los tres pasos del stepper y gestiona el envío a la API.
 */
const NewRequest = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();

  const [pasoActual, setPasoActual] = useState(1);
  const [cabecera, setCabecera] = useState(cabeceraInicial);
  const [detalles, setDetalles] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  const actualizarCabecera = (cambios) => {
    setCabecera((prev) => ({ ...prev, ...cambios }));
  };

  const totalGastos = detalles.reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);

  // Calcula el monto final: si el usuario ingresó uno manualmente se usa ese; si no, se autocalcula
  const montoFinal = cabecera.monto_solicitado
    ? parseFloat(cabecera.monto_solicitado)
    : totalGastos;

  // Validaciones por paso — garantiza que los campos requeridos estén completos antes de avanzar
  const pasoValido = pasoActual === 1
    ? !!cabecera.usuario_id && !!cabecera.area_id && !!cabecera.fecha_solicitud
    : pasoActual === 2
      ? detalles.length > 0
      : true;

  const irAnterior = () => setPasoActual((p) => Math.max(1, p - 1));
  const irSiguiente = () => setPasoActual((p) => Math.min(3, p + 1));

  /**
   * Envía el requerimiento completo a la API.
   * Los campos relacionales se envían como URLs hyperlinked (formato DRF).
   * 1. POST a /Requerimiento_CajaChica/ -> obtiene la URL del requerimiento creado
   * 2. POST múltiples a /RC_Detalle/ usando esa URL como referencia.
   */
  const enviarSolicitud = async () => {
    setEnviando(true);
    setErrorEnvio(null);
    try {
      // ---- Paso A: Crear cabecera del requerimiento ----
      const cabeceraPayload = {
        area_id: cabecera.area_url || cabecera.area_id,
        usuario_id: cabecera.usuario_url || cabecera.usuario_id,
        monto_solicitado: montoFinal.toFixed(2),
        total_gastado: totalGastos.toFixed(2),
        estado_requerimiento: 'PD',
        obs: cabecera.obs || '',
        fecha_solicitud: cabecera.fecha_solicitud,
        created_by: cabecera.usuario_url || cabecera.usuario_id,
      };

      console.log('[NewRequest] Payload enviado:', cabeceraPayload);

      const resRequerimiento = await fetchAuth(
        `${API_URL}/Requerimiento_CajaChica/?format=json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cabeceraPayload),
        }
      );

      if (!resRequerimiento.ok) {
        const detError = await resRequerimiento.text();
        throw new Error(`Error al crear el requerimiento: ${detError}`);
      }

      const requerimientoCreado = await resRequerimiento.json();
      // La API devuelve la URL hyperlinked del nuevo registro
      const requerimientoUrl = requerimientoCreado.url || requerimientoCreado.id;

      // ---- Paso B: Crear líneas de detalle (en paralelo) ----
      const promesasDetalles = detalles.map((det) => {
        if (det.adj_cajachica) {
          // Envío con imagen: FormData (los campos de URL se envían como string)
          const fd = new FormData();
          fd.append('requerimiento_id', requerimientoUrl);
          fd.append('tipogasto_id', det.tipogasto_url || '');
          fd.append('subgasto_id', det.subgasto_url || '');
          fd.append('lima_provincia', det.lima_provincia || 'L');
          if (det.lima_provincia === 'P' && det.provincia_url) {
            fd.append('provincia_id', det.provincia_url);
          }
          fd.append('nro_factura', det.nro_factura || '');
          fd.append('nro_ruc', det.nro_ruc || '');
          fd.append('origen', det.origen_url || '');
          fd.append('destino', det.destino_url || '');
          fd.append('costo', det.costo || '0');
          fd.append('detalle', det.detalle || '');
          fd.append('fecha_gasto', det.fecha_gasto || '');
          fd.append('adj_cajachica', det.adj_cajachica);
          return fetchAuth(`${API_URL}/RC_Detalle/?format=json`, { method: 'POST', body: fd });
        }

        // Envío sin imagen: JSON con URLs hyperlinked
        return fetchAuth(`${API_URL}/RC_Detalle/?format=json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requerimiento_id: requerimientoUrl,
            tipogasto_id: det.tipogasto_url || null,
            subgasto_id: det.subgasto_url || null,
            lima_provincia: det.lima_provincia || 'L',
            provincia_id: det.lima_provincia === 'P' ? (det.provincia_url || null) : null,
            nro_factura: det.nro_factura || '',
            nro_ruc: det.nro_ruc || '',
            origen: det.origen_url || null,
            destino: det.destino_url || null,
            costo: det.costo || '0',
            detalle: det.detalle || '',
            fecha_gasto: det.fecha_gasto || '',
          }),
        });
      });

      const respuestasDetalles = await Promise.all(promesasDetalles);
      const fallidas = respuestasDetalles.filter((r) => !r.ok);
      if (fallidas.length > 0) {
        throw new Error(`${fallidas.length} línea(s) de detalle no pudieron guardarse.`);
      }

      // Éxito total: redirigir a mis solicitudes
      navigate('/mis-solicitudes', { state: { exito: true } });

    } catch (err) {
      setErrorEnvio(err.message || 'Ocurrió un error inesperado. Intente nuevamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col pt-4 pb-4 px-4 md:px-8 animate-fade-in font-outfit overflow-hidden">
      <div className="w-full flex flex-col h-full">
        {/* Encabezado de la página */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div>
            <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">Nueva Solicitud de Caja Chica</h1>
            <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">Complete los pasos para registrar su requerimiento.</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors p-0 m-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tarjeta principal — ocupa el espacio restante y scrollea solo por dentro */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 flex flex-col flex-1 min-h-0">
          {/* Sección scrollable: stepper + contenido */}
          <div className="flex-1 overflow-y-auto md:px-8 pt-5 pb-0 min-h-0">
            <Stepper pasoActual={pasoActual} pasos={PASOS} />

            {/* Contenido del paso activo */}
            {pasoActual === 1 && (
              <Step1Cabecera datos={cabecera} onChange={actualizarCabecera} />
            )}
            {pasoActual === 2 && (
              <Step2Detalles
                detalles={detalles}
                onChangeDetalles={setDetalles}
                montoLimite={cabecera.monto_solicitado || null}
              />
            )}
            {pasoActual === 3 && (
              <Step3Resumen
                cabecera={{ ...cabecera, monto_solicitado: montoFinal }}
                detalles={detalles}
                enviando={enviando}
                errorEnvio={errorEnvio}
              />
            )}
          </div>

          {/* Barra de navegación fija al fondo de la tarjeta */}
          <div className="flex items-center justify-between py-2 md:px-8 py-2 border-t border-gray-50 shrink-0">
            <button
              onClick={pasoActual === 1 ? () => navigate(-1) : irAnterior}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <ArrowLeft size={16} />
              {pasoActual === 1 ? 'Cancelar' : 'Anterior'}
            </button>

            {pasoActual < 3 ? (
              <button
                onClick={irSiguiente}
                disabled={!pasoValido}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all ${pasoValido
                  ? 'bg-brand-primary text-white hover:bg-brand-secondary hover:shadow-lg hover:shadow-brand-primary/20 hover:-translate-y-0.5'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
              >
                Siguiente
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={enviarSolicitud}
                disabled={enviando}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-brand-primary text-white text-sm font-bold hover:bg-brand-secondary hover:shadow-lg hover:shadow-brand-primary/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={16} />
                Enviar Solicitud
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewRequest;
