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

## 📊 2. Estados del Requerimiento (`estado_requerimiento`), Transiciones y Permisos

Los requerimientos manejan un ciclo de vida de 4 estados (`models.TextChoices`). En las respuestas del backend se entrega el objeto estructurado `{ CLAVE: "Texto" }`:

| Código (`clave`) | Etiqueta (`display`) | Permisos y Reglas de Transición | Color UI Sugerido |
| :--- | :--- | :--- | :--- |
| **`PD`** | **Pendiente (Borrador)** | **Estado inicial.** Permite crear, modificar y guardar gastos con datos parciales. **El usuario solicitante puede cambiar de `PD` a `LQ`**. | 🟠 Ámbar / Warning (`#d97706`) |
| **`LQ`** | **Liquidado (Enviado)** | El usuario envía su rendición final. **No se puede revertir a `PD`**. Bloquea la edición de detalles. Exige comprobantes y validaciones completas. | 🔵 Azul / Info (`#2563eb`) |
| **`CD`** | **Cerrado** | **Solo Gerente de Operaciones** (puesto *Gerente* y área *Operaciones*) puede pasar de `LQ` a `CD`. Estado final inmutable. | 🟢 Verde / Success (`#16a34a`) |
| **`RC`** | **Rechazado** | **Solo Gerente de Operaciones** (puesto *Gerente* y área *Operaciones*) puede pasar de `LQ` a `RC`. Estado final inmutable. | 🔴 Rojo / Danger (`#dc2626`) |

> [!CAUTION]
> **Matriz de Seguridad de Estados:**
> 1. **`PD` ➔ `LQ`**: Permitido para el usuario solicitante/creador.
> 2. **`LQ` ➔ `CD` / `RC`**: Exclusivo para usuarios con **Puesto: Gerente** y **Área: Operaciones** (o Superuser).
> 3. **`LQ` / `CD` / `RC` ➔ `PD`**: **Estrictamente Prohibido.** No se puede revertir una solicitud a borrador.
> 4. **Edición de Detalles**: Solo permitida mientras el requerimiento esté en estado **`PD`**.

> [!TIP]
> **Paso Previo al Cierre — Revisión por Gerencia en Aprobaciones (`revisado` / `revision`):**
> En la pestaña **Aprobaciones** (`/aprobaciones`), el **Gerente de Operaciones** audita y da visto bueno previo a los requerimientos liquidados (`LQ`):
> - **Campo Booleano:** `revisado: boolean` (se expone también como `revision` para compatibilidad directa con el Frontend).
> - **Vista en Lista en PC (Desktop):** En computadoras/PC, los requerimientos se visualizan como una lista corrida horizontal (similar a Cierre de Caja) con selector de revisión integrado, en lugar de tarjetas.
> - **Panel KPI Gerencial:** Título y banner similar a Cierre de Caja donde se resume:
>   1. **Total por Aprobar:** Conteo de requerimientos y monto total general (`S/`).
>   2. **Revisados por Gerente:** Cuántos registros ya fueron revisados y cuánto suman (`S/`).
>   3. **Falta Revisar:** Cuántos registros quedan pendientes y monto pendiente (`S/`).
> - **Exclusividad:** Este panel KPI de revisión y los conmutadores de `revisado` solo son visibles para el **Gerente de Operaciones** (y superusuario). Los demás aprobadores (coordinadores, jefaturas) ven la bandeja estándar sin estos contadores gerenciales.
> - **Acciones Rápidas:** Conmutación individual vía `POST /Requerimiento_CajaChica/<ID>/revisar/` o revisión masiva vía `POST /Requerimiento_CajaChica/revisar-masivo/`.

---

## ⚙️ 3. Reglas de Negocio Reactivas en Formulario (`RC_SubGasto`)

El modelo `RC_SubGasto` contiene banderas booleanas que le indican al Frontend **qué campos renderizar, exigir y validar dinámicamente** cuando el usuario selecciona un subgasto:

