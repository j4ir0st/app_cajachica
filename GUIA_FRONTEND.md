# 💰 Guía de Integración Frontend — Módulo Caja Chica (`app_cajachica`)

Este documento describe la especificación técnica completa, flujo de estados, reglas de negocio reactivas, endpoints REST y ejemplos en **React + TypeScript (Hooks / Axios)** y **Angular** para el Microfrontend de **Caja Chica**.

---

## 🌐 1. Arquitectura de URLs y Convención

- **URL Base en Producción:** `https://appsurgicorperu.com/` (en local: `http://localhost:8000/`)
- **Micro-Frontend Docker (IIS Proxy):** `https://appsurgicorperu.com/app_cajachica/` (Puerto interno: `8006`)
- **Autenticación:** Cabecera HTTP obligatoria en todas las peticiones:
  ```http
  Authorization: Bearer <ACCESS_TOKEN>
  ```
- **Content-Type:**
  - Peticiones estándar: `application/json`
  - Registro de gastos con foto/ticket (`RC_Detalle`): `multipart/form-data`

---

## 📊 2. Estados del Requerimiento (`estado_requerimiento`)

Los requerimientos manejan un ciclo de vida de 4 estados (`models.TextChoices`). En las respuestas del backend se entrega el objeto estructurado `{ CLAVE: "Texto" }`:

| Código (`clave`) | Etiqueta (`display`) | Descripción | Color UI Sugerido |
| :--- | :--- | :--- | :--- |
| **`PD`** | **Pendiente** | Solicitud creada, abierta para registrar comprobantes de gasto. | 🟠 Ámbar / Warning (`#d97706`) |
| **`LQ`** | **Liquidado** | El usuario finalizó el registro de gastos y envió la rendición. | 🔵 Azul / Info (`#2563eb`) |
| **`CD`** | **Cerrado** | Aprobado y cerrado formalmente por Administración/Tesorería. | 🟢 Verde / Success (`#16a34a`) |
| **`RC`** | **Rechazado** | Observado o rechazado por jefatura/gerencia. | 🔴 Rojo / Danger (`#dc2626`) |

---

## ⚙️ 3. Reglas de Negocio Reactivas en Formulario (`RC_SubGasto`)

El modelo `RC_SubGasto` contiene banderas booleanas que le indican a React **qué campos renderizar y validar obligatoriamente** cuando el usuario selecciona un subgasto:

| Campo en `RC_SubGasto` | Tipo | Comportamiento en la UI de React |
| :--- | :--- | :--- |
| `localidad_permitida` | `'L' \| 'P' \| 'A'` | - `'L'`: Fijar automáticamente en **Solo Lima**.<br>- `'P'`: Fijar automáticamente en **Solo Provincia**.<br>- `'A'`: Habilitar Radio/Select para elegir Lima o Provincia. |
| `requiere_origen_destino` | `boolean` | Si es `true`, mostrar como obligatorios los desplegables de **Institución Origen** y **Destino** (`RC_Entidades`). |
| `requiere_comprobante` | `boolean` | Si es `true`, mostrar y exigir los inputs de **N° RUC** y **N° Factura/Boleta**. |
| `requiere_adjunto` | `boolean` | Si es `true` (default), exigir la subida de foto/comprobante (`adj_cajachica`). |
| `requiere_detalle` | `boolean` | Si es `true`, exigir el campo de texto libre `detalle`. |
| `mensaje_detalle` | `string \| null` | Texto dinámico que debe colocarse como placeholder o ayuda del campo `detalle` (Ej: *"Indicar nombre de paciente o placa"*). |

---

## 📋 4. Catálogo de Endpoints REST

### A. Requerimientos de Caja Chica (`/Requerimiento_CajaChica/`)

| Operación | Método | URL | Body / Query |
| :--- | :--- | :--- | :--- |
| **Listar** | `GET` | `/Requerimiento_CajaChica/` | `?page=1&top=50&search=movilidad` |
| **Obtener** | `GET` | `/Requerimiento_CajaChica/<ID>/` | — |
| **Crear** | `POST` | `/Requerimiento_CajaChica/` | `{"monto_solicitado": 250.00, "obs": "...", "area_id": 3, "usuario_id": 15}` |
| **Liquidar** | `POST` | `/Requerimiento_CajaChica/<ID>/liquidar/` | `{"obs": "Rendición finalizada"}` |

