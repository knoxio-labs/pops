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
| Camera permission, and the Settings deep link                                        | `AppCore` — `CameraAuthorizing`, `SystemSettings`        |
| `created` / `needs-review` / `unreadable`                                            | `AppCore` — `ReceiptCaptureRepository`, `ReceiptOutcome` |
| `POST /mobile/purchases/receipts` and its outcomes                                   | `BFMClient` — `BFMReceiptCaptureRepository`              |
| An end-to-end Maestro flow                                                           | not built yet — POPS-1963                                |

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
