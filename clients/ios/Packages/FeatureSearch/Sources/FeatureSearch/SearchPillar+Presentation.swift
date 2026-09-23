import AppCore
import DesignSystem
import SwiftUI

extension SearchPillar {
    /// The accent used by this pillar's tab and search results.
    public var tint: Color {
        switch self {
        case .purchases: .popsPurchases
        case .inventory: .popsInventory
        }
    }
}

extension SearchScope {
    /// All keeps the app accent; a scoped search uses its pillar's accent.
    public var tint: Color {
        switch self {
        case .all: .popsAccent
        case .pillar(let pillar): pillar.tint
        }
    }
}
