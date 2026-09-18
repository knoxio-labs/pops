import DesignSystem
import SwiftUI

/// The three things that stop every change from syncing, and so are the only
/// ones allowed to interrupt.
internal enum InventorySyncInterruption: String, Identifiable {
    case sessionExpired
    case storageFull
    case appTooOld

    internal var id: String { rawValue }

    internal var line: String {
        switch self {
        case .sessionExpired: "Session expired"
        case .storageFull: "Storage full"
        case .appTooOld: "This app is too old"
        }
    }

    internal var action: String {
        switch self {
        case .sessionExpired: "Sign in"
        case .storageFull: "Free up space"
        case .appTooOld: "Update"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .sessionExpired: .signIn
        case .storageFull: .storage
        case .appTooOld: .appUpdate
        }
    }

    /// Storage full is an alert that can be put off: reading still works.
    /// The other two block until acted on.
    internal var blocks: Bool { self != .storageFull }
}

/// The app with an interruption over it: a blocking sheet for what stops
/// everything, a system alert for storage.
internal struct InventorySyncInterruptionStage: View {
    internal let interruption: InventorySyncInterruption
    @State private var sheet: InventorySyncInterruption?
    @State private var alerting: Bool

    internal init(interruption: InventorySyncInterruption) {
        self.interruption = interruption
        _sheet = State(initialValue: interruption.blocks ? interruption : nil)
        _alerting = State(initialValue: !interruption.blocks)
    }

    internal var body: some View {
        InventoryShellView(fixture: InventoryFixtures.packing)
            .sheet(item: $sheet) { InventoryBlockingSheet(interruption: $0) }
            .alert(interruption.line, isPresented: $alerting) {
                Button(interruption.action) {}
                Button("Not now", role: .cancel) {}
            }
    }
}

/// One line and the one way on, which cannot be swiped away.
internal struct InventoryBlockingSheet: View {
    internal let interruption: InventorySyncInterruption

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            interruption.symbol.image
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsInventory)
                .accessibilityHidden(true)
            Text(interruption.line)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
            } label: {
                Text(interruption.action)
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .playgroundProminentGlassButton()
        }
        .padding(PopsSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .tint(.popsInventory)
        .presentationDetents([.medium])
        .interactiveDismissDisabled()
    }
}
