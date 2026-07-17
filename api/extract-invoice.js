// Vercel Serverless Function: lee una factura (PDF o imagen) con Gemini Flash
// y devuelve los datos del pago en JSON. La API key vive SOLO acá (env var),
// nunca en el navegador.
//
// Setup (una sola vez):
//   1. Crear API key gratis en https://aistudio.google.com/app/apikey
//   2. Vercel -> Project Settings -> Environment Variables: GEMINI_API_KEY=...
//      (marcar Production + Preview) y redeploy.
//
// Request  (POST application/json): { mimeType: string, data: string(base64 sin prefijo) }
// Response (200): { nombre, nroCuenta, monto, vtoActual, vtoSiguiente }

// Probamos los modelos en orden: si el 1ro está saturado (503), caemos al siguiente.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const RETRYABLE = new Set([429, 500, 503]) // saturación / sobrecarga transitoria
const MAX_TRIES_PER_MODEL = 3
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PROMPT = `Sos un asistente que extrae datos de facturas argentinas de servicios e impuestos (luz, gas, agua, ABL/municipales, expensas, etc.).
Analizá el documento adjunto y devolvé EXACTAMENTE estos campos:
- nombre: empresa o servicio que emite la factura (ej: "EDEA", "CAMUZZI", "OSSE", "MUNICIPALIDAD"). En mayúsculas, corto.
- nroCuenta: número de cuenta / cliente / suministro / partida que identifica al titular. Solo el número o código, sin etiquetas ni texto.
- monto: importe TOTAL A PAGAR del PRIMER vencimiento, como número con punto decimal, sin separador de miles ni símbolo (ej: "15234.50").
- vtoActual: fecha del 1er vencimiento en formato YYYY-MM-DD.
- vtoSiguiente: fecha del 2do vencimiento en formato YYYY-MM-DD si existe; si no, cadena vacía "".
Si un dato no aparece en el documento, devolvé cadena vacía "" en ese campo. No inventes datos.`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nombre: { type: 'STRING' },
    nroCuenta: { type: 'STRING' },
    monto: { type: 'STRING' },
    vtoActual: { type: 'STRING' },
    vtoSiguiente: { type: 'STRING' },
  },
  required: ['nombre', 'nroCuenta', 'monto', 'vtoActual', 'vtoSiguiente'],
}

// --- Modo "proveedor": facturas/remitos comerciales de distribuidoras ---
const PROMPT_PROVEEDOR = `Sos un asistente que extrae datos de facturas comerciales argentinas de proveedores/distribuidoras (alimentos, limpieza, etc.).
Analizá el documento adjunto y devolvé EXACTAMENTE estos campos:
- tipoFactura: la LETRA de la factura. En las facturas argentinas hay un recuadro grande con una letra: "A", "B", "C" o "M". Devolvé solo esa letra en mayúscula. Si no se distingue, devolvé "".
- proveedor: razón social o nombre del emisor de la factura (el que vende/cobra). Corto, sin CUIT ni domicilio.
- monto: importe TOTAL de la factura, como número con punto decimal, sin separador de miles ni símbolo (ej: "15234.50").
- fecha: fecha de emisión de la factura en formato YYYY-MM-DD.
- condicionVenta: condición de venta de la factura: "contado" o "cuenta_corriente". Mirá el campo "Condición de venta"/"Cond. Venta". Si no figura, "".
- vencimiento: fecha de VENCIMIENTO del pago en formato YYYY-MM-DD (campo "Vencimiento"/"Vto", común en cuenta corriente). Si no figura, "".
- items: lista con CADA renglón del detalle. Incluí, como renglones SEPARADOS:
    * Cada PRODUCTO con su importe NETO (sin sumarle el IVA al producto).
    * Si el IVA está discriminado (típico en Factura A), agregalo como un renglón aparte (ej "IVA 21%") con su importe.
    * Cada PERCEPCIÓN o impuesto (ej "Percepción IIBB", "Percepción IVA") como un renglón aparte.
    * Cualquier otro cargo (flete, redondeo, etc.) como renglón aparte.
  Para cada renglón:
    - descripcion: nombre del producto, o del impuesto/percepción.
    - cantidad: cantidad de unidades como número si es un producto (ej "12"); "" para impuestos/percepciones o si no figura.
    - importe: importe del renglón, número con punto decimal, sin separador de miles ni símbolo.
    - concepto: "impuesto" si el renglón es IVA, una percepción u otro cargo impositivo; si no, "producto".
  En facturas B o C el IVA NO se discrimina (ya está incluido en el precio de los productos): en ese caso NO agregues un renglón de IVA.
  NO incluyas el SUBTOTAL ni el TOTAL final como renglones. La suma de TODOS los renglones (productos + IVA + percepciones) debe dar el TOTAL de la factura.
Si un dato no aparece, devolvé cadena vacía "" en ese campo. No inventes datos.`

