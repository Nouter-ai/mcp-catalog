# Catálogo de MCP de nouter

Los servidores MCP remotos que [nouter](https://nouter.ai) ofrece a todas las empresas. Cada uno se instala en
cada espacio de trabajo como un conector, con el logo y la descripción de acá. Las credenciales nunca están en
este repo: cada persona conecta su propia cuenta.

## Qué entra

Servidores oficiales de su proveedor, remotos (`https`), con OAuth y que respaldemos para cualquier empresa. Para
cualquier otro, nouter tiene "Any MCP server" y los servidores propios de cada empresa.

## Proponer un servidor

1. Un archivo `servers/<id>.json` (ver `schema/entry.schema.json` y las entradas que ya están).
2. El logo en `logos/<id>.svg`, un SVG de una pieza con el color de la marca (como los de Simple Icons).
3. El id en `servers/order.json`, donde querés que aparezca.
4. Un PR. El CI valida la entrada y prueba que la URL responda como servidor MCP.

`registry` es el nombre del servidor en el [registro oficial de MCP](https://registry.modelcontextprotocol.io),
si está. Con él, el job semanal avisa si el proveedor cambió la URL o lo retiró.

## Versiones

Cada tag `vN` publica un release con `catalog.json`, la foto completa del catálogo. nouter fija una versión y
la sube con un PR propio.

## Desarrollo

Node 24, sin dependencias: `npm test`, `node scripts/validate.ts`, `node scripts/build.ts dev` y
`node scripts/sync.ts`.
