import SwiftUI

/// The lifecycle half of Item detail's More menu.
///
/// Discard is a submenu of reasons and acts on the pick, like Mark lost and
/// Retire, with Undo after. A group is discarded whole, split or renumbered;
/// there is no partial discard. Destroy is the one red entry and the only one
/// the page confirms. An inactive item offers Restore, a destroyed one
/// nothing.
internal struct InventoryLifecycleMenuItems: View {
    internal let item: InventoryFoundationItem
    internal let perform: (InventoryLifecycleCommand) -> Void

    @ViewBuilder internal var body: some View {
        switch item.lifecycle {
        case .active:
            Divider()
            discardMenu
            if item.quantity.count > 1 {
                entry("Split\u{2026}", .split) { perform(.split) }
                entry("Change quantity\u{2026}", .reduceQuantity) { perform(.changeQuantity) }
            }
            entry("Mark lost", .lost) { perform(.markLost) }
            entry("Retire", .retired) { perform(.retire) }
            Divider()
            destroy
        case .retired, .discarded, .lost:
            Divider()
            entry("Restore", .restore) { perform(.restore) }
            Divider()
            destroy
        case .destroyed:
            EmptyView()
        }
    }

    private var discardTitle: String {
        item.quantity.count > 1 ? "Discard all \(item.quantity.count)" : "Discard"
    }

    private var discardMenu: some View {
        Menu {
            Button("No reason") { perform(.discard(nil)) }
            Divider()
            ForEach(InventoryDiscardReason.allCases) { reason in
                entry(reason.label, reason.symbol) { perform(.discard(reason)) }
            }
        } label: {
            Label {
                Text(discardTitle)
            } icon: {
                InventorySymbol.discard.image
            }
        }
    }

    private var destroy: some View {
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

    private func entry(
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
