import SwiftUI

/// The springs shared by feature screens. Short on purpose: a change a
/// person caused should settle before they look for the next thing to do.
public enum PopsMotion {
    /// Disables animation when the person requests reduced motion.
    public static func animation(_ animation: Animation, reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : animation
    }

    /// A short spring for direct interactions.
    public static let snappy = Animation.snappy(duration: 0.25)
    /// A softer spring for content changes.
    public static let smooth = Animation.smooth(duration: 0.3)

    /// A row leaving or joining a list.
    public static var row: AnyTransition { .opacity.combined(with: .scale(scale: 0.96)) }

    /// A mark turning over to show what replaces it, as a selection mark does.
    public static var flip: AnyTransition {
        .asymmetric(
            insertion: .modifier(
                active: PopsFlip(degrees: -90), identity: PopsFlip(degrees: 0)),
            removal: .modifier(
                active: PopsFlip(degrees: 90), identity: PopsFlip(degrees: 0)))
    }
}

private struct PopsFlip: ViewModifier {
    let degrees: Double

    func body(content: Content) -> some View {
        content
            .rotation3DEffect(.degrees(degrees), axis: (x: 0, y: 1, z: 0))
            .opacity(degrees == 0 ? 1 : 0)
    }
}

extension View {
    /// Animates whatever changes when `value` does, and nothing under Reduce
    /// Motion.
    public func popsMotion<Value: Equatable>(
        _ animation: Animation = PopsMotion.snappy, value: Value
    ) -> some View {
        modifier(PopsMotionModifier(animation: animation, value: value))
    }
}

private struct PopsMotionModifier<Value: Equatable>: ViewModifier {
    let animation: Animation
    let value: Value
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(PopsMotion.animation(animation, reduceMotion: reduceMotion), value: value)
    }
}
