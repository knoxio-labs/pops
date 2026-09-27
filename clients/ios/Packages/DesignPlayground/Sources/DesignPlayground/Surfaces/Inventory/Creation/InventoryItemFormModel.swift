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

internal struct InventoryFormTypeNode: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let parentID: String?
    internal let fields: [InventoryTemplateField]
    internal let isArchived: Bool
}

internal struct InventoryFormTypeOption: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let path: String
    internal let depth: Int
    internal let isArchived: Bool
    internal let hasChildren: Bool
}

/// The types the build ships, as the picker offers them.
///
/// A type is a code artefact (ADR-001), so the list is the templates the app
/// was built with and "No type yet" is a real answer rather than an empty one.
internal enum InventoryFormType {
    internal static let none = "No type yet"

    internal static var names: [String] {
        [none] + tree.map(\.name) + InventoryPropertyTemplates.all.map(\.name)
    }

    internal static func named(_ name: String?) -> InventoryTemplate? {
        guard let name, name != none else { return nil }
        if let node = tree.first(where: { $0.name == name }) {
            return InventoryTemplate(
                id: node.id, name: node.name, fields: fields(for: node.id))
        }
        return InventoryPropertyTemplates.all.first { $0.name == name }
    }

    internal static func path(for name: String?) -> String? {
        guard let name, name != none else { return nil }
        guard let node = tree.first(where: { $0.name == name }) else { return name }
        return path(for: node).joined(separator: " › ")
    }

    internal static func detailSubtitle(typeName: String?, quantity: Int) -> String {
        var parts = [path(for: typeName) ?? none]
        if quantity != 1 { parts.append("\(quantity) in this group") }
        return parts.joined(separator: " · ")
    }

    internal static func children(of parentID: String?) -> [InventoryFormTypeNode] {
        tree.filter { $0.parentID == parentID }
    }

    internal static func node(withID id: String) -> InventoryFormTypeNode? {
        tree.first { $0.id == id }
    }

    internal static func hasChildren(_ node: InventoryFormTypeNode) -> Bool {
        tree.contains { $0.parentID == node.id }
    }

