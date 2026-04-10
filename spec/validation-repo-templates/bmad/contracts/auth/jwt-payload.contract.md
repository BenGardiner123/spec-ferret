---
ferret:
  id: auth.jwt-payload
  type: api
  shape:
    type: object
    properties:
      id:
        type: string
      email:
        type: string
      token:
        type: string
      expiresAt:
        type: string
    required: [id, email, token, expiresAt]
  source:
    file: src/auth/jwt.ts
    symbol: JwtPayload
---

# JWT Payload Contract

Defines the shape of a decoded JWT payload.
Source: `JwtPayload` interface in `src/auth/jwt.ts`.
