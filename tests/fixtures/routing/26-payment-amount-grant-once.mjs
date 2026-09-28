/**
 * Two silent payment failures, both of which pass every server-side check they were given:
 *
 *  - WHERE THE AMOUNT COMES FROM. e670b72 had both payment versions let the BROWSER create the order
 *    row with its amount, and the confirm Script then compared the provider's amount with that row.
 *    A buyer stores 100 for a 10,000 item, pays 100, and the Script compares 100 with 100 — the order
 *    reads `paid`, no error anywhere. The check ran on the server and checked nothing: the number it
 *    trusted was the buyer's. 935da28 moved pricing into a Script that reads a product row the buyer
 *    cannot write and creates the order itself. Fixture 09's `server-side-verification` does not
 *    separate the two — the circular design also "verifies server-side" — so the amount SOURCE and
 *    the order row's WRITERS are asked about here, as two separate asserts.
 *
 *  - GRANTING ONCE. A verify call that consumes nothing (Stripe's session GET, any PG's 조회 API)
 *    passes again every time the confirm step re-runs — a refreshed success page, a retried or
 *    replayed request — and whatever is granted after it is granted again (32c6442). The prompt
 *    grants points, so a design that never thinks about the replay credits them on every call.
 *
 * NO PROVIDER IS NAMED, on purpose: a KR install gets the Toss variant of `weegloo-payment` and every
 * other country the Stripe default, and the three asserts are meant to hold for both. That is also
 * why `grant-once` accepts "the provider refuses a second approval": Toss refuses a second confirm of
 * the same payment (32c6442's message), so the KR default path cannot grant twice through its confirm
 * — Stripe's session GET has no such provider-side guard, and a default-corpus answer needs its own.
 * The KR corpus does NOT say so, though, and its §4 confirm has no already-paid guard: a KR answer
 * that copies §4 cannot grant twice, yet scores NO here unless it applies *A. Confirm* step 5 or
 * states the refusal. Read a KR `grant-once` failure before believing it.
 *
 * WHICH CORPUS A RUN MEASURES: the installed one (CLAUDE.md §2.8). The published CLI ignores
 * `variants`, so until a variant-aware CLI is on npm every run measures the Stripe default whatever
 * the recorded country; after that, the recorded country decides. One run measures ONE of the two.
 *
 * WHAT A PASS DOES NOT SHOW. Measured on the PRE-fix corpus (installed `latest`, whose payment skill
 * still has the page write the order with its amount, and no grant-once guard), this prompt passed
 * all three asserts in 3 of 3 runs, and a leaner prompt without the products hint in 2 of 2: the
 * agent priced in a Script, kept the buyer read-only and guarded the grant on its own — one run even
 * overrode the skill's browser-written order. So this is a floor on the behaviour, not evidence that
 * 935da28 / 32c6442 are load-bearing for it: read a failure here, and do not cite a pass as proof.
 *
 * Deliberately NOT scored here (each would be its own failure mode, and a question that also asked
 * it would stop being one question):
 *  - whether the member can write their own points balance / ledger row — the same class as the
 *    wallet check in `weegloo-script`, and just as silent;
 *  - re-reading the order by id rather than trusting a search's indexed copy, the version-lock loser,
 *    and reverting the order when the grant itself fails. Any explicit already-paid guard passes.
 *
 * Every judge assert here is controlled by `tests/negative-control.mjs` — one wrong answer per
 * failure mode, each wrong in exactly one dimension. Change a question, re-run the control.
 *
 * NOT IN `tests/baseline.develop.json` (neither are 24 and 25): `--compare` scores these asserts but
 * cannot flag them as regressions until a baseline that includes them is recorded.
 */
export default {
  id: 'payment-amount-grant-once',
  lang: 'ko',
  prompt: 'Weegloo 로 쇼핑몰을 만들고 있어. 상품이랑 가격은 products ContentType 에 넣어 두었어. 회원이 카드로 결제하면 결제 금액의 5% 를 적립금으로 넣어주고 싶은데, 결제부터 적립금 지급까지 어떻게 만들면 돼?',
  asserts: [
    { id: 'amount-from-server-price', kind: 'judge', expect: 'yes',
      question: "Does the answer compute the amount to charge — and the amount it later compares with the payment provider's reported amount — server-side (inside a Weegloo Script) from a price the buyer cannot write, such as the product record's price or a price held at the payment provider? It is NO if that amount is one the browser supplied: sent in a request payload, or written into an order row the browser created — even when a Script later compares it with the provider's amount. Whether the buyer's role could also edit the order row afterwards is a separate criterion; do not decide this one on it.",
      why: '금액을 브라우저가 보낸 값이나 브라우저가 쓴 주문 행에서 가져오면, 10,000원 상품을 100원에 결제해도 서버 검증이 100 과 100 을 비교해 결제 완료로 처리한다 — 에러는 어디에도 없다' },
    { id: 'no-buyer-order-write', kind: 'judge', expect: 'no',
      question: "Does the answer let the buyer write order rows directly — the browser/page creating the order Content itself (e.g. through ACMA), or the buyer's role (ServiceUserRole) being given Create, Edit or All on the order ContentType? A Script that creates the order on the buyer's behalf, with the buyer's role holding at most Read on their own orders plus Execute on the Scripts, is NO. Decide only who can write the order row, not where its amount value comes from.",
      why: '구매자 역할이 주문 행을 만들거나 고칠 수 있으면 자기 금액을 적거나, 결제 없이 status 를 paid 로 바꾼다 — 서버 검증은 그 행을 믿으므로 조용히 통과한다' },
    { id: 'grant-once', kind: 'judge', expect: 'yes',
      question: 'Does the answer make the points (적립금) grant happen at most once per order — so that running the confirm step again for an order that is already paid (a page refresh, a retried or replayed request, a duplicate webhook delivery) does not credit points a second time? Any explicit mechanism counts: checking that the order is not already paid before granting and stopping if it is, a version-locked or conditional pending→paid transition only one call can win, an idempotency record keyed on the order or event, or the provider refusing a second approval of the same payment. It is NO if the answer never addresses a repeated confirm, or lets a repeated confirm run the grant again. Decide this on the confirm step\'s own logic: whether the buyer\'s role could rewrite the order row — and so reset it to unpaid — is a separate criterion.',
      why: 'PG 조회는 아무것도 소모하지 않아서, 결제 완료 페이지를 새로고침하거나 confirm 을 다시 부를 때마다 검증이 또 통과하고 적립금이 다시 쌓인다 — 에러 없이' },
  ],
};
