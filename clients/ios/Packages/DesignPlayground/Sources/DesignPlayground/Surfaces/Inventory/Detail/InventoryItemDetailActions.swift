import DesignSystem
import SwiftUI

/// The verbs for this item, side by side under the facts.
///
/// One centred row, placement verbs first, and a capability adds to it rather
/// than opening a screen of its own: containment brings Open or Close and
/// Store here, a cable brings Connect or Disconnect (ADR-001). Every verb is
/// the same glass icon button: none of them is the page's one call to action,
/// so none is drawn as if it were.
internal struct InventoryItemDetailActionRow: View {
    internal let detail: InventoryItemDetail
    internal var actions: [InventoryAction]?
    internal var onAction: (InventoryAction) -> Void = { _ in }
    @Environment(\.inventoryStyle) private var style

    internal var body: some View {
        let actions =
            self.actions ?? InventoryItemDetailPrimaryAction.row(for: detail.item, style: style)
        if !actions.isEmpty || connection != nil {
            PlaygroundGlassGroup(spacing: PopsSpacing.lg) {
                HStack(spacing: PopsSpacing.lg) {
                    ForEach(actions) { action in
                        button(action)
                            .transition(.opacity.combined(with: .scale))
                    }
                    if let connection {
                        button(connection)
                            .transition(.opacity.combined(with: .scale))
                    }
                }
                .inventoryMotion(value: actions + [connection].compactMap { $0 })
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
    }

    /// A cable's own verb. Built here rather than in ``InventoryAction``
    /// because connection is a fact this page holds, not one the row and the
    /// action sheet share.
    private var connection: InventoryAction? {
        guard !detail.connections.isEmpty else { return nil }
        let attached = detail.connections.contains { $0.isConnected }
        return InventoryAction(
            attached ? "disconnect" : "connect",
            attached ? "Disconnect" : "Connect",
            symbol: attached ? .disconnect : .connect,
            heading: .whereItIs)
    }

    private func button(_ action: InventoryAction) -> some View {
        Button {
            onAction(action)
        } label: {
            action.symbol.image
                .font(.popsSubheadline.weight(.semibold))
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
        }
        .playgroundGlassButton()
        .accessibilityLabel(action.title)
        .accessibilityHint(action.note ?? "")
    }
}

/// The page's own chrome: Edit, and everything that is not one of the verbs
/// in the row. A More menu rather than six more bar items, which is what the
/// HIG's toolbar guidance asks for once the important actions are placed.
internal struct InventoryItemDetailToolbar: ToolbarContent {
    internal let detail: InventoryItemDetail
    @Binding internal var editing: Bool
    @Binding internal var destroying: Bool
    internal let perform: (InventoryLifecycleCommand) -> Void
    internal let destroy: () -> Void

    internal var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button("Edit") { editing = true }
        }
        ToolbarItem(placement: .primaryAction) {
            InventoryItemDetailMenu(detail: detail, perform: perform)
                .confirmationDialog(
                    "Destroy \(detail.item.name)?", isPresented: $destroying,
                    titleVisibility: .visible
                ) {
                    Button("Destroy", role: .destructive, action: destroy)
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("History and documents stay.")
                }
        }
    }
}

/// Label and print, share, and the lifecycle verbs.
internal struct InventoryItemDetailMenu: View {
    internal let detail: InventoryItemDetail
    internal let perform: (InventoryLifecycleCommand) -> Void

    internal var body: some View {
        Menu {
            if let code = detail.item.code {
                Button {
                } label: {
                    Label {
                        Text("Copy \(code)")
                    } icon: {
                        InventorySymbol.code.image
                    }
                }
                Button {
                } label: {
                    Label {
                        Text("Print label")
                    } icon: {
                        InventorySymbol.printLabel.image
                    }
                }
            } else {
                Button {
                } label: {
                    Label {
                        Text("Label it")
                    } icon: {
                        InventorySymbol.label.image
                    }
                }
            }
            Button {
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            InventoryLifecycleMenuItems(item: detail.item, perform: perform)
        } label: {
            Label("More", systemImage: "ellipsis")
        }
    }
}
