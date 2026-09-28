# Shape B — the PG POSTs to a Script

Read this **only when the provider pushes to you**: a webhook / callback / notification URL you
register in the provider's console. If your frontend can *ask* the PG whether the payment went
through, that is shape A and it is complete in `SKILL.md` (§4, *A. Confirm*) — add B only for money
that moves without your frontend being there; card checkout stays A. On the Toss default the one push
you may need is the **가상계좌 deposit notification** (`SKILL.md` §3), registered from the user's own
Toss account (개발자센터 → 웹훅). Its check is not a signature — see *The Toss 가상계좌 deposit* at the
end; for any other push, how or whether the provider signs a delivery is read in its docs (B-1, B-3),
never assumed.

## B-1. Which endpoint the PG posts to (read this before designing the flow)

There are two, and one question picks for you:

> **Can this provider send a custom HTTP header with its webhook?**

**Answer it from the provider's own webhook/notification documentation, per integration.** Do not
assume, and do not trust a list — the answer differs by provider, by product line within a provider,
and changes over time. Some let you attach arbitrary headers (or HTTP basic auth) to a notification
endpoint; many only POST to whatever URL you paste in. Look it up before choosing a path.

| If it can… | Register this URL | What authenticates the call |
|---|---|---|
| send a **custom header** | `https://script.weegloo.com/v1/spaces/{spaceId}/scripts/{scriptId}/execute` | a **`SpaceAccessToken`** in `Authorization: Bearer …` **and** the Script's signature check |
| only POST to a **bare URL** | `https://script.weegloo.com/v1/spaces/{spaceId}/scripts/{scriptId}/execute/anonymous` | the Script's **signature check alone** |

The URL you paste into the provider's console is the **full** one above — Script execution is served by
`script.weegloo.com`, not the CMA host (`weegloo-api-endpoints`).

**Prefer the token path whenever the provider supports it** — two independent gates beat one, and an
endpoint that answers only to a known token never runs on someone else's traffic at all.

**Token path.** Bind the token to a **`SpaceRole` whose only grant is `script.Execute` scoped with the
`self` filter** to that one Script, so a leaked callback token buys nothing but the right to invoke
that one endpoint. See `weegloo-space-access-token` and `weegloo-space-role`.

```jsonc
// the SpaceRole bound to the callback token — nothing else granted
"script": { "Execute": { "Allow": [ { "self": { "sys": {
    "id": "<scriptId>", "type": "Refer", "targetType": "Script" } } } ] } }
```

**Anonymous path.** Set **`anonymousCallEnabled: true`** on the Script and register
`…/execute/anonymous`. No token is involved — a presented one is ignored — so:

- ⚠️ **The signature check IS the authentication.** Not a precaution: it is the only thing between the
  open internet and a Script that runs with its author's authority. Verify first, return `401` on
  failure, and do nothing before that (B-2).
- The run is attributed to the **Script's author** (`sys.createdBy` on every write), since there is no
  caller to attribute to. No role permission is consulted — the flag is the whole decision.
- The Script may not use the **`:self`** filter — refused when the Script is saved
  (**`WGL400061`**); with no caller to resolve it to, an ownership filter would widen to the author's
  own rows. Match the order on the reference the provider sends back instead — for Toss, the
  `orderId` in the notification body.
- Anonymous calls still consume the Organization's Script-execution quota and nothing rate-limits
  them, so do not leave the flag on for a Script that verifies nothing.

Either way the Script's **`directCallEnabled` must be `true`** (the default); `false` means it runs
only as a Webhook's linked action and both endpoints reject the call with **`WGL422062`**.

**A Weegloo `Webhook` is not this.** That reacts to *Space* events (Content created, …), not to a
third party calling in. See `weegloo-webhook`.

## B-2. Verify the signature as the FIRST statement

`Signature`, `Hash` and `Regex` are pure computation, so a Script that only verifies and writes answers
the PG in milliseconds with a genuine `200`. **Keep `Http` out of a callback receiver** — an outbound
call the provider has to wait for turns a receiver that should be instant into one that can exceed the
provider's own timeout, and a PG that stopped waiting treats the delivery as failed and retries. If you
must call out, verify + record here and let a `Webhook` on that write do the rest.

