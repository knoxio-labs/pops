import Testing

@testable import DesignPlayground

@Suite("Ego entry surface")
@MainActor
internal struct EgoEntrySurfaceTests {
    @Test("the entry surface is registered as one bare state")
    func catalogRegistersClosedEntry() throws {
        let surface = try #require(
            Catalog.surfaces.first { $0.id == SurfaceID(area: "ego", slug: "entry") })

        #expect(surface.states.map(\.id) == ["closed"])
        #expect(surface.chrome == .bare)
    }
}
