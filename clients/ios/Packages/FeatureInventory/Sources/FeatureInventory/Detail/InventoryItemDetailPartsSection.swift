import AppCore
import DesignSystem
import SwiftUI

/// What an item is a part of, and its own parts with where each one is
/// (Inventory ADR-001, "Assemblies and parts"). Read online; absent until the
/// server answers, and absent for good when there is nothing to show.
internal struct InventoryItemDetailPartsSection: View {
    @State private var model: InventoryItemPartsModel
    private let store: any InventoryStore

    internal init(itemId: InventoryItem.ID, service: any InventoryPartsService, store: any InventoryStore) {
        _model = State(initialValue: InventoryItemPartsModel(itemId: itemId, service: service))
        self.store = store
    }

    internal var body: some View {
        InventoryItemPartsContent(model: model, store: store)
            .task(id: model.itemId) { await model.load() }
    }
}

/// The section's drawing, split from the loader so a test or preview can
/// hand it a model directly.
internal struct InventoryItemPartsContent: View {
    @Bindable internal var model: InventoryItemPartsModel
    internal let store: any InventoryStore
    @State private var adding = false

    internal var body: some View {
        Group {
            if let parts = model.parts {
                VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                    if let assembly = parts.assembly {
                        InventoryItemDetailGroup("Part of") {
                            InventoryPartLink(id: assembly.id, symbol: .partOf) {
                                Text(assembly.name)
                            }
                        }
                    }
                    if parts.canHaveParts || !parts.parts.isEmpty {
                        partsGroup(parts)
                    }
                }
                .transition(.opacity)
            }
        }
        .popsMotion(value: model.phase)
        .sheet(isPresented: $adding) {
            NavigationStack {
                InventoryStoreExistingPicker(
                    model: InventoryAddPartsModel(parts: model, store: store))
            }
            .tint(.popsInventory)
        }
        .alert(
            "Not changed",
            isPresented: Binding(
                get: { model.refusal != nil }, set: { if !$0 { model.refusal = nil } }),
            actions: { Button("OK", role: .cancel) {} },
            message: { Text(model.refusal ?? "") })
    }

    private func partsGroup(_ parts: InventoryItemParts) -> some View {
        InventoryItemDetailGroup("Parts") {
            ForEach(parts.parts) { part in
                InventoryPartLink(id: part.id, symbol: nil) {
                    VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                        Text(part.reference.name)
                        Text(InventoryPartPlacementLabel.text(for: part.placement))
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                }
                .contextMenu {
                    Button("Remove part", role: .destructive) {
                        Task { await model.remove(part.id) }
                    }
                }
            }
            if parts.canHaveParts {
                Button {
                    adding = true
                } label: {
                    Label { Text("Add parts") } icon: { InventorySymbol.addPart.image }
                        .font(.popsBody)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.popsInventory)
            }
        }
    }
}

/// One row that opens another item's page.
private struct InventoryPartLink<Title: View>: View {
    let id: InventoryItem.ID
    let symbol: InventorySymbol?
    @ViewBuilder let title: () -> Title

    var body: some View {
        NavigationLink(value: InventoryRoute.item(id)) {
            HStack(spacing: PopsSpacing.sm) {
                if let symbol {
                    symbol.image.foregroundStyle(Color.popsMutedForeground)
                }
                title()
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                InventoryItemDetailDisclosure()
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// Where a part is, in the words a row shows.
internal enum InventoryPartPlacementLabel {
    internal static func text(for placement: InventoryPartPlacement) -> String {
        switch placement {
        case .hand: "In hand"
        case .container(_, let name): name.map { "In \($0)" } ?? "In a container"
        case .location(_, let name): name ?? "At a place"
        }
    }
}
