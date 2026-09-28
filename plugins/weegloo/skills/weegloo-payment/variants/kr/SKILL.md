---
name: weegloo-payment
description: Wire any PaymentGateway (PG), Merchant-of-Record (MoR) or checkout provider into a Weegloo product. Use when taking payments, building a checkout, verifying a payment, receiving a PG/MoR webhook or callback, checking its signature, or handling refunds and subscription renewals. Covers the two backend-free shapes, CONFIRM (pull from the PG) and CALLBACK (the PG POSTs to a Script); inbound-callback auth; idempotency on retries; where the secret key lives; amount verification. No provider named ⇒ Toss Payments test keys. NOT Weegloo's own plan billing. 결제, 카드결제, 체크아웃, 결제 연동, 결제 검증, 결제 콜백, 환불, 정기결제, 토스페이먼츠, 결제위젯.
country: KR
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

- ⚠️ **The documentation keys are shared and public.** Anyone holding `test_gsk_docs_…` can look up
  what the test flow sent, so never put real customer data — a real name, email or phone number
  passed to `requestPayment` — through it. The order rows on the Weegloo side are yours and
  unaffected.
- **Anything that needs the user's own Toss account is not reachable on them** — registering a
  webhook (개발자센터 → 웹훅), changing which payment methods the widget offers. It waits for their own
  account (§6) and is **not** something you stop and ask for.

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
user for their contracted PG/MoR details.** The default's premise — published test keys — has failed,
so this is the one key conversation you start, and only then is it a genuine blocking input under
step 4.

### 2. What the page specifies

| | Value |
|---|---|
| SDK | `<script src="https://js.tosspayments.com/v2/standard"></script>`, or `npm i @tosspayments/tosspayments-sdk` |
| Test **client** key (browser) | `test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm` |
| Test **secret** key (Script only) | `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6` |
| Confirm API | `POST https://api.tosspayments.com/v1/payments/confirm` |
| Confirm auth | `Authorization: Basic base64("{secretKey}:")` — **the trailing colon is required** |
| Confirm body | `paymentKey`, `orderId`, `amount` |
| Confirm deadline | **within 10 minutes** of the payment request — "결제 요청이 완료된 이후 10분 이내에 결제를 승인해야 됩니다" |
| `successUrl` query params | `paymentType`, `orderId`, `paymentKey`, `amount` |
| `failUrl` query params | `code`, `message`, `orderId` |
| Charging | test keys approve **virtually** — no card or account is ever debited |

### The order ContentType — a field the provider fills is not a `ShortText`

Model it before §3. **`ShortText` stops at 64 characters**, so the split is not "short vs long" but
**whether you can predict the length** (`weegloo-create-content-type` → *Hard limits*):

| field | type | why |
|---|---|---|
| `orderId`, `status` | `ShortText` | yours, and you keep them short — Toss's API reference requires `orderId` to be 6–64 characters of letters, digits, `-`, `_` |
| `amount` | `Long` | KRW has no minor unit; an integer, never a string |
| `paymentKey` | **`RichText`** | Toss allows up to **200** characters — past the cap on its own |
| `receiptUrl` (`receipt.url`) and any provider URL | **`RichText`** | a provider URL is Toss's to shape, not yours |
| `depositSecret` (the 가상계좌 `secret`), and any other Toss id or token you store | **`RichText`** | the length is Toss's to change, not yours |

`RichText`, not `LongText`: none of these is ever full-text searched — the Script finds the order by
**your** `orderId`, then reads the provider value by path. A provider id you **query on** (a
`ResourceFind` keyed on it, such as an idempotency receipt) is the exception: queried ⇒ `LongText`.

