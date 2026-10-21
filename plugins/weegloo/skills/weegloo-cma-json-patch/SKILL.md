---
name: weegloo-cma-json-patch
description: Weegloo CMA/ACMA updates - prefer HTTP PATCH with RFC 6902 JSON Patch over PUT for smaller payloads; PUT is always a full replacement, never partial. Use when implementing or reasoning about document updates.
---

# Weegloo CMA / ACMA - JSON Patch and document updates

## When to use

- When updating a document over the **CMA** or **ACMA** REST APIs (application code or design - agents still prefer **MCP tools** where applicable). **Which resources take `PATCH` differs by plane:** on **CMA** — **ContentType**, **Content**, and **Media** (plus many other management resources); on **ACMA** — **Content only** (ACMA **Media** is create/read/delete with **no update** endpoint, and **ContentType** is not an ACMA resource — it is CMA-only).
- When choosing between **full replacement** and **partial** updates.

## Prefer `PATCH` over `PUT` for updates

**Both** **`PUT`** and **`PATCH`** are valid for updates on these APIs. **Default to `PATCH`** with **JSON Patch** whenever the change can be expressed that way.

- **Why:** you send **only the operations** that mutate the document (add/remove/replace/…), so request bodies stay **small** and you avoid **re-serializing** a full resource when a few paths changed-**better for network use** and **payload size** than a typical **`PUT`**.
- **When `PUT` is appropriate:** replacing the **entire** representation, or when the **OpenAPI contract** for that operation clearly expects a **full** (or contract-specific) body and **`PATCH`** is not the better fit.

## PATCH and [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902)

- Weegloo exposes **HTTP `PATCH`** on these management APIs for **JSON Patch** documents.
- **Request header (mandatory):** set **`Content-Type: application/json-patch+json`** (RFC 6902 registration). Do not send a JSON Patch body with a generic `application/json` content type.
- The format follows **[RFC 6902 - JSON Patch](https://www.rfc-editor.org/rfc/rfc6902)**:
  - Body is a **JSON array** of operations.
  - Each operation has an **`op`**: `add`, `remove`, `replace`, `move`, or `copy` — nothing else. **`test` is defined by RFC 6902, but every Weegloo PATCH refuses it** — MCP `cma_PatchOne*` tools included — with `400 WEB400019`, `details.op: Not supported operation` (rule **`weegloo-global-rules`** › *Resource Updates*). For a precondition, read the resource first and send its `X-Weegloo-Version` with the PATCH instead.
  - **`path`** (and **`from`** where required) use **JSON Pointer** ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)).
- Confirm the **`PATCH`** URL and any extra headers (e.g. version) per resource in **OpenAPI** (canonical API doc URLs live only in **`weegloo-api-endpoints`** - do not duplicate them here).

## PUT - always a full replacement

- **`PUT`** remains valid for updates.
- Send the **full** resource value — the whole representation, every time.
- **`PUT` is never partial on Weegloo.** Every CMA / ACMA update operation states *"Partial updates are not supported"*: a key you omit is wiped, with a **200** and no warning — including keys Swagger leaves out of `required` (`metadata`, `displayField`). Send the full value, or use `PATCH`.
- For **small or localized edits**, still **prefer `PATCH` + JSON Patch** (see **Prefer `PATCH` over `PUT`**) so the client sends **explicit operations** rather than a larger **`PUT`** body when **`PATCH`** can express the same change.

## Media - PATCH edits metadata only, never the file

- A Media `PATCH` (`cma_PatchOneMedia`) edits only `title` / `description`. The file itself (`fields.file`, the uploaded binary) is never changed by it: any op whose `path` is under `/fields/file/…` is refused **`400 WEB400011`** *Invalid patch request*. The error does not name the cause — do not retry path or op variants.
- **To replace the file, `PUT` the Media** (`cma_UpdateOneMedia`, with the current `sys.version`): upload the new file first to get a new `Upload`, then send the **whole** document — `title`, `description`, `metadata.tags`, and `file.{locale}` in the create shape (`fileName`, `contentType`, `upload` → the new Upload; **`weegloo-upload-api`** → Step 2a). Anything left out is wiped.

```jsonc
// PATCH: metadata only
[{ "op": "replace", "path": "/fields/title/en-US", "value": "Side shot (edited)" }]

// PUT: replace the file (the whole document)
{
  "fields": {
    "title":       { "en-US": "Side shot" },
    "description": { "en-US": "Product shot on a white background." },
    "file": {
      "en-US": {
        "fileName":    "rotated-90.mp4",
        "contentType": "video/mp4",
        "upload":      { "sys": { "id": "<new Upload.sys.id>", "type": "Refer", "targetType": "Upload" } }
      }
    }
  },
  "metadata": { "tags": [] }
}
```

- **Replace in place; do not create a new Media for it.** The `PUT` keeps the `sys.id`, so every `Refer → Media` on Content follows the new file. A new Media leaves those `Refer`s on the old one — the old file keeps showing, with no error.
- After the `PUT` the file is processed again (`state: PENDING`) and the Media is **published again automatically** once processing finishes — wait for it (**`weegloo-media-lifecycle`**) instead of calling `cma_PublishOneMedia`; `X-Weegloo-Ignore-Publish: true` turns that republish off. Until processing ends, another update or a delete is refused `WGL422031`.
- A Media with files under **several** locales: the docs only describe the replaced locale carrying a new `upload`. Whether another locale's already-processed file object may be resent unchanged is not documented — read the Media first and confirm before relying on it.
- **ACMA has no Media update endpoint at all** (see **When to use**), so a Service User's file swap is a new Media plus re-pointing the Content's `Refer` at it.

## Practical notes

- Apply **`X-Weegloo-Version`** (or the project’s version header) when the API requires optimistic concurrency - unchanged from other CMA write operations.
- A `path` is a JSON Pointer that mirrors the body, e.g. `/fields/title/en-US` on Content or Media.
- **Agents:** use **MCP** `cma_*` tools when the user asks for console-style operations; use this skill when writing or reviewing **HTTP client code** that calls CMA/ACMA directly. The same PATCH-over-PUT default applies to those tool calls — a partial edit is **`cma_PatchOneContentOfContentType`** / **`cma_PatchOneContentType`** / **`cma_PatchOneMedia`** (metadata only — a file swap is `cma_UpdateOneMedia`, see **Media** above), not the matching `cma_UpdateOne*`.

## Related

- Base URLs, Accept header, Swagger: **`weegloo-api-endpoints`** rule.
