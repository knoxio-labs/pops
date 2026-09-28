import Foundation
import Testing

@Suite("Locations browser summary")
internal struct InventoryLocationBrowserWiringTests {
    private static let sourceRoot = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/FeatureInventory")

    private static func source(at path: String) throws -> String {
        try String(
            contentsOf: Self.sourceRoot.appending(path: path), encoding: .utf8)
    }

    @Test("the locations browser leaves summary tiles on the home screen")
    func summaryTilesStayOnHome() throws {
        let browser = try Self.source(at: "Locations/InventoryLocationBrowserView.swift")
        let skeleton = try Self.source(at: "Locations/InventoryLocationBrowserParts.swift")

        #expect(!browser.contains("InventoryCountTiles"))
        #expect(!skeleton.contains("InventoryCountTilesSkeleton"))
    }
}
