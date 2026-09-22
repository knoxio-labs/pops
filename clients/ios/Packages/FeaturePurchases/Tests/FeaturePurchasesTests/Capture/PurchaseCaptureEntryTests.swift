import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchase capture entry")
@MainActor
internal struct PurchaseCaptureEntryTests {
    @Test("the Add menu excludes the adjacent scan action and preserves its order")
    func addedSources() {
        #expect(PurchaseCaptureEntry.Source.added == [.photos, .file, .hand])
    }

    @Test("every source has a unique stable identity")
    func uniqueIdentities() {
        let sources = PurchaseCaptureEntry.Source.allCases

        #expect(Set(sources.map(\.id)).count == sources.count)
        #expect(Set(sources.map(\.accessibilityIdentifier)).count == sources.count)
        #expect(Set(sources.map(\.symbol)).count == sources.count)
    }

    @Test("the environment defaults capture to unavailable")
    func environmentDefault() throws {
        #expect(EnvironmentValues().purchaseCapture == nil)
        let renderer = ImageRenderer(content: CaptureAvailabilityProbe())
        _ = try #require(renderer.cgImage)
    }

    @Test("the presenter forwards only the selected source")
    func presenterForwardsSource() {
        var received: PurchaseCaptureEntry.Source?
        let presenter = PurchaseCapturePresenter { received = $0 }

        presenter(.file)

        #expect(received == .file)
    }

    @Test("the presenter reports saved identifiers in order")
    func presenterReportsSavedIdentifiers() {
        var received: [String] = []
        let presenter = PurchaseCapturePresenter({ _ in }, onSaved: { received = $0 })

        presenter.reportSaved(["saved-1", "saved-2"])

        #expect(received == ["saved-1", "saved-2"])
    }

    @Test("an empty capture run does not report saved identifiers")
    func presenterDoesNotReportEmptyRuns() {
        var callbackCount = 0
        let presenter = PurchaseCapturePresenter({ _ in }, onSaved: { _ in callbackCount += 1 })

        presenter.reportSaved([])

        #expect(callbackCount == 0)
    }
}

private struct CaptureAvailabilityProbe: View {
    @Environment(\.purchaseCapture) private var presenter

    var body: some View {
        Text(presenter == nil ? "Unavailable" : "Available")
    }
}
