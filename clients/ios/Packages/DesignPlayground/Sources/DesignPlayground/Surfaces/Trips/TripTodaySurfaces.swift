import SwiftUI

/// Native Today proposals share source snapshots, timing projections and inspection actions.
@MainActor
internal enum TripTodaySurfaces {
    internal static let id = SurfaceID(area: "trips", slug: "today")
    internal static let surfaces = [surface(.nextFirst, launchStates: true)]

    internal static func surface(_ layout: TripTodayLayout, launchStates: Bool = false)
        -> DesignSurface
    {
        DesignSurface(
            id: id,
            title: "Today",
            synopsis: "Current accommodation, the next journey and recorded commitments.",
            chrome: .navigation,
            states: TripsTodayScenario.allCases.map { scenario in
                DesignState(scenario.rawValue, scenario.title) {
                    TripTodayView(state: tripsTodayFixture(scenario), layout: layout)
                }
            } + (launchStates ? proposalStates : [])
        )
    }

    private static let proposalStates: [DesignState] = [
        DesignState("next-first", "Next first") {
            TripTodayView(state: tripsTodayFixture(.default), layout: .nextFirst)
        },
        DesignState("day-timeline", "Day timeline") {
            TripTodayView(state: tripsTodayFixture(.default), layout: .timeline)
        },
    ]
}

/// The two list hierarchies under review; each opens the same selected source details.
internal enum TripTodayLayout: String, CaseIterable {
    case nextFirst = "next-first"
    case timeline = "day-timeline"

    internal var title: String {
        switch self {
        case .nextFirst: "Next first"
        case .timeline: "Day timeline"
        }
    }
}
