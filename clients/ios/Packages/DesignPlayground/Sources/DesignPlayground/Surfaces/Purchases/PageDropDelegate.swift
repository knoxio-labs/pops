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
internal struct PageDropDelegate: DropDelegate {
    internal let onEntered: () -> Void
    internal let onExited: () -> Void
    internal let onDropped: ([String]) -> Void

    internal func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [.plainText])
    }

    internal func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    internal func dropEntered(info: DropInfo) {
        onEntered()
    }

    internal func dropExited(info: DropInfo) {
        onExited()
    }

    internal func performDrop(info: DropInfo) -> Bool {
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
