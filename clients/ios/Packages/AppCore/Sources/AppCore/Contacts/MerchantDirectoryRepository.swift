/// One `contacts` entity, as the merchant select draws it (POPS-3753) — an
/// id and a display name, nothing else the picker or a "you created this"
/// confirmation shows.
public struct MerchantDirectoryEntry: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// One of a merchant's recorded addresses (ADR-053) — an id and the printed
/// value, matching `MerchantDirectoryEntry`'s shape for the same reason: the
/// address picker draws exactly these two facts and nothing else `contacts`
/// records against an address.
public struct MerchantAddressEntry: Identifiable, Hashable, Sendable {
    public let id: String
    public let value: String

    public init(id: String, value: String) {
        self.id = id
        self.value = value
    }
}

/// Finding, naming and creating a merchant, and reading or adding one of its
/// addresses — as the review form's merchant and address pickers see it
/// (POPS-3753, ADR-053).
///
/// `search`/`get`/`create` mirror how the form uses them: the sheet searches
/// as the reader types, a draft that arrives already matched looks the
/// merchant up by id, and Create is a section of the same sheet rather than
/// a separate screen. `addresses(forMerchant:)`/`createAddress(forMerchant:value:)`
/// scope an address to the chosen merchant, matching `ReceiptDraft.setMerchant`
/// clearing the address the moment the merchant changes.
public protocol MerchantDirectoryRepository: Sendable {
    /// Merchants whose name or alias matches `query`. There are hundreds, so
    /// this is a server-side search, not a full list the phone filters —
    /// the caller passes free text and gets back candidates, not a page it
    /// has to further narrow.
    func search(_ query: String) async throws -> [MerchantDirectoryEntry]

    /// One merchant by id, or `nil` if `contacts` no longer has one under it.
    ///
    /// Optional rather than throwing, on the same reasoning
    /// ``ReceiptCaptureRepository`` gives a 404 its own outcome: a draft
    /// that arrived already matched naming an id `contacts` has since lost
    /// (a merge, a delete) is a fact the caller renders around, not a
    /// failure that stops the screen.
    func get(_ id: String) async throws -> MerchantDirectoryEntry?

    /// Record a new merchant named `name`, seeded from the reader's own
    /// wording and possibly edited before this call.
    func create(name: String) async throws -> MerchantDirectoryEntry

    /// Every address recorded against merchant `id`.
    func addresses(forMerchant id: String) async throws -> [MerchantAddressEntry]

    /// Record a new address for merchant `id`, typed by the reader.
    func createAddress(forMerchant id: String, value: String) async throws -> MerchantAddressEntry
}
