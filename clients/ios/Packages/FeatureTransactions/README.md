# FeatureTransactions

The transactions list: the first screen in this app that shows data a server owns, and the one that proves the whole chain — phone, BFM, finance pillar, SQLite, and back.

The visual treatment is deliberately plain. The real design has not landed, and when it does it should arrive as a diff against `DesignSystem` rather than a rewrite here: every colour, gap and type size on this screen is a token, and there is no point size anywhere.

## What is here and what is not

This package holds the screen and the decisions behind it. It holds no networking, and it names neither `Auth` nor `BFMClient` — it reads `AppCore`'s `TransactionsRepository` and does not know that the thing behind it attaches a device token and speaks HTTP.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                   | Lives in                                        |
| ----------------------------------------- | ----------------------------------------------- |
| The screen, paging, refresh, failure copy | here                                            |
| `GET /mobile/finance/transactions`        | `BFMClient` — generated from the BFM contract    |
| Attaching a token, refreshing, revocation | `Auth` — `AuthenticatingMiddleware`             |
| `Transaction`, `MoneyAmount`, the errors  | `AppCore`                                       |
| Every colour, gap and type size           | `DesignSystem`                                  |

## Empty is not an outage

The one distinction the whole screen is built around. The BFM answers a finance outage with a typed unavailable response rather than a `500` or an empty list, precisely so this app never renders "no transactions yet" when the truth is that it could not ask. `TransactionsListState` keeps `empty` and `failed` apart, the copy for each is asserted to differ, and `TransactionsCopyTests` fails if the outage sentence ever starts reading like the empty one.

## Cursors, and the two ways paging goes wrong

The cursor is the server's, opaque, and never derived here. Offsets are the alternative and they are wrong on any list that mutates: a row inserted at the head between two requests shifts every offset after it, so page two re-sends a row page one already showed and skips one nobody ever sees.

The subtler failure is a response landing *after* the list it was requested for has been thrown away. Pull-to-refresh resets the cursor while a page fetch may still be in flight; when that fetch completes it would append rows from a list that no longer exists. `TransactionsListViewModel` carries a generation counter for exactly this — a fetch captures it before awaiting and discards its own result if it moved underneath — and `TransactionsListRefreshTests` drives the race deterministically rather than with a sleep.

The third is duplicate work: a footer that appears, provokes a fetch, and provokes another on the next layout pass. Every test that touches paging asserts the repository's call count, because a list that fetches the same page twice renders correctly either way and bills the difference to somebody's cellular plan.

## A failure never takes the rows away

Two decisions, and both were made on purpose:

- **A page fetch that fails mid-scroll keeps the rows and reports the failure underneath them**, with a retry that resumes from the cursor that failed rather than restarting the list. Discarding a screenful because the eleventh page failed costs the reader everything they had and re-costs every page already fetched.
- **A failed refresh keeps the rows and reports the failure above them.** A refresh is an offer to re-check, not a demand; answering a failed one by deleting what somebody was reading punishes the gesture and tells them nothing they could not have been told beside it.

Neither leaves a half-list looking whole — the footer or the banner is always there saying so, and both are announced to VoiceOver rather than only drawn, because VoiceOver does not move focus to content that appears above or below what was just touched.

The one retry that is *not* offered is an automatic one. The row that provoked a failed fetch is still on screen afterwards, so an appearance-triggered retry fires again on the next layout pass and keeps firing against a server that has already said no. Retrying the tail is a button.

## Amounts and dates

Both come out of `TransactionPresentation`, which takes a locale and a time zone rather than reading the process's own. That is what makes "what does this row say" a test instead of something that passes in Sydney and fails on a UTC runner.

Nothing here derives a sign or a currency. The BFM sends both, `MoneyAmount` carries them as sent, and re-deriving either on a phone is how two screens end up disagreeing about whether a refund is money in.

Money arriving is the only thing the list colours, and it is coloured because it is the rarer event rather than because it is good. Spending stays on `popsForeground`: `popsDestructive` means "this failed" or "this cannot be undone" everywhere else in the app, and borrowing it for every purchase would tell the reader their groceries were an error.

## `SwiftUI.Transaction` and `AppCore.Transaction`

Both are in scope in every file here that imports SwiftUI, and the SwiftUI one — the animation type — is not the one this screen draws. Unqualified, the ambiguity resolves against the model and the compiler reports it as failed member lookup on `View.transaction(_:)`, which points nowhere near the real problem. Every mention of the type in a SwiftUI file is therefore written `AppCore.Transaction`.

## The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator. Unlike `FeaturePairing` that costs almost nothing here: this screen touches no camera and no iOS-only text-entry modifier, so every decision it makes is answered in well under a second by

```bash
swift test --package-path Packages/FeatureTransactions
```

There is one platform conditional, in `TransactionRowRenderingTests`. macOS has no Dynamic Type, so the assertion that a row renders differently at `.accessibility5` would be measuring the platform rather than the row. It is compiled out on the host rather than skipped there, so it cannot report a pass it never made, and it runs for real in

```bash
mise run test
```

which builds every package against the iOS SDK on a simulator — the same command CI runs.

## Verification gap: the assembled screen is never rasterised

`TransactionRowRenderingTests` proves a *row* draws, draws differently in light and dark, and grows with Dynamic Type. The screen it sits on is not covered, and `ImageRenderer` — the technique `DesignSystem` uses for exactly this — cannot cover it. That was measured rather than assumed, and both halves of the screen defeat it independently:

- **`ScrollView` content is not drawn.** A `ScrollView` of rows rasterises to a uniform image: one distinct byte value across the whole canvas. That is the `loaded` and `empty` states, which are the states worth looking at.
- **A root carrying `.task` and `.onChange` renders the same image whatever state it is in.** The same primitives rendered through a plain wrapper produce four distinct images; `TransactionsListView` produces two, and neither depends on the state that was supposed to select it. Swapping the model between `@State` and a plain `let` changed nothing, so the state wrapper is not the cause.

So a snapshot gate for this screen needs a real host — an XCUITest, or a hosted test rendering into a window — not `ImageRenderer`.

Nothing automated exercises the screen under VoiceOver either. What the code does about accessibility — an unconditional `ScrollView`, text styles rather than point sizes, one accessibility element per row carrying a whole sentence, and spoken announcements when a refresh or a page fails — is reasoning, not measurement. There are `#Preview`s at `.accessibility5`, and a preview is something a person looks at, which is not a gate.

Tracked as POPS-1583 against the whole app rather than this package, because it applies to every screen the app grows. Delete this section when it lands.