### B. Detalles / Comprobantes de Gasto (`/RC_Detalle/`)

| Operación | Método | URL | Content-Type & Payload |
| :--- | :--- | :--- | :--- |
| **Listar** | `GET` | `/RC_Detalle/?requerimiento_id=<ID>` | `application/json` |
| **Crear Gasto** | `POST` | `/RC_Detalle/` | `multipart/form-data` (`requerimiento_id`, `subgasto_id`, `costo`, `lima_provincia`, `adj_cajachica`, `origen`, `destino`, `nro_factura`, `nro_ruc`, `detalle`) |
| **Eliminar Gasto** | `DELETE` | `/RC_Detalle/<ID>/` | — |

### C. Catálogos Maestros

| Endpoint | Método | Propósito | Parámetros Útiles |
| :--- | :--- | :--- | :--- |
| `/RC_SubGasto/` | `GET` | Catálogo de subgastos y reglas del formulario | Retorna banderas reactivas |
| `/RC_Entidades/` | `GET` | Sedes/Hospitales (Origen y Destino) | `?search=REBAGLIATI` |
| `/RC_TipoGasto/` | `GET` | Grupos generales de gasto | `?is_aux=true` |
| `/RC_Provincia/` | `GET` | Catálogo de provincias | `?top=100` |

---

## ⚛️ 5. Implementación en React + TypeScript

### A. Modelos / Interfaces (`types/cajaChica.ts`)

```typescript
export type EstadoRequerimientoTipo = 'PD' | 'LQ' | 'CD' | 'RC';

export interface EstadoObjeto {
  [codigo: string]: string;
}

export interface SubGastoItem {
  id: number;
  nombre: string;
  tipogasto_id?: { id: number; nombre: string; is_aux: boolean };
  localidad_permitida: 'L' | 'P' | 'A';
  requiere_origen_destino: boolean;
  requiere_comprobante: boolean;
  requiere_adjunto: boolean;
  requiere_detalle: boolean;
  mensaje_detalle?: string;
}

export interface EntidadSedeItem {
  id: number;
  codigo_sede: string;
  sede: string;
  razon_social: string;
  ruc: string;
  tipo_sede: EstadoObjeto;
}

export interface RCDetalleItem {
  id?: number;
  requerimiento_id: number | string;
  subgasto_id: number | SubGastoItem;
  lima_provincia: 'L' | 'P';
  costo: number | string;
  nro_factura?: string;
  nro_ruc?: string;
  origen?: number | string;
  destino?: number | string;
  detalle?: string;
  fecha_gasto?: string;
  adj_cajachica?: string | File;
}

export interface RequerimientoCajaChicaItem {
  id?: number;
  usuario_id: number | string;
  area_id?: number | string;
  monto_solicitado: number | string;
  total_gastado: number | string;
  estado_requerimiento: EstadoObjeto;
  obs?: string;
  fecha_solicitud?: string;
  fecha_liquidacion?: string;
}
```

---

### B. Cliente API Axios (`services/api.ts`)

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://appsurgicorperu.com',
});

// Interceptor para inyectar Token JWT automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

---

### C. Servicios de Caja Chica (`services/cajaChicaService.ts`)

