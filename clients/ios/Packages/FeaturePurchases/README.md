# FeaturePurchases

Purchase browsing, receipt capture and the shared draft form.

`PurchasesFlowView` is the Purchases tab. It owns one navigation stack rooted at the purchases home and resolves feature-local archive and detail routes. Cross-feature links use the public `PurchasesRoute` and install `purchasesDestinations(dependencies:)` on their own stack. The existing Receipts tab continues to own capture while the home asks the app host to present that flow through `purchaseCapture`.

## Capture and the draft form

Photograph or paste a receipt and let the purchases pillar's model turn it into a purchase.

### What is here and what is not

Both ends of the flow. `ReceiptCaptureView` photographs a receipt through VisionKit's document camera and hands what it produced to `ReceiptResultView`, which calls `AppCore`'s `ReceiptCaptureRepository`. Extraction and persistence are two calls (POPS-2454): every usable reading — reconciled or not — becomes a `.draft` and reaches `ReceiptDraftView`, pre-filled; only `unreadable` has nothing to edit. Saving, from either a corrected reading or a blank manual entry, goes through the same `ReceiptDraftView`, the same `ReceiptDraft`, and the same `ReceiptResultViewModel.save(_:)` — which branches on `ReceiptResultState` to call `saveDraft(_:)` or `createManualPurchase(_:)`, never on anything the view or the form decides. Neither view names `Auth` nor `BFMClient`; both read the repository seam and have no idea a device token or HTTP call sits behind it.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                                                                     | Lives in                                                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The capture screen, the camera-refusal states, and the manual-entry action                  | here — `ReceiptCaptureView`, `ReceiptCaptureViewModel`                                                                 |
| The document camera itself, and pages becoming bytes                                        | here — `ReceiptDocumentScanner`, `ReceiptPageEncoder`                                                                  |
| The result screen (`draft` / `manualEntry` / `unreadable` / `saved`, plus gateway failures) | here — `ReceiptResultView`, `ReceiptResultViewModel`                                                                   |
| The editable form a reading — or a blank entry — becomes                                    | here — `ReceiptDraft`, `ReceiptDraftForm`, `ReceiptDraftView`                                                          |
| Turning an edited `ReceiptDraft` into the BFM's cents-based save payload                    | here — `ReceiptDraftSaveMapping`, `AppCore`'s `ReceiptMoneyText`                                                       |
| Camera permission, and the Settings deep link                                               | `AppCore` — `CameraAuthorizing`, `SystemSettings`                                                                      |
| The extraction and save/manual contract types                                               | `AppCore` — `ReceiptCaptureRepository`, `ReceiptExtraction`, `ReceiptDraftSavePayload`, `ReceiptManualPurchasePayload` |
| `POST /mobile/purchases/receipts/extract`, `/receipts` and `/manual`                        | `BFMClient` — `BFMReceiptCaptureRepository`                                                                            |
| An end-to-end Maestro flow                                                                  | `.maestro/receipt-manual-entry.yaml` — the manual path, which needs no camera                                          |

### The surface, and why it is shaped this way

Both screens are **content that scrolls with a bar of actions pinned under it**. The content changes — a first-run prompt, an outcome, and later a list and a form — and the bar does not, because the one thing a screen is for must not be the thing that scrolls off it at the accessibility text sizes where the content is longest. `PopsActionBar` is attached with `.safeAreaInset(edge: .bottom)`, so the content passes behind it rather than stopping above it.

Four decisions carry the rest of it, and each is a rule the screens landing next to these have to keep:

**The receipt is the anchor; everything else is commentary.** `ReceiptPagesView` draws the captured pages above every state of the result screen — while the call is in flight, on the confirmation, on a refusal, and on a gateway failure. What changes underneath is what was made of the paper; the paper is the same paper, and moving it per outcome would make four screens out of one. A reader told a photo could not be read wants to see the photo.

