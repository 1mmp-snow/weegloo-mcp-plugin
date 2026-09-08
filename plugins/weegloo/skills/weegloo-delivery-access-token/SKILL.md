---
name: weegloo-delivery-access-token
description: Create Weegloo DeliveryAccessToken (CDA) via CMA-bind role.sys.id to the intended least-privilege SpaceRole only; never Administrator or first list item; handle WGL422001 without fallback. ALSO covers allowedReferrers — restricting the origins a token is accepted from (a browser-only, Referer-based lever, with subdomain-wildcard and exact-path rules, that a full-replacement update silently clears) — use when asked to lock a CDA/delivery token to a domain or site. Skill text in English only.
---

# Weegloo Delivery Access Token (CDA)

## When to use

- When creating a **`DeliveryAccessToken`** for the **CDA API** (browser or server read-only clients), via MCP **`cma_CreateDeliveryAccessToken`** or equivalent CMA flow.
- When the user asks for a “CDA token”, “delivery token”, or browser-exposed **`DELIVERY_ACCESS_TOKEN`** / `NEXT_PUBLIC_*`-style provisioning backed by a new token.

## Why this skill exists

**`cma_CreateDeliveryAccessToken`** requires a **`role`**: a **`Refer`** to a **`SpaceRole`**. Agents often pass the **wrong** role-typically the **first** entry from **`cma_GetListSpaceRoles`** (**Administrator**)-or **replace** the intended least-privilege role after an error. Tokens used in browsers must be **least-privilege** only.

---

## Mandatory rules

1. **Never** create a **`DeliveryAccessToken`** using the **Administrator** **`SpaceRole`** (or any role with **broad write/admin** access). **No exceptions** in agent workflows; if the user insists, refuse and explain; they may use the console themselves.

2. **Bind `role` to the intended `SpaceRole` by `sys.id`.** If you just created a read-only **`SpaceRole`** for CDA, **`cma_CreateDeliveryAccessToken`** MUST set **`role.sys.id`** to **that** role’s **`sys.id`** from the **`cma_CreateSpaceRole`** response (or from **`cma_GetOneSpaceRole`** for a user-approved role). **Do not** substitute another id from a fresh list; **do not** use Administrator.

3. **Preferred order:** **`cma_CreateSpaceRole`** (read-only for the **`ContentType`s** CDA needs) → copy **`sys.id`** from the response → **`cma_CreateDeliveryAccessToken`** with **`role`** referencing **only** that id. Permission rule design (`createdBy`, **`:self`**, `contentType` filters): **`weegloo-space-role`** skill. OpenAPI: **`weegloo-api-endpoints`** (do not duplicate URLs here).

   **Caller permission:** issuing a DAT requires **`SETTING_DELIVERY_ACCESS_TOKEN`** on the caller's role `settings` list — a distinct action from `SETTING_SPACE_ACCESS_TOKEN`, so the right to issue a read-only delivery token can be granted **without** the right to mint write-capable `SpaceAccessToken`s. Like the whole `settings` axis, it is usable **only from a console login session or a Personal Access Token** — a `SpaceAccessToken` cannot issue a DAT whatever its bound role says.

4. **Required `role` shape:**

```json
"role": {
  "sys": {
    "type": "Refer",
    "id": "<SpaceRole_sys_id>",
    "targetType": "SpaceRole"
  }
}
```

5. **If you cannot create a `SpaceRole`:** call **`cma_GetListSpaceRoles`**, show **non-Administrator** roles with **`name`** and **`sys.id`**, **require the user to choose `sys.id`**, then use **only** that id. **Do not** default to the first list item.

6. **Never** pick a **`SpaceRole`** silently.

---

## Restricting where the token may be used (`allowedReferrers`)

A **`DeliveryAccessToken`** may name the origins it is accepted from. **`allowedReferrers`** is an optional list of origins on create and update — at most **50** entries, no duplicates — and an **empty list places no restriction**. It narrows *where* a leaked token still works; it never narrows *what* the token can read, so it is a second line of defence and **not** a substitute for the least-privilege role above.

