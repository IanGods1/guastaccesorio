# Guastaccesorio (web)

Versión web de **Guastaccesorio**: consulta qué modelos de teléfono comparten el mismo **case** y el mismo **vidrio templado** (Normal, 9D o Privacy). Se abre con un enlace, sin instalar nada, también en iPhone.

**Enlace:** https://iangods1.github.io/guastaccesorio/

Usa **la misma base de datos de Firebase y las mismas contraseñas** que la app Android: lo que cargues en una lo ve la otra y los trabajadores.

- **Administrador:** buscar, agregar/editar/eliminar modelos y grupos, importar y exportar (CSV o Excel), cambiar contraseñas y cerrar sesión.
- **Trabajador:** solo buscar y ver compatibilidades. No existen para él las pantallas de administración.
- **Sesión permanente:** se escribe la contraseña una sola vez; después la página abre directo. La sesión del trabajador se cierra sola cuando el administrador cambia la contraseña de trabajador (al instante con internet, o la próxima vez que se abra). Sin internet se usa la última sesión válida.
- **Sin internet:** guarda una copia de los datos en el navegador para buscar; los cambios se suben al volver la conexión.
- Cinco contraseñas incorrectas bloquean el ingreso durante 1 minuto.

---

## Buscar similares con IA (solo administrador)

Botón **Buscar similares con IA** (en el inicio, y **Buscar más con IA** dentro del resultado de un modelo). Escribes un modelo, por ejemplo "iPhone 13", y la IA (Claude, de Anthropic) investiga qué otros modelos comparten el mismo **case** y/o el mismo **vidrio templado**. **No guarda nada sola: tú revisas y apruebas.**

**Cómo busca**
- Solo en sitios confiables (fichas oficiales de las marcas, GSMArena/Kimovil/PhoneArena y fabricantes de accesorios como Spigen, ESR, OtterBox…). La lista completa está en [`src/core/ai.js`](src/core/ai.js) y se ve en la pantalla.
- Te muestra las medidas, las fuentes (con enlace para que las abras) y la cita donde se nombran los modelos.

**Cómo se calcula la confianza** (lo hace el código de la app, no la IA, para que no pueda "dar por confirmado" algo sin evidencia)
- **Confirmada:** una fuente confiable que **de verdad apareció en la búsqueda** nombra al modelo y a los demás como compatibles con el mismo producto, **y** las medidas coinciden (case: alto y ancho ±0.3 mm, grosor ±0.4 mm; vidrio: ±0.5 mm y misma pantalla), **y** no hay diferencias avisadas.
- **Probable:** hay indicios en fuentes confiables, pero faltan datos o hay diferencias (por ejemplo, el fabricante lo lista pero las medidas no coinciden exacto).
- **Por verificar:** no hay evidencia suficiente. Se muestra, pero no queda marcado.
- Se descartan los enlaces inventados (que no salieron de la búsqueda) y los de sitios fuera de la lista.
- Solo los grupos **confirmados** quedan marcados de antemano. Guardar uno sin confirmar pide una segunda confirmación.

> **Ningún resultado es 100% seguro.** Los fabricantes cambian medidas, cámaras y bordes entre versiones. Aun con "Confirmada", verifica con el producto físico la primera vez que lo vendas. La nota del grupo queda con la fecha y las fuentes.

**Qué se guarda:** por cada grupo marcado, un grupo de compatibilidad con el modelo buscado + los modelos que dejes marcados. En vidrio eliges la clase (Normal por defecto, 9D, Privacy). Los modelos que ya existen se reutilizan.

**Costo (lo pagas tú a Anthropic):** cada consulta cuesta aprox. **entre US$0.05 y US$0.60**: tokens (según el modelo) más US$0.01 por búsqueda web (máximo 3, 6 o 10 por consulta, en Configuración). Al terminar la app muestra el costo real estimado. Puede tardar de 30 segundos a 3 minutos.

**Configurarla (una vez, en el dispositivo del administrador)**
1. Entra a <https://console.anthropic.com>, crea una cuenta y en **Billing** carga saldo (por ejemplo US$5).
2. En **Limits** pon un límite de gasto mensual.
3. En **API keys → Create key** copia la llave (empieza con `sk-ant-`).
4. En la app: **Configuración → Inteligencia artificial → Poner llave** y pégala.
5. Ahí mismo puedes elegir el modelo: **Opus 5.5** (el más preciso, por defecto), **Sonnet 5.5** (más económico) o **Haiku 5.5** (el más barato, menos confiable para investigar).

