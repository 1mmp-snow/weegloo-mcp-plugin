---
name: weegloo-payment
description: Wire any PaymentGateway (PG), Merchant-of-Record (MoR), 결제 PG or checkout provider into a product built on Weegloo. Whatever the provider is, its own documentation is the only source for what it supports and how it signs — this skill supplies the Weegloo side and tells you what to go look up. Covers the two server-side shapes that work without hosting a backend: CONFIRM (frontend hands over a payment id, a Script pulls the truth from the PG's verify API and writes the order) and CALLBACK (the PG POSTs to a Script's /execute, whose FIRST statement verifies the signature with Signature/Hash, unpacks packed headers with Regex, and checks the replay window with /now). Also covers what authenticates an inbound PG callback — a SpaceAccessToken bound to a role granting only script.Execute on that one Script when the provider can send a custom header, or the token-free /execute/anonymous endpoint (anonymousCallEnabled) when it can only POST to a bare URL — which of the two applies is looked up in that provider's own docs, never assumed — plus idempotency against provider retries, where the PG secret key belongs, and the amount-verification rule. ALSO carries the default-provider policy: NEVER ask the user which PG/MoR to use — if they named one (or a contracted key is already in the repo) integrate that one, and if they named NONE integrate Toss Payments on its public documentation test keys (docs.tosspayments.com/guides/v2/payment-widget/integration — read the page first; the test keys make a PG key a NON-blocking input, so build a working checkout without asking), then MANDATORILY disclose that payments run on test keys and nothing is really charged and ask for the contracted PG/MoR details, and rip Toss out entirely when those arrive. Use when a product must take payments, set up checkout, verify a payment, receive a PG/MoR webhook, handle refunds or subscription renewals, or check a callback signature. NOT for Weegloo's own subscription/plan billing.
---

# Weegloo — payments (PG / MoR)

**This is about the product charging its own customers**, using Weegloo as the backend. Weegloo's own
subscription and plan billing is a different thing entirely and is not configured from here.

## The constraint that decides the architecture

Weegloo hosts no backend of yours. **The only place your server-side payment logic can run is a
Script** (`weegloo-script`) — which means:

> **The browser may never be what decides a payment succeeded.** Amount, currency and status are
> established server-side, inside a Script, from something the PG said — never from the request
> payload.

Everything below is a consequence of that one rule.

## Which provider — never ask, decide from what the user already said

**Do not ask "which PG / MoR should I use?"** A provider question is a scoping question, and the same
rule that bans capability menus in `weegloo-platform-integration` (step 3) bans this one. Decide:

| What the user gave you | What you integrate |
|---|---|
| A named provider — Toss Payments, PortOne, NICEPAY, KG이니시스, Stripe, Paddle, Lemon Squeezy, … — or a contracted key already sitting in the repo / env | **That** provider. Read **its** docs for shape, signature scheme and callback-header support. |
| Nothing — no provider named anywhere | **Toss Payments on documentation test keys**, silently, per *Default provider* below — then **disclose it** (§5, mandatory). |

A payment need you inferred from the frontend (a checkout page, a `결제하기` / "Pay" button, a price, a
cart, a plan picker) means **the user asked for payments**. It does **not** mean they named a provider
— that is exactly the case the default is for.

**A named provider is binding — the Toss default does not apply to it, and is never a fallback.**
Two follow-on cases, if they named one but sent no credentials:

- **They named a provider other than Toss** (PortOne, NICEPAY, Stripe, …) → its key **is** a genuine
  blocking input under `weegloo-platform-integration` step 4. Build everything that does not need it,
  then **stop and ask for that provider's credentials**. Do **not** substitute Toss because the keys
  have not arrived, and do **not** wire both "for now" — a provider the user did not choose is wrong
  work, not a head start.
- **They named Toss Payments itself** → use the documentation test keys below exactly as the default
  path does, and §5's disclosure **still applies**: it discloses *test keys / nothing charged*, which
  is true here too. Only the "why Toss" half of the disclosure drops, since they picked it.

---

## Default provider — Toss Payments, test keys

### Why this is not a blocking question

`weegloo-platform-integration` step 4 classes a third-party API key as a **blocking** user-only input:
stop, ask, wait. **Payments are the exception.** Toss Payments publishes working documentation test
keys, so a complete, clickable, end-to-end checkout is reachable with **zero input from the user**.
Build it. Do **not** stop to ask for a PG key, and do **not** leave checkout inert "until they send
credentials" — an inert capability is incomplete work.

