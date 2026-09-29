import Testing

@testable import DesignPlayground

@Suite("Type picker experiment")
@MainActor
internal struct TypePickerExperimentTests {
    @Test("Chosen direction retains alternatives and compare identical entry conditions")
    func comparableAlternatives() {
        let experiment = InventoryTypePickerExperiment.experiment
        #expect(experiment.chosen?.id == "manual")
        #expect(Set(experiment.variants.map(\.id)) == ["outline", "automatic", "manual"])
        for variant in experiment.variants {
            #expect(variant.surface.id == experiment.subject)
            #expect(variant.surface.chrome == .bare)
            #expect(
                variant.surface.states.map(\.id)
                    == [
                        "tree", "expanded", "selected", "start", "cover", "next", "noMatch",
                        "noSuggestion",
                    ])
        }
    }

    @Test("Both the surface and experiment are reachable from the catalogue")
    func registered() {
        #expect(Catalog.surfaces.contains { $0.id == InventoryTypePickerSurfaces.id })
        #expect(Catalog.experiments.contains { $0.id == "inventory-type-picker" })
    }
}
