import AppCore
import DesignSystem
import SwiftUI

/// What a container holds: the manual full switch as its own group, then the
/// counts, a search bar with a filter, and the contents as dashboard rows,
/// newest first.
internal struct InventoryContainerContentsSection: View {
    internal let profile: InventoryContainerProfile
    @Bindable internal var model: InventoryContainerPageModel
    @State private var query = ""
    @State private var filter = InventoryContainerContentsFilter()

    private var contents: InventoryContainerContents { profile.contents }

    private var visible: [InventoryContainedEntry] {
        contents.matching(query, filter: filter)
    }

    private var isFull: Binding<Bool> {
        Binding(
            get: { model.isFull(profile) },
            set: { value in Task { await model.setFull(value) } })
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            if profile.isActive {
                InventoryItemDetailGroup {
                    Toggle("Full", isOn: isFull)
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
                InventoryItemDetailGroup { rows }
            }
        }
        .popsMotion(value: contents.entries.map(\.id))
        .popsMotion(value: filter)
        .popsMotion(value: model.isFull(profile))
        .inventoryGroundedSwipeActionsContainer()
    }

    @ViewBuilder private var rows: some View {
        if model.showsEmptied(profile) {
            InventoryContainerEmptiedCard(profile: profile, load: thumbnail) { choice in
                Task { await model.choose(choice, profile: profile) }
            }
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
                    .transition(PopsMotion.row)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text("Contents")
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            if model.isFull(profile), profile.isActive {
                InventoryStateBadge(mark: .full)
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
        NavigationLink(
            value: InventoryRoute.record(id: entry.id, isContainer: entry.item.isContainer)
        ) {
            InventoryGroundedRowLabel(
                title: entry.item.name,
                detail: "\(entry.typeName ?? "No type yet") · "
                    + InventoryRelativeTime.text(entry.added),
                symbol: InventorySymbol.record(access: entry.item.containment?.access).system,
                value: entry.item.quantity.count == 1 ? nil : "\(entry.item.quantity.count)"
            )
        }
        .buttonStyle(.plain)
        .inventorySelectable(entry.id, in: $model.selection)
        .inventoryGroundedSwipeActions(
            edge: .leading, onPresentationChanged: { _ in }, actions: { moveAction(entry) }
        )
        .inventoryGroundedSwipeActions(
            edge: .trailing, onPresentationChanged: { _ in }, actions: { pickUpAction(entry) })
    }

    @ViewBuilder private func moveAction(_ entry: InventoryContainedEntry) -> some View {
        if !model.selection.isSelecting {
            Button {
                model.move([entry.id], in: profile)
            } label: {
                Label("Move to…", systemImage: "folder.fill")
            }
            .tint(.popsAccent)
        }
    }

    @ViewBuilder private func pickUpAction(_ entry: InventoryContainedEntry) -> some View {
        if !model.selection.isSelecting {
            Button {
                Task { await model.pickUp([entry.id], in: profile) }
            } label: {
                Label {
                    Text("Pick up")
                } icon: {
                    InventorySymbol.inHand.image
                }
            }
            .tint(.popsInventory)
        }
    }

    private func thumbnail(_ sha256: String) async -> Data? {
        try? await model.runner.store.photo(sha256, variant: .thumb)
    }
}