> [!IMPORTANT]
> - **Guardado Borrador (`PD`):** Mientras la solicitud esté en estado `PD`, el usuario puede guardar avances con datos parciales.
> - **Envío / Liquidación (`LQ`):** Al enviar la rendición o pasar a `LQ`, el backend exige obligatoriamente que cada gasto tenga su comprobante (`adj_cajachica`) y cumpla con todas las reglas dinámicas del subgasto (RUC, factura, placa, origen/destino, provincia, detalle).
> - **Visibilidad Completa para Jefaturas y Gestión:** Para roles de supervisión (*Jefe, Gerente, Coordinador y Planner*), **todas las opciones del catálogo son siempre visibles**. La bandera `visible_para_operativo` únicamente restringe opciones para personal operativo (*Choferes, Auxiliares, Motorizados*).

| Campo en `RC_SubGasto` | Tipo | Comportamiento en la UI (React / Angular) |
| :--- | :--- | :--- |
| `localidad_permitida` | `'L' \| 'P' \| 'A'` | - `'L'`: Fijar automáticamente en **Solo Lima**.<br>- `'P'`: Fijar automáticamente en **Solo Provincia**.<br>- `'A'`: Habilitar Selector para elegir Lima o Provincia. |
| `requiere_origen_destino` | `boolean` | Si es `true`, exigir la dupla de desplegables **Origen** (`origen`) y **Destino** (`destino`) desde `RC_Entidades` (usado típicamente para *Taxis*). |
| `requiere_entidad` | `boolean` | Si es `true`, exigir seleccionar una **Entidad/Sede única** (`RC_Entidades`) y **enviarla en el campo `origen`** del payload (ej: *Estacionamiento*, *Impresiones*). |
| `requiere_placa` | `boolean` | Si es `true`, mostrar y exigir el input de texto de la **Placa** del vehículo (`placa`) (ej: *Combustible, Peajes, Mantenimiento*). |
| `requiere_provincia` | `boolean` | Si es `true` (o cuando la localidad seleccionada sea `'P'`), exigir el selector de **Provincia** (`provincia_id`). |
| `visible_para_operativo` | `boolean` | Indica si el subgasto está autorizado para personal operativo (*Choferes, Auxiliares, Motorizados*). Si el usuario no es operativo (es Jefatura, Gerente, Coordinador o Planner), tiene acceso a **todas** las opciones. |
| `requiere_comprobante` | `boolean` | Si es `true`, exigir los inputs de **N° RUC** (`nro_ruc`) y **N° Factura/Boleta** (`nro_factura`). |
| `requiere_detalle` | `boolean` | Si es `true`, exigir el campo de texto libre `detalle`. |
| `mensaje_detalle` | `string \| null` | Texto dinámico que debe colocarse como placeholder o ayuda del campo `detalle` (Ej: *"TE SOLICITE INDICAR EL NOMBRE DE ACC"*). |

### 🚀 Recomendación de Rendimiento para Filtrado por Roles:
> [!TIP]
> **Estrategia Frontend Más Eficiente:** El frontend consulta el catálogo completo de `/RC_SubGasto/` una sola vez y lo guarda en caché (React Query / SWR / Pinia / Redux). Según el perfil del usuario autenticado (`esOperativo`), filtra en memoria instantáneamente sin peticiones HTTP adicionales:
> ```typescript
> const subgastosVisibles = useMemo(() => {
>   return isOperativo ? allSubgastos.filter(s => s.visible_para_operativo) : allSubgastos;
> }, [allSubgastos, isOperativo]);
> ```
> Opcionalmente, la API también soporta filtrado por backend mediante: `GET /RC_SubGasto/?perfil=operativo` (para operativos) o `GET /RC_SubGasto/` (catálogo completo para jefaturas).

---

## 📋 4. Catálogo de Endpoints REST

### A. Requerimientos de Caja Chica (`/Requerimiento_CajaChica/`)

