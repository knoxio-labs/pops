import Foundation
import Testing

@testable import DesignSystem

@Suite("Grounded swipe actions")
internal struct PopsGroundedSwipeTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/DesignSystem/Primitives/PopsGroundedSwipe.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("a short swipe reveals an action and a full swipe commits it")
    func fullSwipeIsEnabled() {
        #expect(!Self.source.isEmpty, "PopsGroundedSwipe.swift is empty or missing")
        #expect(Self.source.contains("allowsFullSwipe: true"))
        #expect(!Self.source.contains("allowsFullSwipe: false"))
    }
}