- Requests are judged on the **`Referer`** header, which makes this a **browser-only** lever. While the list is non-empty, a request arriving **without a `Referer` (or with an empty one) is refused** — that is every server-side caller (`fetch` from a backend, curl, native apps) and any page whose **`Referrer-Policy`** strips the header. Leave the list empty for a token that does not run in a browser.
- An entry is an origin — `https://app.example.com` — optionally with a path. **`https`** only, except **`http`** for `localhost`, `127.0.0.1` and `[::1]`. The **port is part of the match** (443 for `https`, 80 for `http`, when unwritten).
- A wildcard is allowed **only** as a leading **`*.`** label and matches **subdomains only**: `https://*.example.com` covers `app.example.com` but **not** the apex `https://example.com`. List the apex as its own entry when you need both.
- A path is compared for **equality**, not as a prefix: `https://app.example.com/admin` does not cover `/admin/users`. Give an origin with no path unless you mean one exact page. No wildcard in a path, and both host and path must be **ASCII** — punycode an internationalised domain, percent-encode the path.
- **A bare origin and a trailing slash mean the same thing — no path restriction.** `https://app.example.com` and `https://app.example.com/` both match **every** page on that origin; neither pins the request to the site root. Only a path with something in it (`/admin`) restricts anything.
- Query strings, fragments and userinfo are not part of an entry, and a malformed entry is **rejected when the token is saved** rather than silently dropped.

**Update replaces the whole field.** **`cma_UpdateOneDeliveryAccessToken`** is a full replacement, so a call that omits **`allowedReferrers`** **clears the restriction**. When you update anything else on the token, resend the current list — read it back from **`cma_GetOneDeliveryAccessToken`** first if you do not already hold it.

---

## Error `WGL422001` (cannot assign permission you do not own)

If **`cma_CreateDeliveryAccessToken`** fails with an ownership / permission error while using the **correct** least-privilege **`SpaceRole`**:

- **Do not** fall back to **Administrator**.
- **Do:** explain; options include creating the token in the **Weegloo console** with the same **`SpaceRole`**, or using a CMA principal that may assign that role.

Do **not** treat Administrator as an acceptable workaround for **public, browser-exposed** delivery tokens.

---

## Suggested workflow

1. Identify **published `ContentType`s** CDA must read.
2. **`cma_CreateSpaceRole`** with read-only rules and a clear **`name`** (product-specific; chosen by the team).
3. **`sys.id`** from the **create response** → pass into **`cma_CreateDeliveryAccessToken`** as **`role.sys.id`**.
4. If step 3 fails with **`WGL422001`**: follow the section above-**no** Administrator fallback.

---

## MCP tools (typical)

| Step | MCP tool |
|------|----------|
| List roles | `cma_GetListSpaceRoles` |
| Inspect one role | `cma_GetOneSpaceRole` |
| Create least-privilege role | `cma_CreateSpaceRole` |
| Create token | `cma_CreateDeliveryAccessToken` |
| Read one token (e.g. its current `allowedReferrers`) | `cma_GetOneDeliveryAccessToken` |
| Update a token (full replacement — resend `allowedReferrers`) | `cma_UpdateOneDeliveryAccessToken` |

Schema: **`weegloo-api-endpoints`** → CMA OpenAPI (**`CreateDeliveryAccessToken`**).

---

## Related

- **`weegloo-space-role`** — permission maps, **`createdBy.sys.id`**, **`:self`**, per-user private Content.
- **`weegloo-space-access-token`** — the **write-capable** sibling (CMA data + CDA + Upload, one Space, bound role). Use it when the client needs to write; a DeliveryAccessToken is read-only.

## Important

- Use **MCP** for CMA per project rules where applicable.
- Tokens shipped to the **browser** are **public**—least privilege is mandatory.
- **`allowedReferrers`** limits **where** a token works, never **what** it can read; scope the role first, then add the origin list. An update that omits the field clears it.
- Administrator-backed delivery tokens are **not** acceptable for typical **public, browser-exposed** CDA clients.
