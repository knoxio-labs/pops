import DesignSystem
import SwiftUI

/// What the undo capsule offers to reverse: the one line it says, and the
/// glyph of the action it would reverse.
internal struct InventoryUndoOffer: Identifiable, Equatable {
    internal let id: String
    internal let message: String
    internal let symbol: InventorySymbol

    internal init(message: String, symbol: InventorySymbol, id: String = UUID().uuidString) {
        self.id = id
        self.message = message
        self.symbol = symbol
    }
}

/// The glass capsule an action leaves behind instead of asking first: what
/// just happened, and Undo.
internal struct InventoryUndoCapsule: View {
    internal let offer: InventoryUndoOffer
    internal let onUndo: () -> Void

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            offer.symbol.image
                .font(.popsSubheadline.weight(.semibold))
                .foregroundStyle(Color.popsInventory)
                .accessibilityHidden(true)
            Text(offer.message)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: PopsSpacing.sm)
            Button("Undo", action: onUndo)
                .font(.popsSubheadline.weight(.semibold))
                .foregroundStyle(Color.popsInventory)
                .frame(minHeight: PopsSize.touchTarget)
        }
        .padding(.leading, PopsSpacing.lg)
        .padding(.trailing, PopsSpacing.md)
        .playgroundGlass(in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: "Undo", onUndo)
    }
}

extension View {
    /// Floats `offer` over the bottom edge until Undo is tapped, another
    /// offer replaces it, or it times out. `lingers` keeps it up, for a
    /// staged state a reviewer has to be able to look at.
    internal func inventoryUndoCapsule(
        _ offer: Binding<InventoryUndoOffer?>,
        lingers: Bool = false,
        onUndo: @escaping (InventoryUndoOffer) -> Void
    ) -> some View {
        modifier(InventoryUndoCapsuleModifier(offer: offer, lingers: lingers, onUndo: onUndo))
    }
}

private struct InventoryUndoCapsuleModifier: ViewModifier {
    @Binding var offer: InventoryUndoOffer?
    let lingers: Bool
    let onUndo: (InventoryUndoOffer) -> Void

    private static let window = Duration.seconds(6)

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let offer {
                    InventoryUndoCapsule(offer: offer) {
                        onUndo(offer)
                        self.offer = nil
                    }
                    .padding(.horizontal, PopsSpacing.lg)
                    .padding(.bottom, PopsSpacing.sm)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .id(offer.id)
                }
            }
            .inventoryMotion(value: offer?.id)
            .task(id: offer?.id) {
                guard let shown = offer?.id, !lingers else { return }
                try? await Task.sleep(for: Self.window)
                if offer?.id == shown { offer = nil }
            }
    }
}
