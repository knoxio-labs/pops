import DesignSystem
import SwiftUI

/// A container's detail, as an extension of an item's: everything an item
/// detail already shows, plus what its containment capability adds.
///
/// `style.detailStructure` decides how the last part shows up. Unified draws
/// the workspace section in line, so scrolling the detail reaches the
/// contents. Dedicated draws a summary and a link, so packing happens on its
/// own screen. Both draw every other section the same way, because the
/// question is only where the workspace lives, not what an item detail is.
internal struct InventoryContainerDetailView: View {
    internal let profile: InventoryContainerProfile
    @Environment(\.inventoryContainerStyle) private var style

    internal var body: some View {
        List {
            InventoryContainerIdentitySection(profile: profile)
            InventoryContainerPropertiesSection(profile: profile)
            InventoryContainerPlacementSection(profile: profile, style: style)
            InventoryContainerCapabilityRow(profile: profile)
            workspaceSection
            provenanceSection
            Section("Actions") { InventoryActionSections(item: profile.item) }
        }
        .playgroundInsetGroupedList()
        .navigationTitle(profile.item.name)
        .tint(.popsInventory)
    }

    @ViewBuilder private var workspaceSection: some View {
        if profile.item.isContainer {
            switch style.detailStructure {
            case .unifiedSection:
                InventoryContainerContentsSection(profile: profile)
            case .dedicatedWorkspace:
                Section("Contents") {
                    NavigationLink {
                        InventoryContainerWorkspaceView(profile: profile)
                    } label: {
                        LabeledContent("Open workspace") { Text(contentsSummary) }
                    }
                    .frame(minHeight: PopsSize.touchTarget)
                }
            }
        }
    }

    private var contentsSummary: String {
        let contents = profile.contents
        return contents.isEmpty ? "Empty" : "\(contents.itemCount) items"
    }

    @ViewBuilder private var provenanceSection: some View {
        if let provenance = profile.purchaseProvenance {
            Section("Purchase") {
                Text(provenance)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
    }
}
