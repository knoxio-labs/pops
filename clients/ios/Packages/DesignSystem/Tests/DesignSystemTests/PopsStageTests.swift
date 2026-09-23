import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@Suite("Pops stage")
internal struct PopsStageTests {
    @Test("the stage uses a full-screen iOS presentation and a host sheet")
    func platformPresentation() throws {
        let source = try String(contentsOf: Self.source, encoding: .utf8)

        #expect(source.contains("fullScreenCover(item: item, content: content)"))
        #expect(source.contains("sheet(item: item, content: content)"))
    }

    @MainActor
    @Test("an absent stage composes without presenting content")
    func absentStageComposes() {
        let item = Binding<Box?>(get: { nil }, set: { _ in })
        _ = Color.clear.popsStage(item: item) { _ in Color.red }
    }

    private static let source = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/DesignSystem/Primitives/PopsStage.swift")

    private struct Box: Identifiable {
        let id = 0
    }
}
