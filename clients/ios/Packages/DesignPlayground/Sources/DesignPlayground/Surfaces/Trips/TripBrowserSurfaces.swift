/// M02 stages native trip navigation and its named review states.
@MainActor
internal enum TripBrowserSurfaces {
    internal static let id = SurfaceID(area: "trips", slug: "browser")
    internal static let surfaces = [
        DesignSurface(
            id: id,
            title: "Trip Browser",
            synopsis: "Today, route, bookings, documents and trip history.",
            chrome: .bare,
            states: [
                DesignState("default", "Today") {
                    TripBrowserView(state: tripsBrowserFixture())
                },
                DesignState("plan", "Route") {
                    TripBrowserView(state: tripsBrowserFixture(), tab: .plan)
                },
                DesignState("calendar", "Calendar") {
                    TripBrowserView(state: tripsBrowserFixture(), tab: .plan, calendar: true)
                },
                DesignState("bookings", "Bookings") {
                    TripBrowserView(state: tripsBrowserFixture(), tab: .bookings)
                },
                DesignState("documents", "Documents") {
                    TripBrowserView(state: tripsBrowserFixture(), tab: .documents)
                },
                DesignState("search", "Search") {
                    TripBrowserView(state: tripsBrowserFixture(), tab: .search)
                },
                DesignState("history", "History") {
                    TripBrowserView(state: history, tab: .plan)
                },
                DesignState("empty", "Empty") {
                    TripBrowserView(state: tripsBrowserFixture(.empty))
                },
                DesignState("missing-sources", "Missing Sources") {
                    TripBrowserView(state: tripsBrowserFixture(.missingReferences), tab: .plan)
                },
            ]
        )
    ]

    private static var history: TripsBrowserState {
        var state = tripsBrowserFixture()
        if let trip = state.trips.first(where: { tripsBrowserPeriod($0) == .history }) {
            state.selectedTripID = trip.id
        }
        return state
    }
}
