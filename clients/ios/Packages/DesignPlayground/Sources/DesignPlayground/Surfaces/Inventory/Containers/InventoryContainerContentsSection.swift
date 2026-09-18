import DesignSystem
import SwiftUI

/// What a container holds: the manual full switch as its own group, then the
/// counts, a search bar with a filter, and the contents as dashboard rows,
/// newest first.
internal struct InventoryContainerContentsSection: View {
    internal let profile: InventoryContainerProfile
    @Binding internal var unpacking: InventoryContainerUnpacking
    internal let onTakeOut: (Set<String>) -> Void
    internal let onMove: (Set<String>) -> Void
    internal let onChoose: (InventoryEmptyContainerChoice) -> Void
    @State private var query = ""
    @State private var filter = InventoryContainerContentsFilter()
    @State private var isFull: Bool

    internal init(
        profile: InventoryContainerProfile,
        unpacking: Binding<InventoryContainerUnpacking>,
        onTakeOut: @escaping (Set<String>) -> Void,
        onMove: @escaping (Set<String>) -> Void,
        onChoose: @escaping (InventoryEmptyContainerChoice) -> Void
    ) {
        self.profile = profile
        _unpacking = unpacking
        self.onTakeOut = onTakeOut
        self.onMove = onMove
        self.onChoose = onChoose
        _isFull = State(initialValue: profile.isFull)
    }

    private var contents: InventoryContainerContents {
        InventoryContainerContents(
            entries: profile.contents.entries.filter { !unpacking.removed.contains($0.id) })
    }

    private var visible: [InventoryContainedEntry] {
        contents.matching(query, filter: filter)
    }

    private var showsEmptied: Bool {
        InventoryUnpacking.justEmptied(profile.contents, removed: unpacking.removed)
            && !unpacking.emptiedResolved && profile.isActive
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            if profile.isActive {
                InventoryItemDetailGroup {
                    Toggle("Full", isOn: $isFull)
                        .font(.popsBody)
                        .tint(.popsInventory)
                }
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                header
                if !contents.isEmpty {
                    InventoryContainerSearchBar(
                        query: $query, filter: $filter, types: contents.types
                    )
                    .padding(.bottom, PopsSpacing.xs)
                }
                InventoryItemDetailGroup {
                    if showsEmptied {
                        InventoryContainerEmptiedCard(profile: profile, onChoose: onChoose)
                    } else if contents.isEmpty {
                        Label("Empty", systemImage: "tray")
                            .font(.popsBody)
                            .foregroundStyle(Color.popsMutedForeground)
                    } else if visible.isEmpty {
                        Text("No matches")
                            .font(.popsBody)
                            .foregroundStyle(Color.popsMutedForeground)
                    } else {
                        ForEach(visible) { entry in
                            row(entry)
                                .transition(InventoryMotion.row)
                        }
                    }
                }
            }
        }
        .inventoryMotion(value: unpacking)
        .inventoryMotion(value: filter)
        .inventoryMotion(value: isFull)
        .inventoryGroundedSwipeActionsContainer()
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text("Contents")
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            if isFull, profile.isActive {
                InventoryStateBadge(
                    mark: InventoryStateMark(
                        id: "full", label: "Full", symbol: "square.fill", isHighlighted: false)
                )
                .transition(.opacity.combined(with: .scale))
            }
            Spacer(minLength: PopsSpacing.sm)
            if !contents.isEmpty {
                Text(contents.summary)
                    .font(.popsCaption)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
                    .contentTransition(.numericText(value: Double(contents.itemCount)))
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.horizontal, PopsSpacing.lg)
    }

    private func row(_ entry: InventoryContainedEntry) -> some View {
        InventoryGroundedRowLabel(
            title: entry.item.name,
            detail: "\(entry.item.typeName ?? "No type yet") · \(entry.added)",
            symbol: entry.item.symbol.system,
            value: entry.item.quantity.count == 1 ? nil : "\(entry.item.quantity.count)"
        )
        .inventorySelectable(entry.id, in: $unpacking.selection)
        .inventoryGroundedSwipeActions(
            edge: .leading,
            onPresentationChanged: { _ in },
            actions: {
                if !unpacking.selection.isSelecting {
                    Button {
                        onMove([entry.id])
                    } label: {
                        Label("Move to…", systemImage: "folder.fill")
                    }
                    .tint(.popsAccent)
                }
            }
        )
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: { _ in },
            actions: {
                if !unpacking.selection.isSelecting {
                    Button {
                        onTakeOut([entry.id])
                    } label: {
                        Label {
                            Text("Pick up")
                        } icon: {
                            InventorySymbol.inHand.image
                        }
                    }
                    .tint(.popsInventory)
                }
            })
    }
}
