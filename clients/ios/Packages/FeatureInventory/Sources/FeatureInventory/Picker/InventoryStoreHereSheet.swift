import DesignSystem
import SwiftUI

/// Which part of Store here is showing. The sheet swaps its root rather than
/// pushing, so there is no screen between the choice and the existing-item
/// search. New item does not swap the root: it opens the real create form as
/// a sheet of its own, nested inside this one.
internal enum InventoryStoreHereStep: Equatable {
    case choice
    case existing

    /// The height the sheet opens at on this step.
    internal var detent: PresentationDetent {
        switch self {
        case .choice: .height(InventoryChoiceStep.sheetHeight)
        case .existing: .large
        }
    }

    /// The heights a sheet opened on this step can take. Opened on the
    /// choice it grows to the list; opened on the list there is no choice to
    /// shrink back to.
    internal var detents: Set<PresentationDetent> {
        switch self {
        case .choice: [Self.choice.detent, Self.existing.detent]
        case .existing: [Self.existing.detent]
        }
    }
}

/// Store here: a new item placed in this container or place, or an existing
/// one put into it. Neither needs a container open. A caller whose screen
/// already offers New item elsewhere opens it `startingAt: .existing`.
///
/// New item installs its own `inventoryItemFormPresentation`, scoped to this
/// sheet's own `NavigationStack`, so the form opens as a sheet nested inside
/// this one rather than through whatever `inventoryItemForm` an ancestor
/// installed — that ancestor's own sheet is not the topmost presentation
/// once this one is up, and presenting from it there fails or shows behind
/// this sheet rather than on top of it.
internal struct InventoryStoreHereSheet: View {
    internal let target: InventoryStoreTarget
    internal let runner: InventoryCommandRunner
    private let firstStep: InventoryStoreHereStep
    @State private var detent: PresentationDetent

    internal init(
        target: InventoryStoreTarget, runner: InventoryCommandRunner,
        startingAt firstStep: InventoryStoreHereStep = .choice
    ) {
        self.target = target
        self.runner = runner
        self.firstStep = firstStep
        _detent = State(initialValue: firstStep.detent)
    }

    internal var body: some View {
        NavigationStack {
            InventoryStoreHereRoot(
                target: target, runner: runner, firstStep: firstStep, detent: $detent)
        }
        .presentationDetents(firstStep.detents, selection: $detent)
        .tint(.popsInventory)
        .inventoryItemFormPresentation(store: runner.store)
    }
}

/// The sheet's root content, inside the locally scoped item-form
/// presentation so `\.inventoryItemForm` here opens a sheet nested inside
/// `InventoryStoreHereSheet` rather than reaching for an ancestor's.
private struct InventoryStoreHereRoot: View {
    let target: InventoryStoreTarget
    let runner: InventoryCommandRunner
    @Binding var detent: PresentationDetent
    @State private var step: InventoryStoreHereStep
    @Environment(\.inventoryItemForm) private var itemForm

    init(
        target: InventoryStoreTarget, runner: InventoryCommandRunner,
        firstStep: InventoryStoreHereStep, detent: Binding<PresentationDetent>
    ) {
        self.target = target
        self.runner = runner
        _detent = detent
        _step = State(initialValue: firstStep)
    }

    var body: some View {
        Group {
            switch step {
            case .choice:
                InventoryChoiceStep(
                    title: "Store in \(target.name)",
                    options: [
                        InventoryChoiceOption(title: "New item", symbol: .addNew) {
                            itemForm?(.create(placement: target.placement))
                        },
                        InventoryChoiceOption(title: "Existing item", symbol: .search) {
                            step = .existing
                            detent = InventoryStoreHereStep.existing.detent
                        },
                    ])
            case .existing:
                InventoryStoreExistingPicker(
                    model: InventoryStoreHereModel(target: target, runner: runner))
            }
        }
        .transition(.opacity.combined(with: .move(edge: .trailing)))
        .popsMotion(PopsMotion.smooth, value: step)
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
                PopsListSkeleton(rows: 6)
            case .unavailable:
                Text(InventoryCopy.unavailable)
                    .foregroundStyle(Color.popsMutedForeground)
            case .loaded(let candidates):
                rows(candidates)
            }
        }
        .inventoryInsetGroupedList()
        .popsMotion(value: model.selected)
        .inventorySearchable(text: $model.query, isPresented: $searching, prompt: "Search items")
        .task(id: model.query) { await model.observe() }
        .navigationTitle("Store in \(model.target.name)")
        .popsTitleDisplay(large: false)
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
        .popsMotion(value: model.selected)
        .popsProminentGlassButton()
        .tint(.popsInventory)
        .disabled(model.selected.isEmpty)
    }

    private func thumbnail(_ sha256: String) async -> Data? {
        try? await model.runner.store.photo(sha256, variant: .thumb)
    }
}
