import SwiftUI

/// The four surfaces POPS-3988 is about, each staged under a given style.
///
/// Same contract as ``InventoryFoundationStaging``: a variant turns one knob
/// and everything else sits at the default written down in
/// ``InventorySyncStyle``, and `opening` names the state a reviewer lands on,
/// because an experiment shows a variant's first state and nothing else.
@MainActor
internal enum InventorySyncStaging {
    internal static func syncSurface(
        style: InventorySyncStyle = InventorySyncStyle(),
        opening: String = "queued",
        synopsis: String? = nil
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "sync"),
            title: "Sync & repair", synopsis: synopsis, chrome: .navigation,
            states: ordered(syncStates(style: style), opening: opening))
    }

    internal static func catalogueSurface(
        style: InventorySyncStyle = InventorySyncStyle(),
        opening: String = "offline",
        synopsis: String? = nil
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "catalogue"),
            title: "Browsing offline", synopsis: synopsis, chrome: .navigationLarge,
            states: ordered(catalogueStates(style: style), opening: opening))
    }

    internal static func repairSurface(
        style: InventorySyncStyle = InventorySyncStyle(),
        opening: String = "concurrent-edit",
        synopsis: String? = nil
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "repair"),
            title: "One repair", synopsis: synopsis, chrome: .navigation,
            states: ordered(repairStates(style: style), opening: opening))
    }

    internal static func lookupSurface(
        style: InventorySyncStyle = InventorySyncStyle(),
        opening: String = "stale-results",
        synopsis: String? = nil
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "lookup"),
            title: "Search and scan", synopsis: synopsis, chrome: .navigation,
            states: ordered(lookupStates(style: style), opening: opening))
    }

    private static func ordered(_ states: [DesignState], opening: String) -> [DesignState] {
        states.filter { $0.id == opening } + states.filter { $0.id != opening }
    }

    private static func syncState(
        _ id: String, _ title: String, _ scene: InventorySyncScene, _ style: InventorySyncStyle
    ) -> DesignState {
        DesignState(id, title) {
            InventorySyncScreen(scene: scene).environment(\.inventorySyncStyle, style)
        }
    }

    private static func catalogueState(
        _ id: String, _ title: String, _ scene: InventorySyncScene, _ style: InventorySyncStyle
    ) -> DesignState {
        DesignState(id, title) {
            InventoryCatalogueScreen(scene: scene).environment(\.inventorySyncStyle, style)
        }
    }

    private static func syncStates(style: InventorySyncStyle) -> [DesignState] {
        let scenes = InventorySyncScenes.self
        return [
            syncState("queued", "Offline, six waiting", scenes.queued, style),
            syncState("first-run", "Before any copy exists", scenes.firstRun, style),
            syncState("offline-read", "Offline, nothing waiting", scenes.offlineRead, style),
            syncState("relaunched", "38 waiting, after a relaunch", scenes.relaunched, style),
            syncState("replaying", "Reconnected, partly replayed", scenes.replaying, style),
            syncState("repairs", "Five repairs waiting", scenes.repairs, style),
            syncState("session-expired", "Session expired", scenes.sessionExpired, style),
            syncState("storage-full", "Storage full", scenes.storageFull, style),
            syncState("app-behind", "App behind the server", scenes.appBehind, style),
            syncState("settled", "Everything landed", scenes.settled, style),
        ]
    }

    private static func catalogueStates(style: InventorySyncStyle) -> [DesignState] {
        let scenes = InventorySyncScenes.self
        return [
            catalogueState("offline", "Offline, six waiting", scenes.queued, style),
            catalogueState("repairs", "With repairs waiting", scenes.repairs, style),
            catalogueState("queue-stopped", "Session expired", scenes.sessionExpired, style),
            catalogueState("stale", "A day behind", scenes.relaunched, style),
            catalogueState("settled", "Nothing waiting", scenes.settled, style),
        ]
    }

    private static func repairStates(style: InventorySyncStyle) -> [DesignState] {
        InventoryConflictKind.allCases.map { kind in
            DesignState(kind.stateID, kind.headline) {
                InventoryRepairScreen(conflict: InventorySyncFixtures.repair(for: kind))
                    .environment(\.inventorySyncStyle, style)
            }
        }
            + [DesignState("grammar", "Every repair's wording") { InventoryRepairGrammarList() }]
    }

    private static func lookupStates(style: InventorySyncStyle) -> [DesignState] {
        [
            DesignState("stale-results", "Results this phone may be behind on") {
                InventoryLookupScreen(results: InventoryLookupFixtures.results)
                    .environment(\.inventorySyncStyle, style)
            },
            DesignState("fresh-results", "Results minutes old") {
                InventoryLookupScreen(results: InventoryLookupFixtures.fresh)
                    .environment(\.inventorySyncStyle, style)
            },
            DesignState("unknown-code", "A scanned label this copy has not seen") {
                InventoryLookupScreen(
                    results: InventoryLookupFixtures.results, showsUnknownCode: true
                )
                .environment(\.inventorySyncStyle, style)
            },
        ]
    }
}

extension InventoryConflictKind {
    /// The kebab-case state id this kind is looked at under. Written out
    /// rather than derived, because a state id is an address a comment can be
    /// anchored to and deriving it means a rename moves it silently.
    internal var stateID: String {
        switch self {
        case .concurrentEdit: "concurrent-edit"
        case .remoteDeletion: "remote-deletion"
        case .codeCollision: "code-collision"
        case .validation: "validation"
        case .expiredSession: "expired-session"
        case .missingDependency: "missing-dependency"
        case .storageFull: "storage-full"
        case .unsupportedContract: "unsupported-contract"
        case .deviceDivergence: "device-divergence"
        }
    }
}

internal enum InventorySyncSurfaces {
    @MainActor internal static let surfaces: [DesignSurface] = [
        InventorySyncStaging.syncSurface(
            synopsis:
                "Everything this phone has that POPS does not, and everything it would not take."),
        InventorySyncStaging.catalogueSurface(
            synopsis: "Browsing while the phone is on its own. Ordinary use must not look broken."),
        InventorySyncStaging.repairSurface(
            synopsis: "One disagreement at a time: which item, what disagreed, and every way out."),
        InventorySyncStaging.lookupSurface(
            synopsis: "Searching and scanning against a copy that may be behind."),
    ]
}
