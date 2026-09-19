import SwiftUI

/// The springs the Inventory screens move with. Short on purpose: a change a
/// person caused should settle before they look for the next thing to do.
internal enum InventoryMotion {
    internal static let snappy = Animation.snappy(duration: 0.25)
    internal static let smooth = Animation.smooth(duration: 0.3)

    /// A row leaving or joining a list.
    internal static var row: AnyTransition { .opacity.combined(with: .scale(scale: 0.96)) }
}

extension View {
    /// Animates whatever changes when `value` does, and nothing under Reduce
    /// Motion.
    internal func inventoryMotion<Value: Equatable>(
        _ animation: Animation = InventoryMotion.snappy, value: Value
    ) -> some View {
        modifier(InventoryMotionModifier(animation: animation, value: value))
    }
}

private struct InventoryMotionModifier<Value: Equatable>: ViewModifier {
    let animation: Animation
    let value: Value
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}
