import AppCore

/// The native content and routing affordance for one URI-backed Ego entity.
internal struct EgoEntityCardPresentation: Hashable {
    internal enum Kind: CaseIterable, Hashable {
        case transaction
        case account
        case budget
        case purchase
        case inventoryItem
        case inventoryLocation
        case movie
        case tvShow
        case engram
        case generic

        internal var noun: String {
            switch self {
            case .transaction: "Transaction"
            case .account: "Account"
            case .budget: "Budget"
            case .purchase: "Purchase"
            case .inventoryItem: "Inventory item"
            case .inventoryLocation: "Inventory location"
            case .movie: "Movie"
            case .tvShow: "TV show"
            case .engram: "Engram"
            case .generic: "Entity"
            }
        }

        internal var symbolName: String {
            switch self {
            case .transaction: "arrow.left.arrow.right"
            case .account: "building.columns"
            case .budget: "chart.pie"
            case .purchase: "bag"
            case .inventoryItem: "shippingbox"
            case .inventoryLocation: "mappin.and.ellipse"
            case .movie: "film"
            case .tvShow: "tv"
            case .engram: "brain.head.profile"
            case .generic: "link"
            }
        }

        fileprivate init(uri: PopsURI?) {
            guard let uri else {
                self = .generic
                return
            }

            switch (uri.pillar, uri.type) {
            case ("finance", "transaction"): self = .transaction
            case ("finance", "account"): self = .account
            case ("finance", "budget"): self = .budget
            case ("purchases", "purchase"): self = .purchase
            case ("inventory", "item"): self = .inventoryItem
            case ("inventory", "location"): self = .inventoryLocation
            case ("media", "movie"): self = .movie
            case ("media", "tv-show"): self = .tvShow
            case ("cerebrum", "engram"): self = .engram
            default: self = .generic
            }
        }
    }

    internal let kind: Kind
    internal let symbolName: String
    internal let uri: PopsURI?
    internal let isTappable: Bool
    internal let accessibilityLabel: String

    internal init(part: EgoEntityPart) {
        let uri = part.objectURI
        let kind = Kind(uri: uri)

        self.kind = kind
        symbolName = kind.symbolName
        self.uri = uri
        isTappable = uri != nil

        var labelParts = [kind.noun, part.title]
        if let subtitle = part.subtitle, !subtitle.isEmpty {
            labelParts.append(subtitle)
        }
        accessibilityLabel = labelParts.joined(separator: ", ")
    }
}
