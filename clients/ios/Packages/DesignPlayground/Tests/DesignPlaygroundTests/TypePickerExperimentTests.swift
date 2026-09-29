import Testing

@testable import DesignPlayground

@Suite("Type picker experiment")
@MainActor
internal struct TypePickerExperimentTests {
    @Test("Alternatives remain undecided and compare identical entry conditions")
    func comparableAlternatives() {
        let experiment = InventoryTypePickerExperiment.experiment
        #expect(experiment.status == .open)
        #expect(Set(experiment.variants.map(\.id)) == ["search", "browse", "context", "photo"])
        for variant in experiment.variants {
            #expect(variant.surface.id == experiment.subject)
            #expect(variant.surface.chrome == .bare)
            #expect(
                variant.surface.states.map(\.id)
                    == ["start", "cover", "next", "noMatch", "noSuggestion"])
        }
    }

    @Test("Both the surface and experiment are reachable from the catalogue")
    func registered() {
        #expect(Catalog.surfaces.contains { $0.id == InventoryTypePickerSurfaces.id })
        #expect(Catalog.experiments.contains { $0.id == "inventory-type-picker" })
    }
}