```jsonc
{ "type": "Signature", "name": "verified", "algorithm": "SHA256",
  "secret": "<webhook signing secret>",
  "value": "{ /rawPayload }",
  "expected": "{ /headers/x-provider-signature }" },

{ "type": "If", "condition": { "!": "{ /verified }" },
  "then": [ { "type": "Return", "isError": true, "statusCode": 401, "value": "bad signature" } ] }
```

- **Sign `{ /rawPayload }`** — the caller's body exactly as received. A re-serialized object has
  different bytes and will never match.
- Header names arrive **lower-cased**, whatever case the provider sent: `{ /headers/x-provider-signature }`.
- **Nothing before the check.** No read, no write, no `SetVar` off the payload.

## B-3. Read the provider's scheme, then map its shape to statements

**Start by extracting four things from the provider's signature documentation** — these are what the
statements need, and guessing any of them produces a check that fails every time:

1. **Which header** carries the signature, and whether it holds the bare code or a packed structure.
2. **What exactly is signed** — the raw body alone, or a string built from it (a timestamp, a message
   id, a joined field list). Byte-for-byte.
3. **How the code is written** — hex or base64. (You do not have to act on this: `Signature` accepts
   either. Worth knowing so you can tell a wrong scheme from a wrong encoding.)
4. **How the secret was issued to you** — plain text, hex, or base64. This one you *must* act on
   (`secretEncoding`); the wrong choice is a different key and never matches.

Then map the shape you found. This table is the **shape → statement** vocabulary, not a claim about
any provider:

| The scheme's shape | Statements |
|---|---|
| Keyed hash of the raw body, code sits alone in a header | `Signature` |
| Signing key issued **hex**- or **base64**-encoded | `Signature` + `secretEncoding: "Hex"` / `"Base64"` |
| Signature header packs several values, e.g. `t=…,v1=…` or `ts=…;h1=…`, and the timestamp is part of the signed message | `Regex` `Capture` → `Signature` over `"{ /sig/1 }.{ /rawPayload }"` |
| Signed message joins values from **separate** headers | `Signature` over `"{ /headers/a }.{ /headers/b }.{ /rawPayload }"` |
| **Keyless** salted digest — a hash of concatenated fields *including* a shared secret | `Hash` + compare with `$===` |
| Legacy `MD5(…)` digest | `Hash` with `algorithm: "MD5"` |
| Asymmetric signature (RSA/ECDSA), or a scheme requiring a fetched certificate | **not covered** — `Signature` is keyed-hash only; use shape A instead |

**Packed header, end to end** — the header here holds `t=<timestamp>,v1=<hex>` and the signed message
is `"{timestamp}.{body}"`; adapt the pattern and the assembled message to the scheme you read:

```jsonc
{ "type": "Regex", "name": "sig", "mode": "Capture",
  "pattern": "^t=(\\d+),v1=([0-9a-f]{64})$",
  "value": "{ /headers/x-provider-signature }" },

{ "type": "Signature", "name": "verified", "algorithm": "SHA256",
  "secret": "<the provider's signing secret>",
  "value": "{ /sig/1 }.{ /rawPayload }",
  "expected": "{ /sig/2 }" },
```

`Capture` binds a list — index `0` is the whole match, `1..n` the groups — read by pointer
(`{ /sig/1 }`). Two pointers in one string already concatenate, so building the signed message needs
no `$cat`; reach for `$cat` only when a piece is a computed value rather than a pointer or literal.

**Keyless digest** - a hash of concatenated fields with the shared key folded in at the position that scheme puts it:

```jsonc
{ "type": "Hash", "name": "expected", "algorithm": "SHA256", "encoding": "Hex",
  "value": "{ /payload/merchantId }{ /payload/timestamp }{ /payload/orderId }{ /payload/amount }<sharedKey>" },

{ "type": "If", "condition": { "!==": [ "{ /expected }", "{ /payload/signData }" ] },
  "then": [ { "type": "Return", "isError": true, "statusCode": 401, "value": "bad signature" } ] }
```