```typescript
import api from './api';
import {
  RequerimientoCajaChicaItem,
  RCDetalleItem,
  SubGastoItem,
  EntidadSedeItem
} from '../types/cajaChica';

export const cajaChicaService = {
  // Requerimientos
  getRequerimientos: async (page = 1, top = 50, search = '') => {
    const response = await api.get('/Requerimiento_CajaChica/', {
      params: { page, top, search: search || undefined },
    });
    return response.data;
  },

  crearRequerimiento: async (data: Partial<RequerimientoCajaChicaItem>) => {
    const response = await api.post('/Requerimiento_CajaChica/', data);
    return response.data;
  },

  liquidarRequerimiento: async (id: number, obs?: string) => {
    const response = await api.post(`/Requerimiento_CajaChica/${id}/liquidar/`, { obs });
    return response.data;
  },

  // Detalles de Gasto
  getDetalles: async (requerimientoId: number) => {
    const response = await api.get('/RC_Detalle/', {
      params: { requerimiento_id: requerimientoId },
    });
    return response.data.results || response.data;
  },

  registrarGastoConAdjunto: async (detalle: RCDetalleItem, archivo?: File) => {
    const formData = new FormData();
    formData.append('requerimiento_id', String(detalle.requerimiento_id));
    formData.append('subgasto_id', String(detalle.subgasto_id));
    formData.append('costo', String(detalle.costo));
    formData.append('lima_provincia', detalle.lima_provincia);

    if (detalle.nro_factura) formData.append('nro_factura', detalle.nro_factura);
    if (detalle.nro_ruc) formData.append('nro_ruc', detalle.nro_ruc);
    if (detalle.origen) formData.append('origen', String(detalle.origen));
    if (detalle.destino) formData.append('destino', String(detalle.destino));
    if (detalle.detalle) formData.append('detalle', detalle.detalle);
    if (archivo) formData.append('adj_cajachica', archivo, archivo.name);

    const response = await api.post('/RC_Detalle/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  eliminarGasto: async (detalleId: number) => {
    await api.delete(`/RC_Detalle/${detalleId}/`);
  },

  // Catálogos
  getSubGastos: async (): Promise<SubGastoItem[]> => {
    const response = await api.get('/RC_SubGasto/');
    return response.data.results || response.data;
  },

  getEntidades: async (search = '', top = 50): Promise<EntidadSedeItem[]> => {
    const response = await api.get('/RC_Entidades/', { params: { search, top } });
    return response.data.results || response.data;
  },
};
```

---

### D. Custom Hook para el Formulario Reactivo (`hooks/useFormularioGasto.ts`)

```typescript
import { useState, useMemo } from 'react';
import { SubGastoItem, RCDetalleItem } from '../types/cajaChica';

export const useFormularioGasto = (subgastos: SubGastoItem[]) => {
  const [formData, setFormData] = useState<Partial<RCDetalleItem>>({
    lima_provincia: 'L',
    costo: '',
    detalle: '',
    nro_factura: '',
    nro_ruc: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // SubGasto activo seleccionado
  const activeSubGasto = useMemo(() => {
    return subgastos.find((s) => s.id === Number(formData.subgasto_id));
  }, [formData.subgasto_id, subgastos]);

  // Manejar cambio de SubGasto y ajustar localidad automáticamente
  const handleSubGastoChange = (subGastoId: number) => {
    const sub = subgastos.find((s) => s.id === subGastoId);
    let nuevaLocalidad: 'L' | 'P' = 'L';

    if (sub?.localidad_permitida === 'P') {
      nuevaLocalidad = 'P';
    } else if (sub?.localidad_permitida === 'L') {
      nuevaLocalidad = 'L';
    }

    setFormData((prev) => ({
      ...prev,
      subgasto_id: subGastoId,
      lima_provincia: nuevaLocalidad,
    }));
  };

  return {
    formData,
    setFormData,
    selectedFile,
    setSelectedFile,
    activeSubGasto,
    handleSubGastoChange,
  };
};
```

---

### E. Componente React: Modal para Registrar Comprobante de Gasto

