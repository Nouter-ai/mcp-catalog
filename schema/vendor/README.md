# Esquema del estándar, fijado

`server.schema.json` es el esquema **publicado** de `server.json` del [MCP Registry](https://github.com/modelcontextprotocol/registry),
versión `2025-12-11`, copiado sin cambios de https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json (2026-11-12). Es lo que el registro oficial pide en `$schema`, y la fuente
de los topes que valida `scripts/server-check.ts`. El draft (sin publicar) trae cambios que todavía no valen
(por ejemplo, URLs que empiezan con una variable): no se usa. Para actualizarlo, bajar la versión nueva, cambiar
`SCHEMA_URL` en `scripts/server-json.ts`, los `$schema` de `servers/` y correr `npm test`.
