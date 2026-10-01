/**
 * On a KR install, "add card payments" with no provider named builds TOSS PAYMENTS, not Stripe.
 *
 * `09-payment-default` and `26-payment-amount-grant-once` accept either provider on purpose: they
 * measure "picked one and proceeded" and "verified server-side", and must hold on both installed
 * versions (CLAUDE.md §2.8). So a KR install that builds Stripe passed every fixture.
 *
 * Users reported a KR install building Stripe anyway. The variant had three paths toward Stripe. A
 * `pk_test_…` already in the repo counted as "Stripe named", and that included Stripe's public
 * sample pair, which any Stripe-default build hardcodes. A `### ➜ Stripe named?` heading sat above
 * the Toss default. And `references/stripe.md`, a copy of the Stripe default spine, still called
 * itself "the default path".
 *
 * THIS PROMPT DOES NOT REPRODUCE THE REPORT. On the pre-fix corpus (04df7b7, KR install) it passed
 * 3/3 asserts in each of 3 runs, with no Stripe mention in any reply. It guards the plain
 * no-provider path against regression. The trigger behind the report is still unidentified:
 * Stripe's sample pair in the repo, a different harness, or a non-KR install are all unmeasured.
 *
 * COUNTRY-GATED: `country: ['KR']`. The runner skips it on any other install, or an unknown country,
 * and lists it as skipped. Elsewhere the Stripe default is the right answer, and the assert would
 * fail a correct corpus.
 *
 * Judge asserts are controlled in `tests/negative-control.mjs` (one wrong answer per failure mode).
 * NOT IN `tests/baseline.develop.json` yet: `--compare` scores these asserts but cannot flag a
 * regression until a baseline that includes them is recorded on a KR install.
 */
export default {
  id: 'payment-default-kr-toss',
  lang: 'ko',
  country: ['KR'],
  prompt: 'Weegloo 로 수제 디저트 쇼핑몰을 만들고 있어. 상품 상세 페이지에 \'구매하기\' 버튼이 있는데, 누르면 카드 결제가 되게 해줘.',
  asserts: [
    { id: 'mentions-toss', kind: 'must_match', pattern: /Toss|토스/i,
      why: 'KR 설치본의 기본 provider 는 토스페이먼츠다 — 이름조차 나오지 않으면 다른 provider 로 만든 것이다' },
    { id: 'no-stripe', kind: 'judge', expect: 'no',
      question: 'Does the answer integrate Stripe (Stripe Checkout, a Checkout Session, Stripe.js / Elements, Stripe API keys such as pk_test / sk_test, or the Stripe API) as the payment provider, instead of or alongside Toss Payments? Mentioning Stripe only to say it is not used, or only as a possible later swap, is NO.',
      why: 'provider 를 지정하지 않은 KR 결제는 토스페이먼츠 기본값이다 — Stripe 로 만들면 사용자가 고르지도 않은 해외 PG 결제가 붙는다' },
    { id: 'test-keys-disclosed', kind: 'judge', expect: 'yes',
      question: 'Does the answer state that the payment flow runs on test keys (or in test mode) and that nothing is really charged?',
      why: '테스트 키 결제를 말없이 넘기면 production-ready 로 읽힌다 — 가장 나쁜 실패' },
  ],
};
