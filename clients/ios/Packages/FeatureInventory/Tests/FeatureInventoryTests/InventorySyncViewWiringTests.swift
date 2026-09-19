import Foundation
import Testing

/// POPS-4195: the Resolved section on the real Sync page showed every row
/// with no way to collapse it, unlike the approved design, which starts
/// collapsed behind a disclosure chevron. There is no observable state this
/// toggle exposes outside the view — it is a plain `@State private var` — so
/// this reads the file directly, the same technique
/// ``InventoryEntityViewWiringTests`` and `ContentViewFeatureSwitchingWiringTests`
/// use for their own view-only wiring.
@Suite("InventorySyncView wiring")
internal struct InventorySyncViewWiringTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Sync/InventorySyncView.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the scan is reading InventorySyncView's actual source")
    func scanIsWiredUp() {
        #expect(!Self.source.isEmpty, "InventorySyncView.swift is empty or missing")
    }

    @Test("the Resolved section starts collapsed, behind a toggle")
    func resolvedSectionIsCollapsible() {
        #expect(
            Self.source.contains("@State private var showsResolved = false"),
            "Resolved no longer starts collapsed"
        )
        #expect(
            Self.source.contains("showsResolved.toggle()"),
            "Resolved's header no longer toggles it"
        )
        #expect(
            Self.source.contains("if showsResolved {"),
            "the resolved rows are no longer gated on the toggle"
        )
    }
}
