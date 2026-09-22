import AppCore
import DesignSystem
import SwiftUI

/// The shared POPS scanner, reachable from the Inventory dashboard
/// (POPS-4078): the camera full-bleed, glass controls over it, a reticle,
/// and a card that rises with whatever the code resolved to. Every state is
/// the design playground's `InventoryScanView`, drawn against a real camera
/// and a real lookup instead of fixtures.
internal struct InventoryScanScreen: View {
    internal let store: any InventoryStore
    internal let entityRouter: any EntityRouter

    @State private var model: InventoryScanViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var torchOn = false
    @State private var torchAvailable = false
    @State private var shown = false
    @State private var pickingLibraryPhoto = false

    internal init(store: any InventoryStore, entityRouter: any EntityRouter) {
        self.store = store
        self.entityRouter = entityRouter
        _model = State(
            wrappedValue: InventoryScanViewModel(store: store, router: entityRouter))
    }

    internal var body: some View {
        ZStack {
            if model.phase == .denied {
                Color.popsBackground.ignoresSafeArea()
                denied
            } else {
                viewfinder
                VStack(spacing: PopsSpacing.xl) {
                    InventoryScanReticle(found: isFound)
                    if shown {
                        card
                            .padding(.horizontal, PopsSpacing.lg)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
        }
        .safeAreaInset(edge: .top) { controls }
        .popsMotion(PopsMotion.smooth, value: model.phase)
        .task { await model.start() }
        .onAppear { shown = true }
        .onChange(of: model.didRouteElsewhere) { _, routed in
            if routed { dismiss() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshCameraAccess() }
        }
        .inventoryPhotoPickerSheet(
            source: Binding(
                get: { pickingLibraryPhoto ? .library : nil },
                set: { pickingLibraryPhoto = $0 != nil })
        ) { data in
            #if canImport(UIKit)
                if let payload = InventoryScanLibraryDecoding.decode(data) {
                    _ = model.didScan(payload)
                }
            #endif
        }
        .tint(.popsInventory)
        .inventoryHidesNavigationBar()
    }

    private var isFound: Bool {
        if case .found = model.phase { return true }
        return false
    }

    @ViewBuilder private var viewfinder: some View {
        #if canImport(UIKit)
            InventoryScanCameraView(
                onScan: { model.didScan($0) }, torchOn: torchOn,
                onTorchAvailabilityChange: { torchAvailable = $0 }
            )
            .ignoresSafeArea()
            .accessibilityHidden(true)
        #else
            // No camera to preview on the host toolchain; nothing shipped ever
            // reaches this branch — see `InventoryScanCameraView.swift`.
            Color.popsBackground.ignoresSafeArea()
        #endif
    }

    private var controls: some View {
        InventoryGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                InventoryScanControl(symbol: "xmark", label: "Close") { dismiss() }
                Spacer(minLength: PopsSpacing.sm)
                if model.phase != .denied {
                    if torchAvailable {
                        InventoryScanControl(
                            symbol: torchOn ? "flashlight.on.fill" : InventorySymbol.torch.system,
                            label: "Torch", isOn: torchOn
                        ) { torchOn.toggle() }
                    }
                    InventoryScanControl(
                        symbol: InventorySymbol.library.system, label: "Photo library"
                    ) { pickingLibraryPhoto = true }
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private var denied: some View {
        VStack(spacing: PopsSpacing.lg) {
            InventoryScanCentredLine(text: InventoryCopy.cameraAccessOff)
            Button("Settings") { openSettings() }
                .inventoryProminentGlassButton()
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private func openSettings() {
        #if canImport(UIKit)
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        #endif
    }

    @ViewBuilder private var card: some View {
        switch model.phase {
        case .scanning, .denied:
            EmptyView()
        case .loading:
            InventoryScanLoadingCard()
        case .found(let record):
            InventoryScanFoundCard(record: record, loadPhoto: { await model.thumbnail($0) })
        case .unsupported(let pillar):
            InventoryScanLineCard(
                symbol: InventorySymbol.appUpdate.system,
                text: InventoryCopy.opensIn(pillar))
        case .notPops:
            InventoryScanLineCard(
                symbol: InventorySymbol.unavailable.system, text: InventoryCopy.notAPopsCode)
        case .targetMissing:
            InventoryScanLineCard(
                symbol: InventorySymbol.lost.system, text: InventoryCopy.noLongerInInventory)
        }
    }
}

/// One line under the reticle when the camera is off: a sentence with
/// nothing to look at behind it.
private struct InventoryScanCentredLine: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsForeground)
            .multilineTextAlignment(.center)
    }
}

/// The skeleton while a code's lookup is in flight.
private struct InventoryScanLoadingCard: View {
    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .fill(Color.popsSurface)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .fill(Color.popsSurface)
                .frame(height: PopsSize.touchTarget * 0.4)
        }
        .popsShimmer()
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsBackground.opacity(0.6), in: InventoryScanCard.shape)
        .inventoryGlass(in: InventoryScanCard.shape)
    }
}

/// What a scanned code resolved to, with the one action the design offers:
/// open it, pushed onto this same navigation stack.
private struct InventoryScanFoundCard: View {
    let record: InventoryRecord
    let loadPhoto: @MainActor (String) async -> Data?

    var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            InventorySearchHitRow(hit: .record(record), loadPhoto: loadPhoto)
            NavigationLink(
                value: InventoryRoute.record(id: record.id, isContainer: record.isContainer)
            ) {
                Text("Open")
            }
            .inventoryProminentGlassButton()
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsBackground.opacity(0.6), in: InventoryScanCard.shape)
        .inventoryGlass(in: InventoryScanCard.shape)
    }
}

/// A one-line answer with no action to take: a hand-off, a bad code, or a
/// code with nothing behind it.
private struct InventoryScanLineCard: View {
    let symbol: String
    let text: String

    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
            Text(text)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: PopsSpacing.sm)
        }
        .frame(minHeight: PopsSize.touchTarget)
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsBackground.opacity(0.6), in: InventoryScanCard.shape)
        .inventoryGlass(in: InventoryScanCard.shape)
    }
}

private enum InventoryScanCard {
    static var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card * 2, style: .continuous)
    }
}