const RESPONSE_SCHEMA_PROVEEDOR = {
  type: 'OBJECT',
  properties: {
    tipoFactura: { type: 'STRING' },
    proveedor: { type: 'STRING' },
    monto: { type: 'STRING' },
    fecha: { type: 'STRING' },
    condicionVenta: { type: 'STRING' },
    vencimiento: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descripcion: { type: 'STRING' },
          cantidad: { type: 'STRING' },
          importe: { type: 'STRING' },
          concepto: { type: 'STRING' },
        },
        required: ['descripcion', 'cantidad', 'importe', 'concepto'],
      },
    },
  },
  required: ['tipoFactura', 'proveedor', 'monto', 'fecha', 'condicionVenta', 'vencimiento', 'items'],
}

// --- Modo "recibo": recibo de sueldo argentino (foto o PDF) ---
const PROMPT_RECIBO = `Sos un asistente que lee RECIBOS DE SUELDO argentinos (recibo de haberes, Ley 20.744). Te paso una foto o PDF del recibo. Extraé EXACTAMENTE estos campos:
- empleado: nombre y apellido del TRABAJADOR (no del empleador). Como figura en el recibo.
- cuil: CUIL del trabajador, solo números y guiones si figuran (ej "20-12345678-3"). Si no figura, "".
- periodo: mes al que corresponde el sueldo, en formato YYYY-MM. Buscá "Período" / "Período abonado" / "Mes" (ej "Junio 2026" → "2026-06"). Si es quincena, igual devolvé el mes.
- fechaPago: fecha de pago en formato YYYY-MM-DD. Si no figura, "".
- neto: importe NETO A COBRAR (lo que recibe el trabajador en mano), como número con punto decimal, sin separador de miles ni símbolo (ej "850000.50"). Suele figurar como "NETO A COBRAR" / "Total Neto" / "Son pesos...".
- bruto: total de haberes REMUNERATIVOS (sueldo bruto sujeto a aportes), número con punto decimal. Si no se distingue, "".
- items: lista con CADA renglón del recibo, en orden. Para cada renglón:
    - descripcion: concepto tal como figura (ej "Sueldo básico", "Antigüedad", "Presentismo", "Horas extras 50%", "Jubilación", "Ley 19032", "Obra Social", "Cuota sindical UTHGRA").
    - tipo: "haber" si es un haber remunerativo; "haber_nr" si es un haber NO remunerativo (suele estar en columna aparte o aclarado); "deduccion" si es un descuento/retención (jubilación, ley 19032, obra social, sindicato, seguro, adelantos descontados, embargos).
    - importe: importe del renglón, número con punto decimal, sin separador de miles ni símbolo. Siempre POSITIVO (aunque sea deducción).
  NO incluyas los totales (total haberes, total deducciones, neto) como renglones.
  La cuenta debe cerrar: haberes + haberes_nr - deducciones ≈ neto.
Si un dato no aparece en el documento, devolvé cadena vacía "" en ese campo. No inventes datos.`

const RESPONSE_SCHEMA_RECIBO = {
  type: 'OBJECT',
  properties: {
    empleado: { type: 'STRING' },
    cuil: { type: 'STRING' },
    periodo: { type: 'STRING' },
    fechaPago: { type: 'STRING' },
    neto: { type: 'STRING' },
    bruto: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descripcion: { type: 'STRING' },
          tipo: { type: 'STRING' },
          importe: { type: 'STRING' },
        },
        required: ['descripcion', 'tipo', 'importe'],
      },
    },
  },
  required: ['empleado', 'cuil', 'periodo', 'fechaPago', 'neto', 'bruto', 'items'],
}

