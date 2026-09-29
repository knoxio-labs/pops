import Foundation

internal struct TypePickerType: Identifiable, Hashable {
    internal let id: String
    internal let name: String
    internal let parentID: String?
    internal let aliases: [String]
}

internal enum TypePickerTaxonomy {
    internal static let types: [TypePickerType] = [
        type("item", "Item"),
        type("book", "Book", parent: "item", aliases: ["books"]),
        type("furniture", "Furniture", parent: "item"),
        type(
            "storage-furniture", "Storage furniture", parent: "furniture",
            aliases: ["shelf", "cabinet"]),
        type("home-textiles", "Home textiles", parent: "item", aliases: ["linen"]),
        type(
            "textile-soft-furnishing", "Textile & soft furnishing", parent: "home-textiles",
            aliases: ["fabric"]),
        type("towel", "Towel", parent: "home-textiles", aliases: ["bath towel"]),
        type("bedding", "Bedding", parent: "home-textiles", aliases: ["bed linen"]),
        type("sheet", "Sheet", parent: "bedding", aliases: ["bedsheet"]),
        type("quilt", "Quilt", parent: "bedding", aliases: ["doona", "duvet"]),
        type(
            "quilt-cover", "Quilt cover", parent: "bedding",
            aliases: ["doona cover", "duvet cover"]),
        type("blanket", "Blanket", parent: "bedding", aliases: ["throw"]),
        type(
            "mattress-protector", "Mattress protector", parent: "bedding",
            aliases: ["mattress cover"]),
        type(
            "pillows-cushions", "Pillows & cushions", parent: "home-textiles",
            aliases: ["soft furnishings"]),
        type("pillows", "Pillows", parent: "pillows-cushions"),
        type("pillow", "Pillow", parent: "pillows", aliases: ["bed pillow"]),
        type("pillowcase", "Pillowcase", parent: "pillows", aliases: ["pillow case"]),
        type("cushions", "Cushions", parent: "pillows-cushions"),
        type(
            "cushion", "Cushion", parent: "cushions",
            aliases: ["decorative pillow", "cushion insert"]),
        type("cushion-cover", "Cushion cover", parent: "cushions", aliases: ["cushion case"]),
        type(
            "electrical-electronics", "Electrical & electronics", parent: "item",
            aliases: ["electricals"]),
        type(
            "electronics-appliance", "Electronics & appliance", parent: "electrical-electronics",
            aliases: ["appliance"]),
        type(
            "light-bulb", "Light bulb", parent: "electrical-electronics",
            aliases: ["lamp", "globe"]),
        type("cable", "Cable", parent: "electrical-electronics", aliases: ["cord", "lead"]),
        type("charger", "Charger", parent: "electrical-electronics", aliases: ["power adapter"]),
        type("tools-supplies", "Tools & supplies", parent: "item"),
        type("tool", "Tool", parent: "tools-supplies"),
        type("maker-supply", "Maker supply", parent: "tools-supplies", aliases: ["craft supply"]),
        type("hardware-material", "Hardware & material", parent: "tools-supplies"),
        type("tape", "Tape", parent: "tools-supplies", aliases: ["adhesive tape"]),
        type("fitting", "Fitting", parent: "tools-supplies", aliases: ["fixture"]),
        type("kitchen-bar", "Kitchen & bar", parent: "item"),
        type("kitchen-cookware", "Kitchen & cookware", parent: "kitchen-bar"),
        type(
            "bar-brewing-gear", "Bar & brewing gear", parent: "kitchen-bar",
            aliases: ["coffee gear"]),
        type(
            "alcohol-bottle", "Alcohol bottle", parent: "kitchen-bar", aliases: ["wine", "spirits"]),
        type("containers-luggage", "Containers & luggage", parent: "item"),
        type("storage-box", "Storage box", parent: "containers-luggage", aliases: ["bin", "tub"]),
        type("case-bag", "Case & bag", parent: "containers-luggage", aliases: ["luggage"]),
        type("art-frame", "Art & frame", parent: "item", aliases: ["artwork", "picture frame"]),
        type("clothing-accessory", "Clothing & accessory", parent: "item", aliases: ["apparel"]),
        type(
            "outdoor-camping-bbq", "Outdoor, camping & BBQ", parent: "item", aliases: ["barbecue"]),
        type("plant", "Plant", parent: "item", aliases: ["houseplant"]),
        type("cleaning-supply", "Cleaning supply", parent: "item", aliases: ["cleaner"]),
        type("document-valuable", "Document & valuable", parent: "item", aliases: ["paperwork"]),
        type("key", "Key", parent: "item", aliases: ["keys"]),
        type("other-item", "Other item", parent: "item", aliases: ["miscellaneous"]),
    ]

    internal static func children(of parentID: String?) -> [TypePickerType] {
        types.filter { $0.parentID == parentID }
    }

    internal static func breadcrumb(for id: String) -> String {
        path(for: id).map(\.name).joined(separator: " › ")
    }

    internal static func search(_ query: String) -> [TypePickerType] {
        let tokens = normalized(query).split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return [] }

        return types.filter { candidate in
            let context = path(for: candidate.id)
                .flatMap { [$0.name] + $0.aliases }
                .map(normalized)
                .joined(separator: " ")
            return tokens.allSatisfy(context.contains)
        }
    }

    internal static func node(_ id: String) -> TypePickerType? {
        types.first { $0.id == id }
    }

    internal static func suggested(after id: String?) -> [TypePickerType] {
        guard let id, let selected = node(id), let parentID = selected.parentID else { return [] }
        let counterpartID: String? =
            switch id {
            case "quilt-cover": "quilt"
            case "cushion-cover": "cushion"
            case "pillowcase": "pillow"
            default: nil
            }
        let siblingIDs = children(of: parentID).map(\.id).filter { $0 != id && $0 != counterpartID }
        return ([counterpartID].compactMap { $0 } + siblingIDs).compactMap(node)
    }

    private static func type(
        _ id: String,
        _ name: String,
        parent: String? = nil,
        aliases: [String] = []
    ) -> TypePickerType {
        TypePickerType(id: id, name: name, parentID: parent, aliases: aliases)
    }

    private static func path(for id: String) -> [TypePickerType] {
        guard let leaf = node(id) else { return [] }
        var result = [leaf]
        var parentID = leaf.parentID
        while let id = parentID, let parent = node(id) {
            result.append(parent)
            parentID = parent.parentID
        }
        return result.reversed()
    }

    private static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .joined(separator: " ")
    }
}
