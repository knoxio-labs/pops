import DesignSystem
import SwiftUI

/// Which part of Store here is showing. The sheet swaps its root rather than
/// pushing, so there is no screen between the choice and the task.
internal enum InventoryStoreHereStep: Equatable {
    case choice
    case newItem
    case existing
}

/// Where Store here puts things: into a container, or directly in a place.
internal enum InventoryStoreTarget {
    case container(InventoryContainerProfile)
    case location(InventoryLocationNode)

    internal var name: String {
        switch self {
        case .container(let profile): profile.item.name
        case .location(let place): place.name
        }
    }

    internal var draftPlacement: InventoryPlacementChoice {
        switch self {
        case .container(let profile):
            .currentContainer(
                container: profile.item.name,
                location: profile.item.placement.effectiveLocation)
        case .location(let place):
            .directLocation(place.name)
        }
    }

    /// Whether an existing item can be offered: not already there, and, for a
    /// container, not one that would end up inside itself.
    internal func accepts(_ item: InventoryFoundationItem) -> Bool {
        switch self {
        case .container(let profile):
            item.placement.containingItem != profile.item.name
                && !InventoryContainerPacking.validDestinations(
                    for: item.id, candidates: [Self.storable(profile.item)], parents: [:]
                ).isEmpty
        case .location(let place):
            item.placement != .direct(location: place.name)
        }
    }

    /// Furniture has no access state, so it stands in as an open container for
    /// the cycle check.
    private static func storable(_ container: InventoryFoundationItem) -> InventoryFoundationItem {
        var target = container
        target.access = target.access ?? .open
        return target
    }
}

/// Store here: a new item placed in this container or place, or an existing
/// one put into it. Neither needs a container open.
internal struct InventoryStoreHereSheet: View {
    internal let target: InventoryStoreTarget
    @State private var step: InventoryStoreHereStep
    @State private var detent: PresentationDetent
    private let query: String
    private let selected: Set<String>

    internal init(
        target: InventoryStoreTarget,
        step: InventoryStoreHereStep = .choice,
        query: String = "",
        selected: Set<String> = []
    ) {
        self.target = target
        self.query = query
        self.selected = selected
        _step = State(initialValue: step)
        _detent = State(initialValue: step == .choice ? .height(Self.choiceHeight) : .large)
    }

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
                    InventoryItemFormView(draft: draft)
                case .existing:
                    InventoryStoreExistingPicker(
                        target: target, query: query, selected: selected)
                }
            }
            .transition(.opacity.combined(with: .move(edge: .trailing)))
            .inventoryMotion(InventoryMotion.smooth, value: step)
        }
        .presentationDetents([.height(Self.choiceHeight), .large], selection: $detent)
        .tint(.popsInventory)
    }

    private var draft: InventoryDraft {
        InventoryDraft(
            internalID: "itm-store",
            placement: target.draftPlacement)
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
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem {
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
        .playgroundGlassButton()
    }
}

/// Existing items, searched and picked, stored from the nav bar.
internal struct InventoryStoreExistingPicker: View {
    internal let target: InventoryStoreTarget
    @State private var query: String
    @State private var searching: Bool
    @State private var selected: Set<String>
    @Environment(\.dismiss) private var dismiss

    internal init(target: InventoryStoreTarget, query: String, selected: Set<String>) {
        self.target = target
        _query = State(initialValue: query)
        _searching = State(initialValue: !query.isEmpty)
        _selected = State(initialValue: selected)
    }

    private var candidates: [InventoryFoundationItem] {
        InventoryContainerFixtures.storable.filter(target.accepts)
            .filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
    }

    internal var body: some View {
        List {
            if candidates.isEmpty {
                Text("No matches")
                    .foregroundStyle(Color.popsMutedForeground)
            }
            ForEach(candidates) { item in
                InventoryPickRow(
                    item: item, isPicked: selected.contains(item.id),
                    toggle: { toggle(item.id) },
                    subtitle: { InventoryPlacementPath(placement: item.placement) }
                )
            }
        }
        .playgroundInsetGroupedList()
        .inventoryMotion(value: selected)
        .playgroundSearchable(text: $query, isPresented: $searching, prompt: "Search items")
        .navigationTitle("Store in \(target.name)")
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem {
            Button("Cancel") { dismiss() }
        }
        .playgroundTrailingBarItem {
            Button {
                dismiss()
            } label: {
                Text(selected.isEmpty ? "Store" : "Store \(selected.count)")
                    .contentTransition(.numericText(value: Double(selected.count)))
            }
            .inventoryMotion(value: selected)
            .playgroundProminentGlassButton()
            .tint(.popsInventory)
            .disabled(selected.isEmpty)
        }
    }

    private func toggle(_ id: String) {
        if selected.remove(id) == nil { selected.insert(id) }
    }
}
