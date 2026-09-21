import DesignSystem
import SwiftUI

/// A pillar the universal search asks, in tab-bar order.
///
/// Only pillars that have moved to the iOS standard are here. The next one
/// to move (Transactions, then Accounts) joins by adding a case: it gets a
/// scope chip, a section in All, and a status of its own, and nothing else
/// on the screen changes.
internal enum SearchPillar: String, CaseIterable, Identifiable, Hashable {
    case purchases
    case inventory

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .purchases: "Purchases"
        case .inventory: "Inventory"
        }
    }

    /// The pillar's tab glyph, so a chip and a section header name the
    /// pillar the way the tab bar already does.
    internal var symbol: String {
        switch self {
        case .purchases: "cart"
        case .inventory: "shippingbox"
        }
    }

    /// The pillar's own tint, so its chip, section and rows carry the colour
    /// its tab does.
    internal var tint: Color {
        switch self {
        case .purchases: .popsPurchases
        case .inventory: .popsInventory
        }
    }

    /// Whether the pillar answers from its copy on the phone, which is what
    /// lets it answer at once and offline. The rest ask the network.
    internal var answersOnDevice: Bool {
        switch self {
        case .purchases: false
        case .inventory: true
        }
    }

    /// What the field suggests while this pillar alone is being searched.
    internal var prompt: String {
        switch self {
        case .purchases: "Merchants, products, tags"
        case .inventory: "Items, containers, places"
        }
    }
}

/// Which pillars a search asks.
internal enum SearchScope: Hashable {
    case all
    case pillar(SearchPillar)

    internal var pillars: [SearchPillar] {
        switch self {
        case .all: SearchPillar.allCases
        case .pillar(let pillar): [pillar]
        }
    }

    /// All belongs to no pillar, so it keeps the app's own accent.
    internal var tint: Color {
        switch self {
        case .all: .popsAccent
        case .pillar(let pillar): pillar.tint
        }
    }

    internal func includes(_ pillar: SearchPillar) -> Bool {
        pillars.contains(pillar)
    }

    internal var prompt: String {
        switch self {
        case .all: "Items, places, purchases"
        case .pillar(let pillar): pillar.prompt
        }
    }
}

/// Where one pillar's answer to the query in the field stands.
///
/// Inventory answers from the replica on the phone, so it is `current` as
/// soon as a query is typed and answers offline. Purchases goes to the
/// network, so it is `pending` while the request is out, and `offline` when
/// the phone knows before sending that there is no connection.
internal enum SearchAnswer: Equatable {
    /// The rows answer the query in the field.
    case current
    /// A request is out. `previous` is the query whose rows stay on screen,
    /// faded, until the new ones land; nil when the pillar has answered
    /// nothing yet, which draws skeleton rows instead.
    case pending(previous: String?)
    /// The request came back with an error. Retry sends the same query.
    case failed
    /// No connection, known before anything was sent.
    case offline
    /// The pillar's copy has never been downloaded to this phone.
    case notOnPhone
}

/// A query searched before, and the scope it was searched in, so picking it
/// again puts both back.
internal struct SearchRecent: Identifiable, Equatable {
    internal let query: String
    internal var scope = SearchScope.all

    internal var id: String { query }

    /// A query searched everywhere shows in every scope; one searched in a
    /// single pillar shows in All and in that pillar.
    internal func shows(in current: SearchScope) -> Bool {
        current == .all || scope == .all || scope == current
    }
}
