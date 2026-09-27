import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

#if canImport(UIKit)
    import UIKit
#endif

@MainActor
@Suite("Quiet disclosure")
internal struct PopsQuietDisclosureTests {
    private static let canvas = CGSize(width: 320, height: 240)

    private func render(_ content: some View) throws -> CGImage {
        let renderer = ImageRenderer(
            content:
                content
                .frame(width: Self.canvas.width, height: Self.canvas.height, alignment: .top)
        )
        renderer.scale = 1
        return try #require(renderer.cgImage)
    }

    private func pixels(in image: CGImage, rect: CGRect) throws -> Data {
        let cropped = try #require(image.cropping(to: rect))
        let data = try #require(cropped.dataProvider?.data)
        return data as Data
    }

    @Test(
        "history starts collapsed and expanded content renders when requested",
        .requiresCompiledColorCatalog
    )
    func collapsedByDefault() throws {
        let collapsed = try render(
            PopsQuietDisclosure("History") {
                Color.popsAccent.frame(height: 96)
            })
        let expanded = try render(
            PopsQuietDisclosure("History", initiallyExpanded: true) {
                Color.popsAccent.frame(height: 96)
            })

        let contentRect = CGRect(x: 0, y: 80, width: 320, height: 160)
        #expect(
            try pixels(in: collapsed, rect: contentRect)
                != pixels(in: expanded, rect: contentRect)
        )
    }

    @Test("the disclosure exposes its expansion state and keeps a touch target")
    func accessibilityAndTouchTarget() throws {
        #if canImport(UIKit)
            let controller = UIHostingController(
                rootView: PopsQuietDisclosure("History") {
                    Color.popsAccent.frame(height: 96)
                }
                .frame(width: Self.canvas.width, height: Self.canvas.height, alignment: .top)
            )
            controller.view.frame = CGRect(origin: .zero, size: Self.canvas)
            controller.view.layoutIfNeeded()

            let element = try #require(
                Self.accessibilityElements(in: controller.view).first {
                    Self.accessibilityLabel(of: $0) == "History"
                })
            #expect(Self.accessibilityValue(of: element) == "Collapsed")
            #expect(Self.accessibilityFrame(of: element).height >= PopsSize.touchTarget)
            #expect(Self.accessibilityActivate(element))

            controller.view.layoutIfNeeded()
            #expect(
                Self.accessibilityElements(in: controller.view)
                    .first(where: { Self.accessibilityLabel(of: $0) == "History" })
                    .flatMap(Self.accessibilityValue(of:)) == "Expanded"
            )
        #else
            let collapsed = PopsQuietDisclosure("History") { EmptyView() }
            let expanded = PopsQuietDisclosure("History", initiallyExpanded: true) { EmptyView() }
            #expect(collapsed.accessibilityValue == "Collapsed")
            #expect(expanded.accessibilityValue == "Expanded")
            #expect(collapsed.accessibilityHint == "Show section")
            #expect(expanded.accessibilityHint == "Hide section")
            #expect(collapsed.minimumHeight == PopsSize.touchTarget)
        #endif
    }

    #if canImport(UIKit)
        private static func accessibilityElements(in view: UIView) -> [Any] {
            var elements: [Any] = []
            if view.isAccessibilityElement {
                elements.append(view)
            }
            if let childElements = view.accessibilityElements {
                elements.append(contentsOf: childElements)
            }
            for subview in view.subviews {
                elements.append(contentsOf: accessibilityElements(in: subview))
            }
            return elements
        }

        private static func accessibilityLabel(of element: Any) -> String? {
            switch element {
            case let view as UIView:
                view.accessibilityLabel
            case let element as UIAccessibilityElement:
                element.accessibilityLabel
            default:
                nil
            }
        }

        private static func accessibilityValue(of element: Any) -> String? {
            switch element {
            case let view as UIView:
                view.accessibilityValue
            case let element as UIAccessibilityElement:
                element.accessibilityValue
            default:
                nil
            }
        }

        private static func accessibilityFrame(of element: Any) -> CGRect {
            switch element {
            case let view as UIView:
                view.accessibilityFrame
            case let element as UIAccessibilityElement:
                element.accessibilityFrame
            default:
                .zero
            }
        }

        private static func accessibilityActivate(_ element: Any) -> Bool {
            switch element {
            case let view as UIView:
                view.accessibilityActivate()
            case let element as UIAccessibilityElement:
                element.accessibilityActivate()
            default:
                false
            }
        }
    #endif
}
