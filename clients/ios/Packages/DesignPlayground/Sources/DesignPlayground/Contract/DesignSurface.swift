import SwiftUI

/// A page: one screen of the app, in every condition worth looking at.
///
/// The unit a design review is about. It carries no data of its own and asks
/// for none — each of its states closes over a fixture, which is what lets the
/// whole playground run with the phone in flight mode.
public struct DesignSurface: Identifiable {
    public let id: SurfaceID
    public let title: String
    /// One line on what question this surface is meant to answer. Shown under
    /// the title in the browser, so a list of twenty surfaces stays readable.
    public let synopsis: String?
    /// The chrome this surface is designed for. A default, not a lock — the
    /// inspector overrides it.
    public let chrome: Chrome
    public let states: [DesignState]
    /// What shows behind this surface under ``Chrome/sheet``.
    ///
    /// Part of the surface rather than of the chrome because for a sheet it is
    /// part of the design: an account picker is a sheet specifically so the
    /// transaction being filed stays visible behind it, and reviewing it over
    /// a stand-in backdrop cannot answer whether that works. Surfaces that do
    /// not care get the stand-in.
    let backdrop: (@MainActor () -> AnyView)?

    public init(
        id: SurfaceID,
        title: String,
        synopsis: String? = nil,
        chrome: Chrome = .navigationLarge,
        states: [DesignState]
    ) {
        self.id = id
        self.title = title
        self.synopsis = synopsis
        self.chrome = chrome
        self.states = states
        self.backdrop = nil
    }

    public init<Backdrop: View>(
        id: SurfaceID,
        title: String,
        synopsis: String? = nil,
        chrome: Chrome = .navigationLarge,
        states: [DesignState],
        @ViewBuilder backdrop: @MainActor @escaping () -> Backdrop
    ) {
        self.id = id
        self.title = title
        self.synopsis = synopsis
        self.chrome = chrome
        self.states = states
        self.backdrop = { AnyView(backdrop()) }
    }

    /// The state to open on, and the one the browser's row previews.
    public var openingState: DesignState? { states.first }

    public func state(id: String) -> DesignState? {
        states.first { $0.id == id }
    }
}
