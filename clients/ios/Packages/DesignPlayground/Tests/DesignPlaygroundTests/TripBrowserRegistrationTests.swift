import Testing

@testable import DesignPlayground

@Suite("Trip browser registration")
@MainActor
internal struct TripBrowserRegistrationTests {
    @Test("native navigation owns its chrome and all review states are directly launchable")
    func registeredStates() throws {
        let surface = try #require(Catalog.surfaces.first { $0.id == TripBrowserSurfaces.id })
        #expect(surface.chrome == .bare)
        #expect(surface.openingState?.id == "default")
        for state in [
            "default", "plan", "calendar", "bookings", "documents", "search", "history", "empty",
            "missing-sources",
        ] {
            #expect(surface.state(id: state) != nil)
            let launch = try #require(
                LaunchStage.named(in: ["app", "-surface", "trips/browser", "-state", state]))
            #expect(launch.stateID == state)
        }
        #expect(!Catalog.experiments.contains { $0.id == "trip-browser" })
    }
}
