import AppCore
import Foundation

/// Resolves a URL opened through the app's `pops` URL scheme against
/// ``EntityRouter``, the same seam the QR scanner resolves a scanned code
/// through — a label opens the same destination whichever path found it.
///
/// A URL that is not a well-formed `pops://<pillar>/<type>/<id>` reference is
/// silently ignored rather than routed as a hand-off: it never parsed as a
/// `PopsURI` at all, so there is no pillar to hand off to. That case returns
/// `nil` rather than ``EntityRouteOutcome/handled``, which would claim a
/// screen changed when none did.
///
/// The outcome is returned rather than discarded so the caller can surface
/// ``EntityRouteOutcome/unsupported(pillar:)`` to whoever opened the link —
/// a code this build cannot show should say so, not silently do nothing.
@MainActor
internal func handleOpenPopsURL(_ url: URL, router: EntityRouter) -> EntityRouteOutcome? {
    guard let uri = parsePopsURI(url.absoluteString) else { return nil }
    return router.route(uri)
}

/// Resolves code links through the paired Inventory store before routing the
/// item. Other URLs retain the ordinary cross-pillar routing path.
@MainActor
internal func handleOpenPopsURL(
    _ url: URL, router: EntityRouter, inventory: any InventoryStore
) async -> EntityRouteOutcome? {
    guard url.scheme == "pops-i" else { return handleOpenPopsURL(url, router: router) }
    guard let uri = await resolveInventoryCodeURI(url.absoluteString, store: inventory) else {
        return nil
    }
    return router.route(uri)
}

/// The result of opening a URL, including failures the shell must present.
internal enum PopsURLOpenOutcome: Equatable {
    case ignored
    case routed(EntityRouteOutcome)
    case failed(PopsError)
}

/// Restores pairing before resolving code links. A missing pairing or failed
/// restoration becomes a user-safe failure; legacy links bypass restoration.
@MainActor
internal func openPopsURL(
    _ url: URL, router: any EntityRouter,
    restoreInventory: @MainActor () async throws -> (any InventoryStore)?
) async -> PopsURLOpenOutcome {
    guard url.scheme == "pops-i" else {
        return handleOpenPopsURL(url, router: router).map(PopsURLOpenOutcome.routed) ?? .ignored
    }
    guard parseInventoryCodeURI(url.absoluteString) != nil else { return .ignored }
    do {
        guard let inventory = try await restoreInventory() else {
            return .failed(
                PopsError(
                    code: "ios.inventory.link.pairing-required",
                    message: RootCopy.inventoryLinkPairingRequired,
                    requestID: UUID().uuidString, retryable: false, kind: .client))
        }
        guard let outcome = await handleOpenPopsURL(url, router: router, inventory: inventory)
        else {
            return .failed(
                PopsError(
                    code: "ios.inventory.link.not-found", message: RootCopy.inventoryLinkNotFound,
                    requestID: UUID().uuidString, retryable: false, kind: .client))
        }
        return .routed(outcome)
    } catch {
        return .failed(
            PopsError(
                code: "ios.inventory.link.restore-failed",
                message: RootCopy.inventoryLinkRestoreFailed,
                requestID: UUID().uuidString, retryable: true, kind: .client))
    }
}
