import SwiftUI

/// Every field on one screen, in one order.
///
/// The argument for it is that nothing is hidden and nothing is a step: a
/// person who knows what they are doing fills in four things and presses
/// Create. The argument against it is height, and this surface is where that
/// cost is meant to be seen rather than described, it scrolls at the default
/// text size and scrolls a long way at the accessibility ones.
internal struct InventoryCreateFormView: View {
    internal let draft: InventoryDraft
    internal let origin: InventoryCreationOrigin
    /// Whether the photograph leads. The same form either way; what changes is
    /// which question is asked while the object is still in your hands.
    internal let photoLed: Bool
    internal let resumed: Bool
    internal let moment: InventoryCreateMoment
    /// Whether the cancel confirmation is already up, so the state that is
    /// about leaving with staged work can be looked at rather than performed.
    internal let cancelling: Bool

    internal init(
        draft: InventoryDraft,
        origin: InventoryCreationOrigin = InventoryDraftFixtures.origin,
        photoLed: Bool = false,
        resumed: Bool = false,
        moment: InventoryCreateMoment = .atFinalAction,
        cancelling: Bool = false
    ) {
        self.draft = draft
        self.origin = origin
        self.photoLed = photoLed
        self.resumed = resumed
        self.moment = moment
        self.cancelling = cancelling
    }

    internal var body: some View {
        List {
            if photoLed {
                photos
                identity
            } else {
                identity
                photos
            }
            placement
            Section { InventoryTechnicalDetails(draft: draft) }
        }
        .playgroundInsetGroupedList()
        .navigationTitle(draft.copiedFrom == nil ? "New item" : "Copy of \(draft.name)")
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem {
            InventoryCancelButton(draft: draft, presenting: cancelling)
        }
        .safeAreaInset(edge: .top) {
            if resumed { InventoryResumeNotice(draft: draft) }
        }
        .safeAreaInset(edge: .bottom) { bar }
    }

    @ViewBuilder private var bar: some View {
        switch moment {
        case .atFinalAction: InventoryCreateBar(draft: draft)
        case .onFirstKeystroke: InventoryLiveRecordBar(draft: draft)
        }
    }

    private var identity: some View {
        Section {
            InventoryNameField(name: draft.name)
            InventoryCodeField(entry: draft.code)
            InventoryDescriptionFields(draft: draft)
            InventoryIdentifierFields(identifiers: draft.identifiers)
        } footer: {
            Text("Only a name is required. A code is for when you put a label on it.")
        }
    }

    private var photos: some View {
        Section {
            InventoryPhotoStrip(photos: draft.photos)
        } header: {
            Text("Photos")
        }
    }

    private var placement: some View {
        Section {
            InventoryPlacementField(choice: draft.placement, origin: origin)
            InventoryQuantityField(draft: draft)
            InventoryProvenanceField(provenance: draft.provenance)
        } header: {
            Text("Where it goes")
        }
    }
}
