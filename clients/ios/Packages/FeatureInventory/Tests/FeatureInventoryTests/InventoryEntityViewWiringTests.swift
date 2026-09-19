import Foundation
import Testing

/// POPS-4192: a `pops://` link opens `InventoryEntityView` in a sheet over
/// whichever tab is showing, entirely outside `InventoryFlowView`'s own
/// stack — so it needs its own `.inventorySyncInterruptions`, not a share of
/// one `InventoryFlowView` already installs. There is no observable model
/// or store call this modifier's presence changes that a unit test could
/// drive without mounting the whole sheet, so this reads the file directly,
/// the same technique `ContentViewFeatureSwitchingWiringTests` uses for its
/// own routing table.
@Suite("InventoryEntityView wiring")
internal struct InventoryEntityViewWiringTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/InventoryEntityView.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the scan is reading InventoryEntityView's actual source")
    func scanIsWiredUp() {
        #expect(!Self.source.isEmpty, "InventoryEntityView.swift is empty or missing")
    }

    @Test("a session-expired or app-too-old replica interrupts this stack too")
    func installsSyncInterruptions() {
        #expect(
            Self.source.contains(".inventorySyncInterruptions(store: store)"),
            "InventoryEntityView no longer installs the sync interruption sheet"
        )
    }

    /// POPS-4195: this build shows shimmer, never a spinner, while something
    /// loads. `ProgressView` reappearing here would be exactly that
    /// regression, on the one screen that waits on a read before it knows
    /// which route to draw.
    @Test("resolving which screen to draw shows the shimmer skeleton, not a spinner")
    func resolvingShowsShimmerNotASpinner() {
        #expect(
            Self.source.contains("InventoryItemDetailSkeleton()"),
            "the resolving state no longer shows the shimmer skeleton"
        )
        #expect(
            !Self.source.contains("ProgressView()"),
            "a spinner is back in a build that shows shimmer instead"
        )
    }
}