A `ShortText` here breaks nothing until Toss issues a `paymentKey` longer than 64 characters (it allows
up to 200); then §4's `ResourcePatch` answers `/paymentKey/en-US: must not exceed a maximum length of
64` **after** the confirm call has already approved the payment — the money moved, and the order still
reads `pending`.

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
- **The success page calls the confirm Script at once.** The payment must be approved within 10
  minutes of the request (§2); a success page that waits for a click, or a confirm that never runs,
  lets that window lapse.
- **가상계좌 (virtual account)** is settled by a later deposit, not by confirm: confirm only issues the
  account (§4), and the order becomes paid from Toss's deposit webhook — shape **B**
  (`references/callback-receiver.md`). Both ways to handle it — turning 가상계좌 off, or registering
  that webhook — need the user's own Toss account (§1), so on the documentation keys build the confirm
  to record such an order as awaiting deposit, and say so in §5.

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
            "amount": "{ /order/fields/amount/en-US }" },
  "timeoutMs": 10000 },

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
- **A 가상계좌 confirm succeeds without paying.** It answers `status: "WAITING_FOR_DEPOSIT"`, not
  `DONE` — the account was issued and nothing was deposited. After the same amount comparison, record
  the order as awaiting deposit and store the response's **`secret`** as `depositSecret` (it
  authenticates the later deposit webhook) instead of answering `402`; mark it paid only from that
  webhook (shape B).
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
3. The keys are **Toss Payments' public documentation test keys**, not theirs — moving to their own
   Toss account, or to a contracted PG/MoR, is the swap in §6. **State that it is available; do not
   ask for credentials.** If they want it, they will say so.

If the widget offers 가상계좌, add one plain sentence: those orders stay awaiting deposit until their
own Toss account registers the deposit webhook (§3).

**Put point 2 in red.** It is the one fact whose omission actually costs the user money-handling
confidence, so it gets the must-know colour (`weegloo-global-rules` → *Highlight what the user must
act on or must know*) — a `diff` fence, `- ` prefix, in the user's own language:

```diff
- 결제는 토스페이먼츠 테스트 키로 동작합니다 — 실제로 청구되는 카드나 계좌는 없습니다.
```

The `- ` is the red-rendering marker, not part of the sentence, and the block **never replaces** saying
it in prose — state the caveat either way, so a plain-text or no-colour surface loses nothing. Points
1 and 3 stay plain text; the live checkout URL, if you have one, is **green** (`+ `) in its own
separate block so the two do not read as one diff.

This is a **disclosure about what shipped, not a request** — it asks for nothing, so it does not
collide with `weegloo-platform-integration`'s ban on "give me these and I'll continue" wrap-ups.
Keep it to a few plain sentences with no Weegloo or Toss jargon, and never end it with a
credentials list. **Never let a test-key checkout pass for production-ready by saying nothing.**

### 6. Going live, or swapping the provider

**Their own Toss keys** are a swap, not a rewrite — the integration is identical:

1. Replace the client key in the browser and the secret key behind the confirm Script with the
   결제위젯 pair (`…_gck_…` / `…_gsk_…`) from their own 개발자센터, and **recompute the precomputed
   `Basic …` value** (§4) from the new secret key.
2. Delete every `test_gck_docs_…` / `test_gsk_docs_…` string left in the tree.
3. The account-only work from §1 is now reachable — register the 가상계좌 deposit webhook (shape B),
   or turn 가상계좌 off.
4. Walk the **배포 체크리스트** listed in `llms.txt` (§1) before taking real payments.

**A different provider** is a replacement, not a layer:

1. **Read that provider's docs first** — shape, signature scheme, callback-header support (§*Two
   shapes*; if it pushes, `references/callback-receiver.md`). Do not assume it behaves like Toss.
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
| Endpoint | `…/execute` (your frontend holds a token) | `…/execute` with a token, or `…/execute/anonymous` with none |
| Use for | checkout approval, "did this payment really go through" | refunds, disputes, subscription renewals, virtual-account deposits, anything you cannot pull |

**Prefer A whenever the answer can be pulled.** It needs no signature verification, no inbound
authentication, and no idempotency key — you are asking the authoritative source directly. §4 is A,
and the Toss test-key default path is A, complete above in this file — unless the widget offers
가상계좌 (§3), whose deposit webhook is B.

**Add B when the money can move without your frontend being there** — a 가상계좌 deposit that lands
hours later, a subscription renewal, a dispute. Card checkout stays A.

> ### ➜ Building shape B? Read `references/callback-receiver.md` before designing the flow.
> It is the only place with: which of `…/execute` and `…/execute/anonymous` the provider posts to and
> what authenticates each, the signature check as the first statement, the shape→statement table for
> mapping a provider's signature scheme, the replay window, and idempotency against provider
> retries. On the Toss default you need it only for a **가상계좌 deposit notification** (§3), and only
> once the user's own Toss account can register it — if you are not receiving a push from the
> provider, do not open it.

---

## A. Confirm — frontend → Script → PG verify API

1. The frontend completes the PG's client flow and receives a **payment id / token** (plus the PG's
   redirect params). It calls the Script with just those identifiers.
2. The Script **reads the order it created earlier** (`ResourceRead` / `ResourceFind` with
   `where: { "createdBy": ":self" }`) to learn the **expected amount** — from your own record.
3. `Http` GET/POST to the PG's verify endpoint, secret key in a header with **`"secret": true`**.
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
            "amount": "{ /order/fields/amount/en-US }" },
  "timeoutMs": 10000 },

{ "type": "If",
  "condition": { "and": [
      { "===": [ "{ /confirmed/body/status }", "DONE" ] },
      { "===": [ "{ /confirmed/body/totalAmount }", "{ /order/fields/amount/en-US }" ] } ] },
  "then": [ { "type": "ResourcePatch", "resource": "Content", "target": { "sys": { "id": "{ /order/sys/id }" } },
              "locale": "en-US", "fields": { "status": "paid" } } ],
  "else": [ { "type": "Return", "isError": true, "statusCode": 402, "value": "payment not confirmed" } ] }
```