    internal static func searchOptions(
        query: String, additionalNames: [String] = []
    ) -> [InventoryFormTypeOption] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let treeOptions = tree.map { node in
            InventoryFormTypeOption(
                id: node.id, name: node.name, path: path(for: node).joined(separator: " › "),
                depth: path(for: node).count - 1, isArchived: node.isArchived,
                hasChildren: hasChildren(node))
        }
        let standaloneOptions = standaloneNames(additionalNames: additionalNames).map {
            InventoryFormTypeOption(
                id: "extra-\($0)", name: $0, path: $0, depth: 0, isArchived: false,
                hasChildren: false)
        }
        return (treeOptions + standaloneOptions).filter {
            $0.path.localizedCaseInsensitiveContains(trimmed)
        }
    }

    internal static func standaloneNames(additionalNames: [String] = []) -> [String] {
        let treeNames = Set(tree.map(\.name))
        var seen = Set<String>()
        return (InventoryPropertyTemplates.all.map(\.name) + additionalNames).filter {
            !$0.isEmpty && $0 != none && !treeNames.contains($0) && seen.insert($0).inserted
        }
    }

    internal static func includes(_ itemType: String?, in selectedType: String?) -> Bool {
        guard let selectedType else { return true }
        guard let itemType else { return false }
        guard itemType != selectedType else { return true }
        guard let selected = tree.first(where: { $0.name == selectedType }),
            let item = tree.first(where: { $0.name == itemType })
        else { return false }

        var ancestorID = item.parentID
        while let currentID = ancestorID {
            if currentID == selected.id { return true }
            ancestorID = tree.first(where: { $0.id == currentID })?.parentID
        }
        return false
    }

    private static func fields(for nodeID: String) -> [InventoryTemplateField] {
        guard let node = tree.first(where: { $0.id == nodeID }) else { return [] }
        let inherited = node.parentID.flatMap(fields(for:)) ?? []
        return inherited + node.fields
    }

    private static func path(for node: InventoryFormTypeNode) -> [String] {
        var names = [node.name]
        var parentID = node.parentID
        while let currentID = parentID, let parent = tree.first(where: { $0.id == currentID }) {
            names.append(parent.name)
            parentID = parent.parentID
        }
        return names.reversed()
    }

    private static let tree: [InventoryFormTypeNode] = [
        InventoryFormTypeNode(
            id: "bedding", name: "Bedding", parentID: nil,
            fields: [
                InventoryTemplateField("Destination", "Text", highlighted: true),
                InventoryTemplateField("Material", "Text"),
                InventoryTemplateField("Colour", "Text"),
                InventoryTemplateField("Pattern", "Text"),
                InventoryTemplateField("Weather", "Choice", choices: ["All weather"]),
                InventoryTemplateField("Bed size", "Choice", choices: ["Single", "Queen", "King"]),
            ], isArchived: false),
        InventoryFormTypeNode(
            id: "sheet", name: "Sheet", parentID: "bedding",
            fields: [InventoryTemplateField("Fitted", "Yes or no")], isArchived: false),
        InventoryFormTypeNode(
            id: "quilt", name: "Quilt", parentID: "bedding",
            fields: [InventoryTemplateField("Fill", "Text")], isArchived: false),
        InventoryFormTypeNode(
            id: "quilt-cover", name: "Quilt cover", parentID: "bedding",
            fields: [
                InventoryTemplateField("Closure", "Choice", choices: ["Buttons", "Zip", "Ties"])
            ],
            isArchived: false),
        InventoryFormTypeNode(
            id: "blanket", name: "Blanket", parentID: "bedding",
            fields: [
                InventoryTemplateField("Weight", "Measurement", unit: "kg"),
                InventoryTemplateField("Waterproof", "Yes or no"),
                InventoryTemplateField("Decorative", "Yes or no"),
            ], isArchived: false),
        InventoryFormTypeNode(
            id: "mattress-protector", name: "Mattress protector", parentID: "bedding",
            fields: [InventoryTemplateField("Waterproof", "Yes or no")], isArchived: false),
        InventoryFormTypeNode(
            id: "pillows-cushions", name: "Pillows & cushions", parentID: nil,
            fields: [
                InventoryTemplateField("Destination", "Text", highlighted: true),
                InventoryTemplateField("Material", "Text"),
                InventoryTemplateField("Colour", "Text"),
                InventoryTemplateField("Pattern", "Text"),
            ], isArchived: false),
        InventoryFormTypeNode(
            id: "pillows", name: "Pillows", parentID: "pillows-cushions",
            fields: [
                InventoryTemplateField("Pillow size", "Choice", choices: ["Standard", "King"])
            ],
            isArchived: false),
        InventoryFormTypeNode(
            id: "pillow", name: "Pillow", parentID: "pillows",
            fields: [InventoryTemplateField("Fill", "Text")], isArchived: false),
        InventoryFormTypeNode(
            id: "pillowcase", name: "Pillowcase", parentID: "pillows",
            fields: [InventoryTemplateField("Closure", "Choice", choices: ["Envelope", "Zip"])],
            isArchived: false),
        InventoryFormTypeNode(
            id: "pillow-protector", name: "Pillow protector", parentID: "pillows",
            fields: [InventoryTemplateField("Closure", "Choice", choices: ["Zip"])],
            isArchived: true),
        InventoryFormTypeNode(
            id: "cushions", name: "Cushions", parentID: "pillows-cushions",
            fields: [
                InventoryTemplateField("Width", "Measurement", unit: "cm"),
                InventoryTemplateField("Length", "Measurement", unit: "cm"),
            ], isArchived: false),
        InventoryFormTypeNode(
            id: "cushion", name: "Cushion", parentID: "cushions",
            fields: [InventoryTemplateField("Fill", "Text")], isArchived: false),
        InventoryFormTypeNode(
            id: "cushion-cover", name: "Cushion cover", parentID: "cushions",
            fields: [InventoryTemplateField("Closure", "Choice", choices: ["Zip", "Ties"])],
            isArchived: false),
    ]
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
}
