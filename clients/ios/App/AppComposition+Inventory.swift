import AppCore
import BFMClient
import Foundation
import InventoryReplica
import os

/// Building and locating a paired device's Inventory replica, split out of
/// `AppComposition.swift` (POPS-4107) to keep the composition root's own
/// class body under the type-length bar `AppComposition` was already close
/// to; nothing here reads or writes anything this file was not handed.
extension AppComposition {
    /// The paired device's Inventory: a replica of its own on disk, where
    /// every change lands first and is sent to the BFM's relay when the
    /// network allows (`LocalFirstInventoryStore`).
    ///
    /// Opening the replica fails with `InventoryStorageError.full` when the
    /// phone has no room for it. Reading is still possible then, so the
    /// screens get `StorageFullInventoryStore`, whose every write raises
    /// the Storage full interruption, rather than a store that says
    /// Inventory is not available. Any other failure leaves nothing to read
    /// from, and the screens get the unbound store.
    ///
    /// - Parameter storageFull: Set when this falls back to
    ///   `StorageFullInventoryStore`, so ``inventoryStorageFull`` can
    ///   announce it the moment Inventory is entered rather than waiting
    ///   for a write nobody has made yet.
    internal func inventoryStore(
        for device: PairedDevice, transport: BFMInventoryTransport, storageFull: inout Bool
    ) -> any InventoryStore {
        synchronizeInventory = nil
        do {
            let store = LocalFirstInventoryStore(
                replica: try openInventoryReplica(device), transport: transport,
                reachability: networkReachability)
            synchronizeInventory = { await store.synchronize() }
            return store
        } catch InventoryStorageError.full {
            storageFull = true
            return StorageFullInventoryStore(transport: transport)
        } catch {
            return UnboundInventoryStore()
        }
    }

    /// Catches the paired device's Inventory up and sends what it holds,
    /// for when the app comes back to the foreground. Nothing while unpaired.
    internal func refreshInventory() async {
        await bound?.dependencies.inventory.refresh()
    }

    /// Syncs the paired device's Inventory the moment it is (or already was,
    /// at launch) paired, so a fresh replica does not sit empty until the
    /// phone is backgrounded, its dashboard is opened, or someone finds the
    /// Sync page's own Download action.
    ///
    /// Binds `device`'s dependencies first rather than reading ``bound``,
    /// which a pairing this fresh has not necessarily done yet: `ContentView`
    /// only binds them once the shell has a `FeatureSurface` to draw, and
    /// this runs from the moment a device is paired, ahead of that.
    internal func syncInventoryOnPairing(_ device: PairedDevice) async {
        await dependencies(for: device).inventory.syncNow()
    }

    /// Records that the app is in the foreground, which means the phone has
    /// been unlocked since it started (``FirstUnlockProbe``).
    internal func noteForeground() {
        try? firstUnlock.markUnlocked()
    }

    /// Asks for the next background refresh, for when the app leaves the
    /// foreground.
    internal func scheduleBackgroundRefresh() async {
        await backgroundRefresh.schedule()
    }

    /// One background refresh (``AppCore/BackgroundRefresh``): schedules the
    /// next, then, if the phone has been unlocked since it started, restores
    /// the paired device, reads Inventory's change feed and sends its log,
    /// within the refresh's budget. Nothing while unpaired.
    @discardableResult
    internal func refreshInventoryInBackground() async -> BackgroundRefreshOutcome {
        await backgroundRefresh.run { [self] in await synchronizeBoundInventory() }
    }

    private func synchronizeBoundInventory() async {
        await shell.restoreSession()
        guard case .paired(let device) = session.state else { return }
        let inventory = dependencies(for: device).inventory
        if let synchronizeInventory {
            await synchronizeInventory()
        } else {
            await inventory.refresh()
        }
    }

    /// The first-unlock marker under Application Support.
    nonisolated internal static func applicationSupportFirstUnlockProbe() -> FirstUnlockProbe {
        FirstUnlockProbe(
            directory: FileManager.default.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            ).first ?? FileManager.default.temporaryDirectory)
    }

    /// `Application Support/Inventory/<device>`: one replica per paired
    /// device, so a re-pair to another BFM never sends one server's queued
    /// changes to the other.
    nonisolated internal static func onDiskInventoryReplica(for device: PairedDevice) throws
        -> InventoryReplica
    {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
            create: true)
        return try InventoryReplica(
            onDiskAt: support.appendingPathComponent("Inventory", isDirectory: true)
                .appendingPathComponent(inventoryFolderName(for: device), isDirectory: true))
    }

    /// The device id, with anything but letters, digits, `-` and `_`
    /// replaced, so an id can never climb out of `Inventory/` or name a
    /// hidden folder.
    nonisolated internal static func inventoryFolderName(for device: PairedDevice) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let name = String(
            device.id.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
        return name.isEmpty ? "_" : name
    }

    /// What to prefill the pairing form's server field with.
    ///
    /// `nil` in Release, which is the normal state and not a failure: the base
    /// URL arrives with the pairing code. Debug bakes in a local default so
    /// simulator work does not have to pair against a real deployment first.
    internal var suggestedBaseURL: URL? { BuiltInBaseURL.current }

    /// Deletes a previously paired device's on-disk replica once its
    /// mutation log holds nothing unsent, and keeps (logging why) any that
    /// still does.
    ///
    /// A re-pair to a different BFM leaves the old device's folder behind —
    /// `onDiskInventoryReplica(for:)` never removes one, only ever adds
    /// another — and nothing in this build reads it again once the app is
    /// paired elsewhere. Deleting it unconditionally would be simpler, but
    /// wrong: a change queued for a server this phone can no longer reach is
    /// a change no other copy of it exists, so this only ever prunes a
    /// folder whose log is already empty of anything still owed to a server.
    ///
    /// - Parameter root: The `Inventory/` folder to scan. The real one under
    ///   Application Support by default; a test points it somewhere
    ///   disposable.
    nonisolated internal static func pruneStaleInventoryReplicas(
        keeping current: PairedDevice, root: URL? = nil
    ) {
        guard let inventoryRoot = root ?? applicationSupportInventoryRoot() else { return }
        let keep = inventoryFolderName(for: current)
        guard
            let siblings = try? FileManager.default.contentsOfDirectory(
                at: inventoryRoot, includingPropertiesForKeys: [.isDirectoryKey])
        else { return }

        for folder in siblings where folder.lastPathComponent != keep {
            guard
                (try? folder.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            else { continue }
            pruneReplica(at: folder)
        }
    }

    nonisolated private static func applicationSupportInventoryRoot() -> URL? {
        guard
            let support = try? FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
                create: true)
        else { return nil }
        return support.appendingPathComponent("Inventory", isDirectory: true)
    }

    /// Removes `folder` if the replica in it has nothing left to send, or
    /// keeps it and logs why. Opening it fails the same way any other read
    /// of a corrupt or already-full replica would; either way that reads as
    /// "keep", never as "delete a folder this could not actually inspect".
    nonisolated private static func pruneReplica(at folder: URL) {
        guard let replica = try? InventoryReplica(onDiskAt: folder),
            let outbound = try? replica.outboundMutations()
        else { return }
        guard outbound.isEmpty else {
            Self.replicaPruneLog.notice(
                "keeping \(folder.lastPathComponent, privacy: .private): \(outbound.count) mutation(s) still unsent"
            )
            return
        }
        try? FileManager.default.removeItem(at: folder)
    }

    nonisolated private static let replicaPruneLog = Logger(
        subsystem: "com.knoxiolabs.pops", category: "inventory-replica-prune")
}
