import DesignSystem
import SwiftUI

/// Which part of Store here is showing. The sheet swaps its root rather than
/// pushing, so there is no screen between the choice and the task.
internal enum InventoryStoreHereStep: Equatable {
    case choice
    case newItem
    case existing
}

/// Store here: a new item placed in this container or place, or an existing
/// one put into it. Neither needs a container open.
///
/// New item opens the item form placed here once the form has moved into
/// this package (POPS-4063); until then that step is a pending screen.
internal struct InventoryStoreHereSheet: View {
    internal let target: InventoryStoreTarget
    internal let runner: InventoryCommandRunner
    @State private var step: InventoryStoreHereStep = .choice
    @State private var detent: PresentationDetent = .height(Self.choiceHeight)

    private static let choiceHeight: CGFloat = 220

    internal var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .choice:
                    InventoryStoreHereChoice(targetName: target.name) { next in
                        step = next
                        detent = .large
                    }
                case .newItem:
                    InventoryPendingScreen(
                        title: "Store in \(target.name)",
                        detail: "The new item form opens here, placed in \(target.name).",
                        symbol: InventorySymbol.addNew.system)
                case .existing:
                    InventoryStoreExistingPicker(
                        model: InventoryStoreHereModel(target: target, runner: runner))
                }
            }
            .transition(.opacity.combined(with: .move(edge: .trailing)))
            .inventoryMotion(InventoryMotion.smooth, value: step)
        }
        .presentationDetents([.height(Self.choiceHeight), .large], selection: $detent)
        .tint(.popsInventory)
    }
}

/// The two ways in, side by side.
internal struct InventoryStoreHereChoice: View {
    internal let targetName: String
    internal let onChoose: (InventoryStoreHereStep) -> Void
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            option("New item", symbol: InventorySymbol.addNew.system, step: .newItem)
            option("Existing item", symbol: InventorySymbol.search.system, step: .existing)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .frame(maxHeight: .infinity, alignment: .top)
        .navigationTitle("Store in \(targetName)")
        .inventoryTitleDisplay(large: false)
        .inventoryLeadingBarItem {
            Button("Cancel") { dismiss() }
        }
    }

    private func option(_ title: String, symbol: String, step: InventoryStoreHereStep)
        -> some View
    {
        Button {
            onChoose(step)
        } label: {
            VStack(spacing: PopsSpacing.sm) {
                Image(systemName: symbol)
                    .font(.popsTitle)
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.lg)
        }
        .inventoryGlassButton()
    }
}

/// Existing items, searched and picked, stored from the nav bar.
internal struct InventoryStoreExistingPicker: View {
    @State private var model: InventoryStoreHereModel
    @State private var searching: Bool
    @Environment(\.dismiss) private var dismiss

    internal init(model: InventoryStoreHereModel) {
        _model = State(initialValue: model)
        _searching = State(initialValue: !model.query.isEmpty)
    }

    internal var body: some View {
        @Bindable var model = model
        List {
            switch model.candidates.phase {
            case .loading:
                InventoryLocationListSkeleton(rows: 6)
            case .unavailable:
                Text(InventoryCopy.unavailable)
                    .foregroundStyle(Color.popsMutedForeground)
            case .loaded(let candidates):
                rows(candidates)
            }
        }
        .inventoryInsetGroupedList()
        .inventoryMotion(value: model.selected)
        .inventorySearchable(text: $model.query, isPresented: $searching, prompt: "Search items")
        .task(id: model.query) { await model.observe() }
        .navigationTitle("Store in \(model.target.name)")
        .inventoryTitleDisplay(large: false)
        .inventoryLeadingBarItem {
            Button("Cancel") { dismiss() }
        }
        .inventoryTrailingBarItem { storeButton }
    }

    @ViewBuilder
    private func rows(_ candidates: [InventoryStoreCandidate]) -> some View {
        if candidates.isEmpty {
            Text("No matches")
                .foregroundStyle(Color.popsMutedForeground)
        }
        ForEach(candidates) { candidate in
            InventoryPickRow(
                name: candidate.name,
                mark: InventoryRecordMark(
                    photo: candidate.photo, symbol: .record(access: candidate.access),
                    load: thumbnail),
                isPicked: model.selected.contains(candidate.id),
                toggle: { model.toggle(candidate.id) },
                subtitle: {
                    InventoryPlacementPath(crumbs: candidate.crumbs, isInHand: candidate.isInHand)
                })
        }
    }

    private var storeButton: some View {
        Button {
            Task {
                if await model.store() { dismiss() }
            }
        } label: {
            Text(model.selected.isEmpty ? "Store" : "Store \(model.selected.count)")
                .contentTransition(.numericText(value: Double(model.selected.count)))
        }
        .inventoryMotion(value: model.selected)
        .inventoryProminentGlassButton()
        .tint(.popsInventory)
        .disabled(model.selected.isEmpty)
    }

    private func thumbnail(_ sha256: String) async -> Data? {
        try? await model.runner.store.photo(sha256, variant: .thumb)
    }
}