| Operación | Método | URL | Body / Query |
| :--- | :--- | :--- | :--- |
| **Listar con Filtros** | `GET` | `/Requerimiento_CajaChica/` | `?usuario_id=15&estado_requerimiento=LQ,PD&revisado=false&page=1` |
| **Obtener** | `GET` | `/Requerimiento_CajaChica/<ID>/` | — |
| **Crear** | `POST` | `/Requerimiento_CajaChica/` | `{"monto_solicitado": 250.00, "obs": "...", "area_id": 3, "usuario_id": 15}` |
| **Editar / Sincronizar** | `PATCH` | `/Requerimiento_CajaChica/<ID>/` | `{"obs": "...", "detalles": [...]}` (Solo en estado `PD`) |
| **Liquidar** | `POST` | `/Requerimiento_CajaChica/<ID>/liquidar/` | `{"obs": "Rendición finalizada"}` |
| **Revisar (Gerencia)** | `POST` / `PATCH` | `/Requerimiento_CajaChica/<ID>/revisar/` | `{"revisado": true}` *(o `false` para desmarcar)* |
| **Revisión Masiva** | `POST` | `/Requerimiento_CajaChica/revisar-masivo/` | `{"ids": [4755, 4756], "revisado": true}` |

> [!TIP]
> **Filtros Disponibles en `/Requerimiento_CajaChica/`:**
> - `?revisado=true` / `?revisado=false` (alias: `?revision=true`/`false`): **Filtro booleano de revisión gerencial**. Ideal para listar en el modal de cierre únicamente los liquidados pendientes de revisión o ya revisados.
> - `?estado_requerimiento=LQ,PD`: **Filtro de tipo `IN`** (uno o varios estados separados por coma. Ej: `LQ,PD` para "Mis Solicitudes").
> - `?id=<ID>` o `?id__in=10,11,12`: Filtro exacto o lista de IDs.
> - `?usuario_id=<ID>` o `?usuario_id__in=15,16`: Filtro por ID de usuario solicitante.
> - `?usuario=<texto>`: Búsqueda por username (contiene, insensible a mayúsculas).
> - `?area_id=<ID>` o `?area_id__in=3,4`: Filtro por ID de área.
> - `?area=<texto>`: Búsqueda por nombre de área.
> - `?fecha_solicitud_desde=YYYY-MM-DD` / `?fecha_solicitud_hasta=YYYY-MM-DD`: Rango de fechas.
> - `?search=<texto>`: Búsqueda global en ID, observaciones, username, nombres de usuario y área.
> - `?ordering=-id|fecha_solicitud|monto_solicitado|revisado`: Ordenamiento (admite `revisado` y `-revisado`).

### B. Detalles / Comprobantes de Gasto (`/RC_Detalle/`)

| Operación | Método | URL | Content-Type & Payload |
| :--- | :--- | :--- | :--- |
| **Listar** | `GET` | `/RC_Detalle/?requerimiento_id=<ID>` | `application/json` |
| **Crear Gasto** | `POST` | `/RC_Detalle/` | `multipart/form-data` (`requerimiento_id`, `subgasto_id`, `costo`, `lima_provincia`, `provincia_id`, `placa`, `origen`, `destino`, `nro_factura`, `nro_ruc`, `detalle`, `adj_cajachica`) |
| **Eliminar Gasto** | `DELETE` | `/RC_Detalle/<ID>/` | — |

### C. Cierre Semanal de Caja Chica (`/RC_SaldoSemanal/`)

| Operación | Método | URL | Content-Type & Payload |
| :--- | :--- | :--- | :--- |
| **Listar Cierres (Paginado)** | `GET` | `/RC_SaldoSemanal/` | `?page=1&top=10&ordering=-fecha_fin` (Filtros: `codigo_cierre`, `fecha_inicio`, `fecha_fin`) |
| **Obtener Cierre** | `GET` | `/RC_SaldoSemanal/<ID>/` | — |
| **Cierre Atómico de Caja** | `POST` | `/RC_SaldoSemanal/` o `/RC_SaldoSemanal/cerrar-caja/` | `application/json` (Datos de saldo + campo `requerimientos`) |

