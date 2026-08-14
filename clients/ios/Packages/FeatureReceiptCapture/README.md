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
| `POST /mobile/purchases/receipts` and its outcomes                                   | not built yet — `BFMClient` conformance, POPS-1958       |
| An end-to-end Maestro flow                                                           | not built yet — POPS-1963                                |

## What a multi-page receipt is

One scan is one receipt and one call. `VNDocumentCameraViewController` collects several pages into a single `VNDocumentCameraScan`; every page of that scan becomes an ordered `ReceiptPart`, and the whole set goes to `ReceiptCaptureRepository.capture(_:)` once. Several photographs of one piece of paper are never several receipts — `ReceiptPart`'s own documentation says so, and the BFM's upload body says the same thing from the other side.

Three consequences follow, and each is enforced on the handset rather than discovered from a rejection:

- **At most `ReceiptPart.maxPerReceipt` pages.** The BFM refuses more. A longer scan is refused here, with the count, before any bytes are sent.
- **All of it or none of it.** If a page cannot be encoded, the whole scan is refused. A receipt short a page still adds up to _a_ total, just not the printed one, so a short upload would come back as a confident wrong reading.
- **Pages are bounded before they are sent.** `ReceiptPageBudget` caps a page's longest edge and its JPEG quality, so eight full-resolution photographs are not what somebody standing in a shop tries to upload.

## Why the camera is presented modally and never inside a navigation stack

There is an open UIKit defect — reproduced by others on iOS 26, not fixed as of the POPS-1960 spike — where `VNDocumentCameraViewController`'s own navigation bar throws `NSInternalInconsistencyException` immediately after a capture when it is nested inside another navigation controller. So this feature has no `NavigationStack` at all: its two screens replace each other, and the scanner is a freshly-created instance presented from a `.sheet`, acting as its own delegate.

`VNDocumentCameraViewController.isSupported` is deliberately not used as the "is there a camera" gate. It returns `true` in the Simulator, where the document camera cannot configure a capture input at all. The gate is `CameraAuthorizing` instead, which reports `.unavailable` there — asserted against the real implementation by `AppCore`'s Simulator-only camera suite — so the Simulator lands on the drawn "no camera on this device" state rather than a black screen. That state carries an accessibility identifier for the same reason: it is the one a UI flow hosted on a Simulator will actually meet.

## Reachable, and real once the transport is

`FeatureReceiptCapture.feature` is registered in `RootFeature.renderable` and `ContentView` maps it to `ReceiptCaptureView`. `AppDependencies.receiptCapture` is still bound to `AppDependencies.unbound.receiptCapture` at both of `AppComposition`'s construction sites: `BFMClient` has no `POST /mobile/purchases/receipts` conformance yet (POPS-1958), so there is nothing real to point it at, and a capture submitted today reaches the result screen's `dependencyNotBound` state rather than a client that does not exist.

## The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator, for the same reason `FeatureTransactions` does:

```bash
swift test --package-path Packages/FeatureReceiptCapture
```
