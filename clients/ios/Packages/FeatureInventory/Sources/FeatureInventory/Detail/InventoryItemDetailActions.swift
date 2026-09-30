import AppCore
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
            PopsGlassGroup(spacing: PopsSpacing.lg) {
                HStack(spacing: PopsSpacing.lg) {
                    ForEach(actions) { action in
                        button(action)
                            .transition(.opacity.combined(with: .scale))
                    }
                }
                .popsMotion(value: actions)
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

/// The page's own overflow chrome: everything that is not one of the verbs in
/// the row, in a More menu rather than six more bar items.
internal struct InventoryItemDetailToolbar: ToolbarContent {
    internal let record: InventoryDetailRecord
    @Binding internal var destroying: Bool
    internal let open: (InventoryItemDetailPending) -> Void
    internal let moreActions: [InventoryAction]
    internal let onAction: (InventoryAction) -> Void
    internal let perform: (InventoryLifecycleCommand) -> Void
    internal let destroy: () -> Void

    internal var body: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            InventoryItemDetailMenu(
                record: record, open: open, moreActions: moreActions, onAction: onAction,
                perform: perform
            )
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

/// Label, duplicate, share, and the lifecycle verbs. Printing a label is
/// done on the web (POPS-3992); this menu has nothing to reprint.
internal struct InventoryItemDetailMenu: View {
    internal let record: InventoryDetailRecord
    internal let open: (InventoryItemDetailPending) -> Void
    internal let moreActions: [InventoryAction]
    internal let onAction: (InventoryAction) -> Void
    internal let perform: (InventoryLifecycleCommand) -> Void

    internal var body: some View {
        Menu {
            if !moreActions.isEmpty {
                ForEach(moreActions) { action in
                    Button {
                        onAction(action)
                    } label: {
                        Label {
                            Text(action.title)
                        } icon: {
                            action.symbol.image
                        }
                    }
                }
                Divider()
            }
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
            if Self.offersDuplicate(record.lifecycle) {
                Button {
                    open(.duplicate)
                } label: {
                    Label {
                        Text("Duplicate")
                    } icon: {
                        InventorySymbol.duplicate.image
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

    /// Whether the menu offers Duplicate: hidden where the lifecycle menu
    /// offers nothing, a destroyed item or a lifecycle this build does not
    /// know, like the rest of the menu's writes.
    internal static func offersDuplicate(_ lifecycle: InventoryLifecycle) -> Bool {
        switch lifecycle {
        case .active, .retired, .discarded, .lost: true
        case .destroyed, .unrecognised: false
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
