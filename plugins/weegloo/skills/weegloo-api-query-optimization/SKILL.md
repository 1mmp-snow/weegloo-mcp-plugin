---
name: weegloo-api-query-optimization
description: Weegloo list APIs - projection with select (include/exclude, object paths), list-as-single via sys.id, batch fetch with sys.id[in], prefetch sys.version for PATCH/PUT, and CMA Media mimeGroups filtering. Use to shrink payloads, avoid redundant reference expansion, and replace N single GETs with one list call. ALSO covers the two list-driven UI patterns — master/detail (lightweight list/sidebar + on-click single-Content detail fetch) and all-rows-have-images (gallery/card grid that resolves Media at the list level via `include`) — and resolving a Refer→Media image/file field to a displayable URL. Use when building a history list, inbox, search results, gallery, card grid, or any list-then-open-item UI.
---

# Weegloo - query optimization for list APIs

## When to use

- Designing or reviewing **HTTP** calls to Weegloo **list** endpoints (CMA, CDA, or other documented list APIs) where **payload size**, **latency**, or **request count** matter.
- Combining **`select`** with **`include`** (reference expansion) so expanded linked resources do not bloat the response.
- Replacing **one GET-by-id** when you only need a **subset of fields**, or replacing **many GET-by-id** calls with **one filtered list**.
- Loading **`sys.id`** and **`sys.version`** before **`PATCH`** or **`PUT`** without paying for a full **single-resource GET** on each id.

Base URLs and API documentation: **`weegloo-api-endpoints`** (do not duplicate doc links here).

---

## 1. Projection: the `select` query parameter

On **resource list** endpoints, use **`select`** to control which parts of each item appear in the JSON. Smaller responses mean **less network** and **lower parsing cost**.

### Include mode (whitelist)

Only the listed paths are returned:

- Example: **`?select=sys.id,fields.title`**
- Response items contain **`sys.id`** and **`fields.title`** (plus whatever the API always returns by contract-confirm in OpenAPI).

### Exclude mode (blacklist)

Prefix each path with **`-`** to **omit** that fragment:

- Example: **`?select=-sys.id,-fields.title`**
- Those fragments are **not** present in the response.

### Include and exclude are mutually exclusive

You **cannot** mix whitelist and blacklist in one **`select`**:

- **Invalid:** **`?select=sys.id,-fields.title`**

Choose **either** all-inclusive paths **or** all-negative paths for a single request.

### Object-level paths

You may select whole nested objects when the API allows it, for example:

- **`?select=sys`** - restrict or focus the **`sys`** object as a unit (exact semantics per endpoint; see Swagger).

### Interaction with `order`

If the request uses **`order`**, **every sort key** must still be **present** in the projected representation. Sorting relies on those values; **`select`** must not strip them out.

- **Include mode:** list every path that appears in **`order`** (or select a **parent** path that still contains those leaf values-confirm behavior in OpenAPI).
- **Exclude mode:** do **not** prefix any **`order`** path with **`-`** (e.g. if **`?order=sys.id,fields.name`**, avoid **`-sys.id`** or **`-fields.name`** in **`select`**).

Example: **`?order=sys.id,fields.name`** together with **`select`** → keep **`sys.id`** and **`fields.name`** reachable in the response.

### Interaction with `include` (reference expansion)

If the request uses **`?include=`** (or equivalent) so that **linked references** are **expanded** in the response, **`select`** becomes **especially important**: expansion can pull in **full linked documents** (e.g. a **Space**).

When you **do not** need those linked details:

- Prefer **`select`** to **drop** or **narrow** the corresponding branches (e.g. the **space** subtree) so that **expanded Space payloads** are not shipped unnecessarily.

Otherwise, **`include`** may undo optimization by enlarging the body with nested resource graphs.

---

## 2. “Single resource” shape when projection is list-only

**Projection (`select`) applies to list endpoints**, not to the dedicated **single-resource-by-id** GET in the usual sense.

To get **one** item **with** projection:

1. Call the **same list** endpoint used for collections.
2. Filter to that id: **`?sys.id={resourceId}`** (exact parameter name and filter syntax per OpenAPI-**`sys.id`** is the typical filter for a single id).
3. Add projection as needed, e.g. **`&select=sys.id`** (or any allowed **`select`** expression).

Effectively this yields **one row** (or an empty list) with **controlled fields**, analogous to a **single fetch** optimized for payload.

---

## 3. Many ids: prefer one list + `sys.id[in]` over N GETs

To load **several** resources by id:

- **Avoid:** **`N`** separate **GET single-resource** requests (worst case **`N`** round trips and **`N`** full bodies).
- **Prefer:** **one** **list** request with an **in** filter on **`sys.id`**, for example:

  **`?sys.id[in]=1,2,3,4,5`**

(Use the **documented** delimiter, parameter name, and encoding from OpenAPI-**`sys.id[in]`** is the usual pattern for “any of these ids”.)

This is generally **better for latency** (fewer requests) and **network usage** (one response envelope, optional **`select`** to cap size).

Combine with **`select`** from section 1 when you do not need full documents.

---

## 4. `sys.version` before `PATCH` or `PUT`

Updates on **CMA** / **ACMA** (and similar) usually require the **current** **`sys.version`** so the server can enforce **optimistic concurrency** (e.g. via **`X-Weegloo-Version`** or the contract in OpenAPI-see **`weegloo-cma-json-patch`**). You only need **`sys.id`** and **`sys.version`** in the read phase; you do **not** need the **dedicated single-resource GET** for that.

**Prefer the list endpoint** with a **tight `select`:**

