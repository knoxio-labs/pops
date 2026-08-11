# FeatureTransactions

The transactions list and the detail screen behind one of its rows: the first screens in this app that show data a server owns, and the ones that prove the whole chain — phone, BFM, finance pillar, SQLite, and back.

The visual treatment is deliberately plain. The real design has not landed, and when it does it should arrive as a diff against `DesignSystem` rather than a rewrite here: every colour, gap and type size on these screens is a token, and there is no point size anywhere.

## What is here and what is not

This package holds both screens and the decisions behind them. It holds no networking, and it names neither `Auth` nor `BFMClient` — it reads `AppCore`'s `TransactionsRepository` and does not know that the thing behind it attaches a device token and speaks HTTP.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                    | Lives in                                      |
| ------------------------------------------ | --------------------------------------------- |
| The screens, paging, refresh, failure copy | here                                          |
| `GET /mobile/finance/transactions[/:id]`   | `BFMClient` — generated from the BFM contract |
| Attaching a token, refreshing, revocation  | `Auth` — `AuthenticatingMiddleware`           |
| `Transaction`, `TransactionDetail`, errors | `AppCore`                                     |
| Every colour, gap and type size            | `DesignSystem`                                |

## An embedder gets one view

`TransactionsFlowView` is the whole of this package's public surface worth naming. It owns the `NavigationStack` and maps `Route.transactionList` and `Route.transactionDetail(id:)` to views; whoever embeds it places one thing and learns about neither screen.

The mapping is here rather than on the list because a list that constructed the detail screen would name its concrete type, and the two would then be changed together forever. `TransactionsListViewModel.select(_:)` sends a route and nothing else. Both screens live in one module, so the compiler cannot hold that line — `TransactionsScreenBoundaryTests` reads the sources and fails if any of the three list files ever mentions `TransactionDetailView` or `TransactionDetailViewModel`, and fails equally if `TransactionsFlowView` stops naming them.

It is not in the composition root because both routes belong to this feature, so this is a feature resolving its own routes rather than one feature reaching into another's screens — which is the coupling the indirection exists to prevent. The app-wide root (POPS-1391) may hoist the map once there is more than one feature to map; nothing here changes when it does.

## The detail screen opens on content

The list already holds the row that was tapped, so the detail screen opens showing it and fills in underneath. A spinner drawn over data the app has had all along is a screen that appears slower than it is, and makes the reader wait to confirm they tapped the row they meant to.

`TransactionsFlowView` is the only place holding both halves, which is what lets the seed be handed over directly rather than through a cache somebody would then have to invalidate. `nil` is an ordinary answer and not a fallback path: a route restored on a cold launch, or one reached after a refresh dropped the row, has no seed and loads from scratch.

The seed is never treated as the answer. The fetch still happens — the list row is a subset, and may be minutes old — and `TransactionDetailContent` projects both shapes into one value so arriving at the fuller record is lines appearing rather than the screen being replaced under the reader.

## Deleted is not broken

The detail screen's version of the distinction below, and the reason `transactionDetail(id:)` returns an optional rather than throwing. A transaction finance no longer has is the system working: somebody opened a list, finance deleted a row, they tapped it. Modelling that as a `RepositoryError` case would have made every exhaustive switch over that enum — including the _list's_ copy table — handle a state it can never receive, and would have put a retry on screen against an answer that will not change.

So it draws as the empty treatment, muted and with no retry, and `TransactionsCopyTests` fails if its sentence ever starts reading like any of the failure sentences.

## Empty is not an outage

The one distinction the whole screen is built around. The BFM answers a finance outage with a typed unavailable response rather than a `500` or an empty list, precisely so this app never renders "no transactions yet" when the truth is that it could not ask. `TransactionsListState` keeps `empty` and `failed` apart, the copy for each is asserted to differ, and `TransactionsCopyTests` fails if the outage sentence ever starts reading like the empty one.

## Cursors, and the two ways paging goes wrong

The cursor is the server's, opaque, and never derived here. Offsets are the alternative and they are wrong on any list that mutates: a row inserted at the head between two requests shifts every offset after it, so page two re-sends a row page one already showed and skips one nobody ever sees.

The subtler failure is a response landing _after_ the list it was requested for has been thrown away. Pull-to-refresh resets the cursor while a page fetch may still be in flight; when that fetch completes it would append rows from a list that no longer exists. `TransactionsListViewModel` carries a generation counter for exactly this — a fetch captures it before awaiting and discards its own result if it moved underneath — and `TransactionsListRaceTests` drives the race deterministically rather than with a sleep, through a repository that parks mid-call until the test lets it go.

The third is duplicate work: a footer that appears, provokes a fetch, and provokes another on the next layout pass. Every test that touches paging asserts the repository's call count, because a list that fetches the same page twice renders correctly either way and bills the difference to somebody's cellular plan.

## A failure never takes the content away

Three decisions, and all of them were made on purpose:

- **A page fetch that fails mid-scroll keeps the rows and reports the failure underneath them**, with a retry that resumes from the cursor that failed rather than restarting the list. Discarding a screenful because the eleventh page failed costs the reader everything they had and re-costs every page already fetched.
- **A failed refresh keeps the rows and reports the failure above them.** A refresh is an offer to re-check, not a demand; answering a failed one by deleting what somebody was reading punishes the gesture and tells them nothing they could not have been told beside it.
- **A detail fetch that fails over a seeded row keeps the row and reports the failure above it.** What is on screen came off the list and is true; it is simply not the whole record. Only a failure with _nothing_ on screen becomes the screen.

None of them leaves a half-screen looking whole — the footer or the banner is always there saying so, and all of them are announced to VoiceOver rather than only drawn, because VoiceOver does not move focus to content that appears above or below what was just touched. Each of the three clears its failure _before_ re-requesting, so a retry that fails identically is still a `nil -> error` transition and still gets announced; without that, a second identical failure is silence for anyone who cannot see the banner.

The one retry that is _not_ offered is an automatic one. The row that provoked a failed fetch is still on screen afterwards, so an appearance-triggered retry fires again on the next layout pass and keeps firing against a server that has already said no. Retrying the tail is a button.

## Amounts and dates

Both come out of `TransactionPresentation`, which takes a locale and a time zone rather than reading the process's own. That is what makes "what does this row say" a test instead of something that passes in Sydney and fails on a UTC runner. `TransactionDetailPresentation` holds one and adds the labelled lines the detail screen draws.

Nothing here derives a sign or a currency. The BFM sends both, `MoneyAmount` carries them as sent, and re-deriving either on a phone is how two screens end up disagreeing about whether a refund is money in.

Money arriving is the only thing either screen colours, and it is coloured because it is the rarer event rather than because it is good. Spending stays on `popsForeground`: `popsDestructive` means "this failed" or "this cannot be undone" everywhere else in the app, and borrowing it for every purchase would tell the reader their groceries were an error.

A field finance has nothing for is dropped rather than drawn as a dash — including one holding only whitespace, which finance's free-text columns do produce. A detail screen padded out with six empty labels reads as a record that failed to load. Only `lastEdited` carries a clock time, because two edits on one afternoon are different edits and a bare date cannot say which.

## `SwiftUI.Transaction` and `AppCore.Transaction`

Both are in scope in every file here that imports SwiftUI, and the SwiftUI one — the animation type — is not the one these screens draw. Unqualified, the ambiguity resolves against the model and the compiler reports it as failed member lookup on `View.transaction(_:)`, which points nowhere near the real problem. Every mention of the type in a SwiftUI file is therefore written `AppCore.Transaction`.

## The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator. Unlike `FeaturePairing` that costs almost nothing here: this screen touches no camera and no iOS-only text-entry modifier, so every decision it makes is answered in well under a second by

```bash
swift test --package-path Packages/FeatureTransactions
```

There are two platform conditionals, in `TransactionRowRenderingTests` and `TransactionDetailRenderingTests`. macOS has no Dynamic Type, so the assertion that a row or a card renders differently at `.accessibility5` would be measuring the platform rather than the view. Both are compiled out on the host rather than skipped there, so neither can report a pass it never made, and both run for real in

```bash
mise run test
```

which builds every package against the iOS SDK on a simulator — the same command CI runs.

## Verification gap: the assembled screen is never rasterised

`TransactionRowRenderingTests` and `TransactionDetailRenderingTests` prove a _row_ and a _card_ draw, draw differently in light and dark, and grow with Dynamic Type. Neither covers the screen those sit on, and `ImageRenderer` — the technique `DesignSystem` uses for exactly this — cannot cover it. That was measured rather than assumed, and both halves of a screen defeat it independently:

- **`ScrollView` content is not drawn.** A `ScrollView` of rows rasterises to a uniform image: one distinct byte value across the whole canvas. That is the `loaded` and `empty` states, which are the states worth looking at.
- **A root carrying `.task` and `.onChange` renders the same image whatever state it is in.** The same primitives rendered through a plain wrapper produce four distinct images; `TransactionsListView` produces two, and neither depends on the state that was supposed to select it. Swapping the model between `@State` and a plain `let` changed nothing, so the state wrapper is not the cause.

`TransactionDetailCard` exists partly because of this: splitting the drawable part out of `TransactionDetailView` is what makes any of the detail screen checkable off a simulator. The composition it sits in — the failure banner over it, the scroll view around it, which state selected it — is still not.

So a snapshot gate for these screens needs a real host — an XCUITest, or a hosted test rendering into a window — not `ImageRenderer`.

Nothing automated exercises either screen under VoiceOver. What the code does about accessibility — unconditional `ScrollView`s, text styles rather than point sizes, one accessibility element per row and per labelled line each carrying a whole sentence, and spoken announcements when a refresh, a page or a detail fetch fails — is reasoning, not measurement. There are `#Preview`s at `.accessibility5`, and a preview is something a person looks at, which is not a gate.

Tracked as POPS-1583 against the whole app rather than this package, because it applies to every screen the app grows. Delete this section when it lands.
