# FeatureReceiptCapture

Photograph or paste a receipt and let the purchases pillar's model turn it into a purchase.

## What is here and what is not

Both ends of the flow. `ReceiptCaptureView` photographs a receipt through VisionKit's document camera and hands what it produced to `ReceiptResultView`, which calls `AppCore`'s `ReceiptCaptureRepository` and renders whichever of the three outcomes — or gateway failure — came back. Neither names `Auth` nor `BFMClient`; both read the repository seam and have no idea a device token or HTTP call sits behind it.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                                                              | Lives in                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| The capture screen and the camera-refusal states                                     | here — `ReceiptCaptureView`, `ReceiptCaptureViewModel`   |
| The document camera itself, and pages becoming bytes                                 | here — `ReceiptDocumentScanner`, `ReceiptPageEncoder`    |
| The result screen (`created` / `needs-review` / `unreadable`, plus gateway failures) | here — `ReceiptResultView`, `ReceiptResultViewModel`     |
| The editable, pre-filled form a reading becomes                                      | here — `ReceiptDraft`, `ReceiptDraftForm`, `ReceiptDraftView` |
| Camera permission, and the Settings deep link                                        | `AppCore` — `CameraAuthorizing`, `SystemSettings`        |
| `created` / `needs-review` / `unreadable`                                            | `AppCore` — `ReceiptCaptureRepository`, `ReceiptOutcome` |
| `POST /mobile/purchases/receipts` and its outcomes                                   | `BFMClient` — `BFMReceiptCaptureRepository`              |
| An end-to-end Maestro flow                                                           | not built yet — POPS-1963                                |

## The surface, and why it is shaped this way

Both screens are **content that scrolls with a bar of actions pinned under it**. The content changes — a first-run prompt, an outcome, and later a list and a form — and the bar does not, because the one thing a screen is for must not be the thing that scrolls off it at the accessibility text sizes where the content is longest. `PopsActionBar` is attached with `.safeAreaInset(edge: .bottom)`, so the content passes behind it rather than stopping above it.

Four decisions carry the rest of it, and each is a rule the screens landing next to these have to keep:

**The receipt is the anchor; everything else is commentary.** `ReceiptPagesView` draws the captured pages above every state of the result screen — while the call is in flight, on the confirmation, on a refusal, and on a gateway failure. What changes underneath is what was made of the paper; the paper is the same paper, and moving it per outcome would make four screens out of one. A reader told a photo could not be read wants to see the photo.

**An outcome is announced by a glyph and a colour before it is announced by a sentence.** All three open with a `PopsStatusHeader` whose tone comes from `ReceiptResultContent.tone`. `created` is success, `needsReview` is a **warning and never the failure tone** — it is a real purchase waiting for a person, not money that vanished — and `unreadable` is the failure. Somebody who has just pressed a button is scanning, not reading, and three grey cards distinguished only by their copy are three screens that have to be read.

**A reading is laid out like the paper it was read off, not like the record it came from.** `needsReview` puts merchant, address and date at three different weights at the top, then the line items in a column with their amounts aligned, then what adjusts them, then the stated total emphasised at the foot. The flat label-over-value list this replaced is the shape of a database row; a discrepancy shows up when the two things being compared are laid out alike.

**One figure per screen, in `popsAmount`.** The confirmation is a total with a merchant over it. The reference identifies the purchase and describes nothing about it, so it is last, monospaced and small — the one thing on the screen nobody has to read.

## Where the sibling screens land

Four tickets add substantial surface to this tab, and the layout above is the frame all of them fill rather than four layouts that meet in a tab bar. Written down here because designing the current screens and then bolting a form onto the result is how a surface ends up incoherent.

- **A purchases list (POPS-2376).** Becomes the capture screen's content when there is anything to show — the guidance card and the empty plate are the _empty_ state of that list, not a separate screen. Each row is a `PopsPhoto` thumbnail at `PopsSize.pageWidth`/`pageHeight` proportions beside merchant, date and total, so a row is a small version of the confirmation card. The action bar is unchanged. It needs the stored bytes (POPS-2453) before a row can show a receipt rather than a plate.
- **A pre-filled, editable outcome form (POPS-2454).** Built — `ReceiptDraftView`, below. Not yet reached from anywhere in the shipped app, for the reason that section gives.
- **Manual entry (POPS-2455).** The same form with no pages strip and nothing pre-filled, reached from a standard-weight action in the capture screen's bar beside the prominent camera one. `ReceiptDraftPresentation.blankDraft(currency:)` is that state, and it is the same `ReceiptDraft` a reading produces so the two screens cannot drift apart. It is the one screen in the tab with no receipt on it, and it should say so with an empty `PopsPhoto` plate rather than by omitting the region.
- **Editing a saved purchase (POPS-2458).** The confirmation card with the form from POPS-2454 behind an Edit action; the pages strip is the stored receipt once POPS-2453 serves it. Note there is no initialiser building a `ReceiptDraft` from a `ReceiptPurchase`, and that is not an omission: a saved purchase carries a merchant, a total and a count, and a form pre-filled from that would present three line items as zero. That ticket needs the purchase read surface, not a constructor.

