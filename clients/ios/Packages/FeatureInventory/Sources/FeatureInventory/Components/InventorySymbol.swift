import AppCore
import SwiftUI

/// One glyph per concept. A concept drawn with two different symbols on two
/// screens reads as two concepts, so every Inventory component takes its
/// glyph from here and nowhere else. The set is the design playground's,
/// carried over as the screens that draw each glyph move into this package.
internal struct InventorySymbol: Hashable, Sendable {
    internal let system: String

    internal var image: Image { Image(systemName: system) }

    internal static let item = InventorySymbol(system: "cube")
    internal static let openContainer = InventorySymbol(system: "shippingbox")
    internal static let closedContainer = InventorySymbol(system: "shippingbox.fill")
    internal static let queued = InventorySymbol(system: "icloud.and.arrow.up")
    internal static let synced = InventorySymbol(system: "checkmark.icloud")
    internal static let stale = InventorySymbol(system: "exclamationmark.triangle")
    internal static let attention = InventorySymbol(system: "exclamationmark.circle.fill")
    internal static let move = InventorySymbol(
        system: "arrow.up.and.down.and.arrow.left.and.right")
    internal static let restore = InventorySymbol(system: "arrow.uturn.backward")
    internal static let resolved = InventorySymbol(system: "checkmark.circle.fill")
    internal static let retry = InventorySymbol(system: "arrow.clockwise")
    internal static let signIn = InventorySymbol(system: "person.crop.circle.badge.exclamationmark")
    internal static let storage = InventorySymbol(
        system: "externaldrive.fill.badge.exclamationmark")
    internal static let appUpdate = InventorySymbol(system: "arrow.up.circle.fill")
    internal static let device = InventorySymbol(system: "iphone")

    /// A row's kind glyph: a container by its access, anything else as an
    /// item.
    internal static func record(access: InventoryAccess?) -> InventorySymbol {
        switch access {
        case .open: openContainer
        case .closed: closedContainer
        case nil: item
        }
    }
}
