import SwiftUI
import Testing

@testable import DesignPlayground

/// An experiment names no chrome of its own — it inherits its first variant's.
/// That is how a tab bar nobody asked for ends up under an A/B, labelled with
/// the experiment's question truncated to fit and flanked by two stand-in tabs
/// that go nowhere, taking the bottom of the screen away from the comparison.
@Suite("Experiment staging")
@MainActor
internal struct ExperimentStagingTests {
    private static func surface(chrome: Chrome) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "test", slug: "subject"),
            title: "Subject",
            chrome: chrome,
            states: [DesignState.standard { EmptyView() }]
        )
    }

    private static func experiment(variantChrome: Chrome) -> DesignExperiment {
        DesignExperiment(
            id: "test",
            question: "Does it read better one way or the other?",
            subject: SurfaceID(area: "test", slug: "subject"),
            variants: [
                DesignVariant(id: "a", title: "A", surface: surface(chrome: variantChrome)),
                DesignVariant(id: "b", title: "B", surface: surface(chrome: variantChrome)),
            ]
        )
    }

    @Test("whatever a variant declares, a staged experiment draws no tab bar")
    func stagedExperimentNeverDrawsTabs() {
        for chrome in Chrome.allCases {
            let staged = Self.experiment(variantChrome: chrome).asSurface()

            #expect(
                !staged.chrome.showsTabBar,
                "a variant on \(chrome.rawValue) staged as \(staged.chrome.rawValue)"
            )
        }
    }

    /// Dropping the tabs must not drop the navigation stack they were wrapping
    /// — a variant designed under a large title still has to be reviewed under
    /// one.
    @Test("dropping the tab bar keeps what it was wrapping")
    func dropsTheTabsAndNothingElse() {
        #expect(Chrome.tabbed.withoutTabBar == .bare)
        #expect(Chrome.navigationAndTabs.withoutTabBar == .navigationLarge)

        for chrome in Chrome.allCases where !chrome.showsTabBar {
            #expect(
                chrome.withoutTabBar == chrome,
                "\(chrome.rawValue) draws no tab bar and was changed anyway"
            )
        }
    }

    @Test("every experiment in the catalogue stages without a tab bar")
    func catalogueExperimentsDrawNoTabs() {
        for experiment in Catalog.experiments {
            #expect(
                !experiment.asSurface().chrome.showsTabBar,
                "\(experiment.id) stages under a tab bar"
            )
        }
    }

    /// The contract the inspector's chip strip is built on: a variant is a
    /// state, in declaration order, under its own title.
    @Test("the variants are the staged surface's states, in order")
    func variantsBecomeStates() {
        let staged = Self.experiment(variantChrome: .navigationAndTabs).asSurface()

        #expect(staged.states.map(\.id) == ["a", "b"])
        #expect(staged.states.map(\.title) == ["A", "B"])
    }
}
