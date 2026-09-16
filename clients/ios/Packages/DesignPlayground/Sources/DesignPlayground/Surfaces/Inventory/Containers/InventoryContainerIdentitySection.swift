import DesignSystem
import SwiftUI

/// Name, code, quantity and photos: what both the detail screen and the
/// workspace open on, because a container is an item first and the workspace
/// must not let a reader forget which one they are holding.
internal struct InventoryContainerIdentitySection: View {
    internal let profile: InventoryContainerProfile

    internal var body: some View {
        Section {
            InventoryItemRow(item: profile.item)
            if profile.photoCount > 0 {
                Label("\(profile.photoCount) photos", systemImage: InventorySymbol.photo.system)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}

/// Size, load and whatever else the type's fields declare for this container.
/// A note rather than a chip, because there is no fixed list of these fields
/// to badge.
internal struct InventoryContainerPropertiesSection: View {
    internal let profile: InventoryContainerProfile

    @ViewBuilder internal var body: some View {
        if let sizeLoad = profile.sizeLoad {
            Section("Properties") {
                Text(sizeLoad)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
    }
}

/// Where it is now, its open/closed state, and how full it is, in whichever
/// shape the two open questions about this row currently answer.
internal struct InventoryContainerPlacementSection: View {
    internal let profile: InventoryContainerProfile
    internal let style: InventoryContainerStyle

    internal var body: some View {
        Section("Placement") {
            InventoryPlacementPath(placement: profile.item.placement)
            if let destination = profile.destinationHint, style.destinationField != .laterMoveAction
            {
                destinationRow(destination)
            }
            ForEach(InventoryStateMark.marks(for: profile.item)) { InventoryStateBadge(mark: $0) }
            fullnessRow
        }
    }

    private func destinationRow(_ destination: String) -> some View {
        let title = style.destinationField == .currentField ? "Destination" : "Heading to"
        return LabeledContent(title) {
            Text(destination).foregroundStyle(Color.popsMutedForeground)
        }
    }

    @ViewBuilder private var fullnessRow: some View {
        switch style.fullDeclaration {
        case .absent:
            EmptyView()
        case .manual:
            LabeledContent("Full") {
                Text(profile.fullness == .declaredFull ? "Yes" : "No")
                    .foregroundStyle(Color.popsMutedForeground)
            }
        case .property:
            if profile.fullness == .declaredFull {
                Text("At capacity")
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsWarning)
            }
        }
    }
}
