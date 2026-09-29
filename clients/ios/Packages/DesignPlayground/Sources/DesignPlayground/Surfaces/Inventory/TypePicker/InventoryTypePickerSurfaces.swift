internal enum TypePickerOpening: String, CaseIterable {
    case tree, expanded, selected, start, cover, next, noMatch, noSuggestion

    var title: String {
        switch self {
        case .tree: "Choose a type"
        case .expanded: "Cushions branch expanded"
        case .selected: "Change selected cushion cover"
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
    static let surfaces = [surface(.manual)]

    static func surface(_ approach: TypePickerTreeMode) -> DesignSurface {
        DesignSurface(
            id: id,
            title: approach == .manual ? "Choose item type" : "Type picker · \(approach.title)",
            synopsis:
                "Rehearse a cushion cover, then its cushion. Fictional catalogue; photo capture, "
                + "recognition and saving are simulated in memory. Manual focus is the selected direction.",
            chrome: .bare,
            states: TypePickerOpening.allCases.map { opening in
                DesignState(opening.rawValue, opening.title) {
                    TypePickerJourneyView(approach: approach, opening: opening)
                }
            }
        )
    }
}
