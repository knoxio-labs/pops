import SwiftUI

/// One condition a surface can be looked at in — the default render, or
/// `empty`, `error`, `row-selected`.
///
/// A state is a *render thunk* rather than a stored view so that switching to
/// one builds it fresh: a surface that held its states as values would have
/// every one of them alive at once, and a state's whole purpose is to be the
/// only thing on screen.
///
/// Not `Sendable`, deliberately. The closure runs on the main actor and the
/// catalogue is only ever read from it; making the type sendable would mean
/// making `AnyView` sendable, which it is not and should not be.
public struct DesignState: Identifiable {
    public let id: String
    public let title: String
    let build: @MainActor () -> AnyView

    public init<Content: View>(
        _ id: String,
        _ title: String,
        @ViewBuilder content: @MainActor @escaping () -> Content
    ) {
        self.id = id
        self.title = title
        self.build = { AnyView(content()) }
    }

    /// The implicit state every surface has. Named rather than left to a
    /// convention so a surface with one state still reads as having chosen it.
    public static func standard<Content: View>(
        @ViewBuilder content: @MainActor @escaping () -> Content
    ) -> DesignState {
        DesignState("default", "Default", content: content)
    }
}
