import SwiftUI

/// Several pieces of glass that belong to one control.
///
/// iOS 26 renders glass elements that sit near each other as a family — they
/// pick up each other's edges and merge as they approach — but only inside a
/// container. A row of separate floating buttons without one is a row of
/// unrelated blobs, each drawing its own hard rim.
internal struct PlaygroundGlassGroup<Content: View>: View {
    let spacing: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        #if os(iOS)
            GlassEffectContainer(spacing: spacing) { content }
        #else
            content
        #endif
    }
}

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

    /// The inset-grouped list style, which is iOS-only — on the host
    /// toolchain the platform's own default stands in. Here for the reason
    /// stated above: this file holds the package's platform conditionals, and
    /// a second `#if os(iOS)` somewhere else is how two of them drift.
    @ViewBuilder
    func playgroundInsetGroupedList() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }

    /// The tab bar that shrinks to a capsule as content scrolls under it —
    /// iOS 26's own behaviour, and iOS-only. Without it the bar stays full
    /// height and the search capsule beside it never gets the room it expands
    /// into, so the arrangement being reviewed is not the one that ships.
    @ViewBuilder
    func playgroundMinimizingTabBar() -> some View {
        #if os(iOS)
            tabBarMinimizeBehavior(.onScrollDown)
        #else
            self
        #endif
    }

    /// `searchable` with an explicit presentation binding, so a staged state
    /// can pin the field open with a query already in it. The binding form is
    /// iOS-only.
    @ViewBuilder
    func playgroundSearchable(
        text: Binding<String>, isPresented: Binding<Bool>, prompt: String
    ) -> some View {
        #if os(iOS)
            searchable(text: text, isPresented: isPresented, prompt: prompt)
        #else
            searchable(text: text, prompt: prompt)
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
