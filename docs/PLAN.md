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

### El agente (gasto cero)

- **IA gratuita que rota:** Gemini → Groq → OpenRouter, usando sus planes gratuitos (un adaptador común, sin dependencias nuevas). Cuando uno da 429 (límite), queda en pausa —1 min, y se duplica si se repite, hasta 6 h— y responde el siguiente.
- **Archivo de contexto `.md`:** cada pedido arranca desde un Markdown armado con el estado de la app (gustos, presupuesto, cartera, acciones ya hechas y últimos mensajes). Si un modelo se corta, incluso a mitad de respuesta, el siguiente lee el mismo archivo y no repite lo hecho. Armarlo no consume IA. Se puede ver desde el chat (buen momento para el video).
- **Trae tu clave:** cada usuario puede conectar su clave de Claude, Gemini, Groq u OpenRouter. Va solo con sus mensajes; el servidor no la guarda ni la registra.
- Herramientas: `get_taste_profile`, `get_budget`, `list_wallet`, `search_products`, `add_to_wallet`, `propose_purchase`.
- `propose_purchase` **no paga**: devuelve una propuesta que la web convierte en botón de PayPal.
- **Protecciones:** código de acceso opcional, límite por visitante por hora y tope diario total para los proveedores gratuitos.
- Una cuenta por proveedor: crear varias para estirar el plan gratuito viola sus términos.

### Gastos del mes

- Fuente principal: las compras capturadas en la app más un **historial ficticio creíble** (seed) para que el panel tenga sentido.
- Opcional: la Transaction Search API de PayPal (`/v1/reporting/transactions`). En sandbox hay que habilitarla en la app y los datos pueden tardar horas en aparecer. Solo si sobra tiempo.

### Premios de patrocinador (uno por proyecto, más el principal o la mención)

- **Channel3** (US$1.500): ya es nuestra fuente de búsqueda.
- **AG Grid** (hasta US$5.000): usar AG Grid Community (MIT) en la cartera y los gastos. Decidir en la semana 2 cuál destacamos en la entrega.
- **Render** (créditos): deploy ahí de todas formas.

## Calendario

| Fechas | Objetivo | Estado |
|---|---|---|
| 22–23 oct | Producto completo en código | **Hecho:** cartera, presupuesto, PayPal, seed, Descubrir, perfil de gustos, tarjeta QR, agente con IA gratuita rotativa y contexto .md, selector de IA, SnagSkills, AG Grid en Gastos, ahorro, vigilancia de precios, render.yaml, README y borrador para Devpost |
| 24 oct–1 nov | Probar con claves reales | Gemini o Groq, PayPal sandbox y Channel3 funcionando de punta a punta; corregir lo que aparezca |
| 2–4 nov | Repo público y deploy | Repo en GitHub y servicio en Render con URL pública y código de acceso |
| 5–8 nov | Pulido | UI en celular, textos, datos de ejemplo para el video |
| 9–10 nov | Video | Guion de 2:30, grabación y subida a YouTube (pública), sin música con copyright |
| 11 nov | Entrega | Formulario de Devpost (texto listo en `docs/SUBMISSION.md`) |
| 12 nov | Margen | Solo arreglos urgentes, antes de las 17:00 |

## Lo que falta y depende de ustedes

- [ ] App sandbox en el PayPal Developer Dashboard y dos cuentas de prueba: comercio y comprador.
- [ ] Clave gratuita de Gemini y/o Groq (y OpenRouter si quieren un tercero).
- [ ] Clave de Channel3 para productos reales.
- [ ] Completar `apps/api/.env` (copiar de `.env.example`) y probar el flujo completo.
- [ ] Crear el repo público en GitHub.
- [ ] Crear el servicio en Render desde `render.yaml` y cargar las claves en su panel.
- [ ] Grabar el video.

## Requisitos de la entrega (checklist)

- [ ] Repo público en GitHub con licencia MIT visible en el "About".
- [x] README en inglés: qué hace, cómo correrlo, instrucciones para el jurado, herramientas de IA usadas y cómo.
- [ ] Demo funcional: URL en Render (`render.yaml` listo).
- [ ] Video de menos de 3 minutos en YouTube, público, mostrando la app funcionando.
- [x] Ninguna clave real en el repo ni en el historial de git (`.env` excluido; `render.yaml` usa `sync: false`).

## SnagSkills

- Skills de la comunidad: archivos `.md` en `skills/`, se suman por pull request y se revisan (reglas en `skills/README.md`).
- Cada usuario puede importar las suyas (quedan como no verificadas) y activar hasta 3.
- Entran al contexto `.md` del agente como **consejos, nunca instrucciones**, y solo empujan el orden de resultados (tiendas preferidas arriba, a evitar abajo). No pueden pagar ni cambiar el presupuesto.

## Nombres

Evitamos todo lo que suene a PayPal ("-Pal", "Pay-"): PayPal se opone a nombres parecidos.

| Nombre | Idea | Nota |
|---|---|---|
| **Snagwise** | "snag a deal" + compra sensata | Nombre de trabajo. En inglés británico "snag" también es "defecto de obra" |
| Cartwise | carrito inteligente | Muy descriptivo; más probable que ya exista |
| Dealwarden | el guardián de tus ofertas y tu presupuesto | Transmite control; más largo |
| Wishkeeper | guarda tus deseos y los compra a tiempo | Cálido, menos "finanzas" |

Antes de publicar: buscar el nombre en GitHub, en las tiendas de apps y en la base de marcas de USPTO (y de la DINAPI en Paraguay si piensan seguir con el producto).
