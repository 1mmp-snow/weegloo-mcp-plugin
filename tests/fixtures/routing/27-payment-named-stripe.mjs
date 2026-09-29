/**
 * A named provider that the installed variant's spine does not carry.
 *
 * On a KR install `weegloo-payment` is the Toss Payments variant. A design or prompt that names
 * Stripe used to fall into "a provider other than Toss → its key is a blocking input → stop and
 * ask", and the agent closed with "send me your Publishable key and Secret key and I'll continue"
 * — a stall dressed as diligence: no Stripe integration built, nothing for a byte metric to see,
 * and the router said the same ("a named provider other than the default: ask for its key").
 * Stripe publishes a sample key pair, so nothing about Stripe is a key request. The KR spine now
 * routes a named Stripe to `references/stripe.md` (the Stripe integration, copied whole, sample
 * keys included), and the router tells the agent to ask only for a provider the skill does not
 * cover at all.
 *
 * BOTH installed versions are meant to pass (CLAUDE.md §2.8 — one run measures one of them): the
 * Stripe default treats a named Stripe as its own default path (sample keys, never ask), the KR
 * variant reaches the same place through the reference. What is asked:
 *  - Stripe is what gets integrated — not Toss substituted because keys did not arrive;
 *  - no request for the user's Stripe keys — not up front, not as a closing "send me these";
 *  - test mode is disclosed (nothing really charged).
 *
 * NOT controlled by `tests/negative-control.mjs` yet (neither is 09), and NOT IN
 * `tests/baseline.develop.json`: `--compare` scores these asserts but cannot flag a regression until
 * a baseline that includes them is recorded.
 */
export default {
  id: 'payment-named-stripe',
  lang: 'ko',
  prompt: 'Weegloo 로 쇼핑몰을 만들고 있어. 디자인 시안에 결제는 Stripe 로 잡혀 있어. 카드 결제 붙여줘.',
  asserts: [
    { id: 'integrates-stripe', kind: 'must_match', pattern: /Stripe|스트라이프/i,
      why: '디자인이 provider 를 지정했다 — 그것이 binding 이고, 기본 provider 는 fallback 이 아니다' },
    { id: 'no-toss-substitute', kind: 'judge', expect: 'no',
      question: 'Does the answer integrate Toss Payments (its widget/SDK, test keys, or confirm API) as the payment provider, instead of or alongside Stripe? Mentioning Toss only to say it is not being used is NO.',
      why: '키가 안 왔다고 기본 provider 로 바꾸면 사용자가 고르지 않은 provider 를 만드는 것 — 잘못된 작업이지 선행 작업이 아니다' },
    { id: 'no-key-request', kind: 'judge', expect: 'no',
      question: "Does the answer ask the user to provide Stripe API keys — a publishable key, a secret key, pk_test/sk_test values, or anything to copy from the Stripe dashboard — whether up front, as a condition for building the checkout, or as a closing \"send me these and I'll continue\"? Stating that the user's own keys can be swapped in later, without asking for them, is NO.",
      why: 'Stripe 는 공개 샘플 키 쌍을 발행하므로 키는 blocking input 이 아니다 — 요청하면 결제가 inert 한 채 멈춘다' },
    { id: 'test-mode-disclosed', kind: 'judge', expect: 'yes',
      question: 'Does the answer state that the payment flow runs in test mode (on test or sample keys) and that nothing is really charged?',
      why: '테스트 모드 결제를 말없이 넘기면 production-ready 로 읽힌다 — 가장 나쁜 실패' },
  ],
};
