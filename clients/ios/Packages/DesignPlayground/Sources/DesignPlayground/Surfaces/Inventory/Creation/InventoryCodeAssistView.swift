import DesignSystem
import SwiftUI

/// Labelling an item, with the suggestion either in the row or behind it.
///
/// The whole state matrix lives on one surface because these states are one
/// question answered several ways, and a reviewer comparing "pending" with
/// "collision" should not have to remember what the other looked like.
internal struct InventoryCodeAssistView: View {
    internal let draft: InventoryDraft
    /// Whether the suggestion opens its own sheet instead of living in the
    /// field's own row. The experiment's axis.
    internal let inSheet: Bool
    @State private var showing = false

    internal init(draft: InventoryDraft, inSheet: Bool = false) {
        self.draft = draft
        self.inSheet = inSheet
        _showing = State(initialValue: inSheet && draft.code.assist != .idle)
    }

    internal var body: some View {
        List {
            Section {
                InventoryNameField(name: draft.name)
            }
            Section {
                if inSheet {
                    PopsRow(title: "Inventory code", subtitle: rowDetail) {
                        Button("Suggest") { showing = true }
                            .font(.popsSubheadline.weight(.semibold))
                            .playgroundGlassButton()
                            .tint(.popsInventory)
                    }
                } else {
                    InventoryCodeField(entry: draft.code)
                }
            } header: {
                Text("Label")
            } footer: {
                Text("Most items never get one. A code exists once there is a sticker to match it.")
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("New item")
        .playgroundTitleDisplay(large: false)
        .safeAreaInset(edge: .bottom) { InventoryCreateBar(draft: draft) }
        .sheet(isPresented: $showing) {
            InventoryCodeSuggestionSheet(entry: draft.code)
        }
    }

    private var rowDetail: String {
        if draft.code.isLabelled { return draft.code.value }
        return draft.code.assist.note ?? "No label on it"
    }
}

/// The suggestion as its own surface: the code, the runners-up, and the two
/// answers.
internal struct InventoryCodeSuggestionSheet: View {
    internal let entry: InventoryCodeEntry

    internal var body: some View {
        NavigationStack {
            List {
                Section {
                    InventoryCodeField(entry: entry)
                } footer: {
                    Text("Typing over it keeps your code. Nothing is applied until you take one.")
                }
                if entry.assist.blocksCreation || entry.assist == .offline {
                    Section { Text(entry.assist.note ?? "") }
                }
            }
            .playgroundInsetGroupedList()
            .navigationTitle("Suggest a code")
            .playgroundTitleDisplay(large: false)
            .safeAreaInset(edge: .bottom) {
                PopsActionBar {
                    PopsButton("Take it", prominence: .prominent) {}
                        .disabled(entry.assist.isWorking || entry.assist.alternatives.isEmpty)
                    PopsButton("Not now") {}
                }
            }
        }
        .presentationDetents([.medium])
    }
}
