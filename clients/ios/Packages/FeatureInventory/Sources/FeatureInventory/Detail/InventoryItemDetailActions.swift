import DesignSystem
import SwiftUI

/// The verbs for this item, side by side under the facts.
///
/// One centred row, placement verbs first, and a capability adds to it rather
/// than opening a screen of its own. Every verb is the same glass icon
/// button: none of them is the page's one call to action, so none is drawn
/// as if it were.
internal struct InventoryItemDetailActionRow: View {
    internal let actions: [InventoryAction]
    internal let onAction: (InventoryAction) -> Void

    internal var body: some View {
        if !actions.isEmpty {
            InventoryGlassGroup(spacing: PopsSpacing.lg) {
                HStack(spacing: PopsSpacing.lg) {
                    ForEach(actions) { action in
                        button(action)
                            .transition(.opacity.combined(with: .scale))
                    }
                }
                .inventoryMotion(value: actions)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
    }

    private func button(_ action: InventoryAction) -> some View {
        Button {
            onAction(action)
        } label: {
            action.symbol.image
                .font(.popsSubheadline.weight(.semibold))
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
        }
        .inventoryGlassButton()
        .accessibilityLabel(action.title)
        .accessibilityHint(action.note ?? "")
    }
}

/// The page's own chrome: Edit, and everything that is not one of the verbs
/// in the row, in a More menu rather than six more bar items.
internal struct InventoryItemDetailToolbar: ToolbarContent {
    internal let record: InventoryDetailRecord
    @Binding internal var destroying: Bool
    internal let open: (InventoryItemDetailPending) -> Void
    internal let perform: (InventoryLifecycleCommand) -> Void
    internal let destroy: () -> Void

    internal var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button("Edit") { open(.edit) }
        }
        ToolbarItem(placement: .primaryAction) {
            InventoryItemDetailMenu(record: record, open: open, perform: perform)
                .confirmationDialog(
                    "Destroy \(record.name)?", isPresented: $destroying,
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
    internal let record: InventoryDetailRecord
    internal let open: (InventoryItemDetailPending) -> Void
    internal let perform: (InventoryLifecycleCommand) -> Void

    internal var body: some View {
        Menu {
            if let code = record.code {
                Button {
                    InventoryPasteboard.copy(code)
                } label: {
                    Label {
                        Text("Copy \(code)")
                    } icon: {
                        InventorySymbol.code.image
                    }
                }
                Button {
                    open(.printLabel)
                } label: {
                    Label {
                        Text("Print label")
                    } icon: {
                        InventorySymbol.printLabel.image
                    }
                }
            } else {
                Button {
                    open(.label)
                } label: {
                    Label {
                        Text("Label it")
                    } icon: {
                        InventorySymbol.label.image
                    }
                }
            }
            ShareLink(item: shareText) {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            InventoryLifecycleMenuItems(record: record, perform: perform)
        } label: {
            Label("More", systemImage: "ellipsis")
        }
    }

    /// What Share hands on: the name, the code when there is one, and where
    /// it is.
    private var shareText: String {
        let place = record.trail.isInHand ? "In hand" : record.trail.crumbs.joined(separator: " › ")
        return [record.name, record.code, place.isEmpty ? nil : place]
            .compactMap { $0 }
            .joined(separator: "\n")
    }
}

/// The page a screen from another part of Inventory will fill, drawn the way
/// the flow draws any screen that has not moved into this package yet.
internal struct InventoryItemDetailPendingSheet: View {
    internal let pending: InventoryItemDetailPending
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            InventoryPendingScreen(title: title, detail: detail, symbol: symbol.system)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }
                    }
                }
        }
        .tint(.popsInventory)
    }

    private var title: String {
        switch pending {
        case .edit: "Edit"
        case .label: "Label it"
        case .printLabel: "Print label"
        }
    }

    private var detail: String {
        switch pending {
        case .edit: "The edit form opens here."
        case .label: "Choosing a code for this item opens here."
        case .printLabel: "Label printing opens here."
        }
    }

    private var symbol: InventorySymbol {
        switch pending {
        case .edit: .edit
        case .label: .label
        case .printLabel: .printLabel
        }
    }
}