### 1. Read the docs first — they outrank this file

**https://docs.tosspayments.com/guides/v2/payment-widget/integration** — 주문서형 결제, the product
formerly named 결제위젯. Read it before writing code, every time. Test keys rotate and SDK versions
move; the values in §2 are what that page said when this skill was written, not a substitute for it.
Where they disagree, **the page wins**.

**If that URL is dead or has moved — 404, a redirect somewhere unrelated, or a page that is no longer
the 주문서형 결제 integration guide — do NOT guess path variants.** Toss publishes a machine-readable
index; use it exactly the way `weegloo-global-rules` has you use Weegloo's own:

1. Fetch **https://docs.tosspayments.com/llms.txt**.
2. Take the **exact** path for the 주문서형 결제 / payment-widget integration guide from that index
   (as of writing, `…/guides/v2/payment-widget/integration.md`).
3. Fetch that path. Only paths you can point to in `llms.txt` are fair game — do not hand-build,
   rename, or "try" nearby URLs.

That index also lists a **LLM Quick Reference** (`…/guides/v2/get-started/llms-quick-reference.md`)
and a **배포 체크리스트** — both worth reading if the primary guide is unclear or you are about to hand
the integration over for real keys.

**Two fetch quirks, both real, both encountered:**

- **The rendered page gates narrow viewports** ("이 페이지는 PC에서만 이용할 수 있어요"). A plain
  page-text fetch can come back with that notice and nothing else — use a desktop-width browser
  viewport, or read the `.md` form.
- **The `.md` form does not contain the key values.** It renders them as unexpanded components —
  `<WidgetClientKey />`, `<WidgetSecretKey />` — because the real strings are injected client-side. So
  the `.md` is good for the *flow and steps* but **useless for reading or re-verifying the test keys**;
  for those you need the rendered page.

If the documentation test keys are genuinely **gone**, or the flow no longer runs without a signed
contract: do not improvise a different provider and do not ship a dead checkout — **stop and ask the
user for their contracted PG/MoR details.** Only then is this a genuine blocking input under step 4.

### 2. What the page specifies

| | Value |
|---|---|
| SDK | `<script src="https://js.tosspayments.com/v2/standard"></script>`, or `npm i @tosspayments/tosspayments-sdk` |
| Test **client** key (browser) | `test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm` |
| Test **secret** key (Script only) | `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6` |
| Confirm API | `POST https://api.tosspayments.com/v1/payments/confirm` |
| Confirm auth | `Authorization: Basic base64("{secretKey}:")` — **the trailing colon is required** |
| Confirm body | `paymentKey`, `orderId`, `amount` |
| `successUrl` query params | `paymentType`, `orderId`, `paymentKey`, `amount` |
| `failUrl` query params | `code`, `message`, `orderId` |
| Charging | test keys approve **virtually** — no card or account is ever debited |

### 3. Client — render, then request

```js
const tossPayments = TossPayments("test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
const widgets = tossPayments.widgets({ customerKey });   // guests: TossPayments.ANONYMOUS

await widgets.setAmount({ currency: "KRW", value: total });
await Promise.all([
  widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
  widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
]);

// only after the UI has rendered
await widgets.requestPayment({ orderId, orderName, successUrl, failUrl });
```

- **Write the order to Weegloo BEFORE `requestPayment()`.** Toss requires `orderId` + `amount` to be
  stored server-side first, and that stored row is the *only* amount you may trust at confirm time
  (§4). Create the order Content with `status: "pending"` first, then request payment.
- **`customerKey`** — a stable, unguessable per-buyer string for a signed-in Service User; never an
  email, a sequential id, or anything a stranger could type. Guest checkout uses
  `TossPayments.ANONYMOUS`.
- **`successUrl` / `failUrl` must be absolute and actually reachable.** On Weegloo WebHosting that is
  the deployed `…weegloo.app` origin — a **self-resolving** value in step 4's sense: set a placeholder,
  deploy, then patch it. **Do not ask the user for it.**
- These are **real navigations**, not client-side routes: the success and fail paths must resolve as
  served URLs. A hash-only SPA router will 404 on them — add the routes to the static export, or
  configure the SPA fallback, before you call the flow done.