**Seguridad de la llave:** se guarda **solo en el navegador del administrador** (no en la nube ni en GitHub) y los trabajadores no la ven. Pero quien use ese navegador desbloqueado podría sacarla, y esta página comparte el dominio `iangods1.github.io` con otras páginas tuyas. Por eso: pon un **límite de gasto** en console.anthropic.com, no la pegues en dispositivos de otras personas, y si pierdes el dispositivo anúlala en **API keys → Delete**.

**Si falla:** el mensaje explica la causa (llave inválida, sin saldo, búsqueda web desactivada en tu cuenta de Anthropic —en console.anthropic.com → Settings—, demasiadas consultas, sin internet).

---

## Activarla en GitHub (una sola vez)

Cada cambio en `main` se prueba, se compila y se deja en la rama `gh-pages` (flujo **Publicar web**, pestaña **Actions**). Falta decirle a GitHub que muestre esa rama:

1. En este repositorio: **Settings** → **Pages** (menú izquierdo).
2. En **Build and deployment → Source** elige **Deploy from a branch**.
3. En **Branch** elige **gh-pages** y la carpeta **/ (root)** → **Save**.
4. Espera 1 o 2 minutos y abre el enlace de arriba.

Si `gh-pages` no aparece en la lista, abre la pestaña **Actions → Publicar web → Run workflow** y espera el ✓ verde.

## Usarla en el teléfono

- Abre el enlace (Safari en iPhone, Chrome en Android).
- **iPhone:** botón **Compartir** → **Añadir a pantalla de inicio**.
- **Android:** menú ⋮ → **Instalar aplicación**.
- La primera vez se necesita internet para entrar; después abre directo.

## Si al entrar aparece un error de Firebase

- **"La clave de Firebase no permite usar la web"**: registra la app web en Firebase. Consola de Firebase → tu proyecto `guastaccesorio-1c7b0` → ⚙️ **Configuración del proyecto** → **Tus apps** → **Agregar app** → **Web** (`</>`) → registrar. Copia el `firebaseConfig` que muestra y reemplaza el de [`src/config.js`](src/config.js).
- **`auth/unauthorized-domain`**: Firebase → **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `iangods1.github.io`.
- **"Firebase rechazó la operación"**: falta publicar las reglas de [`firestore.rules`](firestore.rules) en Firestore (pestaña **Reglas**).
- Además, deben estar activados en **Authentication → Método de acceso**: *Correo electrónico/contraseña* y *Anónimo*.

## Notas

- Usa **un solo dispositivo como administrador a la vez** (web o Android) para evitar cambios cruzados.
- Este sitio comparte el dominio `iangods1.github.io` con otras páginas tuyas (por ejemplo `/my-proyect/`). Cada una usa su propia ruta y su propia caché, y el service worker de esta página solo borra las cachés que empiezan con `guastaccesorio-`. Si otra página limpia las cachés del dominio, la copia sin internet de esta se vuelve a crear en la siguiente visita con internet.
- La clave que se guarda en la nube para la contraseña de trabajador se calcula igual que en Android (PBKDF2-HMAC-SHA256), así que un trabajador entra con la misma contraseña en las dos versiones. Hay una prueba que lo comprueba con valores calculados en Java.

## Para quien programe

```bash
npm ci
npm test            # pruebas de la lógica: búsqueda, importación, contraseñas, sesiones...
npm run build       # genera dist/ (lo que se publica)
npm run build:test  # versión con la nube simulada, para la prueba en navegador:
NODE_PATH=$(npm root -g) node e2e/smoke.cjs [carpeta-de-capturas]   # requiere Playwright
```

```
src/core/    Lógica sin dependencias: búsqueda, marcas, clases de vidrio, datos, CSV, Excel, contraseñas, IA (ai.js)
src/ui/      Pantallas: acceso, buscador, resultados, modelos, administración, grupo, configuración
src/auth.js  Contraseñas, roles, sesión permanente, bloqueo
src/backend-firebase.js  Acceso a Firebase · src/backend-memory.js  nube simulada (solo pruebas)
test/        Pruebas automáticas · e2e/ pruebas completas en navegador (smoke.cjs y ai.cjs, con la API simulada) · build.mjs genera dist/
```

La app Android está en el repositorio `my-proyect` (rama `claude/casematch-android-app-2a4r13`).
