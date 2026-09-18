import DesignSystem
import SwiftUI

/// Which screen of the New item / Edit item family is being drawn.
///
/// One screen rather than two: the fields, their order and their rows are
/// identical, and what changes is the title and what the final action says.
/// Creating dismisses the sheet; where it lands is the presenting screen's job.
internal enum InventoryItemFormMode: Equatable {
    case create
    case edit

    internal var actionTitle: String {
        switch self {
        case .create: "Create"
        case .edit: "Save"
        }
    }

    internal var title: String {
        switch self {
        case .create: "New item"
        case .edit: "Edit item"
        }
    }
}

/// The types the build ships, as the picker offers them.
///
/// A type is a code artefact (ADR-001), so the list is the templates the app
/// was built with and "No type yet" is a real answer rather than an empty one.
internal enum InventoryFormType {
    internal static let none = "No type yet"

    internal static var names: [String] {
        [none] + InventoryPropertyTemplates.all.map(\.name)
    }

    internal static func named(_ name: String?) -> InventoryTemplate? {
        guard let name, name != none else { return nil }
        return InventoryPropertyTemplates.all.first { $0.name == name }
    }
}

extension InventoryPlacementChoice {
    /// The glyph the destination row carries, in the dashboard's vocabulary.
    internal var destinationSymbol: String {
        switch self {
        case .currentContainer, .anotherContainer: InventorySymbol.openContainer.system
        case .directLocation: InventorySymbol.location.system
        case .inHand: InventorySymbol.inHand.system
        }
    }

    /// An open container offered as a destination is drawn in the colour the
    /// dashboard already uses for an open container, so the two screens agree
    /// about what the colour means.
    internal var destinationTone: Color {
        switch self {
        case .currentContainer, .anotherContainer: .popsWarning
        case .directLocation, .inHand: .popsMutedForeground
        }
    }

    /// What the row says under its label. Says what is still missing rather
    /// than drawing an empty line.
    internal var destinationDetail: String {
        switch self {
        case .currentContainer(_, let location): location ?? "Open container"
        case .anotherContainer(let container, let location):
            container == nil ? "Not chosen yet" : (location ?? "Open container")
        case .directLocation(let location): location == nil ? "Not chosen yet" : "Location"
        case .inHand: "Nothing is put anywhere yet"
        }
    }
}
