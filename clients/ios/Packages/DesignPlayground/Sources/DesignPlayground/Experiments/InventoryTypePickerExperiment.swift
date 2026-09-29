internal enum TypePickerApproach: String, CaseIterable, Identifiable {
    case search, browse, context, photo

    var id: String { rawValue }

    var title: String {
        switch self {
        case .search: "Search & recents"
        case .browse: "Walk the tree"
        case .context: "Keep the context"
        case .photo: "Ask the photo"
        }
    }

    var note: String {
        switch self {
        case .search:
            "Jump to a name or synonym; recent types shorten repeat entry. Browse is always available."
        case .browse:
            "Recognise a family, then narrow it. No keyboard required; deep branches cost more taps."
        case .context:
            "Choose near the last item and offer its counterpart after saving. Suggestions never copy photos."
        case .photo:
            "Confirm one of two staged photo suggestions. A cover and its insert can look identical."
        }
    }
}

@MainActor
internal enum InventoryTypePickerExperiment {
    static let experiment = DesignExperiment(
        id: "inventory-type-picker",
        question: "How do you choose a type without learning the whole catalogue?",
        subject: InventoryTypePickerSurfaces.id,
        variants: TypePickerApproach.allCases.map { approach in
            DesignVariant(
                id: approach.id, title: approach.title,
                note: approach.note + " Photo-first and final-action creation remain fixed.",
                surface: InventoryTypePickerSurfaces.surface(approach))
        }
    )
}
