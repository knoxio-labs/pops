import DesignSystem
import SwiftUI

/// Whether this phone can reach the server, and when it last did.
internal enum InventorySyncConnection: Equatable {
    case online(lastSynced: String)
    case offline(lastSynced: String)
    case syncing
    /// Fetching the catalogue's newer fields before a held change can move.
    case updatingFields

    fileprivate var symbol: InventorySymbol {
        switch self {
        case .online: .synced
        case .offline: .offline
        case .syncing: .queued
        case .updatingFields: .refreshFields
        }
    }
}

/// What the Sync page shows before, while and after it has a catalogue.
internal enum InventorySyncPhase: Equatable {
    case loaded
    case loading
    case firstLaunch
}

/// Pushed to show one repair from the Sync page.
internal struct InventoryRepairRoute: Hashable {
    internal let repair: InventoryRepair
}

/// Sync and repair: the counts, then what needs attention with each row's
/// one fix, then what is waiting to sync, then the last few resolved.
internal struct InventorySyncView: View {
    internal let connection: InventorySyncConnection
    internal let phase: InventorySyncPhase
    internal var registersDestinations = true
    @State private var ledger: InventorySyncLedger
    @State private var offer: InventoryUndoOffer?
    @State private var showsResolved: Bool

    internal init(
        connection: InventorySyncConnection = .online(lastSynced: "2 min ago"),
        ledger: InventorySyncLedger = InventorySyncLedger(),
        phase: InventorySyncPhase = .loaded,
        showsResolved: Bool = false,
        registersDestinations: Bool = true
    ) {
        self.connection = connection
        self.phase = phase
        self.registersDestinations = registersDestinations
        _ledger = State(initialValue: ledger)
        _showsResolved = State(initialValue: showsResolved)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryPageTitle(title: "Sync")
                    if phase == .loaded { status }
                }
                switch phase {
                case .loaded: loaded
                case .loading: InventorySyncSkeleton()
                case .firstLaunch: InventoryFirstLaunchPrompt()
                }
            }
            .inventoryMotion(value: ledger)
            .inventoryMotion(value: showsResolved)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollDisabled(phase != .loaded)
        .inventoryCollapsingTitle("Sync")
        .background(Color.popsBackground)
        .refreshable {}
        .tint(.popsInventory)
        .inventoryDestinations(registersDestinations)
        .navigationDestination(for: InventoryRepairRoute.self) { route in
            InventoryRepairView(repair: route.repair)
        }
        .inventoryUndoCapsule($offer) { ledger.undo($0) }
    }

    @ViewBuilder private var loaded: some View {
        InventoryCountTiles(tiles: tiles)
        if !ledger.repairs.isEmpty { needsAttention }
        if !ledger.waiting.isEmpty { waiting }
        if !ledger.resolved.isEmpty { resolved }
    }

    private var status: some View {
        Label {
            Text(statusLine)
                .foregroundStyle(Color.popsMutedForeground)
                .contentTransition(.numericText())
        } icon: {
            connection.symbol.image
                .foregroundStyle(Color.popsMutedForeground)
        }
        .font(.popsSubheadline)
        .accessibilityElement(children: .combine)
    }

    private var statusLine: String {
        switch connection {
        case .online(let lastSynced): "Synced \(lastSynced)"
        case .offline(let lastSynced): "Offline · synced \(lastSynced)"
        case .syncing: "Syncing \(ledger.waiting.count) changes"
        case .updatingFields: "Updating fields"
        }
    }

    private var tiles: [InventoryCountTile] {
        [
            InventoryCountTile(
                title: "Waiting", count: ledger.waiting.count, symbol: InventorySymbol.queued.system
            ),
            InventoryCountTile(
                title: "Needs attention", count: ledger.repairs.count,
                symbol: InventorySymbol.attention.system),
            InventoryCountTile(
                title: "Resolved today", count: ledger.resolvedToday,
                symbol: InventorySymbol.resolved.system),
        ]
    }

    private var needsAttention: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(
                title: "Needs attention", trailing: "\(ledger.repairs.count)")
            InventoryLocationPanel(rows: ledger.repairs) { repair in
                NavigationLink(value: InventoryRepairRoute(repair: repair)) {
                    InventoryRepairListRow(repair: repair) {
                        offer = ledger.resolve(repair.id)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity)
    }

    private var waiting: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryLocationSectionHeader(
                title: "Waiting to sync", trailing: "\(ledger.waiting.count)")
            InventoryLocationPanel(rows: ledger.waiting) { operation in
                InventoryWaitingRow(operation: operation)
            }
        }
    }

    private var resolved: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Button {
                showsResolved.toggle()
            } label: {
                HStack(spacing: PopsSpacing.sm) {
                    InventoryLocationSectionHeader(
                        title: "Resolved", trailing: "\(ledger.resolved.count)")
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .rotationEffect(.degrees(showsResolved ? 90 : 0))
                        .padding(.trailing, PopsSpacing.md)
                }
                .frame(minHeight: PopsSize.touchTarget)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityValue(showsResolved ? "Expanded" : "Collapsed")
            if showsResolved {
                InventoryLocationPanel(rows: Array(ledger.resolved.prefix(Self.resolvedShown))) {
                    InventoryResolvedRow(entry: $0)
                }
                .transition(.opacity)
            }
        }
    }

    private static let resolvedShown = 3
}

/// The Sync page before its ledger arrives.
private struct InventorySyncSkeleton: View {
    @ScaledMetric(relativeTo: .subheadline) private var line = PopsSpacing.lg

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                Capsule().fill(Color.popsSurface)
                    .frame(width: line * 8, height: line)
                InventoryCountTilesSkeleton(count: 3)
            }
            .popsShimmer()
            InventoryLocationListSkeleton(rows: 6)
        }
        .accessibilityLabel("Loading")
    }
}
