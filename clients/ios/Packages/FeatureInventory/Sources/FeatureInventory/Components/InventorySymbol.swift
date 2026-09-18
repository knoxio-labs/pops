import AppCore
import SwiftUI

/// One glyph per concept. A concept drawn with two different symbols on two
/// screens reads as two concepts, so every Inventory component takes its
/// glyph from here and nowhere else. The set is the design playground's,
/// carried over as the screens that draw each glyph move into this package.
internal struct InventorySymbol: Hashable, Sendable {
    internal let system: String
    /// `system` names a custom symbol in this package's asset catalogue
    /// rather than one in the SF Symbols catalogue, so it is drawn through
    /// `image` and never through `Image(systemName:)`.
    internal let isCustom: Bool

    internal init(system: String, isCustom: Bool = false) {
        self.system = system
        self.isCustom = isCustom
    }

    internal var image: Image {
        isCustom ? Image(system, bundle: .module) : Image(systemName: system)
    }

    internal static let item = InventorySymbol(system: "cube")
    internal static let openContainer = InventorySymbol(system: "shippingbox")
    internal static let closedContainer = InventorySymbol(system: "shippingbox.fill")
    internal static let location = InventorySymbol(system: "house")
    internal static let queued = InventorySymbol(system: "icloud.and.arrow.up")
    internal static let synced = InventorySymbol(system: "checkmark.icloud")
    internal static let stale = InventorySymbol(system: "exclamationmark.triangle")
    internal static let attention = InventorySymbol(system: "exclamationmark.circle.fill")
    internal static let move = InventorySymbol(
        system: "arrow.up.and.down.and.arrow.left.and.right")
    /// Out of a container and onto the place the container stands, which is
    /// not the same as Pick up: nothing ends up in hand.
    internal static let takeOut = InventorySymbol(system: "tray.and.arrow.up")
    /// Open and Close are one pair: the box each verb leaves behind, opened
    /// or shut, with no arrows. SF Symbols has no opened box, so Open is
    /// `shippingbox` rebuilt with its flaps folded out, at the same weights,
    /// and ships in this package's asset catalogue.
    internal static let open = InventorySymbol(system: "shippingbox.open", isCustom: true)
    internal static let restore = InventorySymbol(system: "arrow.uturn.backward")
    internal static let resolved = InventorySymbol(system: "checkmark.circle.fill")
    internal static let retry = InventorySymbol(system: "arrow.clockwise")
    internal static let signIn = InventorySymbol(system: "person.crop.circle.badge.exclamationmark")
    internal static let storage = InventorySymbol(
        system: "externaldrive.fill.badge.exclamationmark")
    internal static let appUpdate = InventorySymbol(system: "arrow.up.circle.fill")
    internal static let device = InventorySymbol(system: "iphone")
    internal static let search = InventorySymbol(system: "magnifyingglass")
    internal static let scan = InventorySymbol(system: "qrcode.viewfinder")
    internal static let dictate = InventorySymbol(system: "mic")
    internal static let storeHere = InventorySymbol(system: "square.and.arrow.down")
    internal static let rename = InventorySymbol(system: "pencil")
    internal static let manage = InventorySymbol(system: "ellipsis.circle")
    internal static let offline = InventorySymbol(system: "wifi.slash")

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
