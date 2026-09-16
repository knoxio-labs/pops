import SwiftUI

/// The five questions POPS-3988 leaves open, as the knobs a screen turns.
///
/// Same contract as ``InventoryFoundationStyle``: each experiment varies one
/// field and holds the rest at the defaults below, so "fixed" always means a
/// value written down here rather than an unstated choice. None of these
/// reopens a decided question, how loud each sync tier is, and whether queued
/// work carries a mark at all, were settled on 2026-09-16 and live in
/// ``InventorySync`` and ``InventoryFoundationStyle/SyncVisibility``.
internal struct InventorySyncStyle: Equatable {
    /// Where global sync state reaches a person who is not on the dashboard.
    ///
    /// The dashboard's capsule is POPS-3981's decided work and is not in
    /// question. What is, is whether a catalogue list repeats it, replaces it
    /// with a banner, files it as an activity row, or says nothing and leaves
    /// the whole subject to the Sync and repair screen.
    internal enum GlobalStatus: Equatable {
        case banner
        case capsule
        case activityRow
        case destinationOnly
    }

    /// Whether a repair is offered where the item is, or only where repairs
    /// are collected.
    internal enum RepairPlacement: Equatable {
        case inline
        case inbox
        case both
    }

    /// How two values that cannot both be true are put to a person.
    internal enum ConflictTreatment: Equatable {
        case sideBySide
        case stacked
        case fieldMerge
        case editFinal
    }

    /// What is allowed to put itself in front of somebody mid-task.
    internal enum Interruption: Equatable {
        case never
        case queueStoppingOnly
        case anyRepair

        internal func interrupts(_ conflict: InventoryConflict) -> Bool {
            switch self {
            case .never: false
            case .queueStoppingOnly: conflict.kind.stopsTheQueue
            case .anyRepair: true
            }
        }
    }

    /// How the age of a local copy is disclosed where somebody is about to act
    /// on it: a search hit, a scanned label.
    internal enum StaleDisclosure: Equatable {
        case ageOnRow
        case bannerOverResults
        case glyphOnly
    }

    internal var globalStatus: GlobalStatus = .capsule
    internal var repairPlacement: RepairPlacement = .inbox
    internal var conflictTreatment: ConflictTreatment = .sideBySide
    internal var interruption: Interruption = .queueStoppingOnly
    internal var staleDisclosure: StaleDisclosure = .ageOnRow
}

extension EnvironmentValues {
    @Entry internal var inventorySyncStyle = InventorySyncStyle()
}
