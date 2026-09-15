import DesignSystem
import SwiftUI

internal struct InventoryWarningWash: View {
    internal var body: some View {
        RadialGradient(
            colors: [Color.popsWarning.opacity(0.5), Color.popsWarning.opacity(0)],
            center: .topTrailing,
            startRadius: PopsSpacing.zero,
            endRadius: PopsSize.pageHeight
        )
        .frame(width: PopsSize.pageHeight, height: PopsSize.pageHeight)
        .accessibilityHidden(true)
    }
}

internal struct InventoryLivingContainerRow: View {
    internal let container: InventoryContainer
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: InventoryRoute.container(container.id)) {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: "shippingbox.fill")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsWarning)
                    .frame(width: markSize, height: markSize)
                    .background(Color.popsWarning.opacity(0.14), in: .circle)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(container.name)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text("\(container.location) · \(container.updated)")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
                VStack(alignment: .trailing, spacing: PopsSpacing.zero) {
                    Text("\(container.itemCount)")
                        .font(.popsTitle)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                    Text("items")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .padding(.vertical, PopsSpacing.sm)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

internal enum InventoryBrowseProminence: Equatable {
    case wide, compact
}

internal struct InventoryLivingBrowseTile: View {
    internal let title: String
    internal let count: String
    internal let detail: String
    internal let symbol: String
    internal let destination: InventoryRoute
    internal let prominence: InventoryBrowseProminence
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: destination) {
            Group {
                if prominence == .wide {
                    HStack(spacing: PopsSpacing.lg) { content }
                } else {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) { content }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(PopsSpacing.lg)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var content: some View {
        Image(systemName: symbol)
            .font(.popsTitle)
            .foregroundStyle(Color.popsAccent)
            .frame(width: markSize, height: markSize)
            .background(Color.popsAccent.opacity(0.14), in: .circle)
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.xs)
                Text(count)
                    .font(.popsTitle)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
            }
            Text(detail)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }
}

internal struct InventoryLivingItemRow: View {
    internal let item: InventoryItem
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: InventoryRoute.item(item.id)) {
            Label {
                PopsRow(title: item.name, subtitle: item.detail) {
                    Image(systemName: "chevron.forward")
                        .foregroundStyle(Color.popsMutedForeground)
                }
            } icon: {
                Image(systemName: item.symbol)
                    .foregroundStyle(Color.popsAccent)
                    .frame(width: markSize, height: markSize)
                    .background(Color.popsAccent.opacity(0.14), in: .circle)
            }
            .padding(.vertical, PopsSpacing.sm)
        }
        .buttonStyle(.plain)
    }
}

internal struct InventoryLivingActivityRow: View {
    internal let activity: InventoryActivity
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: InventoryRoute.activity) {
            Label {
                PopsRow(title: activity.title, subtitle: activity.detail)
            } icon: {
                Image(systemName: activity.symbol)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: markSize, height: markSize)
            }
            .padding(.vertical, PopsSpacing.sm)
        }
        .buttonStyle(.plain)
    }
}

internal struct InventoryLivingSectionLabel: View {
    internal let title: String
    internal let note: String
    internal let destination: InventoryRoute?

    internal init(title: String, note: String, destination: InventoryRoute? = nil) {
        self.title = title
        self.note = note
        self.destination = destination
    }

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            if let destination {
                NavigationLink(value: destination) {
                    Text(note)
                        .font(.popsCaption.weight(.semibold))
                        .frame(minHeight: PopsSize.touchTarget)
                }
            } else {
                Text(note)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}
