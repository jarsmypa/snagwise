# Guion del video (menos de 3 minutos)

La narración va en inglés, porque el jurado es en inglés. Las indicaciones de cámara están en español.
Grabar en Chrome a 1280×720 o más, con el zoom del navegador en 110 % para que se lea bien.

## Antes de grabar

- Reiniciar con datos limpios: `SNAGWISE_SEED_DEMO=1` y una base nueva (borrar `apps/api/data/snagwise.db`).
- Tener abierta la cuenta Personal US del sandbox para el pago.
- Activar la skill **Gamer Deals** en SnagSkills.
- Ensayar una vez los pedidos del paso 3 para saber cuánto tarda la IA (si tarda, cortar en la edición).
- No mostrar el `.env`, las claves ni el panel de desarrollador de PayPal.
- Música: solo libre de derechos (o ninguna).

## Escenas

| Tiempo | Pantalla | Narración (inglés) |
|---|---|---|
| 0:00–0:15 | Pestaña Assistant, banda verde con el presupuesto | "Deal hunting is noisy, and budgets only show up after the money is gone. Snagwise is a shopping agent that knows what you like and what you can spend." |
| 0:15–0:40 | Discover: deslizar 3 tarjetas, en una elegir "The product" | "It learns your taste from swipes. I can say *what* I liked: the product, or the price. 'Love the product, not the price' tells Snagwise to wait for a lower one." |
| 0:40–0:55 | Tocar Recommend: tarjeta 9:16 con QR | "Any deal becomes a story card. When friends scan it and save the deal, my taste profile learns from that too." |
| 0:55–1:10 | SnagSkills: abrir Gamer Deals, "Read tips", activarla | "SnagSkills are shopping know-how from the community, like a gamer's tips on where game prices really drop. The agent reads them as advice, never as instructions." |
| 1:10–1:50 | Assistant: "Find a gaming headset under $80 that fits my taste and save the best one with a $70 target" → luego "If it fits my budget, propose buying it" | "Now I just ask. It searches live products, ranks them with my taste and the skill, saves one to my wallet, and only proposes a purchase if the price hits my target and fits this month's budget." |
| 1:50–2:15 | Botón de PayPal en la propuesta → pagar con la cuenta sandbox | "Nothing is bought until I approve it in PayPal. The server checks the target and the budget again before creating the order." |
| 2:15–2:30 | Spending: la fila nueva, el sticker de ahorro, el presupuesto que bajó en la banda | "The purchase lands in my spending, with what I saved against the list price." |
| 2:30–2:50 | Assistant: abrir "Context file shared between AI models", mostrar el selector de IA | "And it runs at zero AI cost: free models from Gemini, Groq and OpenRouter rotate when one hits its limit. They share this Markdown context, so the next model knows exactly what the last one did. You can also bring your own Claude key." |
| 2:50–2:58 | Banda verde, logo | "Snagwise. It finds the deal, and you stay in charge of the money." |

## Si algo falla en vivo

- La IA tarda: dejar correr y acortar en la edición; no hace falta repetir la toma.
- Un proveedor llega al límite: es una buena toma, muestra la rotación ("Gemini stopped… Groq took over").
- PayPal da error: reintentar en una ventana de incógnito.
