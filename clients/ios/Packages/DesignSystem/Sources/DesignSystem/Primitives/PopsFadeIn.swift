import SwiftUI

extension View {
    /// Fades the view in the first time it appears, and shows it at once
    /// under Reduce Motion.
    public func popsFadeIn() -> some View {
        modifier(PopsFadeInModifier())
    }
}

private struct PopsFadeInModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .onAppear {
                guard !shown else { return }
                withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { shown = true }
            }
    }
}
