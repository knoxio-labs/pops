import SwiftUI

/// Store here's scanner, one state per answer it can give.
internal enum InventoryStoreScanStates {
    private typealias Fixtures = InventoryContainerFixtures

    internal static var all: [DesignState] {
        [
            state("scan", "Scanning", .scanning),
            state("scan-resolving", "Resolving a code", .loading),
            state("scan-not-found", "No item has the code", .notFound),
            state("scan-not-item", "A place or another pillar's code", .notAnItem),
            state("scan-not-pops", "Not a POPS code", .notPops),
            state("scan-failed", "The move did not save", .failed),
            state("scan-denied", "Camera access denied", .denied),
        ] + answers
    }

    private static var answers: [DesignState] {
        let records = [
            InventoryFoundationFixtures.screws, InventoryFoundationFixtures.tape,
            InventoryFoundationFixtures.drill,
        ].compactMap { InventorySearchFixtures.record(id: $0.id) }
        guard let first = records.first else { return [] }
        return [
            state("scan-stored", "Stored", .answered(first, .stored)),
            state("scan-already", "Already here", .answered(first, .alreadyHere)),
            state("scan-refused", "Cannot be stored here", .answered(first, .refused)),
            state("scan-matches", "Several items share the code", .matches(records)),
        ]
    }

    /// A Store here sheet standing over the container page it was opened from.
    internal static func sheetState(
        _ id: String, _ title: String, @ViewBuilder sheet: @MainActor @escaping () -> some View
    ) -> DesignState {
        DesignState(id, title) {
            NavigationStack {
                InventoryContainerPage(profile: Fixtures.few)
                    .sheet(isPresented: .constant(true)) { sheet() }
            }
        }
    }

    private static func state(
        _ id: String, _ title: String, _ phase: InventoryStoreScanPhase
    ) -> DesignState {
        sheetState(id, title) {
            InventoryStoreHereSheet(target: .container(Fixtures.few), step: .scan, scan: phase)
        }
    }
}
