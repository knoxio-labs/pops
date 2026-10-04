import AppCore
import DesignSystem
import SwiftUI

/// Store here by scanning: the scan screen's camera, reticle and cards, with
/// every matched item stored in the target as it is read. The camera stays
/// open for the next one until the sheet is closed.
internal struct InventoryStoreScanStep: View {
    @State private var model: InventoryStoreScanModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var torchOn = false
    @State private var torchAvailable = false

    internal init(model: InventoryStoreScanModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        ZStack {
            if model.phase == .denied {
                Color.popsBackground.ignoresSafeArea()
                InventoryScanDenied()
            } else {
                viewfinder
                VStack(spacing: PopsSpacing.xl) {
                    InventoryScanReticle(found: isStored)
                    card
                        .padding(.horizontal, PopsSpacing.lg)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .safeAreaInset(edge: .top) { controls }
        .popsMotion(PopsMotion.smooth, value: model.phase)
        .sensoryFeedback(.success, trigger: model.storedCount) { _, count in count > 0 }
        .task { await model.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshCameraAccess() }
        }
        .onDisappear { model.finish() }
        .inventoryHidesNavigationBar()
    }

    private var isStored: Bool {
        if case .answered(_, .stored) = model.phase { return true }
        return false
    }

    @ViewBuilder private var viewfinder: some View {
        #if canImport(UIKit)
            InventoryScanCameraView(
                onScan: {
                    model.didScan($0)
                    return false
                }, torchOn: torchOn,
                onTorchAvailabilityChange: { torchAvailable = $0 }
            )
            .ignoresSafeArea()
            .accessibilityHidden(true)
        #else
            Color.popsBackground.ignoresSafeArea()
        #endif
    }

    private var controls: some View {
        PopsGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                InventoryScanControl(symbol: "xmark", label: "Close") { dismiss() }
                Spacer(minLength: PopsSpacing.sm)
                if model.phase != .denied, torchAvailable {
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
        switch model.phase {
        case .denied:
            EmptyView()
        case .scanning:
            InventoryScanLineCard(
                symbol: InventorySymbol.storeHere.system,
                text: InventoryCopy.scanToStore(in: model.target.name))
        case .loading:
            InventoryScanLoadingCard()
        case .answered(let record, let outcome):
            InventoryStoreScanAnswerCard(
                record: record, outcome: outcome, targetName: model.target.name,
                loadPhoto: { await model.thumbnail($0) })
        case .matches(let records):
            InventoryScanMatchesCard(records: records) { record in
                Button {
                    model.pick(record)
                } label: {
                    InventoryRecordRowLabel(
                        record: record, showsChevron: false,
                        loadPhoto: { await model.thumbnail($0) })
                }
                .buttonStyle(.plain)
            }
        case .notAnItem:
            line(.unavailable, InventoryCopy.notAnItem)
        case .notPops:
            line(.unavailable, InventoryCopy.notAPopsCode)
        case .notFound:
            line(.lost, InventoryCopy.noItemHasThisCode)
        case .failed:
            line(.unavailable, InventoryCopy.failureTitle)
        }
    }

    private func line(_ symbol: InventorySymbol, _ text: String) -> some View {
        InventoryScanLineCard(symbol: symbol.system, text: text)
    }
}

/// The one item a code named, and what became of it.
private struct InventoryStoreScanAnswerCard: View {
    let record: InventoryRecord
    let outcome: InventoryStoreScanOutcome
    let targetName: String
    let loadPhoto: @MainActor (String) async -> Data?

    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(
                photo: record.photo, symbol: .record(access: record.access),
                showsKindBadge: record.isContainer, load: loadPhoto)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(record.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(caption)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            if outcome == .stored {
                InventorySymbol.resolved.image
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
        case .stored: InventoryCopy.stored(in: targetName)
        case .alreadyHere: InventoryCopy.alreadyStored(in: targetName)
        case .refused: InventoryCopy.cannotStore(in: targetName)
        }
    }
}
