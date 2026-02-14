# 020 – NestJS Standards

- Each service is a standalone NestJS app inside `services/`
- Use `@nestjs/swagger` for OpenAPI generation
- Shared DTOs / validation schemas live in `packages/schemas`
- Prefer constructor injection; avoid `@Inject` with string tokens
