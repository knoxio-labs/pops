import DesignSystem
import SwiftUI

/// What Store here's scanner did with the one item a code named.
internal enum InventoryStoreScanOutcome: Equatable {
    case stored
    case alreadyHere
    /// The target itself, a container the target sits inside, or an item that
    /// is no longer active.
    case refused
}

/// Where Store here's scanner is. The camera keeps running through every
/// phase but ``denied``: an answer stays up until the next code replaces it.
internal enum InventoryStoreScanPhase: Equatable {
    case scanning
    case loading
    case answered(InventorySearchRecord, InventoryStoreScanOutcome)
    /// A barcode several storable items carry: one is picked, not guessed.
    case matches([InventorySearchRecord])
    case notAnItem
    case notPops
    case notFound
    case failed
    case denied
}

/// Store here by scanning: the shared scanner's camera, reticle and cards,
/// with every matched item stored as it is read and the camera left open for
/// the next one.
internal struct InventoryStoreScanView: View {
    internal let targetName: String
    internal var phase: InventoryStoreScanPhase = .scanning
    @Environment(\.dismiss) private var dismiss
    @State private var torchOn = false

    internal var body: some View {
        ZStack {
            if phase == .denied {
                Color.popsBackground.ignoresSafeArea()
                InventoryScanDenied()
            } else {
                InventoryScanViewfinder()
                VStack(spacing: PopsSpacing.xl) {
                    InventoryScanReticle(found: isStored)
                    card.padding(.horizontal, PopsSpacing.lg)
                }
            }
        }
        .safeAreaInset(edge: .top) { controls }
        .tint(.popsInventory)
    }

    private var isStored: Bool {
        if case .answered(_, .stored) = phase { return true }
        return false
    }

    private var controls: some View {
        PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                InventoryScanControl(symbol: "xmark", label: "Close") { dismiss() }
                Spacer(minLength: PopsSpacing.sm)
                if phase != .denied {
                    InventoryScanControl(
                        symbol: torchOn ? "flashlight.on.fill" : InventorySymbol.torch.system,
                        label: "Torch", isOn: torchOn
                    ) { torchOn.toggle() }
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.top, PopsSpacing.lg)
    }

    @ViewBuilder private var card: some View {
        switch phase {
        case .denied:
            EmptyView()
        case .scanning:
            line(InventorySymbol.storeHere, "Scan to store in \(targetName)")
        case .loading:
            InventoryScanCard.loading
        case .answered(let record, let outcome):
            InventoryStoreScanAnswerCard(record: record, outcome: outcome, targetName: targetName)
        case .matches(let records):
            InventoryStoreScanMatchesCard(records: records)
        case .notAnItem:
            line(InventorySymbol.unavailable, "Not an item")
        case .notPops:
            line(InventorySymbol.unavailable, "Not a POPS code")
        case .notFound:
            line(InventorySymbol.lost, "No item has this code")
        case .failed:
            line(InventorySymbol.unavailable, "That change did not save")
        }
    }

    private func line(_ symbol: InventorySymbol, _ text: String) -> some View {
        InventoryScanCard.line(symbol.system, text, nil)
    }
}

/// The one item a code named, and what became of it.
private struct InventoryStoreScanAnswerCard: View {
    let record: InventorySearchRecord
    let outcome: InventoryStoreScanOutcome
    let targetName: String

    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(
                photo: record.photo, symbol: record.item.symbol.system,
                showsKindBadge: record.kind == .container)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(record.item.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(caption)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            if outcome == .stored {
                Image(systemName: "checkmark.circle.fill")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsInventory)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .inventoryScanCard()
    }

    private var caption: String {
        switch outcome {
        case .stored: "Stored in \(targetName)"
        case .alreadyHere: "Already in \(targetName)"
        case .refused: "Can't be stored in \(targetName)"
        }
    }
}

/// Every storable item carrying a scanned barcode; tapping one stores it.
private struct InventoryStoreScanMatchesCard: View {
    let records: [InventorySearchRecord]

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text("\(records.count) items have this code")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            VStack(spacing: PopsSpacing.zero) {
                ForEach(records) { record in
                    Button {
                    } label: {
                        InventoryRecordRowLabel(record: record, showsChevron: false)
                    }
                    .buttonStyle(.plain)
                    if record.id != records.last?.id {
                        PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
        .inventoryScanCard()
    }
}
