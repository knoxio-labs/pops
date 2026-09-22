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
        var observations: [Bool] = []
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = UIHostingController(
            rootView: ContentViewFixture.view(
                available: available,
                purchasesCaptureObserver: { observations.append($0) }))
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        defer { window.isHidden = true }

        for _ in 0..<10 where observations.isEmpty {
            await Task.yield()
        }
        return try #require(observations.first)
    }
}
