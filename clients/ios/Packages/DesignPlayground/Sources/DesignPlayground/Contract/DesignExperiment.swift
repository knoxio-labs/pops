/// A question about one surface, and the competing answers to it.
///
/// The same shape the web playground uses, and for the same reason: two
/// designs argued about in the abstract is a conversation nobody wins, and two
/// designs side by side on the device is a decision somebody can make in a
/// minute.
///
/// Several open experiments may sit on one surface, and often should: a
/// screen's vocabulary, its status treatment and how much sync it shows are
/// separate questions, and making them queue behind one another answers two of
/// them by default while the third is being looked at.
///
/// What that costs is worth stating, because it is now the author's job rather
/// than a test's. Each variant stages a whole surface, so a variant of one open
/// experiment has already taken a position on every other open question about
/// that surface. When that position is load-bearing, say so in the variant's
/// ``DesignVariant/note``, as in "status as a badge here, which the status
/// experiment has not settled", so a reviewer answering this question knows
/// what it is holding fixed.
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