| Goal | Suggested query (illustrative) |
|------|--------------------------------|
| **One** resource | **`?sys.id={resourceId}&select=sys.id,sys.version`** |
| **Several** resources (bulk follow-up patches) | **`?sys.id[in]=1,2,3,4,5&select=sys.id,sys.version`** |

This matches the patterns in **§2** and **§3**: list + filter + projection. Response **`items`** give you each id with its **current version** in a **small** payload-**fewer round trips** and **less data** than **`N`** full **GET-by-id** responses.

Filter syntax (**`sys.id`**, **`sys.id[in]`**, delimiters) is defined per API in **OpenAPI**.

---

## 5. Media list: filter by logical type (`mimeGroups`)

On **CMA** **`GET .../spaces/{spaceId}/medias`**, add **`fields.file.{locale}.mimeGroups={MimeGroup}`** so the API returns only assets in that **category** (e.g. **`Image`**, **`Video`**, **`Audio`**, **`Code`**)-smaller **`items`** than an unfiltered list. Use the same **`{locale}`** you use for **`fields.file`** (often the space default locale).

**Allowed `MimeGroup` values** and full URL examples: **`weegloo-api-endpoints`** rule → *CMA Media list - filter by `mimeGroups`*.

---

## 6. List-driven UIs: master/detail vs all-rows-have-images

§2–§3 optimize **bulk** loading (one list instead of many GETs). They do **NOT** tell you how to
render a UI from a list. Two list-driven UIs need **opposite** fetch strategies — decide which one
you are building **before** you write the query:

- **(A) Master/detail** — a lightweight list/sidebar whose rows are *labels*, where opening a row
  reveals the rest (history list, inbox, search results → item page). The list stays small; image
  and detail data load lazily **on click**.
- **(B) All-rows-have-images** — a gallery, card grid, or cover/banner list where **every row must
  itself show a thumbnail/cover**, often with no separate "open" step (or the same data backs both a
  card and a banner). Here you resolve images **at the list level, on purpose**.

Getting the split wrong is a common mistake in **both** directions: rendering full detail straight
from a master/detail list, or — the opposite — forgetting `include=1` on a gallery list so every
cover comes back as an unresolved `Refer` and renders blank.

### (A) Master/detail: lightweight list + on-select detail fetch

- **List (sidebar): fetch a lightweight projection per row** — `sys.id` plus the human-readable
  **label field you will display** (e.g. `fields.prompt`, `fields.title`). Use `select` to keep rows
  small, and **always project and render a meaningful label**, never just a bare id. (A label-less
  row of thumbnails is pattern **(B)**, not this — see below.) A master/detail sidebar that shows no
  title/prompt text is a defect, not an optimization.
- **Detail (on click): fetch that ONE Content by id, lazily.** Hit the single-Content endpoint for
  the selected item — `…/content-types/{contentTypeId}/contents/{contentId}` (on ACMA/ACDA always
  nested under the ContentType; see **`weegloo-api-endpoints`**). This lazy by-id GET is **correct
  and expected**. The "avoid N GETs" guidance in §3 is about loading a *batch* up front — it is
  **not** a reason to skip the detail fetch for the *one* item the user actually opened, nor to try
  to cram every row's full detail into the initial list call.

**Rendering the selected item's Media (image / file fields).** A field that points at an asset (e.g.
`fields.image1`…`fields.image4`, `fields.file`) is a **Refer → Media**, **not** a ready-to-use URL
string. On the **detail** fetch, expand the reference (`?include=1`) — or follow up with a Media
fetch — and read the file URL from the **Media's** `fields.file` (locale shape per
**`weegloo-default-locale`**); confirm the Media is deliverable first (**`weegloo-media-lifecycle`**).
In this pattern, **do not** try to render images straight from the master list: pulling every row's
media up front defeats the lightweight-list goal, and the reliable place to read the image is the
per-item detail fetch. (If every row genuinely needs its image, you are building pattern **(B)** —
resolve at the list level instead.)

### (B) All-rows-have-images: resolve Media at the list level with `include`

When the UI requires a thumbnail/cover on **every** row (gallery, card grid, cover banner) and there
is no separate detail fetch to defer to, resolving images from the list response is **correct — not
an anti-pattern**. Do it deliberately:

1. **Add `include=1` to the list call.** This is the most common omission: without it,
   `fields.<refer>` comes back as a bare `sys.id` and every image renders blank.
2. **Build a `{ mediaId → fileUrl }` map** from the response's sibling **`include.Media`** object
   (singular `include`, PascalCase `Media`), then resolve each row's `fields.<refer>.sys.id` against
   that map.
3. **Read the file URL in the shape the plane returns** — flat `media.fields.file.url` on a default
   **CDA/ACDA** delivery read, bucketed `media.fields.file[locale].url` on **management** (CMA/ACMA).
   The exact `include.Media` shape and the flat-vs-bucket rule are documented in
   **`weegloo-default-locale`** — follow it; do not re-derive it here.
4. **Caveats still apply** (the kernel of the pattern-A warning):
   - List-level `include` does **not** guarantee every `Refer` resolves to a deliverable URL —
     confirm each Media is published/deliverable (**`weegloo-media-lifecycle`**) and handle rows
     whose media is missing or still processing.
   - You are pulling every row's media up front: that is the right trade-off **only** when the UI
     actually shows all of them. For a label-first sidebar, use pattern **(A)**.

---

## Related

- **Endpoints and headers:** **`weegloo-api-endpoints`** rule.
- **Pagination:** **`weegloo-list-pagination`** skill (`links.next`, first-page params).
- **PATCH/PUT, JSON Patch, version headers:** **`weegloo-cma-json-patch`** skill.