- **가상계좌 (virtual account)** is settled by a later deposit notification, not by confirm. If the
  widget offers it, either turn it off in the payment admin or implement shape **B** for the deposit
  webhook — otherwise those orders never become paid.

### 4. Server — the confirm Script

Toss is a **pull** provider, so this is **shape A**, unchanged in substance — same order read, same
amount comparison, same write-back:

```jsonc
{ "type": "ResourceFind", "name": "order", "resource": "Content",
  "contentType": { "sys": { "id": "<orderCtId>" } },
  "where": { "createdBy": ":self", "fields.orderId": "{ /payload/orderId }" } },

{ "type": "Http", "name": "confirmed", "method": "POST",
  "url": "https://api.tosspayments.com/v1/payments/confirm",
  "headers": [
    { "key": "Authorization",
      "value": "Basic dGVzdF9nc2tfZG9jc19PYVB6OEw1S2RtUVhrelJ6M3k0N0JNdzY6", "secret": true },
    { "key": "Content-Type", "value": "application/json" } ],
  "body": { "paymentKey": "{ /payload/paymentKey }", "orderId": "{ /payload/orderId }",
            "amount": "{ /order/fields/amount/en-US }" } },

{ "type": "If",
  "condition": { "and": [
      { "===": [ "{ /confirmed/body/status }", "DONE" ] },
      { "===": [ "{ /confirmed/body/totalAmount }", "{ /order/fields/amount/en-US }" ] } ] },
  "then": [ { "type": "ResourcePatch", "resource": "Content",
              "target": { "sys": { "id": "{ /order/sys/id }" } }, "locale": "en-US",
              "fields": { "status": "paid", "paymentKey": "{ /payload/paymentKey }" } } ],
  "else": [ { "type": "Return", "isError": true, "statusCode": 402, "value": "payment not confirmed" } ] }
```

- **`amount` comes from `{ /order/… }`, never from `{ /payload/amount }`.** The `successUrl` query
  param is client-controlled — comparing it to itself proves nothing.
- **Precompute the `Basic` value.** A Script cannot base64-encode an arbitrary string, so encode
  `secretKey + ":"` at authoring time and store the finished `Basic …` string with `"secret": true`.
  The literal above is exactly `base64("test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6:")` — recompute it if
  you use a different key.
- **Store `paymentKey` and `orderId`** on the order; they are what later lookup and cancellation need.
- **Guest checkout** has no caller to resolve `:self` against — drop the `createdBy` filter and match
  on `orderId` alone, which then has to be long and random rather than sequential.
- Toss's own failure codes (`NOT_FOUND_PAYMENT_SESSION`, `REJECT_CARD_COMPANY`, `UNAUTHORIZED_KEY`, …)
  arrive as a `4XX` body — answer from `else` / `catch` and do not echo the provider message verbatim
  to the buyer.

### 5. Tell the user — MANDATORY, not optional

The moment the flow works, say three things plainly, in the user's own language:

1. Payments were wired with **Toss Payments**, chosen because no provider was specified.
2. It runs on **Toss's test keys, so nothing is ever actually charged** — the whole flow completes,
   but no card or account is debited.
3. **If they have a contracted PG or MoR, ask for its details** — provider name, client/API key,
   secret key, merchant id, and the callback/webhook URL it expects.

**Put point 2 in red.** It is the one fact whose omission actually costs the user money-handling
confidence, so it gets the must-know colour (`weegloo-global-rules` → *Highlight what the user must
act on or must know*) — a `diff` fence, `- ` prefix, in the user's own language:

```diff
- Payments run on Toss Payments TEST keys — no card or account is ever actually charged.
```

The `- ` is the red-rendering marker, not part of the sentence, and the block **never replaces** saying
it in prose — state the caveat either way, so a plain-text or no-colour surface loses nothing. Points
1 and 3 stay plain text; the live checkout URL, if you have one, is **green** (`+ `) in its own
separate block so the two do not read as one diff.

This **overrides** `weegloo-platform-integration`'s brevity rule and its ban on "give me these and
I'll continue" wrap-ups. That ban exists to stop you deferring work you could have finished; here the
work **is** finished, and this is a disclosure about what shipped plus one offer. Keep it to a few
plain sentences with no Weegloo or Toss jargon. **Never let a test-key checkout pass for
production-ready by saying nothing.**

