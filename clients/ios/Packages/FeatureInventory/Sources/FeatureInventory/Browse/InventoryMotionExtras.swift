import SwiftUI

extension InventoryMotion {
    internal static let smooth = Animation.smooth(duration: 0.3)

    /// A mark turning over to show what replaces it, as a selection mark does.
    internal static var flip: AnyTransition {
        .asymmetric(
            insertion: .modifier(
                active: InventoryFlip(degrees: -90), identity: InventoryFlip(degrees: 0)),
            removal: .modifier(
                active: InventoryFlip(degrees: 90), identity: InventoryFlip(degrees: 0)))
    }
}

private struct InventoryFlip: ViewModifier {
    let degrees: Double

    func body(content: Content) -> some View {
        content
            .rotation3DEffect(.degrees(degrees), axis: (x: 0, y: 1, z: 0))
            .opacity(degrees == 0 ? 1 : 0)
    }
}

extension View {
    /// Fades the view in the first time it appears, and shows it at once
    /// under Reduce Motion.
    internal func inventoryFadeIn() -> some View {
        modifier(InventoryFadeInModifier())
    }
}

private struct InventoryFadeInModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .onAppear {
                guard !shown else { return }
                withAnimation(reduceMotion ? nil : InventoryMotion.smooth) { shown = true }
            }
    }
}
