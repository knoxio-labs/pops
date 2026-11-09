/// Native Today opens with the selected priority hierarchy and retains the source chronology as a utility.
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
            synopsis: "What is happening now, followed by known future plans.",
            chrome: .navigation,
            states: TripsTodayScenario.allCases.map { scenario in
                DesignState(scenario.rawValue, scenario.title) {
                    TripTodayView(state: tripsTodayFixture(scenario), layout: layout)
                }
            } + (launchStates ? directStates : [])
        )
    }

    private static let directStates: [DesignState] = [
        DesignState("next-first", "Now then Next") {
            TripTodayView(state: tripsTodayFixture(.default), layout: .nextFirst)
        },
        DesignState("day-timeline", "Timeline") {
            TripTodayView(state: tripsTodayFixture(.default), layout: .timeline)
        },
    ]
}

/// The primary priority hierarchy and secondary chronology open the same selected source details.
internal enum TripTodayLayout: String, CaseIterable {
    case nextFirst = "next-first"
    case timeline = "day-timeline"

    internal var title: String {
        switch self {
        case .nextFirst: "Now then Next"
        case .timeline: "Timeline"
        }
    }
}
