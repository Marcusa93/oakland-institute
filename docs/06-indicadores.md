# 06 · Indicadores del tablero de dirección

El tablero es un **informe de gestión interno, no un balance contable**. Todos los valores los calcula la base (`privado.tablero_direccion`); ni la interfaz ni el asistente hacen cuentas propias.

Se muestran tres miradas que no deben mezclarse:

- **Caja**: dinero que efectivamente entró y salió en el período.
- **Devengado**: lo que correspondía cobrar en el período, se haya cobrado o no.
- **Saldos a hoy**: lo que se debe en este momento, sin importar el período elegido.

## Implementados

| Indicador | Fórmula | Período | Fuente | Descuentos | Devoluciones y reversos | Sin datos |
|---|---|---|---|---|---|---|
| Cobros | Σ `pagos.importe` con estado `confirmado` | `fecha_pago` entre desde y hasta | `pagos` | No aplica (el pago es lo recibido) | Los pagos reversados no cuentan. Las devoluciones se muestran aparte | 0 |
| Devoluciones | Σ `ajustes.importe` de tipo `devolucion` | `fecha` del ajuste | `ajustes` | — | — | 0 |
| Gastos | Σ `gastos.importe` no anulados | `fecha` del gasto | `gastos` | — | Los anulados no cuentan | 0 |
| Pagos a docentes | Σ `pagos_docentes.importe` no anulados | `fecha_pago` | `pagos_docentes` | — | — | 0 |
| **Flujo neto de caja** | Cobros − Devoluciones − Gastos − Pagos a docentes | Ídem | Los cuatro anteriores | — | Ya descontados | 0 |
| Devengado del período | Σ `obligaciones.importe` no anuladas | `vencimiento` entre desde y hasta | `obligaciones` | **Neto**: `importe = original − descuento` | Las anuladas no cuentan | 0 |
| Pendiente a hoy | Σ saldo de obligaciones `pendiente` o `parcial` | A la fecha de consulta | vista `obligaciones_saldo` | Neto | Un pago reversado devuelve el saldo | 0 |
| Vencido a hoy | Ídem, con `vencimiento` anterior a hoy (Tucumán) | A la fecha de consulta | vista `obligaciones_saldo` | Neto | Ídem | 0 |
| Ocupación | Matrículas activas ÷ cupo, por comisión abierta o en curso | Instantáneo | `matriculas`, `comisiones` | — | Las reservas no cuentan como inscriptos (se ven en gestión) | Sin comisiones: lista vacía |
| Conversión de consultas | Consultas `ganada` ÷ consultas creadas | Fecha de creación (Tucumán) entre desde y hasta | `consultas` | — | — | **Sin consultas: "sin datos suficientes"** (no 0 %) |

Notas de lectura:

- La conversión por fecha de creación subestima los períodos recientes: una consulta de la última semana todavía puede convertirse.
- Los saldos a favor (pagos confirmados sin imputar) son dinero en caja que no redujo deuda. Se ven en Cobros.
- Cobros y devengado no son comparables mes a mes en forma directa: un pago puede cubrir obligaciones de otros períodos.

## Previstos (backlog)

| Indicador | Fórmula propuesta | Requisito de datos |
|---|---|---|
| Reinscripción | Estudiantes con matrícula en el ciclo N que tienen una matrícula en el ciclo N+1 ÷ estudiantes con matrícula `activa` o `finalizada` en N | Al menos dos ciclos cargados; si no, "sin datos suficientes" |
| Morosidad | Vencido a hoy ÷ devengado de los últimos 3 meses | Tres meses de obligaciones |
| Margen estimado por curso | Devengado de sus comisiones − gastos atribuidos − pagos a docentes atribuidos | Solo si los gastos y pagos docentes del período tienen atribución; mostrar el porcentaje de egresos sin atribuir junto al resultado y rotularlo como **estimación** |
| Flujo de caja proyectado | Saldo de obligaciones por vencer + gastos recurrentes estimados | Rotulado como **proyección**, con sus supuestos visibles |

## Escenarios y recomendaciones (etapa 3)

Toda simulación (cambios de arancel, matrícula, ocupación o costos) debe mostrar los datos de partida, los supuestos y distinguir hechos de proyecciones. Ningún escenario ni recomendación de IA modifica precios, otorga beneficios ni ejecuta movimientos: eso requiere una decisión de dirección registrada en el sistema.