// --- Modo "parte": Parte Diario de habitaciones (foto/escaneo del reporte impreso) ---
const PROMPT_PARTE = `Sos un asistente que lee el "Parte Diario" de habitaciones de un hotel (sistema Todoalojamiento). Te paso una foto o escaneo del reporte impreso. Extraé EXACTAMENTE estos campos:
- nroCaja: el número que figura junto a "Caja" en el título "Parte Diario Caja N". Solo el número.
- usuario: el nombre que figura en "Usuario:".
- fechaCaja: la fecha/hora de "Fecha caja:" en formato "dd/mm/yyyy hh:mm". Si no hay hora, solo "dd/mm/yyyy".
- ocupadas: lista de TODAS las habitaciones OCUPADAS. Vienen agrupadas por canal de reserva (encabezados como "Booking.com", "WhatsApp", "Walk In", "Contacto Telefónico", "Motor de reservas propio" o nombres de agencias). Por cada habitación ocupada:
    * habitacion: número de habitación (ej "101", "1002").
    * reserva: número de reserva de esa fila.
    * plazas: cantidad de plazas (número).
    * canal: el nombre del grupo/canal bajo el que está listada.
- libres: lista de las habitaciones LIBRES con su estado de limpieza. Por cada una:
    * habitacion: número.
    * estado: "sucia", "limpia" o "mantenimiento".
- totalOcupadas, totalPlazas, totalLibres: los totales impresos (números). Si no figuran, "".
Los números van como texto, sin puntos de miles. Listá SOLO las filas que ves; no inventes. NO incluyas los subtotales por canal como si fueran habitaciones.`

const RESPONSE_SCHEMA_PARTE = {
  type: 'OBJECT',
  properties: {
    nroCaja: { type: 'STRING' },
    usuario: { type: 'STRING' },
    fechaCaja: { type: 'STRING' },
    ocupadas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          habitacion: { type: 'STRING' },
          reserva: { type: 'STRING' },
          plazas: { type: 'STRING' },
          canal: { type: 'STRING' },
        },
        required: ['habitacion', 'reserva', 'plazas', 'canal'],
      },
    },
    libres: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          habitacion: { type: 'STRING' },
          estado: { type: 'STRING' },
        },
        required: ['habitacion', 'estado'],
      },
    },
    totalOcupadas: { type: 'STRING' },
    totalPlazas: { type: 'STRING' },
    totalLibres: { type: 'STRING' },
  },
  required: ['nroCaja', 'usuario', 'fechaCaja', 'ocupadas', 'libres', 'totalOcupadas', 'totalPlazas', 'totalLibres'],
}

// --- Modo "remito": remito MANUSCRITO del lavadero (talonario preimpreso) ---
const PROMPT_REMITO = `Sos un asistente que lee REMITOS MANUSCRITOS de un lavadero industrial de ropa blanca hotelera. Es un talonario preimpreso: una columna CANTIDAD a la izquierda y renglones preimpresos de prendas (SÁBANAS, FUNDAS, TOALLAS DE BAÑO, TOALLAS TURCAS, COLCHAS, MANTELES, CUBRES, SERVILLETAS, DELANTALES, FRAZADAS, TENDILLOS P., REPASADORES, CRISTALES, TAPICES, PIE DE BAÑO, PLAYERAS). Las cantidades están escritas con lapicera. Extraé EXACTAMENTE estos campos:
- nro: el número de remito impreso arriba (ej "00174775"). Solo los dígitos tal como figuran.
- fecha: la fecha manuscrita en formato YYYY-MM-DD. Suele estar escrita como dd/mm/aa (ej "15/6/26" → "2026-06-15"). Si no se lee, "".
- tipo: "retiro" si el remito documenta ropa SUCIA que el lavadero se lleva (suele decir "RETIRO" manuscrito cerca de las firmas de abajo); "entrega" si documenta ropa LIMPIA que el lavadero trae (suele decir "ENTREGA" o similar). Si no se distingue, "".
- prendas: un renglón por cada prenda que tenga cantidad manuscrita mayor a 0. Para cada una:
    * prenda: el nombre preimpreso del renglón (ej "Fundas", "Toallas de baño", "Pie de baño"). CASO ESPECIAL SÁBANAS: en el renglón de SÁBANAS suele haber un desglose manuscrito tipo "SG 34 SCH 22" (SG = sábanas grandes, SCH = sábanas chicas): en ese caso devolvé DOS renglones, "Sábanas grandes (SG)" con su cantidad y "Sábanas chicas (SCH)" con la suya. Si solo hay un número total, devolvé un renglón "Sábanas".
    * cantidad: el número manuscrito, como texto (ej "42").
  NO incluyas renglones sin cantidad. La letra es manuscrita: si un número es ilegible o muy dudoso NO lo inventes, directamente omití ese renglón.
Si un dato no aparece en el documento, devolvé cadena vacía "" en ese campo. No inventes datos.`

