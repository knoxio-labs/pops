/// The result of looking up product facts for an Inventory barcode.
public enum InventoryBarcodeLookup: Hashable, Sendable {
    /// Product facts were found for the barcode.
    case found(InventoryBarcodeProduct)
    /// No product is known for the barcode.
    case notFound
    /// The lookup could not produce a reliable answer right now.
    case unavailable
}

/// Transport-independent product facts returned by a barcode lookup.
public struct InventoryBarcodeProduct: Hashable, Sendable {
    /// The product's primary display title.
    public let title: String
    /// A secondary title supplied by the catalogue provider.
    public let subtitle: String?
    /// People or organisations credited for the product.
    public let contributors: [InventoryBarcodeContributor]
    /// The product's publisher or manufacturer.
    public let publisher: String?
    /// The provider's published date text.
    public let publishedDate: String?
    /// The number of pages when the product has pages.
    public let pageCount: Int?
    /// The provider's language identifier.
    public let language: String?
    /// A provider-supplied description of the product.
    public let description: String?
    /// Subjects or categories associated with the product.
    public let subjects: [String]
    /// Additional provider facts keyed by their field name.
    public let attributes: [String: String]

    /// Creates product facts without retaining transport provenance or media.
    public init(
        title: String,
        subtitle: String? = nil,
        contributors: [InventoryBarcodeContributor] = [],
        publisher: String? = nil,
        publishedDate: String? = nil,
        pageCount: Int? = nil,
        language: String? = nil,
        description: String? = nil,
        subjects: [String] = [],
        attributes: [String: String] = [:]
    ) {
        self.title = title
        self.subtitle = subtitle
        self.contributors = contributors
        self.publisher = publisher
        self.publishedDate = publishedDate
        self.pageCount = pageCount
        self.language = language
        self.description = description
        self.subjects = subjects
        self.attributes = attributes
    }
}

/// One credited contributor returned with barcode product facts.
public struct InventoryBarcodeContributor: Hashable, Sendable {
    /// The contributor's display name.
    public let name: String
    /// The contributor's role when the provider distinguishes one.
    public let role: String?

    /// Creates a contributor with an optional provider-defined role.
    public init(name: String, role: String? = nil) {
        self.name = name
        self.role = role
    }
}

/// Looks up product facts for a scanned Inventory barcode.
public protocol InventoryBarcodeLookupService: Sendable {
    /// Returns facts, a definite absence, or temporary unavailability for a barcode.
    func lookUp(code: String) async throws -> InventoryBarcodeLookup
}
