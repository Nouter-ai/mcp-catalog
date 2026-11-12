# Catálogo de MCP de nouter

Los servidores MCP remotos que [nouter](https://nouter.ai) ofrece a todas las empresas. Cada uno se instala en
cada espacio de trabajo como un conector, con el logo y la descripción de acá. Las credenciales nunca están en
este repo: cada persona conecta su propia cuenta.

## Qué entra

Servidores oficiales de su proveedor, remotos (`https`), con OAuth y que respaldemos para cualquier empresa. Para
cualquier otro, nouter tiene "Any MCP server" y los servidores propios de cada empresa.

## Formato de las entradas

Cada `servers/<id>.json` es un `server.json` del [MCP Registry](https://registry.modelcontextprotocol.io), en la versión
publicada que fija `schema/vendor/` (`2025-12-11`), con lo de nouter bajo `_meta["ai.nouter.directory"]`. Hay dos tipos:

- **Servidor MCP remoto:** con `remotes` (una URL `https`). El `name` es el del registro oficial si el servidor está ahí
  (`com.notion/mcp`) y `ai.nouter/<id>` si no. `title` es el nombre que se ve, `description` el tagline (hasta 60) y la
  descripción larga va en `_meta`. Si la URL depende de cada empresa, lleva un hueco `{campo}` como primera etiqueta del
  host, declarado en `remotes[].variables`. Si el servicio ya tiene gatekeeper nativo pero se ofrece como MCP hasta que su
  app OAuth esté, `_meta` lleva `nativeGatekeeper: "gatekeeper-<id>"`.
- **Gatekeeper nativo del OS:** sin `remotes`, con `_meta["ai.nouter.directory"].gatekeeper`: el paquete (`gatekeeper-<id>`),
  los ajustes que carga el admin (lo que el gatekeeper declara en su `deploy-inputs.json`), la app de nouter por el relay, el
  flag y las variables de zona. `offered: false` lo deja en el catálogo sin ofrecerlo.

Las dos clases llevan además los datos de la vidriera de Discover, bajo `_meta["ai.nouter.directory"]`: `categories`
(1 a 3 temas de `schema/categories.json`, el primero es el principal), `publisher` («Google»), `verified` y `signIn`
(`account`: cada persona entra con su cuenta; `company`: la empresa carga una clave o app y nadie entra; `none`).
`featured.json` lista las colecciones curadas del carrusel *Curated by Nouter* (ids de entradas que existan).

Cada release publica el registro estático en `registry.tar.gz` (`v0.1/servers.json`, `…/versions.json`, `latest` y cada
versión), con la forma de la API de un registro. Los gatekeepers nativos no están ahí: el estándar no tiene tipo para ellos.

## Proponer una entrada

1. Un archivo `servers/<id>.json` (ver `schema/entry.schema.json` y las entradas que ya están). **Si cambia la URL o la
   autenticación de una entrada, hay que subir su `version`**: cambiar la URL obliga a todos a reconectar.
2. El logo en `logos/<id>.svg`, un SVG de una pieza con el color de la marca (como los de Simple Icons).
3. El id en `servers/order.json`, donde querés que aparezca.
4. Un PR. El CI valida la entrada en dos capas (el estándar y las reglas de nouter) y prueba que la URL responda como
   servidor MCP.

Para quien revisa: el CI de un PR corre el código del propio PR, así que un PR de afuera puede cambiar las
pruebas. Antes de mergear, revisar que no toque `scripts/` ni `.github/`, o correr `node scripts/validate.ts
--probe origin/main` en local.

## Versiones

Cada tag `vN` publica un release con `catalog.json` (la foto completa del catálogo: MCP, nativos y los servicios con nativo pendiente) `directory.json` (el índice de lo que se muestra: las entradas con sus datos, su logo y `added`, la fecha del commit que la agregó, más los destacados) y `registry.tar.gz`. El job semanal avisa si un servidor del registro oficial cambió su URL o se retiró, y si el estándar publicó un esquema nuevo. nouter fija una versión y
la sube con un PR propio.

## Desarrollo

Node 24, sin dependencias: `npm test`, `node scripts/validate.ts`, `node scripts/build.ts dev` y
`node scripts/sync.ts`.
