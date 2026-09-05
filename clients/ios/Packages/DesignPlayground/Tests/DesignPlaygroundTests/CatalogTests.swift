import Testing

@testable import DesignPlayground

/// The catalogue is a hand-written list (see ``Catalog``'s note on why), so the
/// mistakes it can make are the ones a list makes: a duplicate id, an entry
/// with nothing in it, a decision naming a variant that was renamed out from
/// under it. Every check here fails on a catalogue somebody has broken and
/// passes on one nobody has.
@Suite("Catalog")
@MainActor
internal struct CatalogTests {
    @Test("Every surface offers at least one state")
    func surfacesHaveStates() {
        for surface in Catalog.surfaces {
            #expect(
                !surface.states.isEmpty,
                "\(surface.id) declares no states, so opening it shows the contract error"
            )
        }
    }

    @Test("Surface ids are unique")
    func surfaceIDsAreUnique() {
        let ids = Catalog.surfaces.map(\.id.description)
        #expect(
            Set(ids).count == ids.count,
            "two surfaces share an id, so a comment anchored to one could resolve to the other"
        )
    }

    @Test("A surface's own state ids are unique")
    func stateIDsAreUniqueWithinASurface() {
        for surface in Catalog.surfaces {
            let ids = surface.states.map(\.id)
            #expect(Set(ids).count == ids.count, "\(surface.id) has two states with one id")
        }
    }

    @Test("Component ids are unique")
    func componentIDsAreUnique() {
        let ids = Catalog.components.map(\.id)
        #expect(Set(ids).count == ids.count)
    }

    @Test("Every component shows at least one shape")
    func componentsHaveStates() {
        for component in Catalog.components {
            #expect(!component.states.isEmpty, "\(component.id) lists no shapes")
        }
    }

    @Test("An experiment offers at least two answers")
    func experimentsHaveCompetingVariants() {
        for experiment in Catalog.experiments {
            #expect(
                experiment.variants.count >= 2,
                "\(experiment.id) has \(experiment.variants.count) variant(s) — an experiment with one answer is a screen"
            )
        }
    }

    @Test("At most one open experiment sits on a surface")
    func oneOpenExperimentPerSubject() {
        let subjects = Catalog.experiments.filter(\.isOpen).map(\.subject)
        #expect(
            Set(subjects).count == subjects.count,
            "two open experiments share a subject, so which one a reviewer is answering is ambiguous"
        )
    }

    @Test("A decided experiment names a variant that exists")
    func decisionsNameRealVariants() {
        for experiment in Catalog.experiments {
            guard case .decided(let variant, _) = experiment.status else { continue }
            #expect(
                experiment.variants.contains { $0.id == variant },
                "\(experiment.id) was decided for '\(variant)', which is not one of its variants"
            )
        }
    }

    @Test("An experiment's subject is a surface that exists")
    func experimentsPointAtRealSurfaces() {
        let surfaceIDs = Set(Catalog.surfaces.map(\.id))
        for experiment in Catalog.experiments {
            #expect(
                surfaceIDs.contains(experiment.subject),
                "\(experiment.id) is about \(experiment.subject), which is in no area"
            )
        }
    }

    @Test("Areas are listed once each, in registration order")
    func areasAreDeduplicated() {
        let areas = Catalog.areas
        #expect(Set(areas).count == areas.count)
        #expect(areas.first == Catalog.surfaces.first?.id.area)
    }
}
