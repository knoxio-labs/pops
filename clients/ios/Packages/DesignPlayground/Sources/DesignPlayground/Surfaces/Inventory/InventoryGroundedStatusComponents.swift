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
