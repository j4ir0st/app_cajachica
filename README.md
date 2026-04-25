# Control de Caja Chica

## 1. Resumen del proyecto

**Control de Caja Chica** es una web app responsive para PC y móvil que replica y mejora la funcionalidad actual de PowerApps para solicitudes, liquidaciones y cierres de caja chica. La solución debe conservar intactas las reglas de negocio existentes, pero mejorar la experiencia de usuario, el rendimiento, la estructura de base de datos y la mantenibilidad del sistema.

La aplicación será una sola interfaz web adaptativa para escritorio y celular. No existirán dos apps distintas; la UI se reacomodará según el tamaño de pantalla, manteniendo la misma lógica, los mismos permisos y el mismo flujo funcional.

## 2. Objetivo

Permitir que cualquier trabajador autorizado pueda:

- Crear una solicitud de caja chica.
- Agregar uno o más gastos detalle dentro de la misma solicitud.
- Guardar adjuntos por gasto.
- Revisar sus propias solicitudes o las de su área, según permisos.
- Permitir que un gerente cierre registros por semana.
- Consultar balances semanales y descargar reportes por semana o mes en Excel y PDF.

## 3. Flujo funcional general

La app seguirá un flujo de dos pasos dentro de **Nueva Solicitud**:

### Paso 1: Cabecera de solicitud
El usuario crea la solicitud con estado **Pendiente**. En este paso puede guardar y salir, o continuar inmediatamente con la liquidación.

### Paso 2: Liquidación / gastos detalle
El usuario agrega uno o varios gastos detalle. Al agregar el primer detalle, la solicitud cambia a estado **Liquidado**. El usuario puede seguir agregando más gastos en la misma solicitud hasta completar su liquidación.

### Revisión gerencial
El gerente revisa la solicitud liquidada. Si no está conforme, la cambia a **Rechazado**. Si acepta la solicitud para su cierre, la marca como **Cerrado**.

## 4. Estados del sistema

Los estados oficiales de la solicitud serán:

- **Pendiente**: color naranja.
- **Liquidado**: color azul.
- **Cerrado**: color verde.
- **Rechazado**: color rojo.

Reglas de edición:

- Se puede editar una solicitud en estado **Pendiente** o **Liquidado**.
- No se puede editar una solicitud en estado **Cerrado** o **Rechazado**.
- Si una solicitud es **Rechazada**, debe crearse un nuevo registro corregido.
- El gerente no edita la solicitud: si no le gusta, la rechaza.

## 5. Permisos y visibilidad

Los permisos se basan en la tabla de usuarios, puestos y áreas.

### Puede rechazar solicitudes
- `puesto_id.nombre = gerente`
- `puesto_id.nombre = jefe`
- `puesto_id.nombre = coordinador`

### Puede ver Cierre de Caja y Balance Semanal
- Solo `puesto_id.nombre = gerente` por ahora.

### Visibilidad de Mis Solicitudes
- El usuario normal ve solo sus solicitudes.
- Coordinador, jefe o gerente pueden ver las solicitudes de su área.
- Usuarios especiales como `klewis` y el puesto `operaciones` pueden ver las áreas asignadas especiales.

### Edición del combobox de usuario
Solo pueden cambiar el usuario solicitante quienes tengan rol de jefe, gerente o coordinador, y únicamente dentro de las áreas que administran.

## 6. Reglas de negocio principales

- La solicitud puede quedar en estado **Pendiente** sin liquidarse de inmediato.
- El usuario puede continuar la liquidación más adelante.
- El monto solicitado se ingresa manualmente y luego se validará en frontend y backend para que no sea menor que la suma de los gastos detalle.
- Si el gasto supera el monto solicitado, debe corregirse mediante nuevo registro o por rechazo y recreación de la solicitud.
- No se manejará historial visible de cambios de estado en la vista detalle; solo se mostrará el estado actual.

## 7. Campos funcionales por cabecera

La cabecera de solicitud tendrá, como mínimo:

- Usuario solicitante.
- Monto solicitado.
- Estado.
- Fecha de solicitud.
- Observación del gerente, obligatoria solo si el estado final es rechazado.
- Total gastado calculado.
- Fecha de liquidación.
- Fecha de cierre, cuando aplique.

## 8. Campos funcionales por detalle de gasto

Cada gasto detalle incluirá:

