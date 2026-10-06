import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Send, Save, X, AlertCircle } from 'lucide-react';
import { useUserStore } from '../store/userStore';
import { fetchAuth } from '../utils/fetchAuth';
import Stepper from '../components/NewRequest/Stepper';
import Step1Cabecera from '../components/NewRequest/Step1Cabecera';
import Step2Detalles from '../components/NewRequest/Step2Detalles';
import Step3Resumen from '../components/NewRequest/Step3Resumen';
import Toast from '../components/Toast';

const API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const PASOS = [
  { etiqueta: 'Solicitud' },
  { etiqueta: 'Gastos' },
  { etiqueta: 'Resumen' },
];

// Estado inicial vacío de la cabecera del formulario
const cabeceraInicial = {
  id: null,
  url: null,
  area_id: null,
  area_url: null,
  area_nombre: '',
  usuario_id: null,
  usuario_url: null,
  usuario_nombre: '',
  monto_solicitado: '',
  obs: '',
  fecha_solicitud: '',
};

// ============================================================================
// FUNCIONES AUXILIARES DE FORMATEO Y MAPEO
// ============================================================================

/**
 * Extrae un identificador numérico desde un entero, string o URL de recurso.
 */
const extraerId = (idOUri) => {
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
 * Mapea la cabecera recibida en modo edición al estado local del formulario.
 */
const mapearCabeceraExistente = (req) => {
  const usuarioObj = typeof req.usuario_id === 'object' ? req.usuario_id : null;
  const usuarioId = usuarioObj?.id || req.usuario_id;
  const usuarioUrl = usuarioObj?.url || (usuarioId ? `${API_URL}/Usuario/${usuarioId}/` : null);
  const usuarioNombre = usuarioObj?.full_name || usuarioObj?.username || req.created_by || '';

  const areaId = typeof req.area_id === 'object' ? req.area_id.id : req.area_id;
  const areaUrl = typeof req.area_id === 'object' ? req.area_id.url : null;
  const areaNombre = typeof req.area_id === 'object' ? req.area_id.nombre : String(req.area_id || '');

  return {
    id: req.id || extraerId(req.url),
    url: req.url || (req.id ? `${API_URL}/Requerimiento_CajaChica/${req.id}/` : null),
    area_id: areaId,
    area_url: areaUrl,
    area_nombre: areaNombre,
    usuario_id: usuarioId,
    usuario_url: usuarioUrl,
    usuario_nombre: usuarioNombre,
    monto_solicitado: req.monto_solicitado || '',
    obs: req.obs || '',
    fecha_solicitud: req.fecha_solicitud ? req.fecha_solicitud.slice(0, 16) : '',
  };
};

const extraerEntidadUrl = (ent) => {
  if (!ent) return null;
  if (typeof ent === 'object') return ent.url || (ent.id ? `${API_URL}/RC_Entidades/${ent.id}/` : null);
  if (typeof ent === 'string') return ent.startsWith('http') ? ent : `${API_URL}/RC_Entidades/${extraerId(ent) || ent}/`;
  if (typeof ent === 'number') return `${API_URL}/RC_Entidades/${ent}/`;
  return null;
};

const extraerProvinciaUrl = (prov) => {
  if (!prov) return null;
  if (typeof prov === 'object') return prov.url || (prov.id ? `${API_URL}/RC_Provincia/${prov.id}/` : null);
  if (typeof prov === 'string') return prov.startsWith('http') ? prov : `${API_URL}/RC_Provincia/${extraerId(prov) || prov}/`;
  if (typeof prov === 'number') return `${API_URL}/RC_Provincia/${prov}/`;
  return null;
};

const extraerSubgastoUrl = (sub) => {
  if (!sub) return null;
  if (typeof sub === 'object') return sub.url || (sub.id ? `${API_URL}/RC_SubGasto/${sub.id}/` : null);
  if (typeof sub === 'string') return sub.startsWith('http') ? sub : `${API_URL}/RC_SubGasto/${extraerId(sub) || sub}/`;
  if (typeof sub === 'number') return `${API_URL}/RC_SubGasto/${sub}/`;
  return null;
};

/**
 * Mapea los detalles recibidos del backend para el sub-wizard de gastos.
 */
const mapearDetallesExistentes = (detallesLista) => {
  if (!Array.isArray(detallesLista)) return [];
  return detallesLista.map((d) => {
    const idNum = d.id || extraerId(d.url);
    const subgastoObj = typeof d.subgasto_id === 'object' ? d.subgasto_id : null;
    const subgastoUrl = extraerSubgastoUrl(d.subgasto_id) || (subgastoObj?.id ? `${API_URL}/RC_SubGasto/${subgastoObj.id}/` : null);
    const tipogastoUrl = subgastoObj?.tipogasto_id?.url || (subgastoObj?.tipogasto_id?.id ? `${API_URL}/RC_TipoGasto/${subgastoObj.tipogasto_id.id}/` : null);

    return {
      id: idNum,
      url: d.url || (idNum ? `${API_URL}/RC_Detalle/${idNum}/` : null),
      tipogasto_url: tipogastoUrl,
      subgasto_url: subgastoUrl,
      subgasto_obj: subgastoObj,
      lima_provincia: d.lima_provincia || 'L',
      provincia_url: extraerProvinciaUrl(d.provincia_id),
      nro_factura: d.nro_factura || '',
      nro_ruc: d.nro_ruc || '',
      placa: d.placa || '',
      origen_url: extraerEntidadUrl(d.origen),
      destino_url: extraerEntidadUrl(d.destino),
      costo: d.costo || '',
      detalle: d.detalle || '',
      fecha_gasto: d.fecha_gasto ? d.fecha_gasto.slice(0, 10) : new Date().toISOString().split('T')[0],
      adj_cajachica: d.adj_cajachica || null,
      _preview: d.adj_cajachica || null,
    };
  });
};

/**
 * Extrae de forma limpia el mensaje de error del backend (JSON o texto).
 */
const extraerMensajeError = async (respuesta) => {
  try {
    const datosJson = await respuesta.json();
    if (datosJson.detail && datosJson.error_tecnico) {
      return `${datosJson.detail}\nDetalle técnico: ${datosJson.error_tecnico}`;
    }
    if (datosJson.detail) return datosJson.detail;
    if (datosJson.error) return datosJson.error;
    if (typeof datosJson === 'object') {
      const primerError = Object.entries(datosJson)
        .map(([campo, msg]) => `${campo}: ${Array.isArray(msg) ? msg.join(', ') : msg}`)
        .join(' | ');
      if (primerError) return primerError;
    }
    return JSON.stringify(datosJson);
  } catch {
    return `Error de servidor (${respuesta.status})`;
  }
};

/**
 * Valida de forma estricta los datos para el estado Liquidado (LQ).
 */
const validarParaLiquidacion = (cabecera, detalles, montoFinal, totalGastos) => {
  if (!Array.isArray(detalles) || detalles.length === 0) {
    return 'Debe registrar al menos un comprobante de gasto para liquidar.';
  }

  // Regla gerencial: Debe haberse gastado todo el dinero (sin vuelto)
  if (Math.abs(montoFinal - totalGastos) > 0.01) {
    return `Para liquidar la rendición, debe haber justificado la totalidad del monto solicitado (S/ ${montoFinal.toFixed(2)}).\nActualmente ha registrado S/ ${totalGastos.toFixed(2)}, quedando un saldo de S/ ${(montoFinal - totalGastos).toFixed(2)} por gastar.\nSi no ha finalizado, puede guardarlo como Pendiente (Borrador).`;
  }

  for (let i = 0; i < detalles.length; i++) {
    const d = detalles[i];
    const nro = i + 1;

    if (!d.subgasto_url) {
      return `El gasto #${nro} no tiene un subgasto/concepto asignado.`;
    }

    const costo = parseFloat(d.costo);
    if (isNaN(costo) || costo <= 0) {
      return `El gasto #${nro} tiene un importe inválido.`;
    }

    if (d.lima_provincia === 'P' && !d.provincia_url) {
      return `El gasto #${nro} está marcado para Provincia pero no tiene provincia seleccionada.`;
    }

    if (!d.adj_cajachica) {
      return `El comprobante #${nro} no tiene adjunto el ticket o foto obligatoria.`;
    }
  }

  return null;
};

// ============================================================================
// COMPONENTE PRINCIPAL: NUEVA SOLICITUD / EDICIÓN
// ============================================================================

const NewRequest = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserStore();

  const requerimientoAEditar = location.state?.requerimientoAEditar || null;
  const esModoEdicion = !!requerimientoAEditar;

  const [pasoActual, setPasoActual] = useState(esModoEdicion ? 2 : 1);
  const [cabecera, setCabecera] = useState(
    esModoEdicion ? mapearCabeceraExistente(requerimientoAEditar) : cabeceraInicial
  );
  const [detalles, setDetalles] = useState(
    esModoEdicion ? mapearDetallesExistentes(requerimientoAEditar.detalles) : []
  );
  const [enviando, setEnviando] = useState(false);

  // Registro de detalles originales y eliminados para sincronización
  const detallesOriginalesRef = useRef(
    esModoEdicion ? mapearDetallesExistentes(requerimientoAEditar.detalles) : []
  );
  const [idsEliminados, setIdsEliminados] = useState([]);

  // Notificación flotante Toast
  const [notificacion, setNotificacion] = useState(null);

  const actualizarCabecera = (cambios) => {
    setCabecera((prev) => ({ ...prev, ...cambios }));
  };

  const manejarEliminarDetalle = async (idx) => {
    const detalleAEliminar = detalles[idx];
    const idNum = extraerId(detalleAEliminar?.id || detalleAEliminar?.url);
    if (idNum) {
      try {
        const resDelete = await fetchAuth(`${API_URL}/RC_Detalle/${idNum}/?format=json`, {
          method: 'DELETE',
        });
        if (!resDelete.ok && resDelete.status !== 404) {
          const errDel = await extraerMensajeError(resDelete);
          throw new Error(`Error al eliminar comprobante #${idNum}: ${errDel}`);
        }
      } catch (err) {
        setNotificacion({
          tipo: 'error',
          titulo: 'Error al Eliminar Comprobante',
          mensaje: err.message || 'No se pudo eliminar el comprobante del servidor.',
        });
        return;
      }
    }
    setDetalles((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalGastos = detalles.reduce((acc, d) => acc + (parseFloat(d.costo) || 0), 0);
  const montoSolicitadoNum = parseFloat(cabecera.monto_solicitado || 0);
  const montoFinal = montoSolicitadoNum > 0 ? montoSolicitadoNum : totalGastos;

  // Validaciones por paso para habilitar el avance
  const pasoValido = pasoActual === 1
    ? !!cabecera.usuario_id && !!cabecera.area_id && !!cabecera.fecha_solicitud
    : true;

  const irAnterior = () => setPasoActual((p) => Math.max(1, p - 1));
  const irSiguiente = () => {
    setNotificacion(null);
    setPasoActual((p) => Math.min(3, p + 1));
  };

  // ============================================================================
  // ENVÍO DE FORMULARIO (POST CREACIÓN / PATCH EDICIÓN ATÓMICA)
  // ============================================================================

  const enviarSolicitud = async (estadoDestino = 'LQ') => {
    setNotificacion(null);

    // Si se envía como Liquidado (LQ), exigir todas las reglas y saldo cero
    if (estadoDestino === 'LQ') {
      const errorValidacion = validarParaLiquidacion(cabecera, detalles, montoFinal, totalGastos);
      if (errorValidacion) {
        setNotificacion({
          tipo: 'advertencia',
          titulo: 'Validación de Liquidación',
          mensaje: errorValidacion,
        });
        return;
      }
    }

    setEnviando(true);
    try {
      const idReqExistente = cabecera.id || extraerId(cabecera.url);

      if (esModoEdicion && idReqExistente) {
        // --------------------------------------------------------------------
        // MODO EDICIÓN: PATCH EN CABECERA Y GESTIÓN DE COMPROBANTES
        // --------------------------------------------------------------------
        // La cabecera se mantiene en 'PD' para permitir la inserción/edición de detalles
        const cabeceraPayload = {
          monto_solicitado: montoFinal.toFixed(2),
          total_gastado: totalGastos.toFixed(2),
          estado_requerimiento: 'PD',
          obs: cabecera.obs || '',
          fecha_solicitud: cabecera.fecha_solicitud,
        };

        const resRequerimiento = await fetchAuth(
          `${API_URL}/Requerimiento_CajaChica/${idReqExistente}/?format=json`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cabeceraPayload),
          }
        );

        if (!resRequerimiento.ok) {
          const errorDetallado = await extraerMensajeError(resRequerimiento);
          throw new Error(errorDetallado);
        }

        // Crear nuevos comprobantes o actualizar modificados
        const requerimientoUrl = cabecera.url || `${API_URL}/Requerimiento_CajaChica/${idReqExistente}/`;

        const promesasDetalles = detalles.map(async (det, idx) => {
          const idDetalle = extraerId(det.id || det.url);
          const esNuevo = !idDetalle;
          const tieneArchivoNuevo = det.adj_cajachica instanceof File;
          const subUrl = det.subgasto_url || extraerSubgastoUrl(det.subgasto_obj);
          const provUrl = det.lima_provincia === 'P' ? (det.provincia_url || extraerProvinciaUrl(det.provincia_id)) : null;
          const origUrl = det.origen_url || extraerEntidadUrl(det.origen);
          const destUrl = det.destino_url || extraerEntidadUrl(det.destino);

          const formData = new FormData();
          formData.append('requerimiento_id', requerimientoUrl);
          if (det.tipogasto_url) formData.append('tipogasto_id', det.tipogasto_url);
          if (subUrl) formData.append('subgasto_id', subUrl);
          formData.append('lima_provincia', det.lima_provincia || 'L');

          if (provUrl) formData.append('provincia_id', provUrl);
          if (det.nro_factura) formData.append('nro_factura', det.nro_factura);
          if (det.nro_ruc) formData.append('nro_ruc', det.nro_ruc);
          if (det.placa) formData.append('placa', det.placa);
          if (origUrl) formData.append('origen', origUrl);
          if (destUrl) formData.append('destino', destUrl);

          formData.append('costo', String(det.costo || '0'));
          formData.append('detalle', det.detalle || '');
          formData.append('fecha_gasto', det.fecha_gasto || '');

          if (tieneArchivoNuevo) {
            formData.append('adj_cajachica', det.adj_cajachica);
          }

          if (esNuevo) {
            // Creación de nueva fila de comprobante
            const resDet = await fetchAuth(`${API_URL}/RC_Detalle/?format=json`, {
              method: 'POST',
              body: formData,
            });
            if (!resDet.ok) {
              const err = await extraerMensajeError(resDet);
              throw new Error(`Comprobante #${idx + 1}: ${err}`);
            }
            const datosCreados = await resDet.json();
            const nuevoId = datosCreados.id || extraerId(datosCreados.url);
            return {
              ...det,
              id: nuevoId,
              url: datosCreados.url || (nuevoId ? `${API_URL}/RC_Detalle/${nuevoId}/` : null),
              adj_cajachica: datosCreados.adj_cajachica || det.adj_cajachica,
              _preview: datosCreados.adj_cajachica || det._preview,
            };
          } else {
            // Actualización de comprobante existente vía PATCH
            const resDet = await fetchAuth(`${API_URL}/RC_Detalle/${idDetalle}/?format=json`, {
              method: 'PATCH',
              body: formData,
            });
            if (!resDet.ok) {
              const err = await extraerMensajeError(resDet);
              throw new Error(`Comprobante #${idx + 1}: ${err}`);
            }
            const datosActualizados = await resDet.json();
            return {
              ...det,
              id: idDetalle,
              url: det.url || `${API_URL}/RC_Detalle/${idDetalle}/`,
              adj_cajachica: datosActualizados.adj_cajachica || det.adj_cajachica,
              _preview: datosActualizados.adj_cajachica || det._preview,
            };
          }
        });

        const detallesSincronizados = await Promise.all(promesasDetalles);
        setDetalles(detallesSincronizados);

        // 3. Transición final a Liquidado (LQ) solo después de haber guardado todos los detalles
        if (estadoDestino === 'LQ') {
          const resLiq = await fetchAuth(
            `${API_URL}/Requerimiento_CajaChica/${idReqExistente}/liquidar/?format=json`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ obs: cabecera.obs || 'Rendición finalizada y liquidada' }),
            }
          );
          if (!resLiq.ok) {
            const errLiq = await extraerMensajeError(resLiq);
            throw new Error(errLiq);
          }
        }
      } else {
        // --------------------------------------------------------------------
        // MODO CREACIÓN: POST NUEVO REQUERIMIENTO EN 'PD' Y COMPROBANTES
        // --------------------------------------------------------------------
        const usuarioHyperlink = cabecera.usuario_url || user?.url || (cabecera.usuario_id ? `${API_URL}/users/${cabecera.usuario_id}/` : null);
        const areaHyperlink = cabecera.area_url || user?.area_url || null;

        // Se crea siempre inicialmente en 'PD' para poder asociar los comprobantes
        const cabeceraPayload = {
          area_id: areaHyperlink,
          usuario_id: usuarioHyperlink,
          monto_solicitado: montoFinal.toFixed(2),
          total_gastado: totalGastos.toFixed(2),
          estado_requerimiento: 'PD',
          obs: cabecera.obs || '',
          fecha_solicitud: cabecera.fecha_solicitud,
          created_by: usuarioHyperlink,
        };

        const resRequerimiento = await fetchAuth(
          `${API_URL}/Requerimiento_CajaChica/?format=json`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cabeceraPayload),
          }
        );

        if (!resRequerimiento.ok) {
          const errorDetallado = await extraerMensajeError(resRequerimiento);
          throw new Error(errorDetallado);
        }

        const requerimientoCreado = await resRequerimiento.json();
        const requerimientoId = requerimientoCreado.id || extraerId(requerimientoCreado.url);
        const requerimientoUrl = requerimientoCreado.url || `${API_URL}/Requerimiento_CajaChica/${requerimientoId}/`;

        // Registrar cada detalle asociado al requerimiento recién creado
        if (detalles.length > 0) {
          const promesasDetalles = detalles.map(async (det, idx) => {
            const subUrl = det.subgasto_url || extraerSubgastoUrl(det.subgasto_obj);
            const provUrl = det.lima_provincia === 'P' ? (det.provincia_url || extraerProvinciaUrl(det.provincia_id)) : null;
            const origUrl = det.origen_url || extraerEntidadUrl(det.origen);
            const destUrl = det.destino_url || extraerEntidadUrl(det.destino);

            const formData = new FormData();
            formData.append('requerimiento_id', requerimientoUrl);
            if (det.tipogasto_url) formData.append('tipogasto_id', det.tipogasto_url);
            if (subUrl) formData.append('subgasto_id', subUrl);
            formData.append('lima_provincia', det.lima_provincia || 'L');

            if (provUrl) formData.append('provincia_id', provUrl);
            if (det.nro_factura) formData.append('nro_factura', det.nro_factura);
            if (det.nro_ruc) formData.append('nro_ruc', det.nro_ruc);
            if (det.placa) formData.append('placa', det.placa);
            if (origUrl) formData.append('origen', origUrl);
            if (destUrl) formData.append('destino', destUrl);

            formData.append('costo', String(det.costo || '0'));
            formData.append('detalle', det.detalle || '');
            formData.append('fecha_gasto', det.fecha_gasto || '');

            if (det.adj_cajachica) {
              formData.append('adj_cajachica', det.adj_cajachica);
            }

            const resDet = await fetchAuth(`${API_URL}/RC_Detalle/?format=json`, {
              method: 'POST',
              body: formData,
            });

            if (!resDet.ok) {
              const errorDet = await extraerMensajeError(resDet);
              throw new Error(`Comprobante #${idx + 1}: ${errorDet}`);
            }

            const datosCreados = await resDet.json();
            const nuevoId = datosCreados.id || extraerId(datosCreados.url);
            return {
              ...det,
              id: nuevoId,
              url: datosCreados.url || (nuevoId ? `${API_URL}/RC_Detalle/${nuevoId}/` : null),
              adj_cajachica: datosCreados.adj_cajachica || det.adj_cajachica,
              _preview: datosCreados.adj_cajachica || det._preview,
            };
          });

          const detallesSincronizados = await Promise.all(promesasDetalles);
          setDetalles(detallesSincronizados);
        }

        // Si el usuario eligió Enviar y Liquidar, ejecutar la liquidación ahora que ya existen los detalles
        if (estadoDestino === 'LQ' && requerimientoId) {
          const resLiq = await fetchAuth(
            `${API_URL}/Requerimiento_CajaChica/${requerimientoId}/liquidar/?format=json`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ obs: cabecera.obs || 'Rendición liquidada' }),
            }
          );
          if (!resLiq.ok) {
            const errLiq = await extraerMensajeError(resLiq);
            throw new Error(errLiq);
          }
        }
      }

      const mensaje =
        estadoDestino === 'LQ'
          ? '¡Rendición de caja chica liquidada y enviada con éxito!'
          : 'Se guardó su requerimiento como Pendiente (Borrador). Puede continuar llenándolo en Mis Solicitudes.';

      navigate('/mis-solicitudes', { state: { exito: mensaje } });
    } catch (err) {
      setNotificacion({
        tipo: 'error',
        titulo: 'Error al Guardar Requerimiento',
        mensaje: err.message || 'Ocurrió un error inesperado al procesar la solicitud.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="h-[calc(100vh-5.5rem)] md:h-[calc(100vh-6rem)] flex flex-col pt-3 pb-2 px-4 md:px-8 animate-fade-in font-outfit overflow-hidden relative">
      {/* Notificación Flotante Toast */}
      {notificacion && (
        <Toast
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          alCerrar={() => setNotificacion(null)}
        />
      )}

      <div className="w-full flex flex-col h-full">
        {/* Encabezado de la página */}
        <div className="flex items-center justify-between mb-1.5 shrink-0">
          <div>
            <h1 className="text-xl font-black text-brand-dark tracking-tight p-0 m-0">
              {esModoEdicion ? `Continuar Solicitud #${cabecera.id}` : 'Nueva Solicitud de Caja Chica'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 p-0 m-0">
              {esModoEdicion
                ? 'Modifique o agregue comprobantes antes de enviar la liquidación final.'
                : 'Registre y rinda sus gastos de caja chica.'}
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tarjeta principal */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Stepper Fijo Superior */}
          <div className="px-4 md:px-8 pt-3 pb-2 border-b border-gray-50 shrink-0">
            <Stepper pasoActual={pasoActual} pasos={PASOS} />
          </div>

          {/* Sección scrollable del formulario */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-2.5 pb-3 min-h-0">
            {/* Contenido del paso activo */}
            {pasoActual === 1 && (
              <Step1Cabecera datos={cabecera} onChange={actualizarCabecera} />
            )}
            {pasoActual === 2 && (
              <Step2Detalles
                detalles={detalles}
                onChangeDetalles={setDetalles}
                onEliminarDetalle={manejarEliminarDetalle}
                montoLimite={cabecera.monto_solicitado || null}
              />
            )}
            {pasoActual === 3 && (
              <Step3Resumen
                cabecera={{ ...cabecera, monto_solicitado: montoFinal }}
                detalles={detalles}
                enviando={enviando}
                errorEnvio={notificacion?.tipo === 'error' ? notificacion.mensaje : null}
                onEnviarSolicitud={enviarSolicitud}
              />
            )}
          </div>

          {/* Barra de navegación inferior (Footer Fijo) */}
          <div className="flex items-center justify-between py-2 px-4 md:px-8 border-t border-gray-100 shrink-0 bg-white">
            <button
              onClick={pasoActual === 1 ? () => navigate(-1) : irAnterior}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-gray-200 text-xs sm:text-sm font-bold text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <ArrowLeft size={15} />
              <span>{pasoActual === 1 ? 'Cancelar' : 'Anterior'}</span>
            </button>

            {pasoActual < 3 ? (
              <button
                onClick={irSiguiente}
                disabled={!pasoValido}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  pasoValido
                    ? 'bg-brand-primary text-white hover:bg-brand-secondary hover:shadow-md hover:shadow-brand-primary/20'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                <span>Siguiente</span>
                <ArrowRight size={15} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Botón Guardar Borrador: Oculto en móvil (solo visible en escritorio), en celular se usa el botón al final del scroll */}
                <button
                  type="button"
                  onClick={() => enviarSolicitud('PD')}
                  disabled={enviando}
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>Guardar Borrador</span>
                </button>

                <button
                  type="button"
                  onClick={() => enviarSolicitud('LQ')}
                  disabled={enviando}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black shadow-md shadow-blue-500/20 hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  <Send size={14} />
                  <span>{enviando ? 'Enviando...' : 'Enviar y Liquidar'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewRequest;
