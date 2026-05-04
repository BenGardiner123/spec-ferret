---
ferret:
  id: api.GET/example
  type: api
  shape:
    response:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
            format: uuid
          name:
            type: string
        required: [id, name]
---

# Example Endpoint

Replace this with your first real spec.
Everything below the frontmatter is free-form prose.
Ferret never reads it.