- **Send or compare the amount you recorded, not the amount the caller sent.** A verify call that the
  provider itself amount-checks only protects you if the amount you sent came from your own record.
- The PG round trip happens **inside the run**, while the frontend waits on `/execute` — keep the
  `Http` `timeoutMs` tight, and answer a failed or unconfirmed payment from `catch` / `else` rather
  than letting the run hit its budget. Budget: `weegloo-script`.

---

## Where secrets live

| Secret | Goes in |
|---|---|
| PG **API/secret key** (for confirm calls) | `Http.headers` entry with **`"secret": true`** |
| **Webhook signing secret** (shape B) | `Signature.secret` / inside `Hash.value` — `references/callback-receiver.md` B-2 / B-3 |
| Callback **auth token** (token path, shape B) | the `SpaceAccessToken` you register with the PG, not in the Script — `references/callback-receiver.md` B-1 |

⚠️ **A `Signature.secret` written into a Script definition is stored as authored and is readable by
anyone who can read that Script.** Keep Script `Read` off end-user roles, and treat the signing secret
as compromised if it is not. (`Http.headers` `secret: true` is the encrypted-at-rest slot; there is no
equivalent flag on `Signature` today.)

## Never

- **Never ask which PG / MoR to use.** Named provider → integrate that one; none named → integrate
  the Toss Payments test-key default and disclose it. A provider menu is a scoping question.
- **Never ask the user for Toss keys** — the documentation pair in §2 is what you wire in (the one
  exception: those keys are gone, §1). And never ship an inert checkout waiting on a key.
- **Never finish a test-key payment flow silently.** The completion message must say that payments run
  on Toss test keys and are not really charged (§5) — as a statement, not a request for credentials.
  An undisclosed test-key checkout reads as production-ready and is the worst failure here.
- **Never leave a `test_gck_…` / `test_gsk_…` key in the tree once their own credentials exist** —
  going live or replacing a provider means removing the test path, not layering over it (§6).
- **Never put a secret key, or its `Basic …` header, in client code.** The client key is the only Toss
  key the browser may see; the secret key lives in `Http.headers` with `"secret": true`.
- **Never trust a client-reported amount, currency or status.** Read the amount from your own order
  record, or from the PG's API response.
- **Never store card data** — PAN, CVC, expiry — in Content, Media, or a Script payload. Use the PG's
  tokenization; that is what it is for.
- **Never fulfil in the browser** — grant the entitlement from the Script that established payment.
- **Never `Return` a PG error verbatim** if it may echo customer data.
- Shape B adds two more "never"s of its own — they are in `references/callback-receiver.md`.

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