```tsx
import React from 'react';
import { SubGastoItem, EntidadSedeItem } from '../types/cajaChica';
import { useFormularioGasto } from '../hooks/useFormularioGasto';

interface Props {
  requerimientoId: number;
  subgastos: SubGastoItem[];
  entidades: EntidadSedeItem[];
  onSubmit: (detalle: any, file?: File) => Promise<void>;
  onClose: () => void;
}

export const ModalRegistrarGasto: React.FC<Props> = ({
  requerimientoId,
  subgastos,
  entidades,
  onSubmit,
  onClose,
}) => {
  const {
    formData,
    setFormData,
    selectedFile,
    setSelectedFile,
    activeSubGasto,
    handleSubGastoChange,
  } = useFormularioGasto(subgastos);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ ...formData, requerimiento_id: requerimientoId }, selectedFile || undefined);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Registrar Comprobante de Gasto</h3>

        <form onSubmit={handleSubmit}>
          {/* Selector de SubGasto */}
          <div className="form-group">
            <label>Tipo de Gasto / Concepto *</label>
            <select
              value={formData.subgasto_id || ''}
              onChange={(e) => handleSubGastoChange(Number(e.target.value))}
              required
            >
              <option value="">Seleccione un concepto...</option>
              {subgastos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Localidad (Solo si es 'A' se permite elegir) */}
          <div className="form-group">
            <label>Localidad</label>
            <select
              value={formData.lima_provincia}
              disabled={activeSubGasto?.localidad_permitida !== 'A'}
              onChange={(e) =>
                setFormData({ ...formData, lima_provincia: e.target.value as 'L' | 'P' })
              }
            >
              <option value="L">Lima</option>
              <option value="P">Provincia</option>
            </select>
          </div>

          {/* Costo */}
          <div className="form-group">
            <label>Monto Gastado (S/.) *</label>
            <input
              type="number"
              step="0.01"
              value={formData.costo}
              onChange={(e) => setFormData({ ...formData, costo: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          {/* Campos reactivos: Comprobante RUC / Factura */}
          {activeSubGasto?.requiere_comprobante && (
            <div className="form-row">
              <div className="form-group">
                <label>N° RUC *</label>
                <input
                  type="text"
                  value={formData.nro_ruc}
                  onChange={(e) => setFormData({ ...formData, nro_ruc: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>N° Factura / Boleta *</label>
                <input
                  type="text"
                  value={formData.nro_factura}
                  onChange={(e) => setFormData({ ...formData, nro_factura: e.target.value })}
                  required
                />
              </div>
            </div>
          )}

          {/* Campos reactivos: Origen y Destino */}
          {activeSubGasto?.requiere_origen_destino && (
            <div className="form-row">
              <div className="form-group">
                <label>Sede / Origen *</label>
                <select
                  value={formData.origen || ''}
                  onChange={(e) => setFormData({ ...formData, origen: e.target.value })}
                  required
                >
                  <option value="">Seleccione origen...</option>
                  {entidades.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.codigo_sede} - {ent.sede}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Sede / Destino *</label>
                <select
                  value={formData.destino || ''}
                  onChange={(e) => setFormData({ ...formData, destino: e.target.value })}
                  required
                >
                  <option value="">Seleccione destino...</option>
                  {entidades.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.codigo_sede} - {ent.sede}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Detalle Explicativo */}
          <div className="form-group">
            <label>
              Detalle / Observación {activeSubGasto?.requiere_detalle && '*'}
            </label>
            <textarea
              value={formData.detalle}
              placeholder={activeSubGasto?.mensaje_detalle || 'Detalle del gasto...'}
              onChange={(e) => setFormData({ ...formData, detalle: e.target.value })}
              required={activeSubGasto?.requiere_detalle}
            />
          </div>

          {/* Subida de Foto / Ticket */}
          <div className="form-group">
            <label>
              Adjuntar Foto / Comprobante {activeSubGasto?.requiere_adjunto && '*'}
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              required={activeSubGasto?.requiere_adjunto}
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar Gasto</button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

---

## 🎯 6. Recomendaciones de UI/UX para React

1. **Barra de Presupuesto en Vivo (Componente KPI)**:
   * Renderizar una barra con el porcentaje gastado:
     ```tsx
     const porcentaje = (Number(total_gastado) / Number(monto_solicitado)) * 100;
     const saldo = Number(monto_solicitado) - Number(total_gastado);
     ```
   * Mostrar en verde si `saldo >= 0`, o alertar en rojo si hay excedente (`saldo < 0`).

2. **Compresión de Imágenes en Cliente**:
   * Utilizar librerías como `browser-image-compression` para comprimir fotos de 5 MB a ~300 KB antes de pasarlas a `FormData`.

3. **Bloqueo de Edición por Estado**:
   * Si el estado es `'LQ'` (Liquidado) o `'CD'` (Cerrado), deshabilitar el botón de *"Agregar Gasto"* o *"Eliminar Gasto"* para evitar errores `400 Bad Request`.
