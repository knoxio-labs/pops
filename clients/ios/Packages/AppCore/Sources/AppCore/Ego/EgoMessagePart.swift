/// A renderable part of an Ego message.
public enum EgoMessagePart: Hashable, Sendable {
    case text(String)
    case entity(EgoEntityPart)
    case actions(EgoActionsPart)
}

/// An entity reference carried by an Ego message as an ADR-012 object URI.
public struct EgoEntityPart: Hashable, Sendable {
    public let uri: String
    public let title: String
    public let subtitle: String?

    public init(uri: String, title: String, subtitle: String?) {
        self.uri = uri
        self.title = title
        self.subtitle = subtitle
    }

    /// The URI parsed as an ADR-012 object reference, when it is well-formed.
    public var objectURI: PopsURI? {
        parseObjectURI(uri)
    }
}

/// One write action in an Ego batch.
public struct EgoBatchAction: Hashable, Identifiable, Sendable {
    public let actionId: String
    public let tool: String
    public let summary: String
    public let status: EgoActionStatus

    public var id: String { actionId }

    public init(actionId: String, tool: String, summary: String, status: EgoActionStatus) {
        self.actionId = actionId
        self.tool = tool
        self.summary = summary
        self.status = status
    }
}

/// A batch of write actions proposed by Ego or already executed.
public struct EgoActionsPart: Hashable, Sendable {
    public let batchId: String
    public let actions: [EgoBatchAction]

    /// Whether this batch contains an action that is still awaiting a decision.
    public var hasPending: Bool {
        actions.contains { $0.status.isActionable }
    }

    public init(batchId: String, actions: [EgoBatchAction]) {
        self.batchId = batchId
        self.actions = actions
    }
}

/// The lifecycle status of an Ego write action.
public enum EgoActionStatus: String, Hashable, Sendable {
    case pending
    case confirmed
    case rejected
    case executed
    case failed

    /// Whether the action can still be approved or rejected.
    public var isActionable: Bool {
        self == .pending
    }
}
