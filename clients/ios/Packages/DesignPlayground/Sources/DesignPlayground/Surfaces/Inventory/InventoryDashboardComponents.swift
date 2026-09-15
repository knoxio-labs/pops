import DesignSystem
import SwiftUI

internal struct InventorySectionHeader: View {
    internal let title: String
    internal let actionTitle: String?
    internal let destination: InventoryRoute?

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            if let actionTitle, let destination {
                NavigationLink(value: destination) {
                    Text(actionTitle)
                        .font(.popsSubheadline.weight(.semibold))
                        .frame(minHeight: PopsSize.touchTarget)
                }
            }
        }
    }
}

internal struct InventoryDestinationCard: View {
    internal let title: String
    internal let symbol: String
    internal let destination: InventoryRoute

    internal var body: some View {
        NavigationLink(value: destination) {
            PopsCard {
                HStack(spacing: PopsSpacing.md) {
                    Image(systemName: symbol)
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsAccent)
                        .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(title)
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsForeground)
                    }
                    Spacer(minLength: PopsSpacing.sm)
                    Image(systemName: "chevron.forward")
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityHidden(true)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

internal struct InventorySearchHero: View {
    internal let prominent: Bool

    internal var body: some View {
        VStack(spacing: PopsSpacing.sm) {
            NavigationLink(value: InventoryRoute.search) {
                HStack(spacing: PopsSpacing.sm) {
                    Image(systemName: "magnifyingglass")
                    Text("Find any item")
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.forward")
                        .accessibilityHidden(true)
                }
                .font(prominent ? .popsTitle : .popsBody)
                .foregroundStyle(Color.popsForeground)
                .padding(.horizontal, PopsSpacing.lg)
                .frame(minHeight: PopsSize.touchTarget)
                .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
                .overlay(
                    RoundedRectangle(cornerRadius: PopsRadius.card)
                        .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
                )
            }
            .buttonStyle(.plain)

            NavigationLink(value: InventoryRoute.scan) {
                Label("Scan label", systemImage: "barcode.viewfinder")
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.popsAccent)
        }
    }
}

internal struct InventorySyncCapsule: View {
    internal let state: InventorySyncState

    internal var body: some View {
        NavigationLink(value: InventoryRoute.syncRepair) {
            Label(label, systemImage: symbol)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(tone)
                .padding(.horizontal, PopsSpacing.md)
                .frame(minHeight: PopsSize.touchTarget)
                .background(Color.popsSurface, in: .capsule)
                .overlay(Capsule().stroke(tone, lineWidth: PopsBorder.hairline))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }

    private var label: String {
        switch state {
        case .current: "Up to date"
        case .offline(let updated): "Offline · \(updated)"
        case .synchronizing(let progress): "Syncing · \(progress)"
        case .needsAttention(let count): "\(count) need attention"
        }
    }

    private var accessibilityLabel: String {
        "Sync status: \(label). Opens sync and repair details."
    }

    private var symbol: String {
        switch state {
        case .current: "checkmark.circle.fill"
        case .offline: "wifi.slash"
        case .synchronizing: "arrow.trianglehead.2.clockwise.rotate.90"
        case .needsAttention: "exclamationmark.triangle.fill"
        }
    }

    private var tone: Color {
        switch state {
        case .current: Color.popsSuccess
        case .offline: Color.popsMutedForeground
        case .synchronizing: Color.popsAccent
        case .needsAttention: Color.popsWarning
        }
    }
}

internal struct InventoryOpenContainerCard: View {
    internal let container: InventoryContainer

    internal var body: some View {
        NavigationLink(value: InventoryRoute.container(container.id)) {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: "shippingbox.fill")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsWarning)
                    .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(container.name)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text(
                        "\(container.itemCount) items · \(container.location) · \(container.updated)"
                    )
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: "chevron.forward")
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.xs)
            .background(Color.popsWarning.opacity(0.12), in: .rect(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsWarning, lineWidth: PopsBorder.hairline)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

internal struct InventoryGlobalControls: View {
    internal var body: some View {
        PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                NavigationLink(value: InventoryRoute.search) {
                    Label("Search inventory", systemImage: "magnifyingglass")
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .playgroundGlassButton()

                NavigationLink(value: InventoryRoute.scan) {
                    Image(systemName: "barcode.viewfinder")
                        .font(.popsTitle)
                        .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                }
                .playgroundProminentGlassButton()
                .accessibilityLabel("Scan an item or container label")
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
    }
}

internal struct InventorySummaryFigures: View {
    internal var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: PopsSpacing.xl) { figures }
            VStack(alignment: .leading, spacing: PopsSpacing.md) { figures }
        }
    }

    @ViewBuilder private var figures: some View {
        figure("846", "Items")
        figure("38", "Containers")
        figure("9", "Locations")
    }

    private func figure(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(value)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityElement(children: .combine)
    }
}
