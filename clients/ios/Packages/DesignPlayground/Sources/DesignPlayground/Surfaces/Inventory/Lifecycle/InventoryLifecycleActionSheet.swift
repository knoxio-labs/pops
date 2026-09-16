import DesignSystem
import SwiftUI

/// The sheet a lifecycle action opens into: why, when, anything worth
/// writing down, and, for a group, how many of it.
///
/// One sheet for every disposition rather than one per reason, because the
/// fields are the same regardless of which one a person picked from the
/// action list; only the verb in the title changes.
internal struct InventoryLifecycleActionSheet: View {
    internal let item: InventoryFoundationItem
    internal let verb: String
    @State private var draft: InventoryDispositionDraft
    @State private var isConfirming = false
    @State private var showsUndoBanner = false

    internal init(item: InventoryFoundationItem, verb: String = "Discard") {
        self.item = item
        self.verb = verb
        _draft = State(initialValue: InventoryDispositionDraft(totalCount: item.quantity.count))
    }

    internal var body: some View {
        List {
            Section { InventoryItemRow(item: item) }
            if item.quantity.count > 1 {
                Section("How many") {
                    InventoryLifecycleQuantityStep(draft: $draft)
                }
            }
            Section("Reason") {
                Picker("Reason", selection: $draft.reason) {
                    Text("Not saying").tag(InventoryDiscardReason?.none)
                    ForEach(InventoryDiscardReason.allCases) { reason in
                        Text(reason.label).tag(InventoryDiscardReason?.some(reason))
                    }
                }
            }
            Section("When") {
                DatePicker("Date", selection: $draft.date, displayedComponents: .date)
            }
            Section("Note") {
                TextField("Anything worth remembering", text: $draft.note, axis: .vertical)
            }
            Section {
                InventoryLifecycleConfirmFooter(
                    verb: verb, isConfirming: $isConfirming, showsUndoBanner: $showsUndoBanner)
            }
            if showsUndoBanner {
                Section { InventoryLifecycleUndoBanner(subject: item.name, verb: verb) }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}

/// The one field that differs by style: does reducing a group's quantity
/// leave one record smaller, or split the removed units into their own?
internal struct InventoryLifecycleQuantityStep: View {
    @Binding internal var draft: InventoryDispositionDraft
    @Environment(\.inventoryLifecycleStyle) private var style

    internal var body: some View {
        Stepper(
            value: Binding(
                get: { draft.quantityRemoved ?? draft.totalCount },
                set: { draft.quantityRemoved = $0 }
            ), in: 1...draft.totalCount
        ) {
            Text("\(draft.quantityRemoved ?? draft.totalCount) of \(draft.totalCount)")
                .font(.popsBody)
        }
        Text(explanation)
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
    }

    private var explanation: String {
        guard !draft.disposesOfWholeRecord else {
            return "Every one of them. This record stops counting."
        }
        switch style.quantityReduction {
        case .decrementInPlace:
            return "\(draft.remainingAfter) stay on this record and keep counting."
        case .splitThenDispose:
            return
                "The rest becomes its own record, already carrying this disposition. "
                + "\(draft.remainingAfter) stay on this one."
        }
    }
}

/// The action itself, drawn the way ``InventoryLifecycleStyle
/// .DiscardConfirmation`` says a reversible removal should ask, or not, before
/// it happens.
internal struct InventoryLifecycleConfirmFooter: View {
    internal let verb: String
    @Binding internal var isConfirming: Bool
    @Binding internal var showsUndoBanner: Bool
    @Environment(\.inventoryLifecycleStyle) private var style

    internal var body: some View {
        Button(verb) { act() }
            .font(.popsBody.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            .confirmationDialog(
                "\(verb)? Can be restored.", isPresented: $isConfirming, titleVisibility: .visible
            ) {
                Button(verb) { showsUndoBanner = style.discardConfirmation == .immediateWithUndo }
                Button("Cancel", role: .cancel) {}
            }
    }

    private func act() {
        switch style.discardConfirmation {
        case .immediate: break
        case .immediateWithUndo: showsUndoBanner = true
        case .confirmFirst: isConfirming = true
        }
    }
}
