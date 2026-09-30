import Foundation
import Testing

@Suite("Recent errors collection presentation")
internal struct RecentErrorsCollectionTests {
    private static let sources = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/DesignPlayground/Surfaces/Shell")

    @Test("recent errors keep rows lazy and animate insertions, removals, and updates")
    func collectionUsesLazyAnimatedRows() throws {
        let source = try String(
            contentsOf: Self.sources.appending(path: "RecentErrorsView.swift"), encoding: .utf8)
        let row = try #require(source.components(separatedBy: "private struct RecentErrorRow").last)

        #expect(source.contains("List(errors.entries)"))
        #expect(source.contains(".popsMotion(PopsMotion.smooth, value: errors.entries)"))
        #expect(source.contains(".transition(PopsMotion.row)"))
        #expect(row.contains("let error: PresentedError"))
        #expect(!row.contains(".task"))
    }
}
