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
    internal let detail: String
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
                        Text(detail)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
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
