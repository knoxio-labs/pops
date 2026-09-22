import SwiftUI

extension View {
    /// Applies Liquid Glass on iOS and regular material on the host test platform.
    @ViewBuilder
    public func popsGlass(in shape: some Shape) -> some View {
        #if os(iOS)
            glassEffect(.regular, in: shape)
        #else
            background(.regularMaterial, in: shape)
        #endif
    }

    /// Applies the prominent Liquid Glass button style and its host-platform equivalent.
    @ViewBuilder
    public func popsProminentGlassButton() -> some View {
        #if os(iOS)
            buttonStyle(.glassProminent)
        #else
            buttonStyle(.borderedProminent)
        #endif
    }
}

/// A group of nearby glass controls that merge into one visual family on iOS.
public struct PopsGlassGroup<Content: View>: View {
    private let spacing: CGFloat
    private let content: Content

    /// Creates a glass control group with the distance between its members.
    public init(spacing: CGFloat, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    public var body: some View {
        #if os(iOS)
            GlassEffectContainer(spacing: spacing) { content }
        #else
            content
        #endif
    }
}
