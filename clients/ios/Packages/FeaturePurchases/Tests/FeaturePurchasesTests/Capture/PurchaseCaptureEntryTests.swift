import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchase capture entry")
@MainActor
internal struct PurchaseCaptureEntryTests {
    @Test("the Add menu excludes the adjacent scan action and preserves its order")
    func addedSources() {
        #expect(PurchaseCaptureSource.added == [.photos, .file, .hand])
    }

    @Test("every source has a unique non-empty stable identity")
    func uniqueIdentities() {
        let sources = PurchaseCaptureSource.allCases

        #expect(Set(sources.map(\.id)).count == sources.count)
        #expect(Set(sources.map(\.accessibilityIdentifier)).count == sources.count)
        #expect(sources.allSatisfy { !$0.accessibilityIdentifier.isEmpty })
        #expect(
            sources.map(\.title) == [
                "Scan a receipt", "Choose photos", "Choose a file", "Enter it by hand",
            ])
        #expect(
            sources.map(\.symbol) == [
                "doc.viewfinder", "photo.on.rectangle", "folder", "square.and.pencil",
            ])
        #expect(
            sources.map(\.accessibilityIdentifier) == [
                "purchases-capture-scan",
                "purchases-capture-photos",
                "purchases-capture-file",
                "purchases-capture-hand",
            ])
    }

    @Test("the environment defaults capture to unavailable")
    func environmentDefault() throws {
        let unavailable = try #require(Self.render(CaptureAvailabilityProbe()))
        let available = try #require(
            Self.render(
                CaptureAvailabilityProbe()
                    .environment(\.purchaseCapture, PurchaseCapturePresenter { _ in })))

        #expect(!RenderedPixels.drawTheSame(unavailable, available))
    }

    @Test("the presenter forwards only the selected source")
    func presenterForwardsSource() {
        var received: PurchaseCaptureSource?
        let presenter = PurchaseCapturePresenter { received = $0 }

        presenter(.file)

        #expect(received == .file)
    }

    private static func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
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

private struct CaptureAvailabilityProbe: View {
    @Environment(\.purchaseCapture) private var presenter

    var body: some View {
        Text(presenter == nil ? "Unavailable" : "Available")
    }
}
