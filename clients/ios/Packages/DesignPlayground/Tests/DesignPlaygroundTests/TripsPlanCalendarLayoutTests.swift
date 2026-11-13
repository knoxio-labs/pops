import AppCore
import DesignSystem
import Foundation
import SwiftUI
import Testing

@testable import FeatureTrips

#if canImport(AppKit)
    import AppKit
#elseif canImport(UIKit)
    import UIKit
#endif

@Suite("Native Calendar layout")
@MainActor
internal struct TripsPlanCalendarLayoutTests {
    @Test("the month grid fits seven touch targets without explanatory text widening it")
    internal func monthGridWidth() throws {
        let month = try #require(TripPlanCalendarMonth(containing: "2026-11-01"))
        let route = TripRouteSnapshot(
            tripId: 1, revision: 1, order: [], paths: [], missingSources: [])
        let content = TripsPlanCalendarGrid(
            month: month,
            projection: TripPlanCalendarProjection(route: route, snapshot: nil, zone: .gmt),
            firstWeekday: 2, locale: Locale(identifier: "en_AU"),
            selectedDay: "2026-11-01", selectDay: { _ in }, openSource: { _ in }
        )
        .environment(\.dynamicTypeSize, .large)
        #if canImport(AppKit)
            let host = NSHostingView(rootView: content)
            let width = host.fittingSize.width
        #elseif canImport(UIKit)
            let host = UIHostingController(rootView: content)
            let width = host.sizeThatFits(
                in: CGSize(
                    width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
            ).width
        #endif
        #expect(width == PopsSize.touchTarget * 7)
    }
}