## The form, and why nothing opens it yet

`ReceiptDraftView` is a reading as something the reader may change: the pages above, the outcome's status header, then the same groups in the same order — who and when, the items in a column, what adjusts them, the total in `popsAmount` — with every value in a `PopsTextField` instead of a `Text`. The bar's prominent action is Save; "Photograph another" is demoted beside it, which is what `PopsButtonProminence` exists for.

Three rules hold it together, and each is a value a test asserts rather than a thing the view happens to do:

**There is no locked state, no confirmed state and no edit mode.** Nothing in `ReceiptDraft` can express "this field may not be changed". That absence is the design: most edits are not corrections. `ZCHEETOS C&B BALLS` is exactly what the till printed and exactly what nobody calls it, and a form that gated editing on the extractor's confidence would refuse the commonest reason to open it. What the gate complained about is carried as a hint against the field it names — `ReceiptDraftField` — and a hint is a prompt to look, never a lock.

**Every field exists whether or not anything was read into it.** This is where the form and `ReceiptResultContent` part company: the read-only reading drops what the receipt never stated, because an empty label reads as a record that failed to load. Dropping it here would remove exactly the field the reader came to fill in — a Salvos receipt whose items have no names would offer nowhere to name them.

**The arithmetic is reported, never recomputed.** The amounts on screen are strings a model transcribed; a handset re-adding them would be a second opinion nobody asked for. So the form repeats what the gate found — and withdraws it the moment a figure changes, because from then on the check is about numbers no longer on screen. `ReceiptDraftReconciliation` is those three states, and saying "as read, the items and the total agree" is what tells a reader who came to rename three items which figures to leave alone.

Nothing in the app opens it. Saving a corrected extraction is the handset writing something other than a raw capture, which ADR-046 forbids outright; the capability-scope model that supersedes that rule is a separate, unlanded decision (POPS-2451). The form takes its save as a closure so the wiring is a call site rather than a redesign. Building a confirm-before-save flow that squeezed inside the current rule — on the technicality that an uncommitted extraction is not yet a record a pillar holds — is the shape that would have to be thrown away.

## Showing the receipt, and what is still missing

The pages on the result screen are the bytes the phone is holding — what the camera produced and what was uploaded, kept by `ReceiptResultViewModel.parts` after the call precisely so the reading can be checked against them. Nothing fetches anything.

A receipt captured on another device, or on this one before the app was relaunched, cannot be drawn at all: `ReceiptOutcome` deliberately carries `receiptCount` rather than the stored parts' URIs, because no mobile route serves those bytes. **POPS-2453** is the BFM read surface that changes that, and until it lands a purchases list can only draw plates. Nothing here fakes it with a placeholder that would imply the image is somewhere it is not.

A page that is not a drawable image — the contract admits PDF and plain text — draws a plate with a glyph saying which it is, decided by `ReceiptPageMedia`.

## What a multi-page receipt is

One scan is one receipt and one call. `VNDocumentCameraViewController` collects several pages into a single `VNDocumentCameraScan`; every page of that scan becomes an ordered `ReceiptPart`, and the whole set goes to `ReceiptCaptureRepository.capture(_:)` once. Several photographs of one piece of paper are never several receipts — `ReceiptPart`'s own documentation says so, and the BFM's upload body says the same thing from the other side.

Three consequences follow, and each is enforced on the handset rather than discovered from a rejection:

- **At most `ReceiptPart.maxPerReceipt` pages.** The BFM refuses more. A longer scan is refused here, with the count, before any bytes are sent.
- **All of it or none of it.** If a page cannot be encoded, the whole scan is refused. A receipt short a page still adds up to _a_ total, just not the printed one, so a short upload would come back as a confident wrong reading.
- **Pages are bounded before they are sent.** `ReceiptPageBudget` caps a page's longest edge and its JPEG quality, so eight full-resolution photographs are not what somebody standing in a shop tries to upload.

## Why the camera is presented modally and never inside a navigation stack

There is an open UIKit defect — reproduced by others on iOS 26, not fixed as of the POPS-1960 spike — where `VNDocumentCameraViewController`'s own navigation bar throws `NSInternalInconsistencyException` immediately after a capture when it is nested inside another navigation controller. So this feature has no `NavigationStack` at all: its two screens replace each other, and the scanner is a freshly-created instance presented from a `.fullScreenCover`, acting as its own delegate.