**An outcome is announced by a glyph and a colour before it is announced by a sentence.** `saved` and `unreadable` open with a `PopsStatusHeader` whose tone comes from `ReceiptResultContent.tone` — success and failure respectively. `draft` carries the same warning-toned header only when the reading did not reconcile; a reconciled draft opens with no status header at all, because there is nothing to announce beyond "here is what was read". Somebody who has just pressed a button is scanning, not reading, and grey cards distinguished only by their copy are screens that have to be read.

**A reading is laid out like the paper it was read off, not like the record it came from.** `ReceiptDraftForm` puts merchant, address and date at three different weights at the top, then the line items in a column with their amounts aligned, then what adjusts them, then the stated total emphasised at the foot. The flat label-over-value list this replaced is the shape of a database row; a discrepancy shows up when the two things being compared are laid out alike.

**One figure per screen, in `popsAmount`.** The confirmation is a total with a merchant over it. The reference identifies the purchase and describes nothing about it, so it is last, monospaced and small — the one thing on the screen nobody has to read.

### Stored purchases and the shared form

The Purchases tab renders the saved-purchase list with `PurchaseStatusFilter.all`; capture and draft creation use the receipt repository. A detail model reads the complete purchase and resolves stored receipt thumbnails concurrently while retaining their original document indexes. A failed page is omitted without shifting the pages that follow it, so opening a visible thumbnail still requests the corresponding receipt URI. Detail reads, refreshes, saves, and full-image requests each reject stale responses by generation; a failed refresh keeps the loaded purchase visible.

The detail presentation uses the saved merchant identity, day, total, settlement state, receipt lines, and server charge components. Its totals foot appears only when at least one adjustment exists, currencies remain explicit when foreign to the reader, and an unknown settlement remains visible verbatim. Loading uses the final layout's shimmering shapes, and initial failures offer Retry only for transport and availability failures.

An edited detail carries a purchases-tinted notice with the edit date. Original appears only when the server retained field changes; its sheet labels header fields by meaning, current lines by their present one-based position, removed lines as Removed, and fields from a newer server by their raw name. Added lines omit the nonexistent original row.

The production detail loads every phase through its model, keeps failed refreshes over the saved content, and exposes live Edit and Share actions only with a loaded purchase. Its receipt plate opens the tapped page in the shared full-screen pager; each swipe requests that page's full image while missing imagery retains its placeholder and page position.

Saved-purchase editing maps the full detail into the shared receipt draft while retaining every saved line identifier. Matched, partially matched, and unknown settlement states lock merchant, date, and total; line and adjustment edits remain available. A submitted update carries the complete desired line set and the detail's opaque compare-and-swap token, omits unchanged header fields, and sends no request payload when no permitted value changed. Removing a line omits it from that desired set, and an Inventory-linked line carries the exact unlink notice before removal.

The edit sheet commits from the navigation bar and asks before losing a changed draft. Saving holds the form against duplicate requests; a failure keeps every field for Keep editing or Retry, while locked and stale conflicts name their different recovery paths. A confirmed save notifies the detail host once with the server's replacement and then closes.

Saved-purchase screens share `PurchasesPresentation` for merchant names, settlement labels and tones, calendar grouping, and per-currency totals. Unknown settlement labels remain visible verbatim, and totals in different currencies never become one invented amount. `PurchaseMark`, `PurchaseStatusBadge`, and `PurchaseHeroWash` carry the approved visual vocabulary into the feature without depending on the design playground.

`PurchaseRowContent` turns a saved purchase into the value every list row draws, including whether the merchant is unattributed and whether that context asks for a settlement badge. `PurchaseRowLabel`, `PurchaseRowsPanel`, and `PurchaseMarkStack` compose that value from the shared DesignSystem panel and divided-row primitives.

