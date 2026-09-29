extension TypePickerTreeMode {
    var id: String { rawValue }

    var title: String {
        switch self {
        case .outline: "Expanded outline"
        case .automatic: "Automatic focus"
        case .manual: "Focus when I ask"
        }
    }

    var note: String {
        switch self {
        case .outline:
            "Expand branches in place. Every ancestor stays visible; several branches can stay open."
        case .automatic:
            "Expand in place; deeper branches bring their local tree into focus. Tap an ancestor to widen."
        case .manual:
            "Expand freely, then use Focus on a branch to hide its ancestors and unrelated branches."
        }
    }
}

@MainActor
internal enum InventoryTypePickerExperiment {
    static let experiment = DesignExperiment(
        id: "inventory-type-picker",
        question: "How do you choose a type without learning the whole catalogue?",
        subject: InventoryTypePickerSurfaces.id,
        status: .decided(
            variant: "manual",
            rationale:
                "Joao chose explicit focus: expand the tree in place, and hide ancestors only when requested."
        ),
        variants: TypePickerTreeMode.allCases.map { approach in
            DesignVariant(
                id: approach.id, title: approach.title,
                note: approach.note
                    + " Search, recents and photo suggestions are shared by every variant.",
                surface: InventoryTypePickerSurfaces.surface(approach))
        }
    )
}