- Tipo de gasto.
- Subgasto.
- Lima / Provincia, con edición opcional si la regla automática no aplica.
- Provincia, opcional y desplegable.
- Nro. de factura, opcional.
- Nro. de RUC, opcional.
- Origen.
- Destino.
- Costo.
- Observación / detalle del gasto.
- Fecha y hora del gasto.
- Adjunto único por registro.

## 9. Reglas de tipo de gasto y subgasto

`tipo_gasto` y `subgasto` serán tablas propias.

La lógica actual de PowerApps debe conservarse en funcionalidad, pero la base de datos se modelará mejor, sin depender de rangos de IDs manuales en frontend. Se recomienda que la relación entre tipo de gasto y subgasto quede explícita en base de datos para que el backend valide reglas, visibilidad y compatibilidad por rol o cargo.

## 10. Catálogos adicionales

Se crearán tablas propias para:

- `tipo_gasto`
- `subgasto`
- `provincia`
- `instituciones` o catálogo de origen/destino
- `destinos_frecuentes`

### Instituciones
La tabla `instituciones` se usará para origen y destino. Incluye opciones como:

- OFICINA
- HOGAR
- OTROS

El detalle del gasto tendrá además un campo de observación para aclaraciones del usuario.

## 11. Validaciones especiales de taxi

Cuando el tipo de gasto sea **TAXI**:

- `origen` será obligatorio.
- `destino` será obligatorio.
- Se usarán catálogos de instituciones/destinos frecuentes.
- Todos los demás tipos de gasto deben guardar origen y destino como nulos.

## 12. Adjuntos

- Cada gasto detalle tendrá un solo adjunto.
- Solo se admiten **imagen o PDF**.
- No se admitirán Word ni Excel.
- El adjunto quedará guardado directamente en el detalle de gasto, sin tabla adicional separada para este fin.

## 13. Estructura de datos sugerida

### 13.1 Tabla `caja_solicitud`
Tabla principal de cabecera.

Campos sugeridos:

- id
- usuario_id
- area_id
- monto_solicitado
- total_gastado
- estado_requerimiento
- obs
- fecha_solicitud
- fecha_liquidacion

### 13.2 Tabla `caja_gasto_detalle`
Tabla de detalle de gastos.

Campos sugeridos:

- id
- solicitud_id
- tipo_gasto_id
- subgasto_id
- institucion_origen_id nullable
- institucion_destino_id nullable
- provincia_id nullable
- nro_factura nullable
- nro_ruc nullable
- costo
- detalle
- fecha_gasto
- hora_gasto
- adjunto
- created_by
- updated_by
- timestamps

### 13.3 Tabla `caja_tipo_gasto`
Catálogo maestro de tipos de gasto.

### 13.4 Tabla `caja_subgasto`
Catálogo maestro de subgastos.

Relación recomendada:

- `subgasto.tipo_gasto_id` como FK.
- Flags adicionales como `requiere_provincia`, `requiere_taxi`, `activo`.

### 13.5 Tabla `caja_institucion`
Catálogo para origen y destino.

Campos sugeridos:

- id
- nombre
- tipo
- observacion
- activo

### 13.6 Tabla `caja_provincia`
Catálogo de provincias.

### 13.7 Tabla `caja_cierre_semanal`
Tabla para cierre semanal.

Campos sugeridos:

- id
- codigo_visible
- fecha_inicio
- fecha_final
- saldo_inicial
- nuevo_ingreso
- total_gastado
- saldo_final
- cerrado_por
- fecha_cierre
- observacion opcional

## 14. Recomendación sobre cierre semanal

Se recomienda mejorar el modelo actual de `saldos_semanales` evitando que el `_id` concatenado sea la clave lógica principal.

La mejor práctica es:

- usar un `id` técnico autonumérico como PK,
- generar un `codigo_visible` con el formato actual para el usuario,
- y relacionar las solicitudes cerradas mediante `cierre_semanal_id`.

Esto mantiene compatibilidad visual y mejora integridad, auditoría y mantenimiento.

## 15. Vista Nueva Solicitud

La vista debe funcionar como wizard o formulario por pasos:

### Bloque 1: Cabecera
- Usuario
- Monto solicitado
- Fechas
- Observación si aplica

### Bloque 2: Gastos detalle
- Tipo de gasto
- Subgasto
- Origen / destino cuando aplique
- Provincia
- Nro. factura
- Nro. RUC
- Costo
- Observación del detalle
- Fecha y hora
- Adjunto

La vista debe permitir agregar varios detalles de gasto de forma iterativa.

## 16. Vista Mis Solicitudes

Esta vista mostrará solo los registros autorizados según el rol del usuario.

