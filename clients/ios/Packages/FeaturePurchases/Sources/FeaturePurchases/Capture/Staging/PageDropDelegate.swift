import SwiftUI
import UniformTypeIdentifiers

/// A drop target for a staged page, proposing a **move**.
///
/// `dropDestination(for:)` would be shorter and is what this replaced. It
/// proposes `.copy`, and UIKit draws a copy as a green plus badge riding the
/// item under your finger — which is wrong twice over: nothing is copied here,
/// the page leaves where it was, and the badge is the loudest thing on a
/// screen whose whole feedback story is meant to be the target lighting up.
///
/// A `.move` proposal draws no badge, which is what the home screen does when
/// one icon is held over another.
public struct PageDropDelegate: DropDelegate {
    private let onEntered: () -> Void
    private let onExited: () -> Void
    private let onDropped: ([String]) -> Void

    /// Creates a move target with callbacks for hover and dropped page identifiers.
    public init(
        onEntered: @escaping () -> Void,
        onExited: @escaping () -> Void,
        onDropped: @escaping ([String]) -> Void
    ) {
        self.onEntered = onEntered
        self.onExited = onExited
        self.onDropped = onDropped
    }

    /// Accepts the plain-text identifiers emitted by staged-page drags.
    public func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [.plainText])
    }

    /// Proposes a move so the drag does not display a misleading copy badge.
    public func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    /// Reports that the dragged page entered this target.
    public func dropEntered(info: DropInfo) {
        onEntered()
    }

    /// Reports that the dragged page exited this target.
    public func dropExited(info: DropInfo) {
        onExited()
    }

    /// Loads and forwards every dropped page identifier on the main actor.
    public func performDrop(info: DropInfo) -> Bool {
        let providers = info.itemProviders(for: [.plainText])
        guard !providers.isEmpty else { return false }
        for provider in providers {
            _ = provider.loadObject(ofClass: String.self) { value, _ in
                guard let value else { return }
                Task { @MainActor in onDropped([value]) }
            }
        }
        return true
    }
}
