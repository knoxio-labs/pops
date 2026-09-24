import AppCore
import SwiftUI
import Testing
import UIKit

@testable import Pops

@MainActor
@Suite("Purchases capture availability")
internal struct ContentViewCaptureAvailabilityTests {
    /// POPS-4294 retired `.receiptCapture`'s own tab and, with it,
    /// `RootFeature.renderable`'s entry for it — so this no longer reaches
    /// Purchases through `available` (`ContentViewFeatureSwitchingWiringTests
    /// .receiptsTabHasNoScreenCase` guards that). `FeatureSurface
    /// .captureAvailable` is the seam that replaced it: read straight from
    /// the BFM's answer by `AppShellModel`, independently of what this build
    /// gives a tab.
    @Test("Purchases receives capture only while receipt capture is available")
    func followsFeatureAvailability() async throws {
        let available = try await captureAvailability(
            available: [.purchases], captureAvailable: true)
        let unavailable = try await captureAvailability(
            available: [.purchases], captureAvailable: false)

        #expect(available)
        #expect(!unavailable)
    }

    private func captureAvailability(
        available: [MobileFeature], captureAvailable: Bool
    ) async throws -> Bool {
        let scene = try #require(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        defer { window.isHidden = true }
        let first = FirstObservation()
        return await withCheckedContinuation { continuation in
            first.continuation = continuation
            window.rootViewController = UIHostingController(
                rootView: ContentViewFixture.view(
                    available: available,
                    captureAvailable: captureAvailable,
                    purchasesCaptureObserver: { first.resume(returning: $0) }))
            window.makeKeyAndVisible()
            window.layoutIfNeeded()
        }
    }
}

/// Resumes its continuation with the first observed value only; later appearances are ignored.
@MainActor
private final class FirstObservation {
    var continuation: CheckedContinuation<Bool, Never>?

    func resume(returning value: Bool) {
        continuation?.resume(returning: value)
        continuation = nil
    }
}
