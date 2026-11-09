import Testing

@testable import DesignPlayground

@Suite("Trip Today registration")
@MainActor
internal struct TripTodayRegistrationTests {
    @Test("both native proposals are directly launchable with every named source state")
    func proposalsAreRegistered() throws {
        let surface = try #require(Catalog.surfaces.first { $0.id == TripTodaySurfaces.id })
        #expect(surface.id.description == "trips/today")
        let states = Set(surface.states.map(\.id))
        #expect(states.isSuperset(of: TripsTodayScenario.allCases.map(\.rawValue)))
        for state in ["next-first", "day-timeline"] {
            let launch = try #require(
                LaunchStage.named(in: ["app", "-surface", "trips/today", "-state", state]))
            #expect(launch.stateID == state)
        }
    }

    @Test("the experiment keeps distinct hierarchies and a default state tied to each variant")
    func experimentHasBothVariants() throws {
        let experiment = try #require(Catalog.experiments.first { $0.id == "trip-today" })
        #expect(experiment.isOpen)
        #expect(experiment.subject == TripTodaySurfaces.id)
        #expect(experiment.variants.map(\.id) == ["next-first", "day-timeline"])
        for variant in experiment.variants {
            #expect(variant.surface.openingState?.id == "default")
            #expect(variant.surface.state(id: "next-first") == nil)
            #expect(variant.surface.state(id: "day-timeline") == nil)
        }
    }
}
