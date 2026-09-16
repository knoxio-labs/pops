import DesignSystem
import SwiftUI

/// A container's contents: counts, a search field, the add action, the rows
/// themselves, and what changed most recently.
///
/// Shared by the detail screen's inline section and the dedicated workspace,
/// so the two structures the open experiment is deciding between draw the
/// same content rather than two hand-maintained copies of it.
internal struct InventoryContainerContentsSection: View {
    internal let profile: InventoryContainerProfile
    @State private var query = ""
    @State private var isAdding = false

    internal var body: some View {
        Section {
            if profile.contents.isEmpty {
                InventoryStateNotice(kind: .empty)
            } else {
                searchField
                ForEach(profile.contents.matching(query)) { contentsRow($0) }
                if !profile.contents.recentlyRemovedNames.isEmpty {
                    recentlyRemoved
                }
            }
            addButton
        } header: {
            Text("Contents")
        } footer: {
            if !profile.contents.isEmpty {
                Text(countSummary)
            }
        }
        .sheet(isPresented: $isAdding) {
            InventoryContainerAddSheet(containerName: profile.item.name)
        }
    }

    private var countSummary: String {
        let contents = profile.contents
        return "\(contents.itemCount) items · \(contents.unitCount) units"
    }

    private var searchField: some View {
        Label {
            TextField("Search contents", text: $query)
        } icon: {
            Image(systemName: InventorySymbol.search.system)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private func contentsRow(_ item: InventoryFoundationItem) -> some View {
        HStack(spacing: PopsSpacing.sm) {
            InventoryItemRow(item: item)
            if profile.contents.recentlyAddedIDs.contains(item.id) {
                Text("New")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsInventory)
            }
        }
    }

    private var recentlyRemoved: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text("Recently removed")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
            Text(profile.contents.recentlyRemovedNames.joined(separator: ", "))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private var addButton: some View {
        Button {
            isAdding = true
        } label: {
            Label("Add", systemImage: InventorySymbol.addNew.system)
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
    }
}