`Hash` has no `secret` field on purpose — schemes put the key in different positions, so write it
into `value` wherever that scheme puts it. Mind `Hash`'s short **128-character** limit on what
`value` resolves to; a long concatenation needs `Signature` (65,536) or fewer fields.

## B-4. Replay window

Providers that sign a timestamp expect you to reject old deliveries. `/now/seconds` is the run's
clock (one reading per execution, so two statements cannot disagree):

```jsonc
{ "type": "If",
  "condition": { "$<": [ { "$-": [ "{ /now/seconds }", "{ /sig/1 }" ] }, 300 ] },
  "then": [ … proceed … ],
  "else": [ { "type": "Return", "isError": true, "statusCode": 401, "value": "stale" } ] }
```

The captured timestamp is text; the arithmetic coerces it. `/now/millis` and `/now/iso` are the other
two forms — `iso` is the same rendering as `sys.createdAt`, so it compares against one directly.

## B-5. Idempotency — providers retry

A retried delivery must not charge, credit or fulfil twice. **Key on the provider's own event or
payment id**, not on arrival:

1. `ResourceFind` a receipt Content by that id.
2. If found ⇒ `Return` `200` immediately (a success, not an error — otherwise the PG keeps retrying).
3. Otherwise write it, then do the work.

Before fulfilling, match the delivery to **your own order row** and check it exactly as in shape A —
amount and status against what you stored, never the payload alone. A verified delivery proves *the
PG sent this*, not *this is the order you think it is*.

For a counter or balance that two deliveries could race on, pass the row's **`sys.version`** as the
write's `version` (optimistic lock) and let `Try` handle the conflict — see `weegloo-script`.

Note that a Script's writes are **silent by default** (`propagateEvents: false`): they do not index or
fire Webhooks. Set `propagateEvents: true` on the write that should trigger downstream work.

## The Toss 가상계좌 deposit — a stored-secret compare, not `Signature`

As of writing (Toss's event reference, the path `llms.txt` lists — `…/reference/using-api/webhook-events.md`),
`DEPOSIT_CALLBACK` carries **no signature header and no amount**: its body is `orderId`, `status`,
`transactionKey`, `createdAt` and a **`secret`** that must equal the `secret` the confirm call
returned for that payment — which `SKILL.md` §4 stores on the order. Re-read that page before
building; where it disagrees, the page wins.

So the check needs **one read first**, and that read is the only statement allowed before it —
B-2's "nothing before the check" still binds every write:

```jsonc
{ "type": "ResourceFind", "name": "order", "resource": "Content",
  "contentType": { "sys": { "id": "<orderCtId>" } },
  "where": { "fields.orderId": "{ /payload/orderId }" } },

{ "type": "If", "condition": { "or": [
      { "!": "{ /order }" },
      { "!==": [ "{ /payload/secret }", "{ /order/fields/depositSecret/en-US }" ] } ] },
  "then": [ { "type": "Return", "isError": true, "statusCode": 401, "value": "bad secret" } ] }
```

- **Refuse when the order is missing** (the `!` arm) — otherwise an absent row and an absent `secret`
  compare equal and an empty body passes.
- **The amount was already compared at confirm**, when the account was issued (`SKILL.md` §4). This
  delivery only moves that order from awaiting deposit to paid, and only when `status` is `DONE`;
  `CANCELED` and `WAITING_FOR_DEPOSIT` are status updates, not a payment.
- An order that already reads paid ⇒ `Return` `200` (B-5) — Toss retries a delivery that did not get a
  `200` within 10 seconds.
- Toss's webhook guide (`…/guides/v2/webhook.md`) describes no custom header or auth on a delivery,
  so register the **anonymous** endpoint (B-1): no `:self`, match on `orderId` as above.

## Never — the callback-only two

These are in addition to the `Never` list in `SKILL.md`.

- **Never skip signature verification because the callback URL is secret.** A URL is not a secret, and
  a callback token authenticates *that it is your endpoint*, not *that the PG sent this body* — and on
  the anonymous endpoint there is no token either.
- **Never set `anonymousCallEnabled` on a Script that verifies nothing.** That publishes an endpoint
  which runs with the author's authority to anyone who finds the URL.
