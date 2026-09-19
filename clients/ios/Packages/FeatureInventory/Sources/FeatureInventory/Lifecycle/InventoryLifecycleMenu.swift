import AppCore
import SwiftUI

/// The lifecycle half of Item detail's More menu, as data, so which entries a
/// state offers is decided in one place the menu draws and a test can read.
///
/// Discard is a submenu of reasons and acts on the pick, like Mark lost and
/// Retire, with Undo after. A group is discarded whole, split or renumbered;
/// there is no partial discard. Destroy is the one red entry and the only one
/// the page confirms. An inactive item offers Restore, a destroyed one
/// nothing, and so does a lifecycle this build does not know, because
/// offering a transition the server has not described would be a guess.
internal enum InventoryLifecycleMenuEntry: Hashable {
    /// The whole record; `count` is set when it stands for more than one.
    case discard(count: Int?)
    case split
    case changeQuantity
    case markLost
    case retire
    case restore
    case destroy

    internal static func entries(
        lifecycle: InventoryLifecycle, quantity: InventoryQuantity
    ) -> [InventoryLifecycleMenuEntry] {
        switch lifecycle {
        case .active:
            let grouped = quantity.count > 1
            return [.discard(count: grouped ? quantity.count : nil)]
                + (grouped ? [.split, .changeQuantity] : [])
                + [.markLost, .retire, .destroy]
        case .retired, .discarded, .lost:
            return [.restore, .destroy]
        case .destroyed, .unrecognised:
            return []
        }
    }
}

/// Draws `InventoryLifecycleMenuEntry.entries` inside the More menu.
internal struct InventoryLifecycleMenuItems: View {
    internal let record: InventoryDetailRecord
    internal let perform: (InventoryLifecycleCommand) -> Void

    @ViewBuilder internal var body: some View {
        let entries = InventoryLifecycleMenuEntry.entries(
            lifecycle: record.lifecycle, quantity: record.quantity)
        if !entries.isEmpty {
            Divider()
            ForEach(entries, id: \.self) { entry in
                if entry == .destroy { Divider() }
                item(entry)
            }
        }
    }

    @ViewBuilder private func item(_ entry: InventoryLifecycleMenuEntry) -> some View {
        switch entry {
        case .discard(let count):
            discardMenu(count: count)
        case .split:
            button("Split\u{2026}", .split) { perform(.split) }
        case .changeQuantity:
            button("Change quantity\u{2026}", .reduceQuantity) { perform(.changeQuantity) }
        case .markLost:
            button("Mark lost", .lost) { perform(.markLost) }
        case .retire:
            button("Retire", .retired) { perform(.retire) }
        case .restore:
            button("Restore", .restore) { perform(.restore) }
        case .destroy:
            Button(role: .destructive) {
                perform(.destroy)
            } label: {
                Label {
                    Text("Destroy")
                } icon: {
                    InventorySymbol.destroyed.image
                }
            }
        }
    }

    private func discardMenu(count: Int?) -> some View {
        Menu {
            Button("No reason") { perform(.discard(nil)) }
            Divider()
            ForEach(InventoryDiscardReason.offered, id: \.self) { reason in
                button(reason.label, reason.symbol) { perform(.discard(reason)) }
            }
        } label: {
            Label {
                Text(count.map { "Discard all \($0)" } ?? "Discard")
            } icon: {
                InventorySymbol.discard.image
            }
        }
    }

    private func button(
        _ title: String, _ symbol: InventorySymbol, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label {
                Text(title)
            } icon: {
                symbol.image
            }
        }
    }
}
