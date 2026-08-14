# FeatureReceiptCapture

Photograph or paste a receipt and let the purchases pillar's model turn it into a purchase.

## What is here and what is not

`ReceiptCaptureView` is still the POPS-1959 placeholder — this package does not yet build the photograph-and-review flow that produces a receipt to submit. What it does have is the other end of that flow: `ReceiptResultView` and `ReceiptResultViewModel`, which take a receipt's parts and `AppDependencies`, call `AppCore`'s `ReceiptCaptureRepository`, and render whichever of the three outcomes — or gateway failure — came back. Neither names `Auth` nor `BFMClient`; both read the repository seam and have no idea a device token or HTTP call sits behind it.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                                                              | Lives in                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| The capture screen                                                                   | here — still the POPS-1959 placeholder                   |
| The result screen (`created` / `needs-review` / `unreadable`, plus gateway failures) | here — `ReceiptResultView`, `ReceiptResultViewModel`     |
| Capturing a photograph, wiring the two screens together                              | not built yet — POPS-1959                                |
| Camera permission                                                                    | `AppCore` — `CameraAuthorizing`                          |
| `created` / `needs-review` / `unreadable`                                            | `AppCore` — `ReceiptCaptureRepository`, `ReceiptOutcome` |
| `POST /mobile/receipts` and its outcomes                                             | not built yet — `BFMClient` conformance, POPS-1958       |
| An end-to-end Maestro flow                                                           | not built yet — POPS-1963                                |

## Why the result screen is not wired into the app yet

`ReceiptResultView` takes a `ReceiptResultViewModel`, constructed from the parts a capture produced and `AppDependencies`. Nothing in the app today produces those parts — that is POPS-1959's job — so nothing yet constructs the view outside a preview or a test. `AppDependencies.receiptCapture` is bound to `AppDependencies.unbound.receiptCapture` at both of `AppComposition`'s construction sites for the same reason: `BFMClient` has no `POST /mobile/receipts` conformance yet (POPS-1958), so there is nothing real to point it at.

## Reachable, not yet real

`FeatureReceiptCapture.feature` is registered in `RootFeature.renderable` and `ContentView` maps it to `ReceiptCaptureView`, matching how `FeatureTransactions` is wired — the app can draw the capture placeholder the moment the BFM says the feature is available. Nothing yet makes the BFM say that: `POST /mobile/receipts` does not exist until POPS-1958 lands, so in practice this screen is unreachable outside a build that binds the feature list directly, which is the point of a scaffold landing ahead of the feature it scaffolds.

## The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator, for the same reason `FeatureTransactions` does:

```bash
swift test --package-path Packages/FeatureReceiptCapture
```
