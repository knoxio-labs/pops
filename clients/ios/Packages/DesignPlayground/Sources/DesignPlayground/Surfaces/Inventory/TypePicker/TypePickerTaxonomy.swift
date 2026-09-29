import Foundation

internal struct TypePickerType: Identifiable, Hashable {
    internal let id: String
    internal let name: String
    internal let parentID: String?
    internal let aliases: [String]
    internal let symbol: String

    internal init(
        id: String, name: String, parentID: String?, aliases: [String],
        symbol: String = "square.grid.2x2"
    ) {
        self.id = id
        self.name = name
        self.parentID = parentID
        self.aliases = aliases
        self.symbol = symbol
    }
}

internal enum TypePickerTaxonomy {
    internal static let types: [TypePickerType] = [
        type("item", "Item", symbol: "square.grid.2x2"),
        type("book", "Book", symbol: "book.closed", parent: "item", aliases: ["books"]),
        type("furniture", "Furniture", symbol: "cabinet", parent: "item"),
        type(
            "storage-furniture", "Storage furniture", symbol: "cabinet", parent: "furniture",
            aliases: ["shelf", "cabinet"]),
        type(
            "home-textiles", "Home textiles", symbol: "square.stack", parent: "item",
            aliases: ["linen"]),
        type(
            "textile-soft-furnishing", "Textile & soft furnishing", symbol: "square.stack",
            parent: "home-textiles",
            aliases: ["fabric"]),
        type(
            "towel", "Towel", symbol: "square.stack", parent: "home-textiles",
            aliases: ["bath towel"]),
        type(
            "bedding", "Bedding", symbol: "bed.double", parent: "home-textiles",
            aliases: ["bed linen"]),
        type("sheet", "Sheet", symbol: "bed.double", parent: "bedding", aliases: ["bedsheet"]),
        type(
            "quilt", "Quilt", symbol: "bed.double", parent: "bedding", aliases: ["doona", "duvet"]),
        type(
            "quilt-cover", "Quilt cover", symbol: "bed.double", parent: "bedding",
            aliases: ["doona cover", "duvet cover"]),
        type("blanket", "Blanket", symbol: "bed.double", parent: "bedding", aliases: ["throw"]),
        type(
            "mattress-protector", "Mattress protector", symbol: "bed.double", parent: "bedding",
            aliases: ["mattress cover"]),
        type(
            "pillows-cushions", "Pillows & cushions", symbol: "square.on.square",
            parent: "home-textiles",
            aliases: ["soft furnishings"]),
        type("pillows", "Pillows", symbol: "square.on.square", parent: "pillows-cushions"),
        type(
            "pillow", "Pillow", symbol: "square.on.square", parent: "pillows",
            aliases: ["bed pillow"]),
        type(
            "pillowcase", "Pillowcase", symbol: "square.on.square", parent: "pillows",
            aliases: ["pillow case"]),
        type("cushions", "Cushions", symbol: "square.on.square", parent: "pillows-cushions"),
        type(
            "cushion", "Cushion", symbol: "square.on.square", parent: "cushions",
            aliases: ["decorative pillow", "cushion insert"]),
        type(
            "cushion-cover", "Cushion cover", symbol: "square.on.square", parent: "cushions",
            aliases: ["cushion case"]),
        type(
            "electrical-electronics", "Electrical & electronics", symbol: "powerplug",
            parent: "item",
            aliases: ["electricals"]),
        type(
            "electronics-appliance", "Electronics & appliance", symbol: "powerplug",
            parent: "electrical-electronics",
            aliases: ["appliance"]),
        type(
            "light-bulb", "Light bulb", symbol: "lightbulb", parent: "electrical-electronics",
            aliases: ["lamp", "globe"]),
        type(
            "cable", "Cable", symbol: "cable.connector", parent: "electrical-electronics",
            aliases: ["cord", "lead"]),
        type(
            "charger", "Charger", symbol: "cable.connector", parent: "electrical-electronics",
            aliases: ["power adapter"]),
        type(
            "tools-supplies", "Tools & supplies", symbol: "wrench.and.screwdriver", parent: "item"),
        type("tool", "Tool", symbol: "wrench.and.screwdriver", parent: "tools-supplies"),
        type(
            "maker-supply", "Maker supply", symbol: "square.grid.2x2", parent: "tools-supplies",
            aliases: ["craft supply"]),
        type(
            "hardware-material", "Hardware & material", symbol: "wrench.and.screwdriver",
            parent: "tools-supplies"),
        type(
            "tape", "Tape", symbol: "square.grid.2x2", parent: "tools-supplies",
            aliases: ["adhesive tape"]),
        type(
            "fitting", "Fitting", symbol: "wrench.and.screwdriver", parent: "tools-supplies",
            aliases: ["fixture"]),
        type("kitchen-bar", "Kitchen & bar", symbol: "fork.knife", parent: "item"),
        type("kitchen-cookware", "Kitchen & cookware", symbol: "fork.knife", parent: "kitchen-bar"),
        type(
            "bar-brewing-gear", "Bar & brewing gear", symbol: "wineglass", parent: "kitchen-bar",
            aliases: ["coffee gear"]),
        type(
            "alcohol-bottle", "Alcohol bottle", symbol: "wineglass", parent: "kitchen-bar",
            aliases: ["wine", "spirits"]),
        type("containers-luggage", "Containers & luggage", symbol: "shippingbox", parent: "item"),
        type(
            "storage-box", "Storage box", symbol: "shippingbox", parent: "containers-luggage",
            aliases: ["bin", "tub"]),
        type(
            "case-bag", "Case & bag", symbol: "bag", parent: "containers-luggage",
            aliases: ["luggage"]),
        type(
            "art-frame", "Art & frame", symbol: "photo.artframe", parent: "item",
            aliases: ["artwork", "picture frame"]),
        type(
            "clothing-accessory", "Clothing & accessory", symbol: "tshirt", parent: "item",
            aliases: ["apparel"]),
        type(
            "outdoor-camping-bbq", "Outdoor, camping & BBQ", symbol: "tent", parent: "item",
            aliases: ["barbecue"]),
        type("plant", "Plant", symbol: "leaf", parent: "item", aliases: ["houseplant"]),
        type(
            "cleaning-supply", "Cleaning supply", symbol: "sparkles", parent: "item",
            aliases: ["cleaner"]),
        type(
            "document-valuable", "Document & valuable", symbol: "doc", parent: "item",
            aliases: ["paperwork"]),
        type("key", "Key", symbol: "key", parent: "item", aliases: ["keys"]),
        type(
            "other-item", "Other item", symbol: "square.grid.2x2", parent: "item",
            aliases: ["miscellaneous"]),
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
        symbol: String,
        parent: String? = nil,
        aliases: [String] = []
    ) -> TypePickerType {
        TypePickerType(id: id, name: name, parentID: parent, aliases: aliases, symbol: symbol)
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
