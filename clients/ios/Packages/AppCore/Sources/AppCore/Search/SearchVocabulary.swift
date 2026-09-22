/// A pillar that can answer universal search queries.
public enum SearchPillar: String, CaseIterable, Codable, Hashable, Sendable, Identifiable {
    /// Server-backed purchase records.
    case purchases
    /// Inventory records held in the on-device replica.
    case inventory

    /// The stable pillar identifier.
    public var id: String { rawValue }

    /// The reader-facing pillar name.
    public var title: String {
        switch self {
        case .purchases: "Purchases"
        case .inventory: "Inventory"
        }
    }

    /// The pillar's tab symbol.
    public var symbol: String {
        switch self {
        case .purchases: "cart"
        case .inventory: "shippingbox"
        }
    }

    /// The search-field prompt used when this pillar is the only scope.
    public var prompt: String {
        switch self {
        case .purchases: "Merchants, products, tags"
        case .inventory: "Items, containers, places"
        }
    }

    /// Whether the pillar answers from data held on the device.
    public var answersOnDevice: Bool {
        switch self {
        case .purchases: false
        case .inventory: true
        }
    }

    /// The mobile feature whose availability controls this search pillar.
    public var feature: MobileFeature { MobileFeature(rawValue: rawValue) }
}

/// The pillars a universal search query asks.
public enum SearchScope: Codable, Hashable, Sendable {
    /// Every available search pillar.
    case all
    /// One specific pillar.
    case pillar(SearchPillar)

    /// Returns the pillars in this scope that are available on the device.
    public func pillars(in available: [SearchPillar]) -> [SearchPillar] {
        switch self {
        case .all:
            available
        case .pillar(let pillar):
            available.contains(pillar) ? [pillar] : []
        }
    }

    /// Whether this scope includes the given pillar.
    public func includes(_ pillar: SearchPillar) -> Bool {
        switch self {
        case .all: true
        case .pillar(let scoped): scoped == pillar
        }
    }

    /// The search-field prompt for this scope.
    public var prompt: String {
        switch self {
        case .all: "Items, places, purchases"
        case .pillar(let pillar): pillar.prompt
        }
    }
}

/// Where one pillar's answer to the current query stands.
public enum SearchAnswer: Equatable, Sendable {
    /// The current rows answer the current query.
    case current
    /// A request is in flight while rows for an earlier query may remain visible.
    case pending(previous: String?)
    /// The request failed and can be retried.
    case failed
    /// The phone knows it has no network path before asking.
    case offline
    /// The pillar's on-device data has not been downloaded.
    case notOnPhone
}

/// The compact status shown beside a search scope.
public enum SearchChipStatus: Equatable, Sendable {
    /// No status is shown.
    case none
    /// The current result count.
    case count(Int)
    /// The pillar is answering the query.
    case pending
    /// The pillar failed to answer.
    case failed
    /// The pillar requires a network path that is unavailable.
    case offline
    /// The pillar's on-device data has not been downloaded.
    case notOnPhone
}

/// A previous query and the scope it was searched in.
public struct SearchRecent: Identifiable, Equatable, Codable, Sendable {
    /// The query text as it was searched.
    public let query: String
    /// The scope the query was searched in.
    public var scope: SearchScope

    /// The query used as its stable list identity.
    public var id: String { query }

    /// Creates a recent query in the supplied scope.
    public init(query: String, scope: SearchScope = .all) {
        self.query = query
        self.scope = scope
    }

    /// Whether this query belongs in the given scope's recent list.
    public func shows(in current: SearchScope) -> Bool {
        current == .all || scope == .all || scope == current
    }
}