`PurchaseSearchRow` draws a `PurchaseSearchHit` from `AppCore` in the same row idiom: a line always pushes the order it is on, never its own line identifier — `PurchaseSearchRowContent.route(for:)` is the one place that decides that, so a test can assert it without rendering anything. Highlighted query matches use `popsPurchases`, the same colour every screen in this package tints with `.tint(.popsPurchases)`. The filter section beside it (`PurchasesSearchFilter`, `PurchasesSearchFilterFields`) ships in a follow-up once POPS-4309 lands.

`PurchasesHomeDigest` bounds Recent and merchant leaders while keeping the server's All and Unmatched counts independent from the number of loaded rows. Its summary initializer reads monthly totals, comparisons, and aggregate merchant leaders from `PurchasesMonthSummary`; leaders remain aggregate facts and never require an invented purchase or purchase identifier.

`PurchasesHomeModel` loads that summary and the first unfiltered purchase page together. Refresh failures keep the last digest visible, while a generation counter prevents an older request from replacing a newer refresh. Capture can land complete purchases immediately or report only saved identifiers; both paths highlight every saved identifier and perform one refresh, and the identifier path never fabricates purchase rows.

The home presentation reuses DesignSystem glass, spacing, type, and status primitives. Its monthly figure keeps currencies separate and omits a comparison when the server has no previous month. Archive tiles use server counts and stack vertically at accessibility Dynamic Type sizes; the Unmatched tile disappears only when the server count is zero. Loading, empty, initial failure, and retained-content refresh failure remain visibly distinct states.

The assembled home switches between those states, refreshes without removing loaded content, and routes its tiles and rows through the Purchases stack. An empty history remains pull-to-refreshable and keeps a failed-refresh capsule visible; existing history with no activity in the current month says “No purchases this month” inside the monthly figure instead of becoming an empty history. Recent purchases mark every identifier saved by capture with a purchases-coloured wash and a “Just saved” caption until the next ordinary refresh. Merchant leaders draw aggregate rows directly from the month summary, without manufacturing purchases or identifiers. Add offers photos, files, and hand entry in that order; Scan is the purchases-tinted direct action. Both controls disappear when the host has not installed `purchaseCapture`, including on the empty state.

The archive groups each server-filtered scope into calendar months. Until a scope reaches its final cursor, only its oldest loaded month is marked incomplete; totals for that month say they are partial instead of presenting a page boundary as a complete month. Status badges answer a different question in each scope: All marks unsettled rows, while Unmatched marks only the partially matched exception.

Each archive scope owns its rows, opaque cursor, first-page total, and paging state. Switching scope invalidates in-flight work without discarding either scope's loaded cache; returning to a scope resumes from its cursor. Later pages deduplicate purchase identifiers, keep the first page's server total, and expose failure only at the footer so already loaded months remain readable.

The archive screen pins shared section headers over shared purchase-row panels. Its principal toolbar picker swaps All and Unmatched without creating another navigation stack, and rows push feature-local detail values. First-page loading and failure replace the screen; later-page loading, failure, retry, and the “Everything since” boundary live in the footer beneath rows that remain readable. The archive loading footer follows the next-page cursor, so a duplicate-only page can advance pagination without requiring new rows or a scroll gesture.

Editing a saved purchase remains POPS-2458. There is no initialiser building a `ReceiptDraft` from a `ReceiptPurchase`: that summary carries a merchant, a total and a count, and a form pre-filled from it would present three line items as zero. Reusing the form requires the full detail model, rather than treating the summary as an editable purchase.

### The form, and how both entry points reach it

`StagedReceipts` is the grouping model shared by production capture and the design playground. A
selected page starts as a one-page receipt; combining, moving, separating, and deleting pages keep
receipt and page order stable and remove empty groups. Adding an identifier already present is a
no-op, including a duplicate within one picker result. `PurchaseStagingModel` exposes that shape to
SwiftUI without adding a receipt-page ceiling; upload size remains the only bound. A document scan
arrives as one ordered receipt and is refused only when it has no pages or when some photographed
pages could not be prepared. Replacing a page swaps it at the same receipt position.

