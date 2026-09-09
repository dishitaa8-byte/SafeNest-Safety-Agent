---
name: OpenAPI codegen collisions
description: Orval naming behavior for generated Zod schemas and TypeScript parameter types.
---

When an operation has both a path parameter and a query parameter, Orval can generate the same `<OperationId>Params` name in both `api.ts` and `generated/types`, which breaks the shared typecheck through the barrel export.

**Why:** The generated Zod schema combines path parameters under the operation name while the generated TypeScript type uses the same operation name, creating a duplicate export.

**How to apply:** Prefer path-only or query-only parameter shapes for simple endpoints, or verify the generated barrel after changing an endpoint that combines both.