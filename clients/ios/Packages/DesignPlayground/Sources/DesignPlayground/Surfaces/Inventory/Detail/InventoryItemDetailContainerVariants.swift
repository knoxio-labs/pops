import DesignSystem
import SwiftUI

/// The container-extension experiment's middle answer: the section list is
/// replaced, in place, by the container's own contents. Everything else
/// about the page, the header, the toolbar, stays an item's.
internal struct InventoryItemDetailContentsSwap: View {
    internal let summary: InventoryContainerSummary
    @State private var showingContents = true

    /// Stand-in rows only: a container's own contents are its own list, and
    /// this page is not that list, only its shape when the segment is open.
    private let contents = [InventoryFoundationFixtures.screws, InventoryFoundationFixtures.tape]

    internal var body: some View {
        Section {
            Picker("View", selection: $showingContents) {
                Text("Item").tag(false)
                Text("Contents").tag(true)
            }
            .pickerStyle(.segmented)
        }
        if showingContents {
            Section("Contents") {
                ForEach(contents) { InventoryItemRow(item: $0) }
            }
        }
    }
}

/// The container-extension experiment's third answer, and the one this
/// ticket's own "Done when" rejects: a hero that no longer looks like an
/// item's, so a container's page and an ordinary item's page stop reading
/// as the same design.
internal struct InventoryItemDetailSeparateHero: View {
    internal let detail: InventoryItemDetail
    internal let summary: InventoryContainerSummary

    internal var body: some View {
        VStack(spacing: PopsSpacing.sm) {
            Image(systemName: InventorySymbol.openContainer.system)
                .font(.popsTitle)
                .foregroundStyle(Color.popsInventory)
            Text(detail.item.name)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text("\(summary.itemCount) items inside")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsInventory)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PopsSpacing.xl)
        .background(Color.popsInventory.opacity(0.12))
    }
}