`VNDocumentCameraViewController.isSupported` is deliberately not used as the "is there a camera" gate. It returns `true` in the Simulator, where the document camera cannot configure a capture input at all. The gate is `CameraAuthorizing` instead, which reports `.unavailable` there — asserted against the real implementation by `AppCore`'s Simulator-only camera suite — so the Simulator lands on the drawn "no camera on this device" state rather than a black screen. That state carries an accessibility identifier for the same reason: it is the one a UI flow hosted on a Simulator will actually meet.

### `.fullScreenCover`, not `.sheet`

`FeaturePairing`'s QR scanner is presented from a `.sheet`, and this screen deliberately differs. A page sheet on iPhone is interactively dismissible by a downward swipe, and `VNDocumentCameraViewControllerDelegate` is never told about that dismissal — `documentCameraViewControllerDidCancel(_:)` fires for the Cancel button only, not for a swipe. Pairing can afford that: there is a manual-entry form underneath the scanner, so an accidental dismissal costs nothing. Here it would silently discard however many pages had already been photographed, with no delegate callback and no confirmation — the worse failure mode, since a person mid-scan has already put in the effort a swipe would erase. `.fullScreenCover` has no swipe-to-dismiss gesture, so the only way out of the scanner is its own Cancel button or a finished scan, both of which already report through the delegate. It also matches how the system document camera is meant to appear: undecorated and full-screen, not inset with a sheet's grabber and rounded corners.

## Reachable, end to end

`FeatureReceiptCapture.feature` is registered in `RootFeature.renderable`, the BFM's bootstrap advertises it, and `ContentView` maps it to `ReceiptCaptureView`. A paired device's `AppDependencies.receiptCapture` is a `BFMReceiptCaptureRepository` pointed at that device's own BFM, so a capture submitted from the screen reaches the purchases pillar.

`AppComposition`'s other construction site — the pairing screen's dependencies — leaves the seam unbound on purpose, alongside `transactions`: the base URL arrives with the pairing code, so before pairing there is no BFM to point a client at, and a capture attempted from there would fail with `dependencyNotBound`. Nothing can reach this screen from there; `CompositionRootTests` asserts both halves.

## The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator, for the same reason `FeatureTransactions` does:

```bash
swift test --package-path Packages/FeatureReceiptCapture
```

## How the look is checked, and what nothing checks

No Maestro flow reaches the result screens at all: the Simulator has no camera, so `receipt-capture-says-there-is-no-camera.yaml` proves the refusal and stops there (POPS-2398, POPS-2407). Everything past the shutter is answered by unit tests, and the design work is deliberately arranged so most of it can be.

**Values and copy, not pixels, wherever a value will do.** `ReceiptSurfaceTests` asserts that the three outcomes carry three different tones, that `needsReview` is not toned as a failure, that each camera refusal has a heading of its own and that none of them draws in the failure tone, that a non-image page is never handed to an image decoder, and that a line item stacks at exactly the accessibility text sizes. Every one of those is a claim a render comparison could only make where the colour catalogue compiled — and on the `test:packages` host lane it may not have, in which case two screens that differ by a glyph and a colour rasterise to the same blank canvas. `ReceiptResultPresentationTests` pins the reading's whole ordered shape, so a group being internally right while the order between groups went wrong is still a failure.

`ReceiptDraftTests` answers the form the same way and adds nothing rasterised at all. It drives the model the way a reader does — pre-fill, retype a name, empty a total, add a row, remove one — and asserts what came back: that the extractor's own reading survived the edit, that a cleared field is reported against that field while every other field still takes input, that a hint attaches to the field its kind names and blocks nothing, and that changing a figure withdraws the arithmetic claim while renaming an item does not. The one layout decision in the row is a value (`ReceiptDraftLineRow.amountWidth(at:column:)`), asserted to break at the same Dynamic Type size the read-only row does, so the reading and the form reflow together rather than at two different sizes.

**The rendering comparisons that remain are about layout**, and each says which lane it can answer on — `.requiresCompiledColorCatalog` or `.comparisonSurvivesAnUncompiledCatalog`, enforced by `DesignSystem`'s `RenderComparisonTraitScanner`.

Three gaps, and they are the honest ones:

- **`ImageRenderer` cannot see inside a `ScrollView`.** That is why `ReceiptCapturePrompt`, `ReceiptResultCard` and `ReceiptPageView` are separable views: each is the part of a screen a test can rasterise. What the strip and the screen _compose_ — which state selected the card, whether the action bar is where it should be, whether the pages sit above the reading — is not covered by anything here. A gate for that needs a real host, not `ImageRenderer` (POPS-1583 tracks the app-wide version).
- **Dynamic Type is reasoned about rather than measured**, except where a decision was pulled out into a value (`ReceiptLineLayout`) or shows up as a height (`ReceiptCaptureLayoutTests`). There are `#Preview`s at `.accessibility5`, and a preview is something a person looks at.
- **Nothing exercises these screens under VoiceOver.** The accessibility identifiers are proved by source shape only (POPS-2387).