const RESPONSE_SCHEMA_REMITO = {
  type: 'OBJECT',
  properties: {
    nro: { type: 'STRING' },
    fecha: { type: 'STRING' },
    tipo: { type: 'STRING' },
    prendas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          prenda: { type: 'STRING' },
          cantidad: { type: 'STRING' },
        },
        required: ['prenda', 'cantidad'],
      },
    },
  },
  required: ['nro', 'fecha', 'tipo', 'prendas'],
}

// --- Modo "caja": Informe de caja del PMS (foto/escaneo del reporte impreso) ---
const PROMPT_CAJA = `Sos un asistente que lee el "Informe de caja" de un hotel (sistema Todoalojamiento). Te paso una foto, escaneo o PDF del informe impreso. Extraé EXACTAMENTE estos campos:
- nroCaja: el número que figura junto a "Nro. Caja". Solo el número.
- puntoVenta: lo que figura en "Pto. Vta." (ej "Recepcion").
- moneda: lo que figura en "Moneda de la caja" (ej "AR$"). Si no figura, "".
- usuarioApertura: el nombre en "Usuario apertura".
- usuarioCierre: el nombre en "Usuario cierre". Si la caja no está cerrada, "".
- aperturaAt: fecha/hora de "Apertura" en formato "dd/mm/yyyy hh:mm".
- cierreAt: fecha/hora de "Cierre" en formato "dd/mm/yyyy hh:mm". Si no cerró, "".
- aperturaMonto: el "Monto de Apertura (Efectivo)" como número con punto decimal, sin separador de miles (ej "2419075.55").
- saldoFinal: el "Saldo total en caja" (el número final del informe) como número con punto decimal.
- ingresos: movimientos de la sección "Ingresos" (los cobros). egresos: sección "Egresos". retiros: sección "Retiros" o "Egreso al cerrar Caja".
  Por cada movimiento (en las TRES listas):
    * fechaHora: fecha/hora de la fila en "dd/mm/yyyy hh:mm".
    * usuario: usuario de la fila.
    * comp: la columna "Comp" (comprobante). En cobros con tarjeta suele traer "FB 3-527". Si está vacía, "".
    * habitacion: la habitación de la fila (ej "1001", "205/202"). Si no hay, "".
    * observacion: el texto de la columna "Observación" tal cual (ej "Reserva 389 - Yamila Inzaurraldez", "Pago Reserva 492 /", "RETIRO EFECTIVO").
    * efectivo, tarjetas, cheques, transferencia, otros, total: el importe de cada columna como número con punto decimal, sin separador de miles. Si esa columna está vacía en la fila, "0". (La columna "Transf." es transferencia.)
NO incluyas las filas de "Totales" ni los encabezados como movimientos. Los números van sin puntos de miles. No inventes filas; listá solo las que ves.`

const CAJA_MOV_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fechaHora: { type: 'STRING' },
    usuario: { type: 'STRING' },
    comp: { type: 'STRING' },
    habitacion: { type: 'STRING' },
    observacion: { type: 'STRING' },
    efectivo: { type: 'STRING' },
    tarjetas: { type: 'STRING' },
    cheques: { type: 'STRING' },
    transferencia: { type: 'STRING' },
    otros: { type: 'STRING' },
    total: { type: 'STRING' },
  },
  required: ['fechaHora', 'usuario', 'comp', 'habitacion', 'observacion', 'efectivo', 'tarjetas', 'cheques', 'transferencia', 'otros', 'total'],
}

