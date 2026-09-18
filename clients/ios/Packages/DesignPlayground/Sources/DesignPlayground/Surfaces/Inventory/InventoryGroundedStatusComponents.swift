import DesignSystem
import SwiftUI

internal struct InventoryGroundedSyncStatus: View {
    internal let state: InventorySyncState

    @ViewBuilder internal var body: some View {
        if state != .current {
            InventorySyncCapsule(state: state)
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

internal struct InventoryGroundedFirstRunPanel: View {
    internal var body: some View {
        InventoryGroundedListPanel {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                Image(systemName: "shippingbox.and.arrow.backward")
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsAccent)
                    .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Set up inventory on this phone")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    Text("Download your items, containers, and locations for use on this phone.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                NavigationLink(value: InventoryRoute.syncRepair) {
                    Label("Start synchronization", systemImage: "arrow.down.circle.fill")
                        .font(.popsHeadline)
                        .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.popsAccent)
            }
            .padding(PopsSpacing.lg)
        }
    }
}
