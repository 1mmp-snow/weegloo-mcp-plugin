#!/usr/bin/env node
/**
 * "Does this judge assert still REJECT a wrong answer?"
 *
 * WHY THIS EXISTS
 * ---------------
 * A flaky judge assert is usually fixed by loosening its wording, and loosening has one failure
 * mode with no symptom: an assert that accepts everything scores identically to an assert that
 * was deleted. Stability re-runs cannot see it — they only show the assert passing, which is
 * exactly what a vacuous assert does. Neither can the byte CI or `--compare`.
 *
 * WHAT IT COST TO LEARN THIS
 * --------------------------
 * A rewrite of `bottom-up-order` said independent groups "may be done in any order", which made
 * the assert accept the exact defect it exists to catch (a ContentType deleted before its Content).
 * It passed a negative control anyway — because the control's only wrong answer was wrong in a
 * DIFFERENT way. A negative control proves nothing about failure modes its samples do not
 * contain, so each controlled fixture carries one wrong answer per failure mode, and every judge
 * assert must reject exactly the samples that name it in `violates` — and accept the rest.
 *
 * NOT WIRED INTO CI: it spends real agent calls. Run it by hand when you change a judge question.
 *   node tests/negative-control.mjs                                  # every fixture in CONTROLS
 *   node tests/negative-control.mjs --fixture 08-space-teardown.mjs  # one (file, stem or id; comma list)
 *
 * The default is EVERY controlled fixture, not the one this file used to be hard-wired to. It is
 * run by hand after a judge question changes, and a default that graded only 08 would print
 * "every judge assert caught exactly the samples it covers" for a question it never asked the
 * judge — "could not measure" reported as "fine" (CLAUDE.md §5.3). `--fixture` narrows it;
 * `--fixture 08-space-teardown.mjs` is the old run, sample for sample.
 *
 * The criteria are READ FROM THE FIXTURE and the prompt comes from `judge.mjs`, never copied —
 * a control that grades with a different prompt than the runner proves nothing about the runner.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildJudgePrompt, parseVerdict } from './judge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEARDOWN_WRONG_ANSWERS = [
  {
    id: 'cascade-myth',
    violates: ['confirm-first', 'bottom-up-order'],
    // Deletes the Space directly on the belief that Weegloo cascades downward. Catches an assert
    // that stopped requiring any ordering at all.
    text: `Weegloo Space 삭제 계획입니다.

## 실행
1. \`cma_DeleteOneSpace\` 를 호출해서 Space 를 바로 삭제합니다. Space 를 지우면 그 안에 있는
   ContentType, Content, Media 는 함께 정리되므로 개별로 지울 필요가 없습니다.
2. 삭제가 끝나면 \`cma_GetListSpaces\` 로 목록에서 사라졌는지 확인합니다.
3. 혹시 실패하면 성공할 때까지 재시도합니다.

ContentType 과 글, 이미지는 Space 에 종속된 자원이라 상위 자원을 지우면 같이 없어집니다.
따라서 별도의 발행 해제나 사전 삭제 단계는 필요하지 않습니다. 바로 진행하겠습니다.`,
  },
  {
    id: 'contenttype-before-content',
    violates: ['bottom-up-order'],
    // Correct in every other respect — confirms, unpublishes, ends with the Space — and wrong in
    // exactly one: the ContentType goes before its own Content, which WGL422010 refuses. This is
    // the sample an "any order is fine" rewrite silently accepted.
    text: `Space 를 정리하는 계획입니다. 삭제는 되돌릴 수 없으므로 실행 전에 대상 Space 와
삭제될 항목 수를 보여드리고 확인받은 뒤 진행하겠습니다.

## 삭제 순서 (bottom-up)
1. **WebHosting** — \`cma_DeleteOneWebHosting\`. 배포 중(\`PENDING\`/\`PROCESSING\`)이면 대기합니다.
2. **ContentType** — \`cma_UnpublishOneContentType\` → \`cma_DeleteOneContentType\`.
   타입을 먼저 치워야 그 아래 글을 정리할 때 기준이 흔들리지 않습니다.
3. **Content** — \`Published\`/\`Changed\` 는 \`cma_UnpublishOneContent\` 로 발행 해제한 뒤
   \`cma_DeleteOneContent\`. 목록은 \`links.next\` 로 끝까지 페이징합니다.
4. **Media** — \`cma_UnpublishOneMedia\` 후 \`cma_DeleteOneMedia\`. 파일 처리(\`state\`)가
   끝나기를 기다립니다. Media 는 다른 자원과 독립이라 순서는 언제든 상관없습니다.
5. **Space** — 위 4종이 0인지 확인한 뒤 \`cma_DeleteOneSpace\`.`,
  },
];

// Four samples for three asserts. `amount-from-server-price` and `no-buyer-order-write` overlap on
// the historical defect (`browser-writes-order` breaks both), so each also gets a sample that
// breaks it ALONE — without those, either assert could go vacuous behind the other and this
// control would still pass. Every sample is correct on the points ledger (only a Script writes it),
// so no judge is distracted by a question none of them asks.
const PAYMENT_WRONG_ANSWERS = [
  {
    id: 'browser-writes-order',
    violates: ['amount-from-server-price', 'no-buyer-order-write'],
    // The shape e670b72 shipped in both payment versions: the page prices the cart and creates the
    // order row itself, and the confirm Script compares the provider's amount with that row. The
    // verification really does run server-side — against the buyer's own number. Grant-once is
    // correct, so `grant-once` must accept it.
    text: `Weegloo 쇼핑몰의 결제와 적립금 지급 설계입니다. 결제 검증은 브라우저가 아니라 서버(Script)에서 합니다.

## ContentType
- **products** — \`name\`, \`price\`(Long). 관리자가 콘솔에서 등록하고 발행합니다.
- **orders** — \`orderId\`, \`product\`(Refer), \`quantity\`, \`amount\`(Long), \`status\`, \`paymentKey\`(RichText)
- **pointLedger** — 적립 내역. confirm Script 만 씁니다.

## 흐름
1. 상품 페이지가 CDA 로 읽은 \`price\` × 수량으로 결제 금액을 계산합니다.
2. 결제하기를 누르면 브라우저가 ACMA 로 orders 에 주문 행을 만듭니다 — \`amount\` 는 1번의 금액,
   \`status: "pending"\`. 그래서 회원 ServiceUserRole 에는 orders 에 대한 \`Create\` 와,
   \`createdBy :self\` 로 좁힌 \`Read\` 를 줍니다.
3. PG 결제창을 띄우고, 결제가 끝나면 성공 페이지가 confirm Script 를 호출합니다.
4. **confirm Script** (서버, 관리자가 작성):
   - \`ResourceFind\` 로 주문을 찾고 \`ResourceRead\` 로 id 로 다시 읽습니다. 이미 \`paid\` 면 바로 Return 합니다.
   - PG 결제 조회 API 를 \`Http\` 로 부릅니다. 시크릿 키는 \`"secret": true\` 헤더에 둡니다.
   - PG 가 알려준 결제 금액이 주문 행의 \`amount\` 와 같은지 비교하고, 다르면 402 로 끝냅니다.
   - 같으면 그 읽기의 \`sys.version\` 으로 잠가 \`status: "paid"\` 를 패치하고, 충돌하면 409 로 끝냅니다.
   - 패치에 성공한 호출만 \`amount\` 의 5% 를 pointLedger 에 적립합니다.

금액 비교를 브라우저가 아니라 Script 안에서 PG 응답과 하므로, 금액을 위조해도 통과하지 못합니다.`,
  },
  {
    id: 'payload-amount',
    violates: ['amount-from-server-price'],
    // Breaks the amount source ALONE: no order row is written by the page and the buyer's role is
    // read-only, but the Script takes the amount from its payload. `no-buyer-order-write` must
    // ACCEPT it — it asks who writes the row, not where the number came from.
    text: `Weegloo 쇼핑몰의 결제와 적립금 지급 설계입니다.

## ContentType
- **products** — \`name\`, \`price\`(Long). 관리자가 콘솔에서 등록하고 발행합니다.
- **orders** — \`orderId\`, \`product\`(Refer), \`quantity\`, \`amount\`(Long), \`status\`, \`paymentKey\`(RichText)
- **pointLedger** — 적립 내역. confirm Script 만 씁니다.

## 흐름
1. 상품 페이지가 CDA 로 읽은 \`price\` × 수량으로 합계를 계산해, 주문 Script 에
   \`{ orderId, productId, quantity, amount }\` 를 보냅니다.
2. **주문 Script** (서버)가 orders 행을 만듭니다 — \`amount\` 는 payload 의 \`amount\`,
   \`status: "pending"\`, \`propagateEvents: true\`. PG 결제도 같은 금액으로 요청합니다.
   브라우저는 주문 행을 직접 쓰지 않습니다.
3. **confirm Script**: 주문을 찾아 id 로 다시 읽고, 이미 \`paid\` 면 바로 Return → PG 결제 조회 →
   PG 금액이 주문 행의 \`amount\` 와 같은지 비교 → \`sys.version\` 잠금으로 \`paid\` 패치(충돌 시 409) →
   패치에 성공한 호출만 5% 적립.

## 회원 역할 (ServiceUserRole)
orders 에는 \`createdBy :self\` 로 좁힌 \`Read\` 만, products 에는 \`Read\` 만, Script 는 주문·confirm
두 개에 \`Execute\` 만 줍니다. orders 에 대한 \`Create\`·\`Edit\`·\`All\` 은 주지 않습니다.

주문 행은 Script 만 쓰고 금액 비교도 서버에서 하므로 위조할 수 없습니다.`,
  },
  {
    id: 'buyer-can-edit-order',
    violates: ['no-buyer-order-write'],
    // Priced correctly — a Script reads the product row and creates the order — but the buyer's role
    // may Edit their own orders. There is no field-level permission, so they can rewrite `amount`,
    // set `status: "paid"`, or put a paid order back to `pending` and replay the grant. That is ONE
    // failure, a WRITE failure, and it belongs to `no-buyer-order-write` alone: the amount was
    // computed from the product price and the confirm Script guards the grant, so
    // `amount-from-server-price` and `grant-once` must both ACCEPT it (each of their questions sets
    // the order row's writers aside, so the three stay one failure mode each).
    text: `Weegloo 쇼핑몰의 결제와 적립금 지급 설계입니다.

## ContentType
- **products** — \`name\`, \`price\`(Long). 관리자가 콘솔에서 등록하고 발행합니다.
- **orders** — \`orderId\`, \`product\`(Refer), \`quantity\`, \`amount\`(Long), \`status\`, \`memo\`, \`paymentKey\`(RichText)
- **pointLedger** — 적립 내역. confirm Script 만 씁니다.

## 흐름
1. 결제하기를 누르면 브라우저는 주문 Script 에 \`{ orderId, productId, quantity }\` 만 보냅니다. 가격은 보내지 않습니다.
2. **주문 Script** 가 products 행을 발행본(\`from: "Published"\`)으로 읽어 ContentType 과 수량을 검사하고,
   \`price\` × \`quantity\` 로 금액을 계산해 orders 행을 직접 만듭니다(\`propagateEvents: true\`).
   PG 결제 요청도 이 Script 가 돌려준 금액으로 합니다.
3. **confirm Script**: 주문을 찾아 id 로 다시 읽고, 이미 \`paid\` 면 바로 Return → PG 결제 조회 →
   PG 금액이 주문 행의 \`amount\` 와 같은지 비교 → \`sys.version\` 잠금으로 \`paid\` 패치(충돌 시 409) →
   패치에 성공한 호출만 5% 적립.

## 회원 역할 (ServiceUserRole)
회원이 배송 메모를 고치거나 결제 전 주문을 취소할 수 있도록, orders 에 \`Read\` 와 \`Edit\` 을
\`createdBy :self\` 로 줍니다. products 에는 \`Read\` 만, Script 는 주문·confirm 두 개에 \`Execute\` 만 줍니다.

\`\`\`json
"content": {
  "Read": { "Allow": [ { "contentType": { "sys": { "id": "<ordersCtId>" } }, "createdBy": { "sys": { "id": ":self" } } } ] },
  "Edit": { "Allow": [ { "contentType": { "sys": { "id": "<ordersCtId>" } }, "createdBy": { "sys": { "id": ":self" } } } ] }
}
\`\`\``,
  },
  {
    id: 'grant-on-every-confirm',
    violates: ['grant-once'],
    // Priced by a Script and role-safe, but the confirm Script grants after a verify call that
    // consumes nothing, with no already-paid guard — the 32c6442 defect. It even DISCUSSES the
    // replay and calls it harmless, so a question loosened to "does the answer mention repeated
    // confirms" would accept it; the real question must not.
    text: `Weegloo 쇼핑몰의 결제와 적립금 지급 설계입니다.

## ContentType
- **products** — \`name\`, \`price\`(Long). 관리자가 콘솔에서 등록하고 발행합니다.
- **orders** — \`orderId\`, \`product\`(Refer), \`quantity\`, \`amount\`(Long), \`status\`, \`paymentKey\`(RichText)
- **pointLedger** — 적립 내역. confirm Script 만 씁니다.

## 흐름
1. 결제하기를 누르면 브라우저는 주문 Script 에 \`{ orderId, productId, quantity }\` 만 보냅니다.
2. **주문 Script** 가 products 발행본의 \`price\` × \`quantity\` 로 금액을 계산해 orders 행을 만들고
   (\`propagateEvents: true\`), 그 금액으로 PG 결제를 요청합니다.
3. **confirm Script**:
   - \`ResourceFind\` 로 주문을 찾습니다. 없으면 404.
   - PG 결제 조회 API(GET)로 결제 상태와 금액을 가져옵니다.
   - 결제 완료이고 PG 금액이 주문 행의 \`amount\` 와 같으면 \`status: "paid"\` 로 패치합니다.
   - 이어서 \`amount\` 의 5% 를 pointLedger 에 적립합니다.

성공 페이지를 새로고침하거나 네트워크 오류로 confirm 이 다시 호출돼도 괜찮습니다. 조회 API 는 몇 번
불러도 같은 결과를 주므로 확인이 그대로 다시 통과하고, 매번 같은 순서로 처리됩니다.

## 회원 역할 (ServiceUserRole)
orders 에는 \`createdBy :self\` 로 좁힌 \`Read\` 만, products 에는 \`Read\` 만, Script 는 주문·confirm
두 개에 \`Execute\` 만 줍니다. orders 에 대한 \`Create\`·\`Edit\`·\`All\` 은 주지 않습니다.`,
  },
];

// One sample per failure mode of 28: Stripe built on a KR install (disclosed, so only `no-stripe`
// may reject it), and the Toss default built right but shipped without the test-key disclosure.
const KR_DEFAULT_WRONG_ANSWERS = [
  {
    id: 'stripe-on-kr',
    violates: ['no-stripe'],
    // The reported defect: no provider named, Stripe built anyway. Toss is mentioned, but only as
    // a later option, so a regex on "토스" alone would pass it.
    text: `결제는 Stripe 테스트 모드로 붙이겠습니다. 결제 서비스를 지정하지 않으셔서, 키 없이 바로
동작하는 Stripe 공개 샘플 키(\`pk_test_TYooMQauvdEDq54NiTphI7jx\` / \`sk_test_BQokikJOvBiI2HlWgH4olfQ2\`)를 씁니다.

## 흐름
1. '구매하기' 버튼은 상품 id 와 수량만 주문 Script 에 보냅니다. Script 가 product 행의 가격으로
   금액을 계산해 주문을 \`pending\` 으로 만들고, Stripe Checkout Session 을 생성해 그 URL 을 돌려줍니다.
2. 브라우저는 Stripe 호스티드 결제 페이지로 이동합니다. 테스트 카드 \`4242 4242 4242 4242\` 를 화면에 안내합니다.
3. 성공 페이지가 confirm Script 를 부르고, Script 가 Stripe API 로 세션을 조회해 \`payment_status: paid\` 와
   금액이 주문 행과 같을 때만 \`paid\` 로 바꿉니다.

나중에 국내 결제가 필요하면 토스페이먼츠로 바꿀 수 있습니다.

\`\`\`diff
- 결제는 Stripe 테스트 키로 동작합니다 — 실제로 청구되는 카드는 없습니다.
\`\`\``,
  },
  {
    id: 'toss-undisclosed',
    violates: ['test-keys-disclosed'],
    // Right provider, right flow, and nothing saying the keys are test keys or that no card is
    // charged — the checkout reads as production-ready.
    text: `결제는 토스페이먼츠 결제위젯(주문서형 결제)으로 붙이겠습니다.

## 흐름
1. 상품 상세 페이지에 결제위젯을 렌더링합니다(\`renderPaymentMethods\`, \`renderAgreement\`).
2. '구매하기'를 누르면 주문 Script 가 product 행의 가격으로 금액을 계산해 주문을 \`pending\` 으로 만들고,
   그 금액으로 \`requestPayment\` 를 호출합니다.
3. 성공 페이지가 confirm Script 를 즉시 부릅니다. Script 는 토스 승인 API 를 호출한 뒤 결제 조회 API 로
   \`DONE\` 과 금액·주문번호가 주문 행과 같은지 확인하고 \`paid\` 로 바꿉니다.
4. 시크릿 키는 Script 의 \`Http.headers\` 에 \`secret: true\` 로만 넣고, 브라우저에는 클라이언트 키만 둡니다.

배포하면 바로 카드 결제를 받을 수 있습니다.`,
  },
];

// Controlled fixture file → its wrong answers. A fixture joins by adding a line here; its judge
// questions are read from the fixture itself.
const CONTROLS = {
  '08-space-teardown.mjs': TEARDOWN_WRONG_ANSWERS,
  '26-payment-amount-grant-once.mjs': PAYMENT_WRONG_ANSWERS,
  '28-payment-default-kr-toss.mjs': KR_DEFAULT_WRONG_ANSWERS,
};

function agent(prompt) {
  return new Promise((resolve, reject) => {
    const c = spawn('claude', ['-p'], { shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    c.stdin.on('error', () => {});
    c.stdin.end(prompt, 'utf-8');
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('error', reject);
    c.on('close', () => resolve(out));
  });
}

function harnessError(msg) { console.error(msg); process.exit(2); }

let wanted = null;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--fixture' && process.argv[i + 1]) wanted = process.argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  else harnessError(`unknown or incomplete argument: ${arg}  (usage: --fixture <file|stem|id>[,…])`);
}

// Load and check EVERY selected fixture before the first agent call: a harness error found halfway
// through would have spent the calls before it and still measured nothing.
const selected = [];
for (const [file, samples] of Object.entries(CONTROLS)) {
  let fx;
  try { fx = (await import(pathToFileURL(path.join(__dirname, 'fixtures', 'routing', file)).href)).default; }
  catch (err) { harnessError(`${file}: cannot load the controlled fixture — ${err.message}`); }
  if (!fx || !Array.isArray(fx.asserts)) harnessError(`${file}: no fixture default export with 'asserts'`);
  const names = [file, file.replace(/\.mjs$/, ''), fx.id];
  if (wanted && !wanted.some((w) => names.includes(w))) continue;
  const judges = fx.asserts.filter((a) => a.kind === 'judge');
  if (!judges.length) harnessError(`${file} has no judge asserts to control`);
  const judgeIds = new Set(judges.map((a) => a.id));
  // A `violates` id that names no judge assert (a typo, a renamed assert) does not fail quietly —
  // the real assert then rejects a sample it was "not supposed to", and is reported as OVERREACH,
  // sending the next person to loosen a healthy question. Refuse it here, by name.
  for (const bad of samples) {
    const unknown = bad.violates.filter((id) => !judgeIds.has(id));
    if (unknown.length) harnessError(`${file}: wrong answer '${bad.id}' violates ${unknown.join(', ')} — no judge assert of that id in the fixture`);
  }
  // A judge assert that no sample must reject is never shown rejecting anything: it would pass this
  // control while accepting every answer. Refuse the run rather than print a green for it.
  const uncovered = judges.filter((a) => !samples.some((b) => b.violates.includes(a.id)));
  if (uncovered.length) harnessError(`${file}: no wrong answer is meant to be caught by ${uncovered.map((a) => a.id).join(', ')} — add one per failure mode`);
  selected.push({ file, names, samples, judges });
}
const missing = (wanted || []).filter((w) => !selected.some((s) => s.names.includes(w)));
if (missing.length) harnessError(`--fixture matched no controlled fixture: ${missing.join(', ')}  (controlled: ${Object.keys(CONTROLS).join(', ')})`);

// A sample wrong in ONE dimension must be rejected by the assert covering that dimension — and
// ACCEPTED by the others. Demanding that every assert reject every sample was this control's own
// bug: `media-after-contenttype` opens by promising to confirm before deleting, so `confirm-first`
// saying YES is correct, and scoring that as VACUOUS would send the next person to "fix" a healthy
// assert. Over-rejection is reported too — an assert that fails a sample it does not cover is
// reading something it was never asked about, which is how a gate quietly starts measuring the
// wrong thing.
let failed = 0;
for (const { file, samples, judges } of selected) {
  console.log(`
=== ${file}  (${judges.length} judge assert(s) × ${samples.length} wrong answer(s))`);
  for (const bad of samples) {
    console.log(`
--- wrong answer: ${bad.id}  (must be caught by: ${bad.violates.join(', ')})`);
    for (const a of judges) {
      const shouldReject = bad.violates.includes(a.id);
      const verdict = parseVerdict(await agent(buildJudgePrompt(bad.text, a.question)));
      if (verdict === null) { console.log(`  ??        ${a.id}: judge emitted no verdict`); failed++; continue; }
      const rejected = a.expect === 'yes' ? verdict === false : verdict === true;
      if (shouldReject && !rejected) { console.log(`  VACUOUS   ${a.id}: accepted a sample it must catch`); failed++; }
      else if (!shouldReject && rejected) { console.log(`  OVERREACH ${a.id}: rejected a sample it does not cover`); failed++; }
      else console.log(`  OK        ${a.id}: ${rejected ? 'rejected' : 'accepted'}, as expected`);
    }
  }
}
console.log('');
console.log(failed ? `${failed} check(s) failed.` : `every judge assert caught exactly the samples it covers (${selected.map((s) => s.file).join(', ')}).`);
process.exit(failed ? 1 : 0);
