import SwiftUI

extension View {
    /// Liquid Glass where the platform has it, and the nearest material where
    /// it does not.
    ///
    /// This file holds every platform conditional in the package, and holds
    /// them alone. The package builds for macOS as well as iOS so `swift build`
    /// and `swift test` run without Xcode or a simulator, and three of the
    /// APIs the playground is built on — `glassEffect`, the navigation title
    /// display mode, and `fullScreenCover` — do not exist there. Collected
    /// here, every other file reads as if they did.
    ///
    /// The playground uses real glass for its own chrome rather than drawing a
    /// flat panel, and that is not vanity. The inspector sits over the surface
    /// being reviewed; if it were opaque it would be the one element on screen
    /// lying about what the platform does, in the tool built to stop exactly
    /// that.
    @ViewBuilder
    func playgroundGlass(in shape: some Shape) -> some View {
        #if os(iOS)
            glassEffect(.regular, in: shape)
        #else
            background(.regularMaterial, in: shape)
        #endif
    }

    /// Sets the navigation title's display mode, which is an iOS-only
    /// modifier. Same shape, and the same reason, as `DesignSystem`'s
    /// keyboard-type helper.
    @ViewBuilder
    func playgroundTitleDisplay(large: Bool) -> some View {
        #if os(iOS)
            navigationBarTitleDisplayMode(large ? .large : .inline)
        #else
            self
        #endif
    }

    /// Presents a surface's stage: full-screen where the platform has that,
    /// and a sheet where it does not. The stage wants the whole device — see
    /// ``StageView`` for why it is presented rather than pushed.
    @ViewBuilder
    func playgroundStage<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        #if os(iOS)
            fullScreenCover(item: item, content: content)
        #else
            sheet(item: item, content: content)
        #endif
    }
}
