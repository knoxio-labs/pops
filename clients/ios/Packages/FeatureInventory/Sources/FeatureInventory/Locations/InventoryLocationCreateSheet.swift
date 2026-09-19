import AppCore
import DesignSystem
import SwiftUI

/// New place: a name and the place it sits inside, chosen with the shared
/// picker.
///
/// The design's kind picker (room, shelf, drawer…) has no field behind it: a
/// location records only a name and a parent (ADR-002), so this sheet asks
/// for nothing the store cannot keep.
internal struct InventoryLocationCreateSheet: View {
    internal let tree: InventoryLocationTree
    internal let runner: InventoryCommandRunner
    @State private var name: String
    @State private var parent: InventoryDestination?
    @State private var choosingParent = false
    @State private var showsValidation = false
    @State private var isSaving = false
    @Environment(\.dismiss) private var dismiss

    internal init(
        tree: InventoryLocationTree, runner: InventoryCommandRunner, parentID: String? = nil,
        name: String = ""
    ) {
        self.tree = tree
        self.runner = runner
        _name = State(initialValue: name)
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
            }
            .inventoryInsetGroupedList()
            .inventoryMotion(value: isNamed)
            .navigationTitle("New place")
            .inventoryTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .inventoryProminentGlassButton()
                        .tint(.popsInventory)
                        .disabled(!isNamed || isSaving)
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

    private func create() async {
        guard isNamed else {
            showsValidation = true
            return
        }
        isSaving = true
        defer { isSaving = false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let parentID: InventoryLocation.ID?
        if case .location = parent?.kind { parentID = parent?.id } else { parentID = nil }
        let newLocation = InventoryNewLocation(
            id: UUID().uuidString.lowercased(), name: trimmed, parentId: parentID,
            sortOrder: tree.children(of: parentID).count)
        if await runner.perform([.createLocation(newLocation)]) != nil {
            dismiss()
        }
    }
}
