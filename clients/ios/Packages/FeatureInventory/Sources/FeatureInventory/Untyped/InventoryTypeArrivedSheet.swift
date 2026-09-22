import DesignSystem
import SwiftUI

extension View {
    /// The type-arrived sheet over this screen, asked once per arrived type
    /// that covers items still waiting for one.
    internal func inventoryTypeArrivedSheet(_ model: InventoryTypeArrivalModel) -> some View {
        modifier(InventoryTypeArrivedPresentation(model: model))
    }
}

private struct InventoryTypeArrivedPresentation: ViewModifier {
    let model: InventoryTypeArrivalModel

    func body(content: Content) -> some View {
        content
            .task { await model.observe() }
            .sheet(
                isPresented: Binding(
                    get: { model.presented != nil },
                    set: { isPresented in
                        if !isPresented, model.presented != nil { Task { await model.close() } }
                    })
            ) {
                if let prompt = model.presented {
                    InventoryTypeArrivedSheet(model: model, prompt: prompt)
                }
            }
    }
}

/// The ask, once: the matched items ticked, Apply in the nav bar, and a Not
/// now that does not come back.
///
/// A pick list rather than selection mode: every item starts ticked, because
/// the phone is asking about a match it already made, and a tap anywhere on
/// a row unticks it.
internal struct InventoryTypeArrivedSheet: View {
    @Bindable internal var model: InventoryTypeArrivalModel
    internal let prompt: InventoryTypeArrivalPrompt

    internal var body: some View {
        NavigationStack {
            List {
                ForEach(prompt.rows) { row in
                    InventoryPickRow(
                        name: row.name,
                        mark: InventoryRecordMark(
                            photo: row.photo, symbol: .record(access: nil), load: thumbnail),
                        isPicked: model.ticked.contains(row.id),
                        toggle: { model.toggle(row.id) },
                        subtitle: {
                            if let place = row.place {
                                Text(place)
                                    .font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                            }
                        }
                    )
                    .listRowInsets(
                        EdgeInsets(
                            top: PopsSpacing.zero, leading: PopsSpacing.lg,
                            bottom: PopsSpacing.zero, trailing: PopsSpacing.lg)
                    )
                    .listSectionSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .navigationTitle("New type: \(prompt.typeName)")
            .popsTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { Task { await model.close() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await model.apply() }
                    } label: {
                        Text("Apply to \(model.ticked.count)")
                            .contentTransition(.numericText(value: Double(model.ticked.count)))
                    }
                    .popsMotion(value: model.ticked)
                    .popsProminentGlassButton()
                    .tint(.popsInventory)
                    .disabled(model.ticked.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
        .tint(.popsInventory)
    }

    private func thumbnail(_ sha256: String) async -> Data? {
        try? await model.runner.store.photo(sha256, variant: .thumb)
    }
}