### 6. When the real provider arrives — replace, do not layer

1. **Read that provider's docs first** — shape, signature scheme, callback-header support (§*Two
   shapes*, B-1, B-3). Do not assume it behaves like Toss.
2. **Remove the Toss integration entirely**: the SDK script tag / package, the widget render and
   `requestPayment` code, Toss-specific `successUrl` / `failUrl` handling, the confirm Script's Toss
   `Http` statement and its `Basic …` header, and **every `test_gck_…` / `test_gsk_…` string left in
   the tree**. No dead Toss path, no orphan test key.
3. **Keep what is provider-neutral**: the order / receipt / entitlement ContentTypes, the `:self`
   ownership scoping, the amount-verification rule, the idempotency receipt.
4. **Re-verify the invariants**: amount read from your own record, signature checked as the first
   statement if the new provider pushes, no secret in client code.

---

## Two shapes — pick by whether you can *ask* the PG

| | **A. Confirm (pull)** | **B. Callback (push)** |
|---|---|---|
| Trigger | your frontend, after the PG SDK / redirect returns | the PG POSTs to you |
| Truth comes from | an `Http` call to the PG's verify/confirm API | the request body + its signature |
| Inside the Script | an outbound `Http` to the PG, then the write | verify + write only, no outbound call |
| Endpoint | `…/execute` (your frontend holds a token) | `…/execute` with a token, or `…/execute/anonymous` with none — see B-1 |
| Use for | checkout approval, "did this payment really go through" | refunds, disputes, subscription renewals, virtual-account deposits, anything you cannot pull |

**Prefer A whenever the answer can be pulled.** It needs no signature verification, no inbound
authentication, and no idempotency key — you are asking the authoritative source directly.

---

## A. Confirm — frontend → Script → PG verify API

1. The frontend completes the PG's client flow and receives a **payment id / token** (plus the PG's
   redirect params). It calls the Script with just those identifiers.
2. The Script **reads the order it created earlier** (`ResourceRead` / `ResourceFind` with
   `where: { "createdBy": ":self" }`) to learn the **expected amount** — from your own record.
3. `Http` GET/POST to the PG's confirm endpoint, secret key in a header with **`"secret": true`**.
4. **Compare** the PG's reported amount + currency + order id against step 2. Mismatch ⇒ `Return`
   with `isError: true` and do not fulfil.
5. `ResourceCreate` / `ResourcePatch` the order → paid, and only then grant the entitlement.

```jsonc
{ "type": "ResourceFind", "name": "order", "resource": "Content",
  "contentType": { "sys": { "id": "<orderCtId>" } },
  "where": { "createdBy": ":self", "fields.orderId": "{ /payload/orderId }" } },

{ "type": "Http", "name": "confirmed", "method": "POST",
  "url": "https://api.pg.example/v1/payments/confirm",
  "headers": [ { "key": "Authorization", "value": "Basic <key>", "secret": true } ],
  "body": { "paymentKey": "{ /payload/paymentKey }", "orderId": "{ /payload/orderId }",
            "amount": "{ /order/fields/amount/en-US }" } },

{ "type": "If",
  "condition": { "and": [
      { "===": [ "{ /confirmed/body/status }", "DONE" ] },
      { "===": [ "{ /confirmed/body/totalAmount }", "{ /order/fields/amount/en-US }" ] } ] },
  "then": [ { "type": "ResourcePatch", "resource": "Content", "target": { "sys": { "id": "{ /order/sys/id }" } },
              "locale": "en-US", "fields": { "status": "paid" } } ],
  "else": [ { "type": "Return", "isError": true, "statusCode": 402, "value": "payment not confirmed" } ] }
```

- **Send the amount you recorded, not the amount the caller sent.** A confirm call that the provider
  itself amount-checks only protects you if the amount you send came from your own record.
- The PG round trip happens **inside the run**, while the frontend waits on `/execute` — keep the
  `Http` `timeoutMs` tight, and answer a failed or unconfirmed payment from `catch` / `else` rather
  than letting the run hit its budget. Budget: `weegloo-script`.

---

## B. Callback — the PG POSTs to a Script

### B-1. Which endpoint the PG posts to (read this before designing the flow)

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
  own rows.