The production page viewer reads and deletes through `PurchaseStagingModel`. Its Replace menu marks
the current page as pending before handing scan, photo, or file presentation to the capture flow,
so a returned page keeps the original receipt identity and position. The design playground's grid
still owns a raw `StagedReceipts` value; its local viewer cannot be exchanged for this model-backed
viewer without disconnecting deletion from the grid.

The production staging grid groups pages directly through that model. Its title counts receipts,
while discard confirmation counts pages; an empty Cancel leaves immediately and Read remains
unavailable until at least one receipt exists. Add and Replace report scan, photo, or file intent to
the enclosing capture flow, which owns the platform pickers. Scanner preparation refusals remain on
the grid until their alert is acknowledged.

Before reading starts, each staged receipt becomes a `StagedReceiptForReading`: its stable receipt
identity plus its parts in page order, without mutable staging layout. `PurchaseReadingRow` then
tracks queued, active, readable, and terminally unreadable outcomes while retaining a full
`ReceiptDraftReading` for review.

Review saves purchases sequentially because each draft is its own repository write. `ReviewSaving`
keeps completed writes out of a retry, attaches a failure only to the refused entry, and distinguishes
a retryable refusal from one that must be discarded. `ReviewBatch` applies discards before counting
completed writes and keeps flagged, unseen or currently invalid drafts from being saved unnoticed.
`PurchaseReadingViewModel` keeps those rows in staged order and starts at most two extractions at a
time. Each completed call opens the next queued receipt, including after an unreadable result or a
repository failure, so one bad receipt cannot stall the batch. Cancelling the reading task starts no
further calls: reads already in flight settle with their result, and receipts that never started,
or whose read the cancellation interrupted, stay queued. A reading batch is one-shot: another
`start()` call does not submit the same receipt again.

`PurchaseReadingView` presents those rows in their staging order, with a small page fan beside
waiting, active, readable, or unreadable copy. Progress stays in the navigation subtitle and Review
remains unavailable until every row has settled; Cancel remains available throughout. The active
row's pulse collapses to a static skeleton when Reduce Motion is enabled.

`ReceiptDraftView` is a reading — or a blank purchase — as something the reader may change: the pages above (empty for a manual entry), the outcome's status header, then the same groups in the same order — who and when, the items in a column, what adjusts them, the total in `popsAmount` — with every value in a `PopsTextField` instead of a `Text`. The bar's prominent action is Save; whichever the entry point's own "start again" action is sits beside it at the standard weight, which is what `PopsButtonProminence` exists for. A host that commits from its own navigation bar passes no `save`, so there is no bar, and hands the form a `Binding` to its draft so it can gate its Save on `ReceiptDraftView.canSave` as the reader types.

Merchant and address record sheets debounce searches and ask their caller for matches, rather than
filtering a preloaded catalogue. An already resolved record remains visible before the first query;
an empty unresolved sheet prompts for a query without making a request. Cancelling an older search
prevents its late result from replacing the latest answer. The form receives separate merchant
search, merchant preview, address list, and address preview closures. Address work reads the draft's
current merchant identifier when it starts, so changing merchant cannot send a later lookup to the
branch list from the previous merchant.

Three rules hold the form together, and each is a value a test asserts rather than a thing the view happens to do:

**There is no locked state, no confirmed state and no edit mode.** Nothing in `ReceiptDraft` can express "this field may not be changed". That absence is the design: most edits are not corrections. `ZCHEETOS C&B BALLS` is exactly what the till printed and exactly what nobody calls it, and a form that gated editing on the extractor's confidence would refuse the commonest reason to open it. What the gate complained about is carried as a hint against the field it names — `ReceiptDraftField` — and a hint is a prompt to look, never a lock.

**Every field exists whether or not anything was read into it.** This is where the form and `ReceiptResultContent` part company: the read-only reading drops what the receipt never stated, because an empty label reads as a record that failed to load. Dropping it here would remove exactly the field the reader came to fill in — a Salvos receipt whose items have no names would offer nowhere to name them. A blank manual entry is the limit of this: every field present, none of them read into.

