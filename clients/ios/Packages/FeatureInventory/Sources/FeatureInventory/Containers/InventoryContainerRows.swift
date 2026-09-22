import DesignSystem
import SwiftUI

/// Several open containers, drawn exactly as the dashboard's open-containers
/// panel draws them, with Close on a trailing swipe.
///
/// `rowSpace` pairs each row with the same container's row in another list on
/// the screen, so a closed one travels there rather than vanishing.
internal struct InventoryOpenContainersPanel: View {
    internal let containers: [InventoryContainerProfile]
    internal var rowSpace: Namespace.ID?
    internal let onClose: (InventoryContainerProfile) -> Void
    @State private var activeSwipe: String?

    internal var body: some View {
        InventoryGroundedOpenPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                summary
                    .padding(.bottom, PopsSpacing.sm)
                ForEach(containers) { container in
                    row(container)
                        .transition(PopsMotion.row)
                    if container.id != containers.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    private var itemCount: Int {
        containers.reduce(0) { $0 + $1.contents.itemCount }
    }

    private var title: String {
        "\(containers.count) open \(containers.count == 1 ? "container" : "containers")"
    }

    private var summary: some View {
        Label {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .contentTransition(.numericText(value: Double(containers.count)))
                Text("\(itemCount) items in open containers")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .contentTransition(.numericText(value: Double(itemCount)))
            }
            .popsMotion(value: containers.map(\.id))
        } icon: {
            Image(systemName: "shippingbox.fill")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        }
    }

    private func row(_ container: InventoryContainerProfile) -> some View {
        NavigationLink(value: InventoryRoute.container(container.id)) {
            InventoryGroundedRowLabel(
                title: container.name,
                detail: InventoryCopy.detail(
                    place: container.path.isEmpty ? nil : container.path,
                    at: container.item.updatedAt),
                symbol: "shippingbox",
                value: "\(container.contents.itemCount)",
                tone: .popsWarning)
        }
        .buttonStyle(.plain)
        .inventoryMatchedRow(id: container.id, in: rowSpace)
        .inventoryGroundedSwipeRow(isActive: activeSwipe == container.id)
        .accessibilityElement(children: .combine)
        .inventoryGroundedSwipeActions(
            edge: .trailing,
            onPresentationChanged: { presented in
                if presented {
                    activeSwipe = container.id
                } else if activeSwipe == container.id {
                    activeSwipe = nil
                }
            },
            actions: {
                Button {
                    onClose(container)
                } label: {
                    Label("Close", systemImage: "checkmark.circle.fill")
                }
                .tint(.popsWarning)
            })
    }
}

extension View {
    @ViewBuilder
    fileprivate func inventoryMatchedRow(id: String, in space: Namespace.ID?) -> some View {
        if let space {
            matchedGeometryEffect(id: id, in: space)
        } else {
            self
        }
    }
}

/// A container that is not open, in the dashboard's row idiom with its state
/// badges under the path.
internal struct InventoryContainerRowLabel: View {
    internal let profile: InventoryContainerProfile
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventorySymbol.closedContainer.image
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(width: markSize, height: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(profile.name)
                    .font(.popsHeadline)
                    .foregroundStyle(
                        profile.isActive ? Color.popsForeground : Color.popsMutedForeground)
                Text(profile.path)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                if !badges.isEmpty {
                    HStack(spacing: PopsSpacing.xs) {
                        ForEach(badges) { InventoryStateBadge(mark: $0) }
                    }
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            Text("\(profile.contents.itemCount)")
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
            Image(systemName: "chevron.forward")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .padding(.trailing, PopsSpacing.sm)
                .accessibilityHidden(true)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }

    private var badges: [InventoryStateMark] {
        var marks = InventoryStateMark.marks(for: profile.item)
        if profile.isFull, profile.isActive {
            marks.append(.full)
        }
        return marks
    }
}
