import DesignSystem
import SwiftUI

/// An item already in the catalogue, opened to be corrected or enriched.
///
/// The same fields as the create flow, which is the point: an item recorded in
/// four seconds during a move is meant to be finished later, and a second form
/// with its own layout would make the two halves of one job look like two
/// jobs. What differs is the identity section, the internal id is the record's
/// forever, and a code already assigned is a sticker in the world rather than
/// a value to retype.
internal struct InventoryEditView: View {
    internal let item: InventoryFoundationItem
    internal let draft: InventoryDraft
    internal let origin: InventoryCreationOrigin

    internal init(
        item: InventoryFoundationItem,
        draft: InventoryDraft? = nil,
        origin: InventoryCreationOrigin = InventoryDraftFixtures.origin
    ) {
        self.item = item
        self.draft = draft ?? InventoryDraft.editing(item)
        self.origin = origin
    }

    internal var body: some View {
        List {
            Section { InventoryItemRow(item: item) }
            Section {
                InventoryNameField(name: draft.name)
                code
                InventoryDescriptionFields(draft: draft)
                InventoryIdentifierFields(identifiers: draft.identifiers)
            } header: {
                Text("What it is")
            }
            Section {
                InventoryPhotoStrip(photos: draft.photos)
            } header: {
                Text("Photos")
            }
            Section {
                InventoryPlacementField(choice: draft.placement, origin: origin)
                InventoryQuantityField(draft: draft)
                InventoryProvenanceField(provenance: draft.provenance)
            } header: {
                Text("Where it is")
            }
            Section { InventoryTechnicalDetails(draft: draft) }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Edit")
        .playgroundTitleDisplay(large: false)
        .safeAreaInset(edge: .bottom) {
            PopsActionBar {
                PopsButton("Save changes", prominence: .prominent) {}
                    .disabled(!draft.canCreate)
            }
        }
    }

    /// An unlabelled item can still be labelled, so the field is live. A
    /// labelled one shows the code as the fact it is, with changing it behind
    /// a deliberate action.
    @ViewBuilder private var code: some View {
        if draft.code.isLabelled {
            PopsRow(title: "Inventory code", subtitle: draft.code.value) {
                Button("Change") {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
            }
        } else {
            InventoryCodeField(entry: draft.code)
        }
    }
}
