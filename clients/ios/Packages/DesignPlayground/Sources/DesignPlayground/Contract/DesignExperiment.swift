/// A question about one surface, and the competing answers to it.
///
/// The same shape the web playground uses, and for the same reason: two
/// designs argued about in the abstract is a conversation nobody wins, and two
/// designs side by side on the device is a decision somebody can make in a
/// minute.
///
/// At most one open experiment should sit on a surface. That is a convention
/// here rather than an invariant — `CatalogTests` checks it, because nothing
/// in the type system can.
public struct DesignExperiment: Identifiable {
    public enum Status: Equatable {
        /// Still a question.
        case open
        /// Somebody chose. Carries the winning variant's id and why.
        case decided(variant: String, rationale: String)
        /// Closed without a decision — the question stopped mattering, or the
        /// surface it was about is gone.
        case archived(reason: String)
    }

    public let id: String
    /// The question, written as a question. An experiment whose title is a
    /// noun phrase is a folder, not an experiment.
    public let question: String
    /// The surface it is about.
    public let subject: SurfaceID
    public let status: Status
    public let variants: [DesignVariant]

    public init(
        id: String,
        question: String,
        subject: SurfaceID,
        status: Status = .open,
        variants: [DesignVariant]
    ) {
        self.id = id
        self.question = question
        self.subject = subject
        self.status = status
        self.variants = variants
    }

    public var isOpen: Bool { status == .open }

    /// The winning variant, once there is one.
    public var chosen: DesignVariant? {
        guard case .decided(let variant, _) = status else { return nil }
        return variants.first { $0.id == variant }
    }
}

/// One answer to an experiment's question.
public struct DesignVariant: Identifiable {
    public let id: String
    public let title: String
    /// What this variant is arguing, in one line. Shown beside the switcher so
    /// the difference between two variants is stated rather than inferred.
    public let note: String?
    /// The surface as this variant would have it. A complete surface, not a
    /// patch: flipping a variant always shows a whole screen.
    public let surface: DesignSurface

    public init(id: String, title: String, note: String? = nil, surface: DesignSurface) {
        self.id = id
        self.title = title
        self.note = note
        self.surface = surface
    }
}
