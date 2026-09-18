import DesignSystem
import SwiftUI

/// The one moment POPS-4016 leaves for a type arriving: the phone asks once,
/// over the dashboard, and never returns to items that were skipped or left
/// for later.
internal enum InventoryTypeArrivedState: String, CaseIterable, Identifiable {
    case prompt
    case applied
    case notNow = "not-now"

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .prompt: "Asked once"
        case .applied: "Applied"
        case .notNow: "Not now"
        }
    }
}

internal struct InventoryTypeArrivedView: View {
    internal let state: InventoryTypeArrivedState

    internal var body: some View {
        NavigationStack {
            InventoryGroundedDashboardView(fixture: InventoryFixtures.packing)
                .sheet(isPresented: .constant(state == .prompt)) {
                    InventoryTypeArrivedSheet()
                }
                .inventoryUndoCapsule(.constant(appliedOffer), lingers: true) { _ in }
        }
    }

    private var appliedOffer: InventoryUndoOffer? {
        guard state == .applied else { return nil }
        return InventoryUndoOffer(
            message: "Typed 3 as Bag", symbol: .update, id: "type-arrived-applied")
    }
}

/// The ask, once: the matched items ticked, Apply in the nav bar, and a Not
/// now that does not come back.
///
/// A pick list rather than selection mode: every item starts ticked, because
/// the phone is asking about a match it already made, and a tap on a row
/// unticks it.
internal struct InventoryTypeArrivedSheet: View {
    @State private var ticked = Set(InventoryUntypedFixtures.matches.map(\.id))
    @Environment(\.dismiss) private var dismiss

    private let type = InventoryUntypedFixtures.bagType

    internal var body: some View {
        NavigationStack {
            List {
                ForEach(InventoryUntypedFixtures.matches) { item in
                    InventoryPickRow(
                        item: item, isPicked: ticked.contains(item.id),
                        toggle: { toggle(item.id) },
                        subtitle: {
                            if let place = item.placement.effectiveLocation {
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
            .navigationTitle("New type: \(type.name)")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Text("Apply to \(ticked.count)")
                            .contentTransition(.numericText(value: Double(ticked.count)))
                    }
                    .inventoryMotion(value: ticked)
                    .playgroundProminentGlassButton()
                    .tint(.popsInventory)
                    .disabled(ticked.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
        .tint(.popsInventory)
    }

    private func toggle(_ id: String) {
        if ticked.remove(id) == nil { ticked.insert(id) }
    }
}
