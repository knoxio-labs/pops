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
        let modifier = PurchaseCapturePresentationModifier(
            flow: flow,
            isAvailable: true,
            merchantDirectory: PurchaseCaptureMerchantDirectory(
                repository: AppDependencies.unbound.merchants))

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

    @Test("merchant closures preserve directory identities and scope address lookup")
    func merchantDirectoryMapping() async {
        let repository = InMemoryMerchantDirectoryRepository(
            entries: [MerchantDirectoryEntry(id: "merchant-1", name: "Corner Shop")],
            addressesByMerchantID: [
                "merchant-1": [MerchantAddressEntry(id: "address-1", value: "1 Main Street")]
            ])
        let directory = PurchaseCaptureMerchantDirectory(repository: repository)

        #expect(
            await directory.search("corner")
                == [ReceiptMerchantChoice(id: "merchant-1", name: "Corner Shop")])
        #expect(
            await directory.merchant("merchant-1")
                == ReceiptMerchantChoice(id: "merchant-1", name: "Corner Shop"))
        #expect(
            await directory.addresses(for: "merchant-1")
                == [ReceiptAddressChoice(id: "address-1", value: "1 Main Street")])
        #expect(
            await directory.address(merchantID: "merchant-1", addressID: "address-1")
                == ReceiptAddressChoice(id: "address-1", value: "1 Main Street"))
        #expect(
            await directory.address(merchantID: "merchant-other", addressID: "address-1") == nil)
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
                        isAvailable: isAvailable,
                        merchantDirectory: PurchaseCaptureMerchantDirectory(
                            repository: AppDependencies.unbound.merchants))
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

@Suite("Capture flow destinations")
internal struct PurchaseCaptureDestinationsWiringTests {
    private static let stackOpening = "NavigationStack(path: $flow.path) {"
    private static let registration = "navigationDestination(for: PurchaseCaptureRoute.self)"

    private static let source: String = {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(
            path: "Sources/FeaturePurchases/Capture/Flow/PurchaseCapturePresentation.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    /// The text of the stack's root-content closure, found by brace matching from its opening.
    private static var stackRootContent: Substring? {
        guard let opening = source.range(of: stackOpening) else { return nil }
        var depth = 1
        var index = opening.upperBound
        while index < source.endIndex {
            switch source[index] {
            case "{": depth += 1
            case "}":
                depth -= 1
                if depth == 0 { return source[opening.upperBound..<index] }
            default: break
            }
            index = source.index(after: index)
        }
        return nil
    }

    @Test("the scan reads the capture presentation source")
    func sourceExists() {
        #expect(Self.source.contains(Self.stackOpening))
    }

    @Test("the route destination is registered inside the stack's root content")
    func destinationIsInsideTheStack() throws {
        let content = try #require(Self.stackRootContent)
        #expect(content.contains(Self.registration))
    }
}