**The arithmetic is reported, never recomputed.** `ReceiptDraft`'s fields hold what a model transcribed, printed-looking, whichever arm of `receipt.extract` produced them — `BFMReceiptCaptureRepository` turns the BFM's cents-based draft back into that shape once, at the repository boundary, so this module's own presentation code is unaware the wire is cents at all. The form repeats what the gate found — and withdraws it the moment a figure changes, because from then on the check is about numbers no longer on screen. `ReceiptDraftReconciliation` is those three states, and saying "as read, the items and the total agree" is what tells a reader who came to rename three items which figures to leave alone.

### Two entry points, one save path

Feature-owned controls request capture through the optional `purchaseCapture` environment presenter. The presenter receives only a `PurchaseCaptureSource`; the app host owns the navigation and whatever follows the run. A host without capture support leaves the environment value `nil`, so a feature can omit the control instead of opening a dead destination.

`purchaseCapturePresentation(dependencies:isAvailable:onSaved:)` installs that presenter and owns the
capture overlays. Staging, reading, and review share one large sheet and navigation stack; hand entry
uses its own non-dismissible sheet. The document scanner remains a full-screen system controller,
while photo and file selections return through the staging intake. Empty cancellation reports no
completion, and camera refusals offer Settings only when the system permission can be changed there.
`PurchasesFlowView` installs this presentation only when receipt capture is available and lands its
ordered saved identifiers on the home model, which refreshes and highlights the saved rows.

Review and hand entry map merchant and address choices from the bound merchant directory, returning
an empty result when that optional catalogue request fails so capture itself remains usable.

`ReceiptCaptureView`'s ready state offers two actions side by side: photograph a receipt, or "Add a purchase" with no camera involved. Both land on `ReceiptResultView` over a `ReceiptResultViewModel`, and both save through the same `save(_:)`, which reads `ReceiptResultState` to decide which BFM call to make:

- **A corrected reading (`.draft(reading)`).** `extract()` already ran; `save(_:)` turns the edited `ReceiptDraft` into a `ReceiptDraftSavePayload` — via `ReceiptDraftSaveMapping`, in this module, since `ReceiptDraft`'s fields are `internal` to it — carrying `reading`'s receipt URIs and capture facts forward untouched, and calls `saveDraft(_:)`.
- **A manual entry (`.manualEntry`).** No `extract()` call at all: `ReceiptCaptureViewModel.startManualEntry()` opens `ReceiptResultViewModel(enteringManuallyWith:)` straight on `.manualEntry`, `ReceiptDraftPresentation.blankDraft(currency:)` fills the form with nothing, and `save(_:)` calls `createManualPurchase(_:)` instead — no receipt URIs, because there is no receipt.

Money is parsed once, in `ReceiptDraftSaveMapping`, using `AppCore`'s `ReceiptMoneyText` — the same parser regardless of which of the two calls the result feeds. A field that will not parse (a stray letter, a date not in `YYYY-MM-DD[ HH:MM]`) is refused locally, before either call, as a `ReceiptDraftSaveError` the form's own alert names — never sent as an invented number.

### Showing the receipt

The pages on the result screen are the bytes the phone is holding — what the camera produced and what was uploaded, kept by `ReceiptResultViewModel.parts` after the call precisely so the reading can be checked against them. Stored purchase details instead resolve their ordered `receiptURIs` through `PurchasesRepository`: thumbnails fill the header and opening one requests the full image for that URI.

The `unreadable` capture outcome carries `receiptCount`, not stored-part URIs. `ReceiptDraftReading.receiptUris` identifies the stored parts a save attaches; those references become drawable only after the resulting saved purchase is read through the detail repository.

A page that is not a drawable image — the contract admits PDF and plain text — draws a plate with a glyph saying which it is, decided by `ReceiptPageMedia`.

### What a multi-page receipt is

