import DesignSystem
import SwiftUI

/// The move-day screen: a container's destination and its contents, and the
/// only two things a person does with each item: hand it a home, or carry
/// it off in hand. Lightweight selection is offered only when the style asks
/// for it (see ``InventoryUnpackingStyle/Selection``); under single-item it is
/// one row's "Move" button at a time.
internal struct InventoryUnpackingWorkspaceView: View {
    @State private var state: InventoryUnpackingState
    @State private var selection: Set<String> = []
    @State private var destinationTarget: DestinationTarget?
    @State private var emptyOutcome: InventoryEmptyContainerChoice?
    @Environment(\.inventoryUnpackingStyle) private var style

    private enum DestinationTarget: Equatable, Identifiable {
        case one(String)
        case selected

        var id: String {
            switch self {
            case .one(let id): "one-\(id)"
            case .selected: "selected"
            }
        }
    }

    internal init(state: InventoryUnpackingState) {
        _state = State(initialValue: state)
    }

    internal var body: some View {
        List {
            Section {
                progressHeader
            }
            contentsSection
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
        .safeAreaInset(edge: .bottom) { closeBar }
        .sheet(item: $destinationTarget) { target in
            destinationSheet(for: target)
        }
        .sheet(item: $emptyOutcome) { _ in
            InventoryEmptyContainerOutcomeSheet(containerName: state.containerName) { _ in
                emptyOutcome = nil
            }
        }
    }

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(state.containerName)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(state.progress.summary)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if !state.createdDestinations.isEmpty {
                Text("New: \(state.createdDestinations.joined(separator: ", "))")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsInventory)
            }
        }
    }

    private var contentsSection: some View {
        Section("Still inside") {
            if state.remaining.isEmpty {
                EmptyStateView(message: "Everything has been placed.")
            } else {
                ForEach(state.remaining) { lot in
                    InventoryUnpackingLotRow(
                        lot: lot,
                        allowsSelection: style.selection == .lightweightMultiSelect,
                        isSelected: selection.contains(lot.id),
                        onToggleSelection: { toggleSelection(lot.id) },
                        onKeepInHand: { keepInHand(lot) },
                        onChooseDestination: { destinationTarget = .one(lot.id) }
                    )
                }
            }
        }
    }

    @ViewBuilder private var closeBar: some View {
        HStack(spacing: PopsSpacing.sm) {
            if style.selection == .lightweightMultiSelect && !selection.isEmpty {
                Button("Move \(selection.count) to…") { destinationTarget = .selected }
                    .buttonStyle(.borderedProminent)
                    .tint(.popsInventory)
            }
            Spacer(minLength: PopsSpacing.sm)
            Button("Close", action: close)
                .buttonStyle(.bordered)
        }
        .padding(PopsSpacing.lg)
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .padding(.horizontal, PopsSpacing.lg)
    }

    private func toggleSelection(_ id: String) {
        if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
    }

    private func keepInHand(_ lot: InventoryUnpackingLot) {
        state.place([lot.id], at: "In hand")
    }

    private func destinationSheet(for target: DestinationTarget) -> some View {
        let ids: Set<String>
        switch target {
        case .one(let id): ids = [id]
        case .selected: ids = selection
        }
        return InventoryDestinationPickerSheet(
            itemName: ids.count == 1 ? "this item" : "\(ids.count) items",
            recent: [], containers: [],
            locations: [InventoryDestination(id: "kitchen", name: "Kitchen", kind: .location)],
            onChoose: { destination in
                state.place(ids, at: destination.name)
                selection.subtract(ids)
                destinationTarget = nil
            }
        )
    }

    private func close() {
        switch state.closeOutcome {
        case .closedPartial: break
        case .empty: emptyOutcome = .keepForStorage
        }
    }
}
