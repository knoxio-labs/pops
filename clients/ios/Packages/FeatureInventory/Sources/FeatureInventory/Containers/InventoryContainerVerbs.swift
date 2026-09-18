import AppCore
import DesignSystem
import SwiftUI

/// The verbs a container's page puts in its action row: Pick up or Put back,
/// Move, Open or Close, Store here. An inactive container is offered only
/// Restore, and only when its lifecycle can be walked back.
///
/// Store here is offered whatever the access state: closing a box stops
/// casual packing, not a deliberate "this goes in there".
internal enum InventoryContainerVerb: String, Identifiable, CaseIterable {
    case pickUp
    case putBack
    case move
    case open
    case close
    case storeHere
    case restore

    internal var id: String { rawValue }

    internal static func row(for item: InventoryItem) -> [InventoryContainerVerb] {
        guard item.lifecycle == .active else {
            return item.lifecycle.isRestorable ? [.restore] : []
        }
        let holding: InventoryContainerVerb =
            item.placement == .hand && item.previousPlacement.map(Self.isLive) == true
            ? .putBack : .pickUp
        let access: InventoryContainerVerb = item.containment?.access == .open ? .close : .open
        return [holding, .move, access, .storeHere]
    }

    private static func isLive(_ previous: InventoryPreviousPlacement) -> Bool {
        if case .tombstoned = previous { return false }
        return true
    }

    internal var title: String {
        switch self {
        case .pickUp: "Pick up"
        case .putBack: "Put back"
        case .move: "Move"
        case .open: "Open"
        case .close: "Close"
        case .storeHere: "Store here"
        case .restore: "Restore"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .pickUp: .inHand
        case .putBack, .restore: .restore
        case .move: .move
        case .open: .open
        case .close: .close
        case .storeHere: .storeHere
        }
    }

    /// The one command a verb issues on its own, or nil for the verbs that
    /// open a sheet first (Move, Store here) and for Put back with nowhere
    /// live to go back to.
    internal func command(for item: InventoryItem) -> InventoryCommand? {
        switch self {
        case .pickUp: .moveItem(id: item.id, to: .hand, verb: .pickUp)
        case .putBack:
            item.previousPlacement.flatMap(Self.placement).map {
                .moveItem(id: item.id, to: $0, verb: .putBack)
            }
        case .open: .setItemAccess(id: item.id, access: .open)
        case .close: .setItemAccess(id: item.id, access: .closed)
        case .restore: .setItemLifecycle(id: item.id, lifecycle: .active, reason: nil)
        case .move, .storeHere: nil
        }
    }

    internal func announcement(_ name: String) -> String {
        switch self {
        case .pickUp: "Picked up \(name)"
        case .putBack: "Put back \(name)"
        case .open: "Opened \(name)"
        case .close: "Closed \(name)"
        case .restore: "Restored \(name)"
        case .move, .storeHere: name
        }
    }

    private static func placement(_ previous: InventoryPreviousPlacement) -> InventoryPlacement? {
        switch previous {
        case .location(let id): .location(id)
        case .container(let id): .container(id)
        case .tombstoned: nil
        }
    }
}

/// The verbs side by side under the header: one centred row of the same
/// glass icon buttons the item page uses, none of them drawn as the page's
/// one call to action.
internal struct InventoryContainerActionRow: View {
    internal let verbs: [InventoryContainerVerb]
    internal let perform: (InventoryContainerVerb) -> Void

    internal var body: some View {
        if !verbs.isEmpty {
            InventoryGlassGroup(spacing: PopsSpacing.lg) {
                HStack(spacing: PopsSpacing.lg) {
                    ForEach(verbs) { verb in
                        Button {
                            perform(verb)
                        } label: {
                            verb.symbol.image
                                .font(.popsSubheadline.weight(.semibold))
                                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        }
                        .inventoryGlassButton()
                        .accessibilityLabel(verb.title)
                        .transition(.opacity.combined(with: .scale))
                    }
                }
                .inventoryMotion(value: verbs)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
    }
}
