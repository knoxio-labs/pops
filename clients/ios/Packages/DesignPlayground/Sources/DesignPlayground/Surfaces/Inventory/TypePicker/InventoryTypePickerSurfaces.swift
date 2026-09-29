internal enum TypePickerOpening: String, CaseIterable {
    case tree, expanded, start, cover, next, noMatch, noSuggestion

    var title: String {
        switch self {
        case .tree: "Choose a type"
        case .expanded: "Cushions branch expanded"
        case .start: "Start in Inventory"
        case .cover: "Cover photographed"
        case .next: "Cover saved · add the cushion"
        case .noMatch: "Unknown type"
        case .noSuggestion: "Photo offers no suggestion"
        }
    }
}

@MainActor
internal enum InventoryTypePickerSurfaces {
    static let id = SurfaceID(area: "inventory", slug: "type-picker-lab")
    static let surfaces = [surface(.automatic)]

    static func surface(_ approach: TypePickerTreeMode) -> DesignSurface {
        DesignSurface(
            id: id, title: "Type picker · \(approach.title)",
            synopsis:
                "Rehearse a cushion cover, then its cushion. Fictional catalogue; photo capture, "
                + "recognition and saving are simulated in memory. No design has been chosen.",
            chrome: .bare,
            states: TypePickerOpening.allCases.map { opening in
                DesignState(opening.rawValue, opening.title) {
                    TypePickerJourneyView(approach: approach, opening: opening)
                }
            }
        )
    }
}
