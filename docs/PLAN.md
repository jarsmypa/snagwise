# Plan técnico · Snagwise (PayPal AI Hackathon)

**Nombre de trabajo:** Snagwise. Se puede cambiar antes de publicar el repo (ver "Nombres").
**Entrega:** jueves 12-11-2026, 12:00 PT = **17:00 Paraguay**. Apuntamos a entregar el **11-11**.

## La frase del pitch

> Tell it what you like and what you can spend. It finds the deal, watches the price, and buys with PayPal when it fits — never over budget, never without your OK.

## Alcance (lo que entra y lo que no)

| Entra | No entra |
|---|---|
| Gustos en lenguaje natural → búsqueda real de productos (Channel3) | Recomendaciones de inversión (asesoría financiera regulada) |
| Cartera (lista de deseos) con precio objetivo | Scraping de tiendas (términos de uso; usamos Channel3) |
| Presupuesto mensual y gastos del mes | Dinero real: todo en **sandbox** |
| Vigilancia de precio con veredicto explicado | Apps nativas: es web, se usa bien en el celular |
| Compra con PayPal **aprobada por la persona** | Varias monedas: solo USD |
| Contador "te ahorraste US$X" | Cuentas de usuario completas: un usuario demo alcanza |

## Cómo aprende la app tus gustos

- **Descubrir (swipe):** tarjetas de ofertas reales. Izquierda = no; derecha = me gusta, y elegís **qué** te gustó: el producto, el precio o ambos.
  - "Me gusta el producto, no el precio" baja el precio que la app cree que pagarías en esa categoría (85% del precio visto). Es la señal para vigilarlo hasta que baje.
  - "Me gusta el precio" sube ese techo.
- **Recomendar:** de una oferta que te gustó se genera una **tarjeta 9:16 con QR** para historias. El QR abre una página pública (`/s/:id`) sin cuenta.
- **Referidos también enseñan:** cada apertura del QR y cada "guardar en mi cartera" desde esa página suman al perfil. Guardar una oferta recomendada pesa más que un swipe.
- El **perfil de gustos** (`packages/core/src/taste.ts`) ordena las tarjetas de Descubrir y lo va a leer el agente para buscar y proponer.
- Sin clave de Channel3, Descubrir usa un **catálogo de ejemplo solo para desarrollo** (marcado en pantalla). No aparece en la demo final.

Amigos con cuentas queda fuera del hackathon (cuentas, privacidad y tiempo). La tarjeta con QR cubre la parte social sin exponer compras.

## Arquitectura

```
apps/web     React + Vite. Chat con el agente, cartera, gastos, botón de PayPal.
apps/api     Hono + SQLite (node:sqlite). Sirve también la web: un solo servicio en Render.
packages/core  Reglas puras con pruebas: presupuesto, veredicto de compra, ahorro.
```

Flujo de compra (el corazón de la demo):

1. La persona escribe lo que busca. El **agente** (Claude con herramientas) llama a `search_products` y propone 2–3 opciones explicando por qué.
2. La persona guarda una en la cartera con precio objetivo.
3. "Revisar precio" (botón en la demo; en producción, un cron) vuelve a buscar y calcula el **veredicto** con `evaluateOffer`: compra solo si el precio ≤ objetivo **y** ≤ lo que queda del presupuesto.
4. Si el veredicto es sí, el servidor **vuelve a validar** y crea la orden de PayPal (Orders v2).
5. La web muestra el botón de PayPal (JS SDK): **la aprobación humana es el checkout de PayPal**. El agente nunca paga solo.
6. El servidor captura la orden, registra el gasto y actualiza el presupuesto.

### Decisión importante: quién cobra

En sandbox, la orden la cobra **nuestra cuenta comercial de prueba**, como un servicio de "compra por mí" (concierge). Una tienda real de Channel3 no cobra a través de nuestra orden. Para el jurado lo decimos claro en el README y en el video: *"en producción, la compra se hace en el checkout de PayPal de la tienda, o mediante los protocolos de comercio con agentes de PayPal"*. Ser transparentes en esto evita que el jurado lo marque como trampa.

### El agente