### Comportamiento
- Usuario común: solo sus registros.
- Jefe / coordinador / gerente: registros de su área.
- Casos especiales: áreas asignadas especiales para usuarios como `klewis` u operaciones.

### Lista de resumen
Cada fila mostrará:
- ID
- Usuario
- Fecha solicitud
- Monto solicitado
- Monto gastado
- Estado

### Vista detalle
Al hacer click en un registro, se mostrará:
- Cabecera de la solicitud
- Lista de gastos detalle
- Adjuntos
- Estado actual

No se mostrará historial de cambios de estado.

## 17. Vista Cierre de Caja

Disponible solo para gerente.

### Función
Permite seleccionar una o varias solicitudes en estado **Liquidado** para cerrarlas.

### Comportamiento
- Checkbox individual por registro.
- Checkbox general para seleccionar o deseleccionar todos.
- Cierre masivo por grupo si es necesario.
- Generación de registro en `caja_cierre_semanal`.
- Asociación de las solicitudes cerradas con ese cierre.

## 18. Vista Balance Semanal

Disponible solo para gerente.

### Función
Muestra la lista de cierres semanales o cierres del mes.

### Comportamiento
- Lista de `caja_cierre_semanal`.
- Al entrar a un cierre, muestra las solicitudes cerradas asociadas.
- Desde aquí se podrán descargar reportes por semana o mes.

## 19. Reportes

Se requiere descarga de reportes en:

- Excel
- PDF

### Alcance inicial
Por ahora solo queda definido que los reportes podrán generarse:

- por semana
- por mes

El formato exacto del reporte se definirá al final del proyecto.

## 20. UX / UI esperada

La experiencia debe ser la misma tanto en PC como en celular, pero la disposición de los componentes debe reorganizarse para adaptarse al tamaño de pantalla.

### Reglas UX
- Una sola web app para ambos formatos.
- Diseño responsive real.
- Flujo por pasos para la nueva solicitud.
- Vista detalle por bloques.
- Estados visibles por color.
- Prioridad a formularios claros y uso rápido en móvil.

## 21. Reglas técnicas recomendadas

### Frontend
Se sugiere React con un framework moderno encima, siempre manteniendo:

- layout responsive,
- wizard por pasos,
- validaciones de monto,
- validaciones de adjuntos,
- consumo de API centralizada.

### Backend
Se implementará en DRF con SQL Server.

Recomendaciones:

- serializers separados para cabecera y detalle,
- validación de monto total en backend,
- validación de estado por rol,
- validación de archivo por tipo y tamaño,
- endpoints específicos para cierre semanal y reportes,
- permisos por puesto/área.

## 22. Reglas de seguridad y permisos

- Todo acceso se debe resolver por área y puesto.
- Los registros cerrados son solo de consulta.
- Los usuarios gerenciales pueden revisar y cerrar, pero no editar directamente una solicitud para “arreglarla”.
- Si algo no está correcto, se rechaza y se crea una nueva solicitud.

## 23. Migración desde PowerApps / SharePoint

El historial actual de caja chica vive en SharePoint y debe migrarse a la nueva base de datos.

La migración debe considerar:
- solicitudes pendientes,
- solicitudes liquidadas,
- solicitudes cerradas,
- solicitudes históricas.

Los registros antiguos en estado pendiente o liquidado podrán seguir editándose o cerrándose según necesidad de migración. Los cerrados solo quedarán para consulta.

## 24. Alcance del primer entregable

Para esta primera fase, el alcance funcional será:

- Crear solicitud.
- Agregar detalles de gasto.
- Guardar adjuntos.
- Consultar mis solicitudes.
- Ver detalle por bloques.
- Cerrar solicitudes liquidada por gerente.
- Ver balance semanal.
- Exportar reportes por semana o mes.

## 25. Pendientes posteriores

Quedan para una fase posterior:

- Formato final de Excel y PDF.
- Automatización exacta del reporte.
- Ajustes finos de permisos especiales.
- Reglas específicas por tipo de gasto si aparecen nuevas excepciones.

## 26. Decisiones ya cerradas

- Una sola web app responsive para PC y móvil.
- No habrá historial de cambios de estado visible en detalle.
- Solo gerente ve cierre de caja y balance semanal.
- Rechazo permitido para gerente, jefe y coordinador.
- Adjuntos: solo imagen o PDF.
- Origen/destino para taxi son obligatorios.
- Provincia será desplegable.
- El monto solicitado se valida contra el total de gastos.
- Los registros cerrados son solo consulta.
