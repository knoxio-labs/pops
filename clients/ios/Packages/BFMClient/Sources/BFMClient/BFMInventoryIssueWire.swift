import AppCore

internal protocol WireInventoryIssue {
    var itemId: String { get }
    var itemName: String { get }
    var seq: Int { get }
    var code: String { get }
    var fieldId: String? { get }
    var fieldKey: String? { get }
    var message: String { get }
    var itemApplied: Bool { get }
    var retryable: Bool { get }
}

internal func inventorySyncIssue<Row: WireInventoryIssue>(from wire: Row) -> InventorySyncIssue {
    InventorySyncIssue(
        itemId: wire.itemId, itemName: wire.itemName, seq: wire.seq, code: wire.code,
        fieldId: wire.fieldId, fieldKey: wire.fieldKey, message: wire.message,
        itemApplied: wire.itemApplied, retryable: wire.retryable)
}

extension Operations.MobileInventory_snapshot.Output.Ok.Body.JsonPayload.IssuesPayloadPayload:
    WireInventoryIssue
{}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.IssuesPayloadPayload:
    WireInventoryIssue
{}

extension Operations.MobileInventory_item.Output.Ok.Body.JsonPayload.IssuesPayloadPayload:
    WireInventoryIssue
{}