- Modelo: Claude por la API de Anthropic, con un bucle de herramientas (tool use).
- Herramientas: `search_products`, `add_to_wallet`, `get_budget`, `list_spending`, `check_price`, `propose_purchase`.
- `propose_purchase` **no paga**: devuelve una propuesta que la web convierte en botón de PayPal.
- Antes de escribir el agente, revisar la documentación actual del SDK (`@anthropic-ai/sdk`) y del modelo a usar.
- Clave de Anthropic con **límite de gasto mensual**, y solo en el servidor.

### Gastos del mes

- Fuente principal: las compras capturadas en la app más un **historial ficticio creíble** (seed) para que el panel tenga sentido.
- Opcional: la Transaction Search API de PayPal (`/v1/reporting/transactions`). En sandbox hay que habilitarla en la app y los datos pueden tardar horas en aparecer. Solo si sobra tiempo.

### Premios de patrocinador (uno por proyecto, más el principal o la mención)

- **Channel3** (US$1.500): ya es nuestra fuente de búsqueda.
- **AG Grid** (hasta US$5.000): usar AG Grid Community (MIT) en la cartera y los gastos. Decidir en la semana 2 cuál destacamos en la entrega.
- **Render** (créditos): deploy ahí de todas formas.

## Calendario

| Fechas | Objetivo | Hecho cuando… |
|---|---|---|
| 22–25 oct | Base, swipe y tarjeta QR | Hecho: cartera, presupuesto, botón de PayPal, seed, Descubrir con motivos, perfil de gustos, tarjeta 9:16 y página del QR. Falta probar con claves reales |
| 26 oct–1 nov | Agente | Chat con el agente usando perfil, cartera, presupuesto y propuesta de compra |
| 2–4 nov | Producto | Flujo completo probado con claves reales; cartera y gastos con AG Grid |
| 5–8 nov | Diseño y deploy | UI cuidada en celular; deploy en Render con URL pública; README en inglés |
| 9–10 nov | Video | Guion de 2:30, grabación y subida a YouTube (pública), sin música con copyright |
| 11 nov | Entrega | Formulario de Devpost completo y enviado |
| 12 nov | Margen | Solo arreglos urgentes, antes de las 17:00 |

## Tareas de la semana 1 (ya)

- [ ] Crear la app en el PayPal Developer Dashboard (sandbox) y dos cuentas de prueba: comercio y comprador.
- [ ] Pedir la clave de Channel3 y probar una búsqueda real.
- [ ] Clave de Anthropic con límite de gasto.
- [ ] Completar `apps/api/.env` (copiar de `.env.example`).
- [x] Botón de PayPal en la web (JS SDK) conectado a `/order` y `/capture`. Falta probarlo con credenciales reales de sandbox.
- [x] Seed de gastos demo (`npm run demo --workspace @snagwise/api`, o `SNAGWISE_SEED_DEMO=1` al arrancar).
- [x] Nombre final: Snagwise.
- [ ] Crear el repo público en GitHub.

## Requisitos de la entrega (checklist)

- [ ] Repo público en GitHub con licencia MIT visible en el "About".
- [ ] README en inglés: qué hace, cómo correrlo, credenciales **de sandbox** para probar, herramientas de IA usadas y cómo.
- [ ] Demo funcional: URL en Render o instrucciones completas.
- [ ] Video de menos de 3 minutos en YouTube, público, mostrando la app funcionando.
- [ ] Ninguna clave real en el repo ni en el historial de git.

## Nombres

Evitamos todo lo que suene a PayPal ("-Pal", "Pay-"): PayPal se opone a nombres parecidos.

| Nombre | Idea | Nota |
|---|---|---|
| **Snagwise** | "snag a deal" + compra sensata | Nombre de trabajo. En inglés británico "snag" también es "defecto de obra" |
| Cartwise | carrito inteligente | Muy descriptivo; más probable que ya exista |
| Dealwarden | el guardián de tus ofertas y tu presupuesto | Transmite control; más largo |
| Wishkeeper | guarda tus deseos y los compra a tiempo | Cálido, menos "finanzas" |

Antes de publicar: buscar el nombre en GitHub, en las tiendas de apps y en la base de marcas de USPTO (y de la DINAPI en Paraguay si piensan seguir con el producto).
