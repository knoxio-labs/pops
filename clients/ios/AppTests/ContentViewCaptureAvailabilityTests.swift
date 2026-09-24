import AppCore
import SwiftUI
import Testing
import UIKit

@testable import Pops

@MainActor
@Suite("Purchases capture availability")
internal struct ContentViewCaptureAvailabilityTests {
    @Test("Purchases receives capture only while receipt capture is available")
    func followsFeatureAvailability() async throws {
        let available = try await captureAvailability(available: [.purchases, .receiptCapture])
        let unavailable = try await captureAvailability(available: [.purchases])

        #expect(available)
        #expect(!unavailable)
    }

    private func captureAvailability(available: [MobileFeature]) async throws -> Bool {
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
