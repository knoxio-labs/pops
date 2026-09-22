import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@Suite("Pops motion")
internal struct PopsMotionTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/DesignSystem/Tokens/PopsMotion.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("reduced motion removes an animation")
    func reducedMotionRemovesAnimation() {
        #expect(PopsMotion.animation(.snappy, reduceMotion: true) == nil)
    }

    @Test("ordinary motion preserves an animation")
    func ordinaryMotionPreservesAnimation() {
        #expect(PopsMotion.animation(.snappy, reduceMotion: false) != nil)
    }

    @Test("the source scan reads the motion implementation")
    func sourceScanIsWiredUp() {
        #expect(!Self.source.isEmpty, "PopsMotion.swift is empty or missing")
    }

    @Test("the view modifier delegates reduced-motion policy to the helper")
    func modifierUsesAnimationHelper() {
        #expect(
            Self.source.contains(
                "PopsMotion.animation(animation, reduceMotion: reduceMotion)"),
            "PopsMotionModifier no longer delegates reduced-motion policy to PopsMotion.animation"
        )
    }
}
