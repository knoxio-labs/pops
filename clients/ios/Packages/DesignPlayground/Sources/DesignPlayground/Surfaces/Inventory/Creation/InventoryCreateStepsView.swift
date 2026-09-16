import DesignSystem
import SwiftUI

/// Four short steps, each of which fits.
///
/// The argument for it is that no step ever scrolls and every one of them asks
/// a single question, so the flow is answerable one-handed while holding the
/// object. The argument against it is that a person who wanted to type a name
/// and be done now presses Next three times, and that the record exists only
/// after the fourth screen, which is further away than it looks.
internal struct InventoryCreateStepsView: View {
    internal let draft: InventoryDraft
    internal let step: InventoryCreateStep
    internal let origin: InventoryCreationOrigin

    internal init(
        draft: InventoryDraft,
        step: InventoryCreateStep,
        origin: InventoryCreationOrigin = InventoryDraftFixtures.origin
    ) {
        self.draft = draft
        self.step = step
        self.origin = origin
    }

    internal var body: some View {
        List { content }
            .playgroundInsetGroupedList()
            .navigationTitle(step.title)
            .playgroundTitleDisplay(large: false)
            .playgroundLeadingBarItem { InventoryCancelButton(draft: draft) }
            .safeAreaInset(edge: .top) { progress }
            .safeAreaInset(edge: .bottom) { actions }
    }

    @ViewBuilder private var content: some View {
        switch step {
        case .identity:
            Section {
                InventoryNameField(name: draft.name)
                InventoryDescriptionFields(draft: draft)
            } footer: {
                Text("A name is enough to carry on. Everything after this is optional.")
            }
        case .photos:
            Section {
                InventoryPhotoStrip(photos: draft.photos)
            } footer: {
                Text("Held on this phone until the item is created. Skipping costs nothing.")
            }
        case .placement:
            Section {
                InventoryPlacementField(choice: draft.placement, origin: origin)
                InventoryQuantityField(draft: draft)
            }
        case .review:
            review
        }
    }

    private var review: some View {
        Group {
            Section { InventoryDraftPreview(draft: draft) }
            Section {
                InventoryCodeField(entry: draft.code)
                InventoryIdentifierFields(identifiers: draft.identifiers)
                InventoryProvenanceField(provenance: draft.provenance)
            } header: {
                Text("Last chance to add")
            }
            Section { InventoryTechnicalDetails(draft: draft) }
        }
    }

    /// Which step this is, in words. A bar alone says how far along without
    /// saying what is left, and what is left is the thing people want to know
    /// before they start.
    private var progress: some View {
        Text("Step \(step.position) of \(InventoryCreateStep.allCases.count)")
            .font(.popsSectionLabel)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .background(.regularMaterial)
    }

    @ViewBuilder private var actions: some View {
        if step.isFinal {
            InventoryCreateBar(draft: draft)
        } else {
            PopsActionBar {
                PopsButton("Next", prominence: .prominent) {}
                    .disabled(step == .identity && !draft.canCreate)
                if step != .identity {
                    PopsButton("Skip") {}
                }
            }
        }
    }
}
