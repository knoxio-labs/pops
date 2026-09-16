import DesignSystem
import SwiftUI

/// Every open container at once, in whichever shape
/// `inventory-open-containers-representation` is being shown in.
///
/// A list row per container, one card holding all of them, or one card each —
/// the three answers stay side by side here rather than as three screens,
/// because the content, one row per open container linking to its detail, is
/// the same in every one of them.
internal struct InventoryOpenContainersView: View {
    internal let profiles: [InventoryContainerProfile]
    @Environment(\.inventoryContainerStyle) private var style

    private var open: [InventoryContainerProfile] {
        profiles.filter { $0.item.access == .open && $0.item.lifecycle == .active }
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if open.isEmpty {
                    InventoryStateNotice(kind: .empty)
                } else {
                    content
                }
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .navigationTitle("Open containers")
        .tint(.popsInventory)
    }

    @ViewBuilder private var content: some View {
        switch style.openRepresentation {
        case .list:
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(open) { profile in
                        row(profile)
                        if profile.id != open.last?.id { PopsDivider() }
                    }
                }
            }
        case .groupedCard:
            InventoryGroundedOpenPanel {
                VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                    ForEach(open) { profile in
                        row(profile)
                        if profile.id != open.last?.id { PopsDivider() }
                    }
                }
            }
        case .individualCards:
            ForEach(open) { profile in
                InventoryGroundedOpenPanel { row(profile) }
            }
        }
    }

    private func row(_ profile: InventoryContainerProfile) -> some View {
        NavigationLink {
            InventoryContainerDetailView(profile: profile)
        } label: {
            InventoryItemRow(item: profile.item)
        }
        .buttonStyle(.plain)
    }
}
