import Foundation
import Testing

@Suite("Inventory grounded swipe behavior")
internal struct InventoryGroundedSwipeBehaviorTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(
                path:
                    "Sources/DesignPlayground/Surfaces/Inventory/InventoryGroundedComponents.swift"
            )
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("inventory surfaces use the shared grounded swipe behavior")
    func delegatesToDesignSystem() {
        #expect(
            !Self.source.isEmpty,
            "InventoryGroundedComponents.swift is empty or missing")
        #expect(Self.source.contains("popsGroundedSwipeActionsContainer()"))
        #expect(Self.source.contains("popsGroundedSwipeActions("))
        #expect(!Self.source.contains(".swipeActions("))
    }
}
