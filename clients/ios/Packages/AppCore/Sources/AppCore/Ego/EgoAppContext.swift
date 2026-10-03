/// App and screen context sent to Ego with a conversation turn.
public struct EgoAppContext: Hashable, Sendable {
    public let app: String
    public let uri: String?
    public let route: String?
    public let entityTitle: String?

    public init(app: String, uri: String?, route: String?, entityTitle: String?) {
        self.app = app
        self.uri = uri
        self.route = route
        self.entityTitle = entityTitle
    }
}
