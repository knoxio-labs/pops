import CoreGraphics
import SwiftUI
import Testing

@testable import DesignPlayground

/// `glassEffect` fills its shape *behind* the content rather than clipping the
/// content to it, so a shape that stops short of a corner does not crop what is
/// drawn there — it leaves it on bare background. Nothing in the type system
/// says a shape has to cover the box its content is laid out in, and the
/// inspector shipped a `Capsule` under a multi-row panel that did not.
@Suite("Inspector shape")
internal struct InspectorShapeTests {
    /// The stage is the whole device, so the panel is as wide as the screen
    /// less the inspector's own margin — the narrowest iPhone the app runs on
    /// through to the widest. The heights are the panel with its rows at the
    /// default text size and at an accessibility one.
    private static let widths: [CGFloat] = [361, 393, 430]
    private static let heights: [CGFloat] = [140, 215, 320, 480]

    private static func contentCorners(of bounds: CGRect) -> [CGPoint] {
        let inset = InspectorShape.contentInset
        return [
            CGPoint(x: bounds.minX + inset, y: bounds.minY + inset),
            CGPoint(x: bounds.maxX - inset, y: bounds.minY + inset),
            CGPoint(x: bounds.minX + inset, y: bounds.maxY - inset),
            CGPoint(x: bounds.maxX - inset, y: bounds.maxY - inset),
        ]
    }

    @Test("the panel's glass reaches every corner of the box its content sits in")
    func panelCoversItsContentBox() {
        for width in Self.widths {
            for height in Self.heights {
                let bounds = CGRect(x: 0, y: 0, width: width, height: height)
                let path = InspectorShape.panel.path(in: bounds)

                for corner in Self.contentCorners(of: bounds) {
                    #expect(
                        path.contains(corner),
                        "the panel's glass misses \(corner) at \(width)\u{00D7}\(height)"
                    )
                }
            }
        }
    }

    /// The check above is only worth running while a shape exists that fails
    /// it. Were ``InspectorShape/contentInset`` ever to grow past the corner it
    /// has to clear, every shape would pass and the assertion would be proving
    /// nothing — so the shape the panel used to be drawn in has to still fail,
    /// at a size the panel is actually drawn at.
    @Test("the capsule the panel used to be drawn in misses all four")
    func aCapsuleMissesTheSameCorners() {
        let bounds = CGRect(x: 0, y: 0, width: 361, height: 215)
        let path = Capsule().path(in: bounds)
        let covered = Self.contentCorners(of: bounds).filter { path.contains($0) }

        #expect(
            covered.isEmpty,
            "a capsule covered \(covered.count) of the panel's content corners"
        )
    }

    /// The bar keeps its capsule, and that is the same invariant rather than an
    /// exception to it: one row tall, a capsule's round end still clears the
    /// controls inside it.
    @Test("the bar's capsule clears the controls inside it")
    func barCoversItsContent() {
        let bounds = CGRect(x: 0, y: 0, width: 361, height: InspectorShape.barHeight)
        let path = InspectorShape.bar.path(in: bounds)
        let inset = InspectorShape.barPadding

        for corner in [
            CGPoint(x: bounds.minX + InspectorShape.contentInset, y: bounds.minY + inset),
            CGPoint(x: bounds.maxX - InspectorShape.contentInset, y: bounds.maxY - inset),
        ] {
            #expect(path.contains(corner), "the bar's glass misses \(corner)")
        }
    }
}
