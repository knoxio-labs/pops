import DesignSystem
import SwiftUI

/// The item detail page: identity, placement, what its type knows, where it
/// came from, and the one action its placement makes obvious.
///
/// Composed from the pieces the row and the action sheet already use ,
/// ``InventoryItemRow``, ``InventoryActionList``, ``InventoryPlacementPath`` ,
/// so this page can never draw a state a list row disagrees with. Nothing
/// here fetches; see ``Catalog`` for why that is a fact about the package.
internal struct InventoryItemDetailView: View {
    internal let detail: InventoryItemDetail
    @Environment(\.inventoryStyle) private var foundationStyle
    @Environment(\.inventoryItemDetailStyle) private var style
    @State private var isShowingMore = false

    private var primary: InventoryAction? {
        InventoryItemDetailPrimaryAction.choose(for: detail.item, style: foundationStyle)
    }

    internal var body: some View {
        List {
            Section { header }
            InventoryItemDetailSyncBanner(detail: detail)
            InventoryItemDetailPlacementSection(detail: detail)
            InventoryItemDetailIdentifiersSection(identifiers: detail.externalIdentifiers)
            InventoryItemDetailFieldsSection(detail: detail)
            containerSection
            optionalSections
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
        .navigationTitle(detail.item.name)
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                InventoryItemDetailMenu(detail: detail) { isShowingMore = true }
            }
        }
        .navigationDestination(for: InventoryItemDetailRoute.self) { route in
            InventoryItemDetailDrillInDestination(route: route, detail: detail)
        }
        .sheet(isPresented: $isShowingMore) {
            InventoryActionList(item: detail.item)
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
    }

    @ViewBuilder private var header: some View {
        if let summary = detail.containerSummary, style.containerExtension == .separateHero {
            InventoryItemDetailSeparateHero(detail: detail, summary: summary)
        } else {
            InventoryItemDetailHeader(detail: detail, primary: primary, onPrimary: {})
        }
    }

    @ViewBuilder private var bottomBar: some View {
        if style.actionPlacement == .bottomBar, let primary {
            InventoryItemDetailBottomBar(action: primary, onPrimary: {})
        }
    }

    @ViewBuilder private var containerSection: some View {
        if let summary = detail.containerSummary {
            switch style.containerExtension {
            case .appendedSection, .separateHero:
                InventoryItemDetailContainerSection(summary: summary)
            case .segmentedContents:
                InventoryItemDetailContentsSwap(summary: summary)
            }
        }
    }

    private var showsEmptyPlaceholders: Bool { style.hierarchy == .fixedOrder }

    @ViewBuilder private var optionalSections: some View {
        switch style.sectionDisclosure {
        case .inlineExpandable:
            InventoryItemDetailProvenanceSection(
                provenance: detail.provenance, showsWhenEmpty: showsEmptyPlaceholders)
            InventoryItemDetailDocumentsSection(
                documents: detail.documents, showsWhenEmpty: showsEmptyPlaceholders)
            InventoryItemDetailActivitySection(activity: detail.activity)
        case .drillIn:
            InventoryItemDetailDrillInRows(
                detail: detail, showsEmptyPlaceholders: showsEmptyPlaceholders)
        }
    }
}
