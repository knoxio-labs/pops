# FeatureReceiptCapture

Photograph or paste a receipt and let the purchases pillar's model turn it into a purchase.

## What is here and what is not

Today this package is a scaffold: one placeholder screen, reachable from the shell, and nothing else. It holds no networking and it names neither `Auth` nor `BFMClient` — it will read `AppCore`'s `ReceiptCaptureRepository` and will not know that the thing behind it attaches a device token and speaks HTTP.

That boundary is asserted, not merely intended: `ModuleBoundaryTests` in `AppCore` fails if any package outside `Auth` and `BFMClient` imports either.

| Concern                                   | Lives in                                                 |
| ----------------------------------------- | -------------------------------------------------------- |
| The screen                                | here                                                     |
| Capturing a photograph, the review UI     | not built yet — POPS-1959, POPS-1961                     |
| Camera permission                         | `AppCore` — `CameraAuthorizing`                          |
| `created` / `needs-review` / `unreadable` | `AppCore` — `ReceiptCaptureRepository`, `ReceiptOutcome` |
| `POST /mobile/receipts` and its outcomes  | not built yet — `BFMClient` conformance, POPS-1958       |
| An end-to-end Maestro flow                | not built yet — POPS-1963                                |

## Why the placeholder has no dependencies

`ReceiptCaptureView` takes no `AppCore` seam because there is nothing for it to read yet — wiring `ReceiptCaptureRepository` into a screen that draws nothing with it would be a parameter nobody exercises. The composition root binds it once the capture flow (POPS-1959) gives the screen something to call it with.

## Reachable, not yet real

`FeatureReceiptCapture.feature` is registered in `RootFeature.renderable` and `ContentView` maps it to `ReceiptCaptureView`, matching how `FeatureTransactions` is wired — the app can draw this screen the moment the BFM says the feature is available. Nothing yet makes the BFM say that: `POST /mobile/receipts` does not exist until POPS-1958 lands, so in practice this screen is unreachable outside a build that binds the feature list directly, which is the point of a scaffold landing ahead of the feature it scaffolds.

## The host build

The package declares macOS as well as iOS so `swift build` and `swift test` run on a developer machine and a CI runner without booting a simulator, for the same reason `FeatureTransactions` does:

```bash
swift test --package-path Packages/FeatureReceiptCapture
```