const RESPONSE_SCHEMA_CAJA = {
  type: 'OBJECT',
  properties: {
    nroCaja: { type: 'STRING' },
    puntoVenta: { type: 'STRING' },
    moneda: { type: 'STRING' },
    usuarioApertura: { type: 'STRING' },
    usuarioCierre: { type: 'STRING' },
    aperturaAt: { type: 'STRING' },
    cierreAt: { type: 'STRING' },
    aperturaMonto: { type: 'STRING' },
    saldoFinal: { type: 'STRING' },
    ingresos: { type: 'ARRAY', items: CAJA_MOV_SCHEMA },
    egresos: { type: 'ARRAY', items: CAJA_MOV_SCHEMA },
    retiros: { type: 'ARRAY', items: CAJA_MOV_SCHEMA },
  },
  required: ['nroCaja', 'puntoVenta', 'moneda', 'usuarioApertura', 'usuarioCierre', 'aperturaAt', 'cierreAt', 'aperturaMonto', 'saldoFinal', 'ingresos', 'egresos', 'retiros'],
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const mimeType = body && body.mimeType
  const data = body && body.data
  const mode = ['proveedor', 'parte', 'caja', 'recibo', 'remito'].includes(body && body.mode) ? body.mode : 'servicio'
  if (!mimeType || !data) {
    res.status(400).json({ error: 'Faltan datos del archivo (mimeType / data).' })
    return
  }
  // Guarda de tamaño: el límite del body en Vercel es ~4.5MB.
  if (data.length > 6_000_000) {
    res.status(413).json({ error: 'El archivo es muy grande. Probá con una foto más liviana o un PDF más chico.' })
    return
  }

  const prompt = mode === 'proveedor' ? PROMPT_PROVEEDOR : mode === 'parte' ? PROMPT_PARTE : mode === 'caja' ? PROMPT_CAJA : mode === 'recibo' ? PROMPT_RECIBO : mode === 'remito' ? PROMPT_REMITO : PROMPT
  const schema = mode === 'proveedor' ? RESPONSE_SCHEMA_PROVEEDOR : mode === 'parte' ? RESPONSE_SCHEMA_PARTE : mode === 'caja' ? RESPONSE_SCHEMA_CAJA : mode === 'recibo' ? RESPONSE_SCHEMA_RECIBO : mode === 'remito' ? RESPONSE_SCHEMA_REMITO : RESPONSE_SCHEMA

  const payload = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  }

  // Recorre los modelos; en cada uno reintenta ante sobrecarga transitoria (503/429/500)
  // con backoff creciente. Solo aborta ante un error NO recuperable (ej: 400, 403).
  let lastStatus = 0
  let lastReason = ''
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    for (let attempt = 1; attempt <= MAX_TRIES_PER_MODEL; attempt++) {
      let r
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch (err) {
        console.error('[extract-invoice] fetch fallo', model, err)
        lastStatus = 0
        lastReason = 'No se pudo conectar con el servicio de IA.'
        await sleep(attempt * 600)
        continue
      }

      if (r.ok) {
        const json = await r.json()
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          res.status(502).json({ error: 'La IA no devolvió datos legibles de la factura.' })
          return
        }
        let parsed
        try { parsed = JSON.parse(text) } catch {
          res.status(502).json({ error: 'No se pudo interpretar la respuesta de la IA.' })
          return
        }
        if (mode === 'recibo') {
          const str = v => String(v ?? '').trim()
          const items = Array.isArray(parsed.items)
            ? parsed.items.map(it => {
                const t = str(it?.tipo).toLowerCase()
                return {
                  descripcion: str(it?.descripcion),
                  tipo: t === 'deduccion' ? 'deduccion' : t === 'haber_nr' ? 'haber_nr' : 'haber',
                  importe: str(it?.importe),
                }
              }).filter(it => it.descripcion || it.importe)
            : []
          res.status(200).json({
            empleado: str(parsed.empleado),
            cuil: str(parsed.cuil),
            periodo: str(parsed.periodo),
            fechaPago: str(parsed.fechaPago),
            neto: str(parsed.neto),
            bruto: str(parsed.bruto),
            items,
          })
          return
        }
        if (mode === 'proveedor') {
          const tipo = String(parsed.tipoFactura ?? '').trim().toUpperCase()
          const items = Array.isArray(parsed.items)
            ? parsed.items.map(it => ({
                descripcion: String(it?.descripcion ?? '').trim(),
                cantidad: String(it?.cantidad ?? '').trim(),
                importe: String(it?.importe ?? '').trim(),
                concepto: String(it?.concepto ?? '').trim().toLowerCase() === 'impuesto' ? 'impuesto' : 'producto',
              })).filter(it => it.descripcion || it.importe)
            : []
          const cond = String(parsed.condicionVenta ?? '').trim().toLowerCase()
          const condicionVenta = cond.includes('corriente') || cond.includes('cta') ? 'cuenta_corriente'
            : cond.includes('contado') ? 'contado' : ''
          res.status(200).json({
            tipoFactura: ['A', 'B', 'C', 'M'].includes(tipo) ? tipo : '',
            proveedor: String(parsed.proveedor ?? '').trim(),
            monto: String(parsed.monto ?? '').trim(),
            fecha: String(parsed.fecha ?? '').trim(),
            condicionVenta,
            vencimiento: String(parsed.vencimiento ?? '').trim(),
            items,
          })
          return
        }
        if (mode === 'parte') {
          const str = v => String(v ?? '').trim()
          const ocupadas = Array.isArray(parsed.ocupadas)
            ? parsed.ocupadas.map(o => ({
                habitacion: str(o?.habitacion),
                reserva: str(o?.reserva),
                plazas: str(o?.plazas),
                canal: str(o?.canal),
              })).filter(o => o.habitacion)
            : []
          const libres = Array.isArray(parsed.libres)
            ? parsed.libres.map(l => ({
                habitacion: str(l?.habitacion),
                estado: str(l?.estado).toLowerCase(),
              })).filter(l => l.habitacion)
            : []
          res.status(200).json({
            nroCaja: str(parsed.nroCaja),
            usuario: str(parsed.usuario),
            fechaCaja: str(parsed.fechaCaja),
            ocupadas,
            libres,
            totalOcupadas: str(parsed.totalOcupadas),
            totalPlazas: str(parsed.totalPlazas),
            totalLibres: str(parsed.totalLibres),
          })
          return
        }
        if (mode === 'remito') {
          const str = v => String(v ?? '').trim()
          const prendas = Array.isArray(parsed.prendas)
            ? parsed.prendas.map(p => ({
                prenda: str(p?.prenda),
                cantidad: str(p?.cantidad),
              })).filter(p => p.prenda && p.cantidad)
            : []
          const t = str(parsed.tipo).toLowerCase()
          res.status(200).json({
            nro: str(parsed.nro),
            fecha: str(parsed.fecha),
            tipo: t === 'retiro' ? 'retiro' : t === 'entrega' ? 'entrega' : '',
            prendas,
          })
          return
        }
        if (mode === 'caja') {
          const str = v => String(v ?? '').trim()
          const mapMov = arr => Array.isArray(arr)
            ? arr.map(m => ({
                fechaHora: str(m?.fechaHora),
                usuario: str(m?.usuario),
                comp: str(m?.comp),
                habitacion: str(m?.habitacion),
                observacion: str(m?.observacion),
                efectivo: str(m?.efectivo),
                tarjetas: str(m?.tarjetas),
                cheques: str(m?.cheques),
                transferencia: str(m?.transferencia),
                otros: str(m?.otros),
                total: str(m?.total),
              })).filter(m => m.observacion || m.total !== '' || m.habitacion)
            : []
          res.status(200).json({
            nroCaja: str(parsed.nroCaja),
            puntoVenta: str(parsed.puntoVenta),
            moneda: str(parsed.moneda),
            usuarioApertura: str(parsed.usuarioApertura),
            usuarioCierre: str(parsed.usuarioCierre),
            aperturaAt: str(parsed.aperturaAt),
            cierreAt: str(parsed.cierreAt),
            aperturaMonto: str(parsed.aperturaMonto),
            saldoFinal: str(parsed.saldoFinal),
            ingresos: mapMov(parsed.ingresos),
            egresos: mapMov(parsed.egresos),
            retiros: mapMov(parsed.retiros),
          })
          return
        }
        res.status(200).json({
          nombre: String(parsed.nombre ?? '').trim(),
          nroCuenta: String(parsed.nroCuenta ?? '').trim(),
          monto: String(parsed.monto ?? '').trim(),
          vtoActual: String(parsed.vtoActual ?? '').trim(),
          vtoSiguiente: String(parsed.vtoSiguiente ?? '').trim(),
        })
        return
      }

      const detail = await r.text()
      console.error('[extract-invoice] Gemini error', model, r.status, detail)
      lastStatus = r.status
      try { lastReason = JSON.parse(detail)?.error?.message || detail } catch { lastReason = detail }

      if (!RETRYABLE.has(r.status)) {
        // Error definitivo (key inválida, request mal armado, etc.): no insistir.
        // El detalle real queda en los logs (console.error de arriba).
        res.status(502).json({ error: 'No se pudo leer la factura (error del servicio de IA).' })
        return
      }
      // Sobrecarga transitoria: esperar y reintentar (backoff 0.6s, 1.2s, 1.8s).
      if (attempt < MAX_TRIES_PER_MODEL) await sleep(attempt * 600)
    }
    // Este modelo no respondió tras varios intentos: probamos el siguiente.
  }

  res.status(503).json({
    error: 'El servicio de IA está saturado en este momento. Probá de nuevo en un minuto.',
    detail: `HTTP ${lastStatus}: ${String(lastReason).slice(0, 200)}`,
  })
}
