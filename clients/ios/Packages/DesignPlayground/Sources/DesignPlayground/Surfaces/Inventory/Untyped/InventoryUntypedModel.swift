/// A type as the phone meets it, once ADR-001 settled that a type ships in
/// code with an app update and is never authored here.
///
/// The only job left for the model is naming the type an update brings, so
/// the arrival screen can say what showed up and what it asks for.
internal struct InventoryItemType: Equatable {
    internal let name: String
    internal let fieldNames: [String]
    internal let arrivedIn: String
}
