import AppCore
import AppCoreFakes
import DesignSystemTestSupport
import Foundation
import Observation
import SwiftUI
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase capture presentation")
internal struct PurchaseCapturePresentationTests {
    @Test("capture availability controls the descendant presenter", .requiresCompiledColorCatalog)
    func availability() throws {
        let unavailable = try #require(render(isAvailable: false))
        let available = try #require(render(isAvailable: true))

        #expect(!RenderedPixels.drawTheSame(unavailable, available))
    }

    @Test("the installed presenter starts hand entry")
    func presenterStartsHandEntry() async {
        let flow = PurchaseCaptureFlow(
            dependencies: .fake(receiptCapture: InMemoryReceiptCaptureRepository()),
            camera: PresentationCamera(),
            onSaved: { _ in })
        let modifier = PurchaseCapturePresentationModifier(flow: flow, isAvailable: true)

        modifier.presenter(.hand)
        await Self.untilSheetOpens(flow)

        #expect(flow.sheet == .handEntry)
        #expect(flow.handEntry != nil)
    }

    /// Resumes when `flow.sheet` is set, signalled by observation rather than by polling. The flow
    /// and this test share the main actor, so no change can land between the check and the
    /// registration.
    private static func untilSheetOpens(_ flow: PurchaseCaptureFlow) async {
        while flow.sheet == nil {
            await withCheckedContinuation { continuation in
                withObservationTracking {
                    _ = flow.sheet
                } onChange: {
                    continuation.resume()
                }
            }
        }
    }

    private func render(isAvailable: Bool) -> Data? {
        let flow = PurchaseCaptureFlow(
            dependencies: .fake(receiptCapture: InMemoryReceiptCaptureRepository()),
            camera: PresentationCamera(),
            onSaved: { _ in })
        let renderer = ImageRenderer(
            content:
                CapturePresentationProbe()
                .modifier(
                    PurchaseCapturePresentationModifier(
                        flow: flow,
                        isAvailable: isAvailable)
                )
                .padding()
                .environment(\._accessibilityReduceMotion, true)
                .environment(\.colorScheme, .light)
                .frame(width: 180, height: 80)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }
}

private struct CapturePresentationProbe: View {
    @Environment(\.purchaseCapture) private var presenter

    var body: some View {
        Text(presenter == nil ? "Unavailable" : "Available")
    }
}

private struct PresentationCamera: CameraAuthorizing {
    func currentAccess() -> CameraAccess { .authorized }
    func requestAccess() async -> CameraAccess { .authorized }
}
