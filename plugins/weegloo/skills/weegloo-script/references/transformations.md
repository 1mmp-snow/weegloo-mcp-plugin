# Media transformations — `PdfWatermark`

Read this before writing a `transformations` array on a Media `file` directive — today that means
stamping a PDF (a buyer's email or order number on a purchased document, a `CONFIDENTIAL` mark). It
assumes the spine's **Media ingest** paragraph (`source` / `encoding`, which writes take a `file`
directive, locale buckets); that is not repeated here.

## The directive

```jsonc
"file": {
  "source": "{ /original/fields/file/en-US/url }", "encoding": "url",
  "transformations": [
    { "type": "PdfWatermark", "text": "Licensed to { /payload/email }", "color": "#808080" }
  ]
}
```

- `transformations` is an **array**, applied **in order** to the fetched / decoded bytes before they
  are uploaded — each step takes the previous one's output. The one type today is `PdfWatermark`.
- It goes on any `file` directive: `ResourceCreate`, `ResourceUpdate` and `ResourcePatch` alike.
- The **source is never modified.** The stamped bytes become the new file — of a new Media
  (`ResourceCreate`) or of the target's re-ingested locale (`ResourceUpdate` / `ResourcePatch`). To
  stamp a file that already lives in the Space, `ResourceRead` its Media (default `from: Current`,
  management shape) and pass `{ /<name>/fields/file/<locale>/url }` as the `source`.
- Fields other than `type`, `text` and `color` are **ignored** — there is no size, position or
  opacity option. An unknown `type`, or a `transformations` that is not an array, is refused at
  Script save (`WGL400096`).

## What `PdfWatermark` draws

- On **every page**: one line of `text` along the page's **bottom-left → top-right diagonal**, its
  middle on the page center, drawn **over** the content at **30% opacity** so the page stays readable,
  in Helvetica.
- **Size is automatic, per page:** the text runs along up to 80% of the diagonal, capped at 15% of
  the page's shorter side — a short `CONFIDENTIAL` comes out large, a 64-character line small, and
  neither leaves the page.
- `color` is optional, `#RRGGBB`, default **`#808080`**.

## `text` limits — and where each one fails

`text` is a value expression. **Only a literal can be judged at save time**; anything holding a
`{ /pointer }` is judged on its resolved value, when the run reaches the ingest.

| Rule | Literal `text` | `text` holding `{ /ptr }` |
|---|---|---|
| **One line of WinAnsi characters** — Latin letters, digits and common punctuation (`·` `—` `€` `“ ”` `é` …); **no Korean / Japanese / Chinese, no line break** | Script save refused, `WGL400096` | run fails `400` on the resolved value |
| **1–64 characters** | Script save refused, `WGL400086` | not checked at save; run fails `400` on the resolved length |

- **Budget the fixed part.** `"Purchased by { /payload/email } · Order { /payload/orderId }"` is 22
  fixed characters, leaving **42** for the email and order id together; a longer real value saves
  fine and fails every run that gets one. Keep the fixed text short —
  `"{ /payload/email } · { /payload/orderId }"` spends 3.
- **Stamp identifiers, not names.** A buyer's name in Hangul (or any non-Latin script) is not
  drawable and fails the run; an email or an order id is.

## Run-time failures

| Cause | Status |
|---|---|
| The source is not a PDF — judged by its **content**, not its name or extension | `422` |
| The PDF cannot be read, or is encrypted / password-protected | `422` |
| The resolved `text` is outside 1–64 characters or holds an undrawable character | `400` |

Each is a Script error like any other failed statement: the run reports it (and a `Try` can catch
it). The ingest runs **before** the Media write, so a failed transformation creates no Media and
leaves an Update/Patch target unchanged. Stamping is part of the ingest and spends the run's time
budget the same way (an 8-page, 4 MB A4 PDF takes about a second).

## Recipe — stamp a purchased PDF for its buyer

```jsonc
[
  { "type": "ResourceRead", "name": "original", "resource": "Media",
    "target": { "sys": { "id": "{ /payload/mediaId }" } } },
  { "type": "ResourceCreate", "name": "stamped", "resource": "Media", "locale": "en-US",
    "fields": {
      "title": "{ /original/fields/title/en-US }",
      "file": {
        "source": "{ /original/fields/file/en-US/url }", "encoding": "url",
        "transformations": [ { "type": "PdfWatermark", "text": "{ /payload/email } · { /payload/orderId }" } ]
      }
    } },
  { "type": "Return", "value": { "mediaId": "{ /stamped/sys/id }" } }
]
```

- The original needs an `en-US` title and file, or the run fails `400` (a pointer resolving to null).
- `publish` defaults to `true`, so the stamped copy is **delivered by CDA like any published Media**.
  Set `"publish": false` when it must not be.
- Trigger it however the purchase is recorded: the buyer's `/execute` with the body above, or a
  `weegloo-webhook` on the order Content — `/payload` then takes the Webhook's body shape, so rewrite
  the `{ /payload/… }` pointers to match it.
