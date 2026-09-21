import SwiftUI

/// The sheet the universal search's filter circle opens: one native form
/// with a section per pillar in scope, each headed by its tab glyph. A
/// pillar's filters narrow only that pillar's rows, so in All both show and
/// each says whose it is. Filters apply as they change; Reset clears every
/// pillar in scope and Done closes.
internal struct UniversalSearchFilterSheet: View {
    @Binding internal var inventory: InventorySearchFilter
    @Binding internal var purchases: PurchasesSearchFilter
    internal let scope: SearchScope
    @Environment(\.dismiss) private var dismiss

    private var isActive: Bool {
        (scope.includes(.inventory) && inventory.isActive)
            || (scope.includes(.purchases) && purchases.isActive)
    }

    internal var body: some View {
        NavigationStack {
            Form {
                ForEach(scope.pillars) { pillar in
                    switch pillar {
                    case .purchases: purchasesFields
                    case .inventory:
                        InventorySearchFilterFields(
                            filter: $inventory, types: InventorySearchFixtures.types
                        ) {
                            header(.inventory)
                        }
                    }
                }
            }
            .playgroundInsetGroupedList()
            .navigationTitle("Filters")
            .playgroundTitleDisplay(large: false)
            .playgroundLeadingBarItem {
                Button("Reset", action: reset)
                    .disabled(!isActive)
            }
            .playgroundTrailingBarItem {
                Button("Done") { dismiss() }
                    .playgroundProminentGlassButton()
            }
            .inventoryMotion(value: inventory)
            .inventoryMotion(value: purchases)
        }
        .tint(scope.tint)
        .presentationDetents([.large])
    }

    private var purchasesFields: some View {
        Section {
            Picker("Show", selection: $purchases.kind) {
                ForEach(PurchasesKindFilter.allCases) { Text($0.title).tag($0) }
            }
            Picker("Status", selection: $purchases.status) {
                ForEach(PurchasesStatusFilter.allCases) { Text($0.title).tag($0) }
            }
            NavigationLink {
                PurchasesTagPicker(selection: $purchases.tags, tags: PurchasesSearchFixtures.tagsInUse)
            } label: {
                LabeledContent("Tags", value: purchases.tagSummary ?? "Any")
            }
        } header: {
            header(.purchases)
        }
        .pickerStyle(.menu)
    }

    private func header(_ pillar: SearchPillar) -> some View {
        Label(pillar.title, systemImage: pillar.symbol)
    }

    private func reset() {
        if scope.includes(.inventory) { inventory = InventorySearchFilter() }
        if scope.includes(.purchases) { purchases = PurchasesSearchFilter() }
    }
}
