import AppCore
import SwiftUI

/// Asks the server for a free inventory code (`POST /codes/suggest`).
///
/// A closure rather than a method on `InventoryStore`, because the store's
/// protocol carries no suggestion call and the replica never answers one: a
/// suggestion is only ever the server's. `unbound` is what the form gets
/// until the composition root hands it a transport-backed one, and it
/// answers as a server that cannot suggest right now, which the form shows
/// as the approved unavailable state rather than as an error.
internal struct InventoryCodeSuggester: Sendable {
    internal let suggest:
        @Sendable (_ name: String, _ typeKey: String?, _ stem: String?) async throws -> [String]

    internal init(
        suggest: @escaping @Sendable (String, String?, String?) async throws -> [String]
    ) {
        self.suggest = suggest
    }

    internal static let unbound = InventoryCodeSuggester { _, _, _ in
        throw InventorySyncTransportError.suggestionsUnavailable
    }
}

/// Where a placement picker was asked to put something, and where it chose.
internal struct InventoryPlacementChoice: Hashable, Sendable {
    internal let placement: InventoryPlacement
    /// What the destination row says; nil for in hand.
    internal let name: String?
}

/// What the form hands the shared destination picker: the item being placed,
/// where it is now, and what to do with the answer.
internal struct InventoryPlacementPickerRequest {
    internal let itemId: InventoryItem.ID
    internal let itemName: String
    internal let current: InventoryPlacement
    internal let choose: @MainActor (InventoryPlacementChoice) -> Void
    internal let cancel: @MainActor () -> Void
}

/// The shared destination picker, as the form reaches it.
///
/// The picker belongs to the containers and locations screens (POPS-4064),
/// which install one through `inventoryPlacementPicker` in the environment.
/// Until one is installed the destination row shows where the item will go
/// without offering to change it: a create then lands where it was opened
/// from, or in hand.
internal struct InventoryPlacementPicker: Sendable {
    internal let makeView: @MainActor @Sendable (InventoryPlacementPickerRequest) -> AnyView

    internal init(
        makeView: @escaping @MainActor @Sendable (InventoryPlacementPickerRequest) -> AnyView
    ) {
        self.makeView = makeView
    }
}

/// Which form to open: a new item, optionally somewhere already, or an
/// existing item to edit.
internal enum InventoryItemFormRequest: Identifiable, Hashable, Sendable {
    /// `placement` pre-fills where the item goes: the container or location
    /// the form was opened from. Nil opens it in hand.
    case create(placement: InventoryPlacement?)
    case edit(InventoryItem.ID)

    internal var id: String {
        switch self {
        case .create(let placement): "create-\(String(describing: placement))"
        case .edit(let itemId): "edit-\(itemId)"
        }
    }
}

/// Opens the item form from anywhere in the Inventory stack.
internal struct InventoryItemFormPresenter: Sendable {
    internal let present: @MainActor @Sendable (InventoryItemFormRequest) -> Void

    @MainActor
    internal func callAsFunction(_ request: InventoryItemFormRequest) {
        present(request)
    }
}

extension EnvironmentValues {
    /// The shared destination picker, when the screen that owns it has
    /// installed one.
    @Entry internal var inventoryPlacementPicker: InventoryPlacementPicker?
    /// Opens the item form, when the Inventory flow has installed its sheet.
    @Entry internal var inventoryItemForm: InventoryItemFormPresenter?
}
