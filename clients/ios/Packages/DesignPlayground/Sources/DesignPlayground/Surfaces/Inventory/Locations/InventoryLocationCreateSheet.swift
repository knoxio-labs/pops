import DesignSystem
import SwiftUI

/// New place: a name, a kind picked from a row of glyphs, and the place it
/// sits inside, chosen with the shared picker.
internal struct InventoryLocationCreateSheet: View {
    internal let tree: InventoryLocationTree
    internal let showsValidation: Bool
    @State private var name: String
    @State private var kind: InventoryPlaceKind
    @State private var parent: InventoryDestination?
    @State private var choosingParent = false
    @Environment(\.dismiss) private var dismiss

    internal init(
        tree: InventoryLocationTree,
        parentID: String? = nil,
        name: String = "",
        kind: InventoryPlaceKind = .room,
        showsValidation: Bool = false
    ) {
        self.tree = tree
        self.showsValidation = showsValidation
        _name = State(initialValue: name)
        _kind = State(initialValue: kind)
        _parent = State(
            initialValue: parentID.flatMap { tree.node($0) }.map {
                InventoryDestination(place: $0, in: tree)
            })
    }

    private var isNamed: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    internal var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .font(.popsBody)
                    parentRow
                } footer: {
                    if showsValidation, !isNamed {
                        Text("Name is required")
                            .foregroundStyle(Color.popsDestructive)
                    }
                }
                Section("Kind") {
                    InventoryPlaceKindPicker(selection: $kind)
                        .listRowInsets(EdgeInsets())
                }
            }
            .playgroundInsetGroupedList()
            .inventoryMotion(value: isNamed)
            .navigationTitle("New place")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { dismiss() }
                        .playgroundProminentGlassButton()
                        .tint(.popsInventory)
                        .disabled(!isNamed)
                }
            }
            .sheet(isPresented: $choosingParent) {
                InventoryDestinationPickerSheet(
                    title: "Inside", commitTitle: "Choose", tree: tree,
                    onChoose: { parent = $0 })
            }
        }
        .presentationDetents([.medium, .large])
        .tint(.popsInventory)
    }

    private var parentRow: some View {
        Button {
            choosingParent = true
        } label: {
            HStack(spacing: PopsSpacing.sm) {
                Text("Inside")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                Text(parent?.name ?? "Top level")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
                    .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.forward")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Inside, \(parent?.name ?? "Top level")")
    }
}

/// Every kind as a glass glyph in one scrolling row, the chosen one filled
/// with Inventory's colour and named under it.
internal struct InventoryPlaceKindPicker: View {
    @Binding internal var selection: InventoryPlaceKind
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        ScrollView(.horizontal) {
            PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    ForEach(InventoryPlaceKind.allCases) { kind in
                        option(kind)
                    }
                }
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.vertical, PopsSpacing.md)
            }
        }
        .scrollIndicators(.hidden)
        .inventoryMotion(value: selection)
    }

    private func option(_ kind: InventoryPlaceKind) -> some View {
        let chosen = kind == selection
        return Button {
            selection = kind
        } label: {
            VStack(spacing: PopsSpacing.xs) {
                Image(systemName: kind.symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(chosen ? Color.popsBackground : Color.popsForeground)
                    .frame(width: size, height: size)
                    .background {
                        if chosen { Circle().fill(Color.popsInventory) }
                    }
                    .playgroundGlass(in: Circle())
                Text(kind.title)
                    .font(.popsCaption)
                    .foregroundStyle(chosen ? Color.popsForeground : Color.popsMutedForeground)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(kind.title)
        .accessibilityAddTraits(chosen ? .isSelected : [])
    }
}