One scan is one receipt and one call. `VNDocumentCameraViewController` collects several pages into a single `VNDocumentCameraScan`; every page of that scan becomes an ordered `ReceiptPart`, and the whole set goes to `ReceiptCaptureRepository.capture(_:)` once. Several photographs of one piece of paper are never several receipts — `ReceiptPart`'s own documentation says so, and the BFM's upload body says the same thing from the other side.

Two consequences follow, and each is enforced on the handset rather than discovered from a rejection:

- **All of it or none of it.** If a page cannot be encoded, the whole scan is refused. A receipt short a page still adds up to _a_ total, just not the printed one, so a short upload would come back as a confident wrong reading.
- **Pages are bounded before they are sent.** `ReceiptPageBudget` caps a page's longest edge and its JPEG quality, so a full-resolution photograph is not what somebody standing in a shop tries to upload. There is no cap on how many pages one scan may carry — ADR-052 (`docs/architecture/adr-052-receipt-part-count-ceiling.md`) found the byte-size limit already the tighter, real bound.

### Why the camera is presented modally and never inside a navigation stack

There is an open UIKit defect — reproduced by others on iOS 26, not fixed as of the POPS-1960 spike — where `VNDocumentCameraViewController`'s own navigation bar throws `NSInternalInconsistencyException` immediately after a capture when it is nested inside another navigation controller. So this feature has no `NavigationStack` at all: its two screens replace each other, and the scanner is a freshly-created instance presented from a `.fullScreenCover`, acting as its own delegate.

`VNDocumentCameraViewController.isSupported` is deliberately not used as the "is there a camera" gate. It returns `true` in the Simulator, where the document camera cannot configure a capture input at all. The gate is `CameraAuthorizing` instead, which reports `.unavailable` there — asserted against the real implementation by `AppCore`'s Simulator-only camera suite — so the Simulator lands on the drawn "no camera on this device" state rather than a black screen. That state carries an accessibility identifier for the same reason: it is the one a UI flow hosted on a Simulator will actually meet.

### `.fullScreenCover`, not `.sheet`

`FeaturePairing`'s QR scanner is presented from a `.sheet`, and this screen deliberately differs. A page sheet on iPhone is interactively dismissible by a downward swipe, and `VNDocumentCameraViewControllerDelegate` is never told about that dismissal — `documentCameraViewControllerDidCancel(_:)` fires for the Cancel button only, not for a swipe. Pairing can afford that: there is a manual-entry form underneath the scanner, so an accidental dismissal costs nothing. Here it would silently discard however many pages had already been photographed, with no delegate callback and no confirmation — the worse failure mode, since a person mid-scan has already put in the effort a swipe would erase. `.fullScreenCover` has no swipe-to-dismiss gesture, so the only way out of the scanner is its own Cancel button or a finished scan, both of which already report through the delegate. It also matches how the system document camera is meant to appear: undecorated and full-screen, not inset with a sheet's grabber and rounded corners.

### Universal search

`PurchasesSearchProvider` answers universal search from the BFM rather than an on-device replica, so it never claims a result the phone cannot currently reach. Asking it while the phone is offline yields `.offline` immediately and sends no request; it then waits on `NetworkReachability.updates()` and searches only once the path is satisfied again, rather than polling or guessing when the network might be back. `PurchasesSearchFilter` narrows by settlement `status`, sent to the server, and by `kind` (purchases, products, or either), applied on the phone because the server contract has no such filter — a caller that wants both narrowings named in one line reads `filter.summary`.

`PurchasesSearchFilterFields` is `PurchasesSearchFilter`'s Show and Status pickers as `Section` content, following `FeatureInventory`'s `InventorySearchFilterFields` idiom so a shared filter sheet can place a pillar's fields with its own header. The picker option lists live in plain functions (`purchasesSearchKindOptions()`, `purchasesSearchStatusOptions()`) rather than inline in the view, because `PurchaseSearchStatus` is not `CaseIterable` and the presentation order is worth a test independent of rendering.

