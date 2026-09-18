import AppCore
import DesignSystem
import SwiftUI

/// The three things that stop a change from syncing, per ADR-002's per-
/// replica state machine. Session expired and app too old block until acted
/// on; storage full is an alert, because reading still works while it is
/// outstanding.
private enum InventorySyncInterruptionCopy {
    internal static func line(_ reason: InventoryBlockReason) -> String {
        switch reason {
        case .sessionExpired: "Session expired"
        case .appTooOld: "This app is too old"
        }
    }

    internal static func action(_ reason: InventoryBlockReason) -> String {
        switch reason {
        case .sessionExpired: "Sign in"
        case .appTooOld: "Update"
        }
    }

    internal static func symbol(_ reason: InventoryBlockReason) -> InventorySymbol {
        switch reason {
        case .sessionExpired: .signIn
        case .appTooOld: .appUpdate
        }
    }
}

extension View {
    /// Presents the blocking sheet whenever `store.status()` reports the
    /// replica blocked, and the storage-full alert whenever `isFull` is set.
    /// Attached once, at the feature's root, rather than by each screen: an
    /// interruption is about the whole replica, not about whichever screen
    /// happens to be on top.
    internal func inventorySyncInterruptions(store: any InventoryStore) -> some View {
        modifier(InventorySyncInterruptionsModifier(store: store))
    }

    /// The alert Storage full shows: read still works, so this can be put
    /// off rather than blocking the screen underneath.
    internal func inventoryStorageFullAlert(isPresented: Binding<Bool>) -> some View {
        alert("Storage full", isPresented: isPresented) {
            Button("Free up space") {}
            Button("Not now", role: .cancel) {}
        } message: {
            Text("This phone is nearly out of storage, so that change was not saved.")
        }
    }
}

internal struct InventorySyncInterruptionsModifier: ViewModifier {
    let store: any InventoryStore
    @State private var reason: InventoryBlockReason?

    func body(content: Content) -> some View {
        content
            .task { await observe() }
            .sheet(item: $reason.identifiable) { reason in
                InventoryBlockingSheet(reason: reason)
            }
    }

    private func observe() async {
        for await status in store.status() {
            reason = Self.reason(for: status)
        }
    }

    /// What a status reports blocking on, if anything. A pure function of
    /// the status rather than inline in the loop, so a test can drive every
    /// `InventoryReplicaStatus` case without a running store.
    internal static func reason(for status: InventoryReplicaStatus) -> InventoryBlockReason? {
        guard case .blocked(let reason) = status else { return nil }
        return reason
    }
}

extension Binding where Value == InventoryBlockReason? {
    /// `InventoryBlockReason` has no identity of its own; a sheet keyed on
    /// it needs one, and the reason itself is exactly that key (there is at
    /// most one interruption up at a time).
    fileprivate var identifiable: Binding<IdentifiedBlockReason?> {
        Binding<IdentifiedBlockReason?> {
            wrappedValue.map(IdentifiedBlockReason.init)
        } set: { newValue in
            wrappedValue = newValue?.reason
        }
    }
}

internal struct IdentifiedBlockReason: Identifiable {
    let reason: InventoryBlockReason
    var id: InventoryBlockReason { reason }
}

/// One line and the one way on, which cannot be swiped away: reading is
/// broken until it is acted on, so leaving it up with nothing changed would
/// be a worse state than showing it.
internal struct InventoryBlockingSheet: View {
    internal let reason: IdentifiedBlockReason

    internal init(reason: IdentifiedBlockReason) {
        self.reason = reason
    }

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            InventorySyncInterruptionCopy.symbol(reason.reason).image
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsInventory)
                .accessibilityHidden(true)
            Text(InventorySyncInterruptionCopy.line(reason.reason))
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
            } label: {
                Text(InventorySyncInterruptionCopy.action(reason.reason))
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .inventoryProminentGlassButton()
        }
        .padding(PopsSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .tint(.popsInventory)
        .presentationDetents([.medium])
        .interactiveDismissDisabled()
    }
}