- Anonymous calls still consume the Organization's Script-execution quota and nothing rate-limits
  them, so do not leave the flag on for a Script that verifies nothing.

Either way the Script's **`directCallEnabled` must be `true`** (the default); `false` means it runs
only as a Webhook's linked action and both endpoints reject the call with **`WGL422062`**.

**A Weegloo `Webhook` is not this.** That reacts to *Space* events (Content created, …), not to a
third party calling in. See `weegloo-webhook`.

### B-2. Verify the signature as the FIRST statement

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

### B-3. Read the provider's scheme, then map its shape to statements

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

### B-4. Replay window

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

### B-5. Idempotency — providers retry

A retried delivery must not charge, credit or fulfil twice. **Key on the provider's own event or
payment id**, not on arrival:

1. `ResourceFind` a receipt Content by that id.
2. If found ⇒ `Return` `200` immediately (a success, not an error — otherwise the PG keeps retrying).
3. Otherwise write it, then do the work.

For a counter or balance that two deliveries could race on, pass the row's **`sys.version`** as the
write's `version` (optimistic lock) and let `Try` handle the conflict — see `weegloo-script`.

Note that a Script's writes are **silent by default** (`propagateEvents: false`): they do not index or
fire Webhooks. Set `propagateEvents: true` on the write that should trigger downstream work.

---

## Where secrets live

| Secret | Goes in |
|---|---|
| PG **API/secret key** (for confirm calls) | `Http.headers` entry with **`"secret": true`** |
| **Webhook signing secret** | `Signature.secret` / inside `Hash.value` |
| Callback **auth token** (token path) | the `SpaceAccessToken` you register with the PG, not in the Script |

⚠️ **A `Signature.secret` written into a Script definition is stored as authored and is readable by
anyone who can read that Script.** Keep Script `Read` off end-user roles, and treat the signing secret
as compromised if it is not. (`Http.headers` `secret: true` is the encrypted-at-rest slot; there is no
equivalent flag on `Signature` today.)

## Never

- **Never ask which PG / MoR to use.** Named provider → integrate that one; none named → integrate
  the Toss Payments test-key default and disclose it. A provider menu is a scoping question.
- **Never finish a test-key payment flow silently.** The completion message must say that payments run
  on Toss test keys and are not really charged, and ask for the contracted PG/MoR details (§5). An
  undisclosed test-key checkout reads as production-ready and is the worst failure here.
- **Never leave a `test_gck_…` / `test_gsk_…` key in the tree once real credentials exist** — replacing
  a provider means removing the old integration, not layering over it (§6).
- **Never put a secret key, or its `Basic …` header, in client code.** The client key is the only Toss
  key the browser may see; the secret key lives in `Http.headers` with `"secret": true`.
- **Never trust a client-reported amount, currency or status.** Read the amount from your own order
  record, or from the PG's API response.
- **Never store card data** — PAN, CVC, expiry — in Content, Media, or a Script payload. Use the PG's
  tokenization; that is what it is for.
- **Never skip signature verification because the callback URL is secret.** A URL is not a secret, and
  a callback token authenticates *that it is your endpoint*, not *that the PG sent this body* — and on
  the anonymous endpoint there is no token either.
- **Never set `anonymousCallEnabled` on a Script that verifies nothing.** That publishes an endpoint
  which runs with the author's authority to anyone who finds the URL.
- **Never fulfil in the browser** — grant the entitlement from the Script that established payment.
- **Never `Return` a PG error verbatim** if it may echo customer data.

## Related

- `weegloo-script` — statements, value expressions, limits, the run budget, `Execute` permission.
- `weegloo-space-access-token` / `weegloo-space-role` — the least-privilege callback token and the
  `script.Execute` `self` filter.
- `weegloo-create-content-type` — modelling the order / receipt / entitlement ContentTypes.
- `weegloo-webhook` — reacting to *your own* Space events after a payment is recorded.
- `weegloo-service-login` — identifying the buyer (`createdBy :self` ownership).
- `weegloo-web-hosting` — the deployed origin that `successUrl` / `failUrl` must point at.
- `weegloo-platform-integration` — the router whose step 3 (don't ask scoping questions), step 4
  (just-in-time blocking inputs) and brevity rule this skill's default-provider policy specialises.