> [!TIP]
> **Paginación e Infinite Scroll para Balance Semanal (`top=10`, máximo `top=1000`):**
> - **Parámetro `top`:** Define la cantidad de registros por página (permite hasta un máximo de `top=1000`).
> - **Estrategia Frontend para Balance Semanal:**
>   1. **Carga Inicial:** Solicitar únicamente los primeros 10 registros con `GET /RC_SaldoSemanal/?page=1&top=10&ordering=-fecha_fin`.
>   2. **Scroll Infinito:** Cuando el usuario scrollee hacia abajo y llegue al límite inferior de la lista/tabla, solicitar los 10 siguientes (usando la URL entregada en la propiedad `next` del JSON).
>   3. **Concatenación:** Agregar los 10 registros nuevos al estado local (`prev => [...prev, ...nuevos]`).
>   4. **Límite:** Detener las solicitudes cuando `next` sea `null`. Esto asegura tiempos de carga instantáneos y mínimo consumo de memoria en el navegador, ya que cada saldo semanal incluye sus requerimientos y comprobantes anidados.

> [!NOTE]
> **Serialización Completa de Requerimientos y Detalles:**
> Al consultar `GET /RC_SaldoSemanal/` o `GET /RC_SaldoSemanal/<ID>/`, la respuesta incluye directamente el listado de todos los **`requerimientos`** asociados y, dentro de cada uno, el array de **`detalle`** de gasto con comprobantes, subgasto, entidades y montos. La respuesta paginada tiene la estructura DRF estándar (`count`, `next`, `previous`, `results`):
> 
> ```json
> {
>   "count": 45,
>   "next": "https://appsurgicorperu.com/RC_SaldoSemanal/?page=2&top=10",
>   "previous": null,
>   "results": [
>     {
>       "id": 245,
>       "codigo_cierre": "09OCT26-245",
>       "fecha_inicio": "2026-10-02",
>       "fecha_fin": "2026-10-09",
>       "saldo_inicial": "4000.00",
>       "total_gasto": "320.00",
>       "saldo_final": "3680.00",
>       "nuevo_ingreso": "320.00",
>       "observaciones": "Cierre semanal semana 41",
>       "cerrado_por": 15,
>       "cerrado_por_nombre": "Juan Pérez",
>       "total_requerimientos": 1,
>       "requerimientos": [
>         {
>           "id": 1,
>           "usuario_id": {
>             "id": 12,
>             "username": "mgarcia",
>             "full_name": "Mario García"
>           },
>           "area_id": "Operaciones",
>           "monto_solicitado": "320.00",
>           "total_gastado": "320.00",
>           "estado_requerimiento": { "CD": "Cerrado" },
>           "saldo_semanal_id": 245,
>           "codigo_cierre": "09OCT26-245",
>           "detalle": [
>             {
>               "id": 101,
>               "subgasto_id": { "id": 5, "nombre": "Taxi Operativo" },
>               "costo": "45.00",
>               "lima_provincia": "L",
>               "origen_nombre": "Sede Central",
>               "destino_nombre": "Hosp. Rebagliati",
>               "adj_cajachica": "https://.../adj_cajachica/foto_101.jpg"
>             }
>           ]
>         }
>       ]
>     }
>   ]
> }
> ```

### D. Catálogos Maestros

| Endpoint | Método | Propósito | Parámetros Útiles |
| :--- | :--- | :--- | :--- |
| `/RC_SubGasto/` | `GET` | Catálogo de subgastos y reglas reactivas | `?perfil=operativo` (opcional para filtrar operativos) |
| `/RC_Entidades/` | `GET` | Sedes/Hospitales (Origen, Destino y Entidad única) | `?search=REBAGLIATI` |
| `/RC_TipoGasto/` | `GET` | Grupos generales de gasto | `?is_aux=true` |
| `/RC_Provincia/` | `GET` | Catálogo de provincias | `?top=100` |
| `/RC_Placas/` | `GET` | Catálogo de placas y choferes de unidades de transporte | `?search=ABC` (o `?top=100`) |

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
  requiere_entidad: boolean;
  requiere_placa: boolean;
  requiere_provincia: boolean;
  visible_para_operativo: boolean;
  requiere_comprobante: boolean;
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

export interface RCPlacaItem {
  id: number;
  placa: string;
  chofer?: string;
}

