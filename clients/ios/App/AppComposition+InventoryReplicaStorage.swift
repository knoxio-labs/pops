import AppCore
import Foundation
import InventoryReplica
import os

extension AppComposition {
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
