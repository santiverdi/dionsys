// Qué conceptos del libro de Charo son de verdad una SALIDA de plata.
//
// El libro mezcla tres cosas y solo una es gasto del hotel:
//   - plata que ENTRA (el efectivo y las tarjetas que vienen de la caja del
//     conserje, las señas de los grupos)
//   - plata que se MUEVE de un lado a otro (cambio, dinero en guarda, retiros):
//     sigue siendo del hotel, no es un gasto
//   - lo que se PAGA de verdad (proveedores, publicidad, honorarios…)
//
// Esta lista saca la del medio. Es fija y no se toca a mano: son los códigos de
// la propia planilla, que no cambian de un mes a otro. Lo otro que había que
// resolver — que una parte de lo que se paga YA está cargado en otra pantalla —
// no se decide acá: se resuelve solo apareando pago contra pago (libroCajaCruce).

/** Conceptos que NO son una salida de plata, con el motivo para mostrarlo. */
const NO_ES_SALIDA: Record<string, string> = {
  '001': 'es el efectivo que entra de la caja del conserje',
  '002': 'son las tarjetas que entran de la caja del conserje',
  '003': 'es un movimiento entre cuentas del hotel',
  '014': 'es un cobro (seña), no un gasto',
  '024': 'es un ajuste de caja, no un gasto',
  '028': 'es plata guardada, sigue siendo del hotel',
  '029': 'es cambio, no sale plata',
  '032': 'es un retiro, la plata sigue siendo del hotel',
}

/** ¿Este concepto es plata que sale del hotel? */
export function esSalidaDePlata(conceptoCod: string): boolean {
  return !(conceptoCod in NO_ES_SALIDA)
}

/** Por qué no cuenta como salida (vacío = sí cuenta). */
export function motivoNoContar(conceptoCod: string): string {
  return NO_ES_SALIDA[conceptoCod] ?? ''
}