export interface RCDetalleItem {
  id?: number;
  requerimiento_id: number | string;
  subgasto_id: number | SubGastoItem;
  lima_provincia: 'L' | 'P';
  provincia_id?: number | string;
  costo: number | string;
  placa_id?: number | string | RCPlacaItem;
  placa_nombre?: string;
  nro_factura?: string;
  nro_ruc?: string;
  origen?: number | string; // Se usa para 'origen' en taxis y para 'entidad' en gastos únicos
  destino?: number | string;
  detalle?: string;
  fecha_gasto?: string;
  adj_cajachica?: string | File;
}

export interface UsuarioItem {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  email?: string;
  area?: string;
  puesto?: string;
}

export interface RequerimientoCajaChicaItem {
  id: number;
  url?: string;
  usuario_id: UsuarioItem; // Objeto de usuario completo
  area_id?: string; // Nombre del área como texto (ej: "Sistemas", "Operaciones")
  monto_solicitado: number | string;
  total_gastado: number | string;
  estado_requerimiento: EstadoObjeto;
  revisado: boolean; // Flag booleano de revisión gerencial antes del cierre
  revision?: boolean; // Alias idéntico a revisado
  saldo_semanal_id?: number | null;
  codigo_cierre?: string | null;
  obs?: string;
  fecha_solicitud?: string;
  fecha_liquidacion?: string;
  created_by?: string; // Nombre completo del usuario creador (ej: "Juan Perez")
  detalle?: RCDetalleItem[]; // Lista de detalles/comprobantes con su subgasto_id limpio
}

export interface SaldoSemanalItem {
  id: number;
  codigo_cierre: string;
  fecha_inicio: string;
  fecha_fin: string;
  saldo_inicial: number | string;
  total_gasto: number | string;
  saldo_final: number | string;
  nuevo_ingreso: number | string;
  observaciones?: string;
  cerrado_por?: number;
  cerrado_por_nombre?: string;
  total_requerimientos: number;
  requerimientos: RequerimientoCajaChicaItem[]; // Requerimientos asociados con todos sus detalles de gasto
  created_at: string;
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

  // Revisión por Gerencia (Previa al Cierre)
  revisarRequerimiento: async (id: number, revisado = true) => {
    const response = await api.post(`/Requerimiento_CajaChica/${id}/revisar/`, { revisado });
    return response.data;
  },

