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

internal struct InventoryGroundedSyncNotice: View {
    internal let state: InventorySyncState

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(tone)
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
            NavigationLink(value: InventoryRoute.syncRepair) {
                Image(systemName: "chevron.forward")
                    .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
            }
            .accessibilityLabel("Open sync and repair details")
        }
        .padding(.horizontal, PopsSpacing.md)
        .padding(.vertical, PopsSpacing.sm)
        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(tone, lineWidth: PopsBorder.hairline)
        }
    }

    private var title: String {
        switch state {
        case .current: "Up to date"
        case .offline: "Inventory is offline"
        case .synchronizing: "Updating inventory"
        case .needsAttention(let count): "\(count) changes need attention"
        }
    }

    private var detail: String {
        switch state {
        case .current: "All changes are on this phone"
        case .offline(let updated): "Showing changes saved \(updated)"
        case .synchronizing(let progress): "Synchronization is \(progress) complete"
        case .needsAttention: "Review changes that could not be synchronized"
        }
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
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                Image(systemName: "shippingbox.and.arrow.backward")
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsAccent)
                    .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
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
            .padding(PopsSpacing.sm)
        }
    }
}

internal struct InventoryMoveDestinationSheet: View {
    internal let item: InventoryItem
    internal let containers: [InventoryContainer]
    internal let onMove: () -> Void
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                if !containers.isEmpty {
                    Section("Open containers") {
                        ForEach(containers) { container in
                            Button {
                                onMove()
                            } label: {
                                Label(container.name, systemImage: "shippingbox")
                            }
                        }
                    }
                }

                Section("Locations") {
                    Button {
                        onMove()
                    } label: {
                        Label("Choose a location", systemImage: "house")
                    }
                }
            }
            .navigationTitle("Move \(item.name)")
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}
