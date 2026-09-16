import DesignSystem
import SwiftUI

/// One enrichment, opened over the form that is already complete enough.
internal enum InventoryEnrichment: String, Identifiable, CaseIterable {
    case photos
    case code
    case placement

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .photos: "Photos"
        case .code: "Code and identifiers"
        case .placement: "Where it goes"
        }
    }

    internal var symbol: String {
        switch self {
        case .photos: InventorySymbol.camera.system
        case .code: InventorySymbol.code.system
        case .placement: InventorySymbol.location.system
        }
    }
}

/// A form that is finished after one field, and three sheets for the rest.
///
/// The argument for it is that Create is reachable from the first screen and
/// always has been, so cataloguing a room is a name and a button, twice a
/// minute. The argument against it is that everything optional is now behind a
/// tap, and a thing behind a tap on a phone is a thing that does not get done.
internal struct InventoryCreateSheetsView: View {
    internal let draft: InventoryDraft
    internal let origin: InventoryCreationOrigin
    @State private var open: InventoryEnrichment?

    internal init(
        draft: InventoryDraft,
        origin: InventoryCreationOrigin = InventoryDraftFixtures.origin,
        open: InventoryEnrichment? = nil
    ) {
        self.draft = draft
        self.origin = origin
        _open = State(initialValue: open)
    }

    internal var body: some View {
        List {
            Section {
                InventoryNameField(name: draft.name)
                InventoryDescriptionFields(draft: draft)
            } footer: {
                Text(
                    "This is enough. The three below are worth doing and none of them is asked for."
                )
            }
            Section {
                ForEach(InventoryEnrichment.allCases) { enrichment in
                    Button {
                        open = enrichment
                    } label: {
                        InventoryEnrichmentRow(enrichment: enrichment, draft: draft)
                    }
                    .buttonStyle(.plain)
                }
            }
            Section { InventoryTechnicalDetails(draft: draft) }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("New item")
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem { InventoryCancelButton(draft: draft) }
        .safeAreaInset(edge: .bottom) { InventoryCreateBar(draft: draft) }
        .sheet(item: $open) { enrichment in
            InventoryEnrichmentSheet(enrichment: enrichment, draft: draft, origin: origin)
        }
    }
}

/// One enrichment row, saying what it already holds rather than only its name.
internal struct InventoryEnrichmentRow: View {
    internal let enrichment: InventoryEnrichment
    internal let draft: InventoryDraft

    internal var body: some View {
        PopsRow(title: enrichment.title, subtitle: detail) {
            Image(systemName: enrichment.symbol)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private var detail: String {
        switch enrichment {
        case .photos:
            draft.photos.isEmpty ? "None yet" : "\(draft.photos.count) staged"
        case .code:
            draft.code.isLabelled ? draft.code.value : "No label on it"
        case .placement:
            draft.placement.summary
        }
    }
}

internal struct InventoryEnrichmentSheet: View {
    internal let enrichment: InventoryEnrichment
    internal let draft: InventoryDraft
    internal let origin: InventoryCreationOrigin

    internal var body: some View {
        NavigationStack {
            List { content }
                .playgroundInsetGroupedList()
                .navigationTitle(enrichment.title)
                .playgroundTitleDisplay(large: false)
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder private var content: some View {
        switch enrichment {
        case .photos:
            Section { InventoryPhotoStrip(photos: draft.photos) }
        case .code:
            Section {
                InventoryCodeField(entry: draft.code)
                InventoryIdentifierFields(identifiers: draft.identifiers)
            }
        case .placement:
            Section {
                InventoryPlacementField(choice: draft.placement, origin: origin)
                InventoryQuantityField(draft: draft)
                InventoryProvenanceField(provenance: draft.provenance)
            }
        }
    }
}