  revisarRequerimientosMasivo: async (ids: number[], revisado = true) => {
    const response = await api.post('/Requerimiento_CajaChica/revisar-masivo/', { ids, revisado });
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

  // Saldos Semanales (Infinite Scroll con top=10)
  getSaldosSemanales: async (page = 1, top = 10, search = '') => {
    const response = await api.get('/RC_SaldoSemanal/', {
      params: { page, top, search: search || undefined, ordering: '-fecha_fin' },
    });
    return response.data; // { count, next, previous, results: SaldoSemanalItem[] }
  },

  cerrarCajaSemanal: async (data: any) => {
    const response = await api.post('/RC_SaldoSemanal/', data);
    return response.data;
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

          {/* Subida de Foto / Ticket (Siempre obligatorio) */}
          <div className="form-group">
            <label>
              Adjuntar Foto / Comprobante *
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              required
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

4. **Scroll Infinito para Balance Semanal (`top=10`)**:
   * Para optimizar la memoria y renderizado de la vista de saldos semanales (que incluye requerimientos y comprobantes anidados), cargar inicialmente 10 registros y consultar 10 más cuando el usuario scrollea hacia abajo al final del contenedor:
     ```tsx
     import React, { useState, useEffect, useRef, useCallback } from 'react';
     import { cajaChicaService } from '../services/cajaChicaService';
     import { SaldoSemanalItem } from '../types/cajaChica';

     export const BalanceSemanalList = () => {
       const [saldos, setSaldos] = useState<SaldoSemanalItem[]>([]);
       const [page, setPage] = useState(1);
       const [hasNext, setHasNext] = useState(true);
       const [loading, setLoading] = useState(false);
       const observerTarget = useRef<HTMLDivElement>(null);

       const loadSaldos = useCallback(async (pageNum: number) => {
         if (loading) return;
         setLoading(true);
         try {
           // Solicitar exactamente 10 registros por bloque
           const data = await cajaChicaService.getSaldosSemanales(pageNum, 10);
           setSaldos(prev => (pageNum === 1 ? data.results : [...prev, ...data.results]));
           setHasNext(Boolean(data.next));
         } catch (error) {
           console.error('Error al cargar balances semanales:', error);
         } finally {
           setLoading(false);
         }
       }, [loading]);

       // Carga inicial (página 1, primeros 10 registros)
       useEffect(() => {
         loadSaldos(1);
       }, []);

       // Observer para detectar cuando el usuario scrollea al fondo
       useEffect(() => {
         const observer = new IntersectionObserver(
           entries => {
             if (entries[0].isIntersecting && hasNext && !loading) {
               setPage(prevPage => {
                 const nextPage = prevPage + 1;
                 loadSaldos(nextPage);
                 return nextPage;
               });
             }
           },
           { threshold: 1.0 }
         );

         if (observerTarget.current) {
           observer.observe(observerTarget.current);
         }
         return () => observer.disconnect();
       }, [hasNext, loading, loadSaldos]);

       return (
         <div className="balance-semanal-container">
           <h2>Historial de Balances Semanales</h2>
           {saldos.map(saldo => (
             <div key={saldo.id} className="saldo-card">
               <h3>{saldo.codigo_cierre} ({saldo.fecha_inicio} al {saldo.fecha_fin})</h3>
               <p>Saldo Inicial: S/. {saldo.saldo_inicial} | Gasto: S/. {saldo.total_gasto}</p>
               <p>Requerimientos cerrados: {saldo.total_requerimientos}</p>
               {/* Requerimientos y detalles anidados listos para desplegar */}
             </div>
           ))}
           {/* Centinela de Scroll Infinito */}
           <div ref={observerTarget} className="scroll-sentinel">
             {loading && <p>Cargando 10 registros más...</p>}
             {!hasNext && saldos.length > 0 && <p>Has llegado al final de los registros.</p>}
           </div>
         </div>
       );
     };
     ```

5. **Flujo de Revisión Gerencial en Bandeja de Aprobaciones (`/aprobaciones`)**:
   * **Propósito y Arquitectura UI:**
     - En la pestaña **Aprobaciones**, el **Gerente de Operaciones** audita los comprobantes y da el visto bueno a los requerimientos en estado Liquidado (`LQ`).
     - **Diseño Adaptativo:**
       - **En PC / Escritorio (`hidden md:flex flex-col`):** Ya **no se muestran tarjetas en cuadrícula**, sino una **vista en lista corrida horizontal** (idéntica a la presentación de *Cierre de Caja*), facilitando la revisión ágil y densa de expedientes.
       - **En Móviles (`md:hidden`):** Se conservan tarjetas verticales compactas con el selector de revisión en la cabecera.
     - **Panel de Métricas Exclusivo para Gerente de Operaciones (`esGerenteOperaciones(user)`):**
       - **Total por Aprobar:** Conteo de requerimientos y monto acumulado total (`S/ Y.YY`).
       - **Revisados por Gerente:** Cantidad revisada, porcentaje (%) y suma de lo revisado (`S/ X.XX`).
       - **Falta Revisar:** Cantidad de requerimientos pendientes de visto bueno y suma pendiente (`S/ Z.ZZ`).
       - **Progreso y Acciones Masivas:** Barra de progreso visual y botón *"Revisar Todo"* (`revisar-masivo`) para auditar en bloque.
       - **Filtros Rápidos:** Píldoras *"Todos"*, *"Falta revisar"* y *"Revisados"*.
     - **Seguridad por Rol:** Otros roles (coordinadores, jefaturas) tienen acceso a la bandeja para auditar, pero **no ven** el panel de recuento de revisión gerencial ni los conmutadores de `revisado`.

   ```tsx
   import React, { useState, useMemo } from 'react';
   import { cajaChicaService } from '../services/cajaChicaService';
   import { RequerimientoCajaChicaItem } from '../types/cajaChica';
   import { esGerenteOperaciones } from '../utils/permisos';

   interface Props {
     requerimientos: RequerimientoCajaChicaItem[];
     currentUser: any;
     onActualizarLista: () => void;
     onAbrirAuditoria: (req: RequerimientoCajaChicaItem) => void;
   }

   export const BandejaAprobacionesLista: React.FC<Props> = ({
     requerimientos,
     currentUser,
     onActualizarLista,
     onAbrirAuditoria,
   }) => {
     const esGerente = esGerenteOperaciones(currentUser);
     const [loadingId, setLoadingId] = useState<number | null>(null);
     const [procesandoMasivo, setProcesandoMasivo] = useState(false);
     const [filtroRevision, setFiltroRevision] = useState<'TODOS' | 'PENDIENTES' | 'REVISADOS'>('TODOS');

     // Cálculos del Banner de Métricas Gerencial
     const metricas = useMemo(() => {
       const totalCount = requerimientos.length;
       let totalMonto = 0;
       let revisadosCount = 0;
       let revisadosMonto = 0;

       for (const r of requerimientos) {
         const gasto = parseFloat(String(r.total_gastado || r.monto_solicitado || 0)) || 0;
         totalMonto += gasto;
         if (r.revisado || r.revision) {
           revisadosCount += 1;
           revisadosMonto += gasto;
         }
       }

       const faltantesCount = totalCount - revisadosCount;
       const faltantesMonto = Math.max(0, totalMonto - revisadosMonto);
       const porcentaje = totalCount > 0 ? Math.round((revisadosCount / totalCount) * 100) : 0;

       return { totalCount, totalMonto, revisadosCount, revisadosMonto, faltantesCount, faltantesMonto, porcentaje };
     }, [requerimientos]);

     // Conmutar revisión individual con actualización optimista
     const handleToggleRevision = async (req: RequerimientoCajaChicaItem, e: React.MouseEvent) => {
       e.stopPropagation();
       if (loadingId === req.id || procesandoMasivo) return;

       const nuevoEstado = !Boolean(req.revisado || req.revision);
       setLoadingId(req.id);
       req.revisado = nuevoEstado; // Optimismo UI
       try {
         await cajaChicaService.revisarRequerimiento(req.id, nuevoEstado);
         onActualizarLista();
       } catch (error) {
         req.revisado = !nuevoEstado; // Revertir en caso de falla
         console.error('Error al cambiar revisión:', error);
       } finally {
         setLoadingId(null);
       }
     };

     // Revisión masiva en lote
     const handleRevisarMasivo = async (marcarComo: boolean) => {
       const pendientes = requerimientos.filter(r => Boolean(r.revisado || r.revision) !== marcarComo);
       if (pendientes.length === 0 || procesandoMasivo) return;

       setProcesandoMasivo(true);
       try {
         await cajaChicaService.revisarRequerimientosMasivo(pendientes.map(p => p.id), marcarComo);
         onActualizarLista();
       } catch (error) {
         console.error('Error en revisión masiva:', error);
       } finally {
         setProcesandoMasivo(false);
       }
     };

     const listaFiltrada = useMemo(() => {
       if (!esGerente || filtroRevision === 'TODOS') return requerimientos;
       if (filtroRevision === 'PENDIENTES') return requerimientos.filter(r => !Boolean(r.revisado || r.revision));
       return requerimientos.filter(r => Boolean(r.revisado || r.revision));
     }, [requerimientos, esGerente, filtroRevision]);

     return (
       <div className="aprobaciones-container space-y-3">
         {/* Banner de Métricas Gerencial — Solo visible para Gerente de Operaciones */}
         {esGerente && (
           <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
             <div className="bg-blue-50/50 p-2.5 rounded-xl">
               <span className="text-[10px] font-bold text-gray-500 uppercase">Total por Aprobar</span>
               <div className="text-lg font-black text-blue-900">S/ {metricas.totalMonto.toFixed(2)}</div>
               <span className="text-[10px] text-blue-600">{metricas.totalCount} requerimientos</span>
             </div>

             <div className="bg-emerald-50/70 p-2.5 rounded-xl">
               <span className="text-[10px] font-bold text-emerald-700 uppercase">Revisados por Gerente</span>
               <div className="text-lg font-black text-emerald-600">S/ {metricas.revisadosMonto.toFixed(2)}</div>
               <span className="text-[10px] text-emerald-700 font-bold">{metricas.revisadosCount} ({metricas.porcentaje}%)</span>
             </div>

             <div className="bg-amber-50/70 p-2.5 rounded-xl">
               <span className="text-[10px] font-bold text-amber-800 uppercase">Falta Revisar</span>
               <div className="text-lg font-black text-amber-600">S/ {metricas.faltantesMonto.toFixed(2)}</div>
               <span className="text-[10px] text-amber-700 font-bold">{metricas.faltantesCount} requerimientos</span>
             </div>

             <div className="bg-gray-50 p-2.5 rounded-xl flex flex-col justify-between">
               <span className="text-[10px] font-bold text-gray-500 uppercase">Progreso: {metricas.revisadosCount}/{metricas.totalCount}</span>
               <button
                 type="button"
                 onClick={() => handleRevisarMasivo(true)}
                 disabled={metricas.faltantesCount === 0 || procesandoMasivo}
                 className="w-full py-1.5 px-3 bg-emerald-600 text-white rounded-lg font-black text-[10px]"
               >
                 Revisar Todo
               </button>
             </div>
           </div>
         )}

         {/* Vista Lista en PC / Desktop (similar a Cierre de Caja) */}
         <div className="hidden md:flex flex-col space-y-2">
           {listaFiltrada.map(req => {
             const estaRevisado = Boolean(req.revisado || req.revision);
             return (
               <div
                 key={req.id}
                 onClick={() => onAbrirAuditoria(req)}
                 className={`p-3 bg-white rounded-2xl border ${estaRevisado && esGerente ? 'border-emerald-200 bg-emerald-50/15' : 'border-gray-100'} hover:border-blue-200 flex items-center justify-between gap-4 cursor-pointer`}
               >
                 <div className="flex items-center gap-3">
                   {/* Switch / Botón Revisado exclusivo para Gerente de Operaciones */}
                   {esGerente && (
                     <button
                       type="button"
                       onClick={(e) => handleToggleRevision(req, e)}
                       disabled={loadingId === req.id}
                       className={`px-2.5 py-1.5 rounded-xl font-bold text-[10px] border ${estaRevisado ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                     >
                       {estaRevisado ? '✅ Revisado' : '⏳ Por revisar'}
                     </button>
                   )}
                   <span className="font-black text-xs">#{req.id}</span>
                   <div>
                     <h4 className="text-xs font-black">{req.usuario_id?.full_name || req.usuario_id?.username}</h4>
                     <span className="text-[10px] text-gray-400">{req.area_id} • {req.fecha_solicitud?.slice(0, 10)}</span>
                   </div>
                 </div>

                 <div className="flex items-center gap-3">
                   <div className="text-right">
                     <span className="text-[9px] text-gray-400 uppercase font-bold block">Gasto Total</span>
                     <span className="text-xs font-black">S/ {parseFloat(String(req.total_gastado || 0)).toFixed(2)}</span>
                   </div>
                   <button
                     type="button"
                     onClick={(e) => { e.stopPropagation(); onAbrirAuditoria(req); }}
                     className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold"
                   >
                     Auditar
                   </button>
                 </div>
               </div>
             );
           })}
         </div>

         {/* Vista Tarjetas en Móviles */}
         <div className="md:hidden flex flex-col space-y-2.5">
           {listaFiltrada.map(req => (
             <div key={req.id} className="p-3.5 bg-white rounded-2xl border border-gray-100">
               {/* Tarjeta móvil con selector de revisión en cabecera */}
               <div className="flex items-center justify-between">
                 <span className="font-bold text-xs">#{req.id}</span>
                 {esGerente && (
                   <button
                     type="button"
                     onClick={(e) => handleToggleRevision(req, e)}
                     className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${req.revisado ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}`}
                   >
                     {req.revisado ? 'Revisado' : 'Por revisar'}
                   </button>
                 )}
               </div>
             </div>
           ))}
         </div>
       </div>
     );
   };
   ```