### Reachable, end to end

`FeaturePurchases.feature` is registered in `RootFeature.renderable`, the BFM's bootstrap advertises it, and `ContentView` maps it to `PurchasesFlowView`, whose capture presenter is gated on `MobileFeature.receiptCapture`'s own reachability. A paired device's `AppDependencies.receiptCapture` is a `BFMReceiptCaptureRepository` pointed at that device's own BFM, so a capture submitted from the presenter reaches the purchases pillar.

`AppComposition`'s other construction site — the pairing screen's dependencies — leaves the seam unbound on purpose, alongside `transactions`: the base URL arrives with the pairing code, so before pairing there is no BFM to point a client at, and a capture attempted from there would fail with `dependencyNotBound`. Nothing can reach this screen from there; `CompositionRootTests` asserts both halves.

### The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator, for the same reason `FeatureTransactions` does:

```bash
swift test --package-path Packages/FeaturePurchases
```

### How the look is checked, and what nothing checks

No Maestro flow reaches the result screens through the camera: the Simulator has no camera, so `receipt-capture-says-there-is-no-camera.yaml` proves the refusal and stops there (POPS-2398, POPS-2407). `receipt-manual-entry.yaml` reaches them the other way in — manual entry needs no camera, so it drives the tab, the form, a real `saveDraft`/`createManualPurchase` round trip through the harness's own `purchases` stub, and the saved result screen, end to end. Everything past the shutter that only a capture can produce is still answered by unit tests, and the design work is deliberately arranged so most of it can be.

**Values and copy, not pixels, wherever a value will do.** `ReceiptSurfaceTests` asserts that the three outcomes carry three different tones, that `needsReview` is not toned as a failure, that each camera refusal has a heading of its own and that none of them draws in the failure tone, that a non-image page is never handed to an image decoder, and that a line item stacks at exactly the accessibility text sizes. Every one of those is a claim a render comparison could only make where the colour catalogue compiled — and on the `test:packages` host lane it may not have, in which case two screens that differ by a glyph and a colour rasterise to the same blank canvas. `ReceiptResultPresentationTests` pins the reading's whole ordered shape, so a group being internally right while the order between groups went wrong is still a failure.

`ReceiptDraftTests` answers the form the same way and adds nothing rasterised at all. It drives the model the way a reader does — pre-fill, retype a name, empty a total, add a row, remove one — and asserts what came back: that the extractor's own reading survived the edit, that a cleared field is reported against that field while every other field still takes input, that a hint attaches to the field its kind names and blocks nothing, and that changing a figure withdraws the arithmetic claim while renaming an item does not. The one layout decision in the row is a value (`ReceiptDraftLineRow.amountWidth(at:column:)`), asserted to break at the same Dynamic Type size the read-only row does, so the reading and the form reflow together rather than at two different sizes.

**The rendering comparisons that remain are about layout**, and each says which lane it can answer on — `.requiresCompiledColorCatalog` or `.comparisonSurvivesAnUncompiledCatalog`, enforced by `DesignSystem`'s `RenderComparisonTraitScanner`.

Three gaps, and they are the honest ones:

- **`ImageRenderer` cannot see inside a `ScrollView`.** That is why `ReceiptCapturePrompt`, `ReceiptResultCard` and `ReceiptPageView` are separable views: each is the part of a screen a test can rasterise. What the strip and the screen _compose_ — which state selected the card, whether the action bar is where it should be, whether the pages sit above the reading — is not covered by anything here. A gate for that needs a real host, not `ImageRenderer` (POPS-1583 tracks the app-wide version).
- **Dynamic Type is reasoned about rather than measured**, except where a decision was pulled out into a value (`ReceiptLineLayout`) or shows up as a height (`ReceiptCaptureLayoutTests`). There are `#Preview`s at `.accessibility5`, and a preview is something a person looks at.
- **Nothing exercises these screens under VoiceOver.** The accessibility identifiers are proved by source shape only (POPS-2387).
