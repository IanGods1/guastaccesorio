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

## Apariencia: cambiar el color de la app

El botón **paleta** 🎨 (arriba a la derecha en el inicio, y **Configuración → Apariencia**) abre el selector:

- **Color:** Azul marino (el de siempre), Azul, Turquesa, Verde, Morado, Granate, Naranja, Grafito, o **Otro** para elegir cualquier color con la rueda del teléfono. El cambio se ve al instante, con una vista previa.
- **Modo:** Sistema, Claro u Oscuro.
- Se guarda **en cada dispositivo**: cada persona (administrador o trabajador) elige el suyo; no cambia el de los demás.
- Cualquier color que elijas genera sus propios tonos claros y oscuros, y el código **ajusta la intensidad para que el texto siempre se lea bien** (hay pruebas automáticas de contraste con 360 tonos).
- También cambia el color de la barra del navegador del teléfono.

La web tiene un diseño nuevo: buscador grande con degradado, accesos en mosaicos, avatares con el color de cada marca, pestañas tipo píldora, tarjetas suaves y animaciones discretas (se desactivan si el teléfono pide menos movimiento).

> Si en una versión anterior guardaste una llave de IA en este navegador, la web la borra sola. Si llegaste a crearla en console.anthropic.com, anúlala allí (API keys).

---

## Teléfonos nuevos (automático)

El botón **Teléfonos nuevos** muestra los lanzamientos de las marcas populares (Apple, Samsung, Xiaomi, Motorola, Huawei, Honor, Google, OnePlus, Oppo, Realme, Vivo, Nokia, Infinix, Tecno), con botones por marca. Cada día, GitHub busca solo los nuevos en Wikidata (flujo "Buscar teléfonos nuevos"), guarda `data/novedades.json` y vuelve a publicar la web. Para buscar ya: Actions → "Buscar teléfonos nuevos" → Run workflow. El administrador puede agregar uno o todos a su lista de modelos con un toque. Wikidata puede tardar en tener un modelo recién salido.

## Modelos nuevos

En el inicio, el botón **Modelos nuevos** (para todos) muestra los últimos 30 modelos que se agregaron, el más reciente arriba. Arriba hay botones por marca (Todas, Apple, Samsung…) para ver solo los nuevos de una marca. Tocar uno abre su compatibilidad.

## Escanear lista (foto)

Solo para el administrador: botón **Escanear lista** en el inicio (y en Administrar datos). Elige el tipo de lista (Case, Vidrio normal, 9D o privacy), toma la foto o elígela de la galería y los grupos de compatibles se agregan y se suben solos a esa categoría. Cada renglón con varios modelos (separados por coma, "/", "-" o "+"), o cada bloque separado por un espacio, es un grupo. Siempre queda **Deshacer lo que agregué**. Si desmarcas "Subir solo, sin revisar antes", primero te muestra el texto leído para que lo corrijas. La lectura se hace en el teléfono (la foto no se envía a ningún lado). Prueba en navegador: `npm run build:test && NODE_PATH=$(npm root -g) node e2e/scan.cjs`.

## Pegar información de una IA

Solo para el administrador (botón **Pegar información** en el inicio).

1. Escribe el modelo (ej. "iPhone 13") y toca **Copiar la pregunta para la IA**. Pégala en ChatGPT, Claude u otra IA: la pregunta ya le pide la respuesta en el formato que la app entiende.
2. Copia la respuesta de la IA y pégala en el cuadro (o toca **Pegar del portapapeles**).
3. Revisa la vista previa (qué grupos y modelos son nuevos y cuáles ya existen) y toca **Agregar y subir a la nube**. Los trabajadores lo ven en segundos.

- **Desde una foto:** en el paso 2 toca **Leer una lista desde una foto**, elige si la lista es de Case o de vidrio (normal, 9D o privacy) y toma o elige la foto. La app lee el texto en el propio teléfono (la imagen no se envía a ningún lado) y arma los grupos: cada renglón con varios modelos separados por coma, "/", "-" o "+", o cada bloque separado por un espacio en blanco, es un grupo de compatibles. El texto queda en el cuadro para que lo corrijas y luego revises la vista previa. La primera vez descarga el lector (unos 10 MB). Funciona mejor con foto recta, cerca y con buena luz.
- **Subir automáticamente:** marca "Agregar y subir solo al pegar" y se agrega al pegar, sin tocar el botón. Si el texto no se entiende, no agrega nada.
- **Deshacer:** después de agregar aparece "Deshacer lo que agregué", que también lo quita de la nube.
- Entiende listas ("Case: iPhone 13, iPhone 14"), abreviaciones ("iPhone 13/14/15"), viñetas, y tablas de Markdown, CSV o Excel pegado. Si pegas algo que ya existe, no se duplica.
- La información viene de la IA y puede tener errores: verifícala con el producto antes de venderlo.

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
src/core/    Lógica sin dependencias: búsqueda, marcas, clases de vidrio, datos, CSV, Excel, contraseñas
src/ui/      Pantallas: acceso, buscador, resultados, modelos, administración, grupo, configuración, apariencia
src/core/theme.js  Colores: genera los tonos claros y oscuros de cualquier color y cuida el contraste
src/auth.js  Contraseñas, roles, sesión permanente, bloqueo
src/backend-firebase.js  Acceso a Firebase · src/backend-memory.js  nube simulada (solo pruebas)
test/        Pruebas automáticas · e2e/ prueba completa en navegador · build.mjs genera dist/
```

La app Android está en el repositorio `my-proyect` (rama `claude/casematch-android-app-2a4r13`).
